/**
 * The whole product: for each domain, combined monthly paid-search spend
 * across the selected countries, classified against a threshold.
 *
 *   spend >= threshold  -> qualified
 *   0 < spend < threshold -> below
 *   spend === 0          -> no_paid
 *
 * Runs against demo data unless a proxy URL is configured, in which case it
 * calls the real SpyFu bulk endpoint through server/proxy.mjs.
 */

import { createSpyfuClient } from './spyfu.js';
import { mockStats } from './mock.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function classify(budget, threshold) {
  if (budget <= 0) return 'no_paid';
  return budget >= threshold ? 'qualified' : 'below';
}

export const SEGMENT_LABELS = {
  qualified: 'Qualified',
  below: 'Below threshold',
  no_paid: 'No paid search',
};

/**
 * @param prospects  [{ domain, original }]
 * @param countries  ['UK', 'US', ...]
 * @param threshold  USD/month
 * @param config     { proxyUrl, apiId, secretKey }
 */
export async function runSpendCheck({ prospects, countries, threshold, config, onProgress }) {
  const live = Boolean(config && config.proxyUrl);
  const client = live
    ? createSpyfuClient({ proxyUrl: config.proxyUrl, apiId: config.apiId, secretKey: config.secretKey })
    : null;

  const domains = prospects.map((p) => p.domain);
  const byDomain = new Map(domains.map((d) => [d, { byCountry: {}, budget: 0, paidKeywords: 0 }]));

  for (let i = 0; i < countries.length; i++) {
    const code = countries[i];
    onProgress?.({ done: i, total: countries.length, label: `Checking ${code}` });

    const rows = live
      ? await client.bulkSnapshot(domains, code)
      : domains.map((d) => mockStats(d, code));
    if (!live) await sleep(15); // keeps the progress bar visible even on a tiny list

    for (const r of rows) {
      const rec = byDomain.get(r.domain);
      if (!rec) continue;
      rec.byCountry[code] = { budget: r.budget, paidKeywords: r.paidKeywords };
      rec.budget += r.budget;
      rec.paidKeywords += r.paidKeywords;
    }
  }
  onProgress?.({ done: countries.length, total: countries.length, label: 'Done' });

  const results = prospects.map((p) => {
    const rec = byDomain.get(p.domain);
    return {
      domain: p.domain,
      original: p.original,
      byCountry: rec.byCountry,
      budget: rec.budget,
      paidKeywords: rec.paidKeywords,
      segment: classify(rec.budget, threshold),
    };
  });
  results.sort((a, b) => b.budget - a.budget);

  const counts = { qualified: 0, below: 0, no_paid: 0 };
  let totalBudget = 0;
  for (const r of results) {
    counts[r.segment] += 1;
    totalBudget += r.budget;
  }

  return {
    results,
    counts,
    totalBudget,
    provider: live ? 'spyfu' : 'demo-data',
    runAt: new Date().toISOString(),
  };
}
