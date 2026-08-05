/**
 * Live SpyFu client.
 *
 * SECURITY: this never sees the API key. All requests go through
 * `server/proxy.mjs`, which holds SPYFU_API_ID / SPYFU_SECRET_KEY in env and
 * attaches HTTP Basic auth server-side. The browser only ever talks to the
 * proxy (NFR-01, NFR-02).
 *
 * NOTE FOR WHOEVER WIRES THIS UP: the endpoint paths and the *response* field
 * names below are taken from the plan doc, but SpyFu's exact query-parameter
 * spelling should be confirmed against developer.spyfu.com before the first
 * paid run. `mapBulkRow` is the single place to adjust field mapping.
 */

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function createSpyfuClient({ proxyUrl, onSpend }) {
  const base = String(proxyUrl || '').replace(/\/+$/, '');

  async function call(endpoint, params, { retries = 4 } = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
      else qs.append(k, String(v));
    }
    const url = `${base}/api/spyfu/${endpoint}?${qs.toString()}`;

    let attempt = 0;
    for (;;) {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.ok) {
        const json = await r.json();
        if (onSpend && typeof json.__rows === 'number') onSpend(endpoint, json.__rows);
        return json;
      }
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
    /** FR-02 — key validity + month-to-date API spend. */
    async testConnection() {
      const j = await call('account/usage', {});
      return {
        ok: true,
        monthToDateUsd: j.monthToDateUsd ?? j.totalCost ?? null,
        plan: j.plan ?? null,
        raw: j,
      };
    },

    /** Cheap pass: one row per domain per market. <=1000 domains per call. */
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

    /** Trend points — 1 row each, so 5 points is $0.0025/domain. */
    async trendPoints(domain, countryCode, monthsBack = [1, 3, 6, 12]) {
      const now = new Date();
      const reqs = monthsBack.map((back) => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
        return call('domain-stats-exact-date', {
          domain,
          countryCode,
          month: d.getUTCMonth() + 1,
          year: d.getUTCFullYear(),
        });
      });
      const rows = await Promise.all(reqs);
      return rows.map((r) => mapBulkRow(r.results?.[0] ?? r));
    },

    async topCompetitors(domain, countryCode, limit = 5) {
      const j = await call('top-competitors', { domain, countryCode, pageSize: limit });
      return (j.results || j.data || []).map((r) => ({
        domain: r.domain ?? r.competitorDomain,
        budget: num(r.monthlyBudget ?? r.adwordsBudget),
      }));
    },

    async newKeywords(domain, countryCode, pageSize = 25) {
      const j = await call('new-keywords', { domain, countryCode, pageSize });
      const rows = j.results || j.data || [];
      return { count: j.totalMatchingResults ?? rows.length, rows };
    },

    /** $3 CPM — user-triggered only. Never batch this. */
    async adHistory(domain, countryCode) {
      const j = await call('ad-history', { domain, countryCode });
      return j.results || j.data || [];
    },
  };
}

function mapBulkRow(r = {}) {
  return {
    domain: r.domain ?? r.searchTerm ?? null,
    month: r.searchMonth && r.searchYear
      ? `${r.searchYear}-${String(r.searchMonth).padStart(2, '0')}`
      : null,
    budget: num(r.monthlyBudget ?? r.adwordsBudget),
    paidClicks: num(r.monthlyPaidClicks),
    paidKeywords: num(r.totalAdsPurchased ?? r.totalPaidResults),
    organicClicks: num(r.monthlyOrganicClicks),
    organicKeywords: num(r.totalOrganicResults),
    adRank: num(r.averageAdRank),
    strength: num(r.strength),
  };
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Concurrency-capped map, honouring per-endpoint RPS (NFR-04). */
export async function pooled(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (err) {
        results[idx] = { ok: false, error: String(err && err.message ? err.message : err) };
      }
    }
  });
  await Promise.all(workers);
  return results;
}
