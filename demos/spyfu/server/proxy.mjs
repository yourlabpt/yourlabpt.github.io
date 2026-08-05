#!/usr/bin/env node
/**
 * Optional SpyFu proxy. Zero dependencies — plain Node http.
 *
 * WHY THIS EXISTS: the API key must never reach the browser (NFR-01/02). The
 * static app calls this proxy; the proxy attaches HTTP Basic auth from its own
 * environment and forwards to SpyFu. The key stays on your server, out of URLs,
 * out of browser history, out of any shared log.
 *
 * The demo does not need this. Only start it once a real key exists.
 *
 *   SPYFU_API_ID=xxx SPYFU_SECRET_KEY=yyy \
 *   ALLOW_ORIGIN=https://yourlabpt.com \
 *   node server/proxy.mjs
 *
 * Then set "Proxy URL" on the config page to wherever this is reachable.
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const API_ID = process.env.SPYFU_API_ID || '';
const SECRET = process.env.SPYFU_SECRET_KEY || '';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const SPYFU_BASE = 'https://api.spyfu.com/apis';

if (!API_ID || !SECRET) {
  console.error('Refusing to start: set SPYFU_API_ID and SPYFU_SECRET_KEY.');
  process.exit(1);
}

/**
 * Allowlist. Anything not in this map is rejected, so a compromised front end
 * cannot use the proxy to burn credit on arbitrary expensive endpoints.
 *
 * Confirm the exact query-parameter spellings against developer.spyfu.com
 * before the first paid run — see the note in lib/spyfu.js.
 */
const ROUTES = {
  'account/usage': { path: 'accountapi/getApiUsageForMonth', allow: [] },
  'bulk-domain-stats': {
    path: 'domain_stats_api/v2/getBulkDomainStats',
    allow: ['domains', 'countryCode', 'showOnlyLatest'],
  },
  'domain-stats-exact-date': {
    path: 'domain_stats_api/v2/getDomainStatsForExactDate',
    allow: ['domain', 'countryCode', 'month', 'year'],
  },
  'top-competitors': {
    path: 'competitors_api/v2/ppc/getTopCompetitors',
    allow: ['domain', 'countryCode', 'pageSize'],
  },
  'new-keywords': {
    path: 'keyword_api/v2/ppc/getNewKeywords',
    allow: ['domain', 'countryCode', 'pageSize'],
  },
  'matching-domains': {
    path: 'domain_stats_api/v2/getMatchingDomains',
    allow: ['countryCode', 'pageSize', 'monthlyBudgetMin', 'monthlyBudgetMax', 'strengthMin'],
  },
  'ad-history': {
    path: 'cloud_ad_history_api/v2/domain/getDomainAdHistory',
    allow: ['domain', 'countryCode'],
    expensive: true,
  },
};

const auth = 'Basic ' + Buffer.from(`${API_ID}:${SECRET}`).toString('base64');

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

const RPS = {
  'bulk-domain-stats': 300, 'domain-stats-exact-date': 900, 'top-competitors': 900,
  'new-keywords': 8, 'matching-domains': 8, 'ad-history': 8, 'account/usage': 5,
};

const server = http.createServer(async (req, res) => {
  const cors = {
    'access-control-allow-origin': ALLOW_ORIGIN,
    'access-control-allow-headers': 'accept,content-type',
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

    // Row count drives the client-side running cost meter.
    const rows = Array.isArray(payload.results) ? payload.results.length
      : Array.isArray(payload) ? payload.length : 1;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) payload.__rows = rows;

    // Never log the query string — it can carry customer domain lists, and on
    // the query-param auth mode it would carry the key itself.
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
  console.log('Key loaded from environment. It is never sent to the browser.');
});
