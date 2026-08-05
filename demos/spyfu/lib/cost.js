/**
 * Pre-run cost estimator (FR-09) and the budget cap (FR-10).
 *
 * The rule this encodes: cheap endpoints scan the whole list, expensive
 * endpoints only touch the top N. If an estimate for 1000 domains comes out
 * materially above ~$5, something is calling an expensive endpoint on the full
 * list — that's a bug, not a pricing surprise.
 */

import { ENDPOINTS } from './config.js';

export function estimateRun({ domainCount, markets, topN = 25 }) {
  const marketCount = Math.max(1, markets.length);
  const lines = [];

  for (const [key, ep] of Object.entries(ENDPOINTS)) {
    if (ep.scope === 'ondemand') continue;
    const targets = ep.scope === 'topN' ? Math.min(topN, domainCount) : domainCount;
    const multiplier = ep.perMarket ? marketCount : 1;
    const rows = targets * ep.rowsPerDomain * multiplier;
    const cost = (rows / 1000) * ep.cpm;
    lines.push({
      key,
      label: ep.label,
      scope: ep.scope,
      targets,
      rows,
      cpm: ep.cpm,
      cost,
      note: ep.note,
    });
  }

  const total = lines.reduce((a, l) => a + l.cost, 0);
  return { lines, total, domainCount, marketCount, topN };
}

/** What a single on-demand drill-down costs, so the UI can label the button. */
export function drillDownCost() {
  const ep = ENDPOINTS.adHistory;
  return (ep.rowsPerDomain / 1000) * ep.cpm;
}

export function withinCap(estimateTotal, capUsd) {
  return { ok: estimateTotal <= capUsd, over: Math.max(0, estimateTotal - capUsd) };
}

/**
 * How many domains fit inside a cap — used to tell the user what to trim
 * rather than just refusing to run.
 */
export function maxDomainsForCap(capUsd, markets, topN = 25) {
  let lo = 0;
  let hi = 500000;
  if (estimateRun({ domainCount: hi, markets, topN }).total <= capUsd) return hi;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (estimateRun({ domainCount: mid, markets, topN }).total <= capUsd) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
