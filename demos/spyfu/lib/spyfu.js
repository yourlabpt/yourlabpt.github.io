/**
 * Live SpyFu client.
 *
 * The browser never calls api.spyfu.com directly — SpyFu doesn't allow
 * browser-origin requests, and Basic auth would expose the key in every
 * request. Instead the browser calls a same-origin route mounted on the
 * site's own server (see server/server.js, "SpyFu demo proxy"), which
 * forwards to SpyFu and attaches auth server-side.
 *
 * The API ID / secret typed into the page are sent to that route as request
 * headers (never as URL query params, never logged) so nothing needs to be
 * preconfigured per client — paste a key, click run.
 */

const PROXY_BASE = '/demos/spyfu/api/spyfu';
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function createSpyfuClient({ apiId, secretKey }) {
  async function call(endpoint, params, { retries = 4 } = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
      else qs.append(k, String(v));
    }
    const url = `${PROXY_BASE}/${endpoint}?${qs.toString()}`;
    const headers = { accept: 'application/json' };
    if (apiId) headers['x-spyfu-api-id'] = apiId;
    if (secretKey) headers['x-spyfu-secret-key'] = secretKey;

    let attempt = 0;
    for (;;) {
      const r = await fetch(url, { headers });
      if (r.ok) return r.json();
      if (!RETRYABLE.has(r.status) || attempt >= retries) {
        const body = await r.text().catch(() => '');
        throw new Error(`SpyFu ${endpoint} failed: ${r.status} ${body.slice(0, 200)}`);
      }
      const retryAfter = Number(r.headers.get('retry-after')) || 0;
      const wait = retryAfter ? retryAfter * 1000 : Math.min(8000, 400 * 2 ** attempt);
      await sleep(wait + Math.random() * 200);
      attempt += 1;
    }
  }

  return {
    /** Key validity + month-to-date API spend. */
    async testConnection() {
      const j = await call('account/usage', {});
      return {
        ok: true,
        monthToDateUsd: j.monthToDateUsd ?? j.totalCost ?? null,
        plan: j.plan ?? null,
      };
    },

    /** One row per domain per country. <=1000 domains per call. */
    async bulkSnapshot(domains, countryCode) {
      const out = [];
      for (const batch of chunk(domains, 1000)) {
        const j = await call('bulk-domain-stats', {
          domains: batch,
          countryCode,
          showOnlyLatest: true,
        });
        out.push(...(j.results || j.data || []));
      }
      return out.map(mapBulkRow);
    },
  };
}

function mapBulkRow(r = {}) {
  return {
    domain: r.domain ?? r.searchTerm ?? null,
    budget: num(r.monthlyBudget ?? r.adwordsBudget),
    paidKeywords: num(r.totalAdsPurchased ?? r.totalPaidResults),
  };
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
