#!/usr/bin/env node
/**
 * SpyFu proxy. Zero dependencies — plain Node http.
 *
 * WHY THIS EXISTS: SpyFu doesn't accept browser-origin requests, and its
 * Basic-auth key must never be visible in a request the browser makes
 * directly (URL, browser history, any script on the page). The static app
 * calls this proxy instead; the proxy attaches Basic auth and forwards to
 * SpyFu.
 *
 * Credentials can come from either place:
 *   - typed into the page (sent as x-spyfu-api-id / x-spyfu-secret-key
 *     headers, never as a query param, never logged)
 *   - SPYFU_API_ID / SPYFU_SECRET_KEY in this process's environment, used
 *     whenever a request doesn't carry its own headers
 *
 * Run it:
 *   node server/proxy.mjs
 *   # or, to avoid retyping a key every demo:
 *   SPYFU_API_ID=xxx SPYFU_SECRET_KEY=yyy node server/proxy.mjs
 *
 * Then paste the printed address into "Proxy URL" on the page.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const ENV_API_ID = process.env.SPYFU_API_ID || '';
const ENV_SECRET = process.env.SPYFU_SECRET_KEY || '';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const SPYFU_BASE = 'https://api.spyfu.com/apis';

/** Only what the spend check needs — anything else is rejected. */
const ROUTES = {
  'account/usage': { path: 'accountapi/getApiUsageForMonth', allow: [] },
  'bulk-domain-stats': {
    path: 'domain_stats_api/v2/getBulkDomainStats',
    allow: ['domains', 'countryCode', 'showOnlyLatest'],
  },
};

const RPS = { 'bulk-domain-stats': 300, 'account/usage': 5 };

/** Crude per-endpoint rate limiting so a runaway client can't spend the credit. */
const buckets = new Map();
function rateLimited(key, perSecond) {
  const now = Date.now();
  const b = buckets.get(key) || { count: 0, windowStart: now };
  if (now - b.windowStart >= 1000) { b.count = 0; b.windowStart = now; }
  b.count += 1;
  buckets.set(key, b);
  return b.count > perSecond;
}

const server = http.createServer(async (req, res) => {
  const cors = {
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-headers': 'accept,content-type,x-spyfu-api-id,x-spyfu-secret-key',
    'access-control-allow-methods': 'GET,OPTIONS',
    vary: 'Origin',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const match = url.pathname.replace(/^\/api\/spyfu\//, '');
  const route = ROUTES[match];

  if (!route) {
    res.writeHead(404, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown endpoint: ${match}` }));
    return;
  }
  if (rateLimited(match, RPS[match] || 5)) {
    res.writeHead(429, { ...cors, 'retry-after': '1', 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Rate limited by the proxy. Back off and retry.' }));
    return;
  }

  const apiId = req.headers['x-spyfu-api-id'] || ENV_API_ID;
  const secret = req.headers['x-spyfu-secret-key'] || ENV_SECRET;
  if (!apiId || !secret) {
    res.writeHead(401, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'No SpyFu credentials. Fill in API ID and secret key on the page, or set SPYFU_API_ID/SPYFU_SECRET_KEY on this process.' }));
    return;
  }
  const auth = 'Basic ' + Buffer.from(`${apiId}:${secret}`).toString('base64');

  const out = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) {
    if (route.allow.includes(k)) out.append(k, v);
  }

  const target = `${SPYFU_BASE}/${route.path}?${out.toString()}`;
  const started = Date.now();
  try {
    const upstream = await fetch(target, {
      headers: { authorization: auth, accept: 'application/json' },
    });
    const text = await upstream.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

    const rows = Array.isArray(payload.results) ? payload.results.length
      : Array.isArray(payload) ? payload.length : 1;

    // Never log the query string or headers — the query string carries the
    // customer's domain list, and headers now carry the key itself.
    console.log(`${upstream.status} ${match} rows=${rows} ${Date.now() - started}ms`);

    res.writeHead(upstream.status, {
      ...cors,
      'content-type': 'application/json',
      'retry-after': upstream.headers.get('retry-after') || '',
    });
    res.end(JSON.stringify(payload));
  } catch (err) {
    console.error(`ERR ${match}: ${err.message}`);
    res.writeHead(502, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Upstream request failed' }));
  }
});

server.listen(PORT, () => {
  console.log(`SpyFu proxy on http://localhost:${PORT}`);
  console.log(`Allowed origin: ${ALLOW_ORIGIN}`);
  console.log(ENV_API_ID
    ? 'Default credentials loaded from environment (used when the page does not send its own).'
    : 'No default credentials in environment — every request must carry its own API ID and secret key.');
});
