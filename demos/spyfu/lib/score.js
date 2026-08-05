/**
 * Weighted composite scoring + segmentation.
 *
 * The score is a RANKING DEVICE, not a spend estimate. Every score decomposes
 * back to the rules that fired (NFR-10) — `breakdown` on the result is what the
 * "why is this an 82?" panel reads from.
 */

import { evaluateRules, primaryMarket, currentBudget } from './rules.js';
import { clamp, pctChange } from './util.js';

export const SEGMENTS = {
  QUALIFIED: 'qualified',
  BELOW: 'below',
  NO_PAID: 'no_paid',
};

export const SEGMENT_LABELS = {
  [SEGMENTS.QUALIFIED]: 'Qualified',
  [SEGMENTS.BELOW]: 'Advertising below threshold',
  [SEGMENTS.NO_PAID]: 'No paid search found',
};

export function scoreRecord(record, config) {
  const markets = config.markets;
  const market = primaryMarket(record, markets);
  const ctx = {
    market,
    markets,
    thresholds: config.thresholds,
    weights: config.weights,
  };

  const rules = evaluateRules(record, ctx);
  const fired = rules.filter((r) => r.fired);

  const raw = fired.reduce((a, r) => a + r.weight, 0);
  const score = clamp(Math.round(raw), 0, 100);

  const hist = (record.markets[market] && record.markets[market].history) || [];
  const cur = hist.length ? hist[hist.length - 1].budget || 0 : 0;
  const prev = hist.length > 1 ? hist[hist.length - 2].budget || 0 : 0;
  const totalCur = currentBudget(record, markets);

  let segment;
  if (totalCur <= 0) segment = SEGMENTS.NO_PAID;
  else if (totalCur < config.thresholds.spendFloor) segment = SEGMENTS.BELOW;
  else segment = SEGMENTS.QUALIFIED;

  // Highest-weight fired rule drives the outreach line.
  const ranked = [...fired].sort((a, b) => b.weight - a.weight);
  const whyLine = ranked.length ? ranked[0].why : null;
  const topSignal = ranked.length ? ranked[0].label : null;

  return {
    domain: record.domain,
    market,
    score,
    segment,
    chips: ranked.map((r) => ({ id: r.id, text: r.chip })),
    firedIds: ranked.map((r) => r.id),
    whyLine,
    topSignal,
    breakdown: rules.map((r) => ({
      id: r.id, label: r.label, weight: r.weight,
      fired: r.fired, applicable: r.applicable, why: r.why, metric: r.metric,
    })),
    kpi: {
      budget: cur,
      budgetPrev: prev,
      budgetDelta: pctChange(prev, cur),
      budgetAllMarkets: totalCur,
      paidKeywords: hist.length ? hist[hist.length - 1].paidKeywords || 0 : 0,
      organicKeywords: hist.length ? hist[hist.length - 1].organicKeywords || 0 : 0,
      organicClicks: hist.length ? hist[hist.length - 1].organicClicks || 0 : 0,
      paidClicks: hist.length ? hist[hist.length - 1].paidClicks || 0 : 0,
      strength: hist.length ? hist[hist.length - 1].strength || 0 : 0,
      adRank: hist.length ? hist[hist.length - 1].adRank || 0 : 0,
    },
    record,
  };
}

export function scoreAll(records, config) {
  return records
    .map((r) => scoreRecord(r, config))
    .sort((a, b) => b.score - a.score || b.kpi.budget - a.kpi.budget);
}

export function summarise(results) {
  const bySegment = { qualified: 0, below: 0, no_paid: 0 };
  const byRule = {};
  let totalBudget = 0;
  for (const r of results) {
    bySegment[r.segment] += 1;
    totalBudget += r.kpi.budgetAllMarkets;
    for (const id of r.firedIds) byRule[id] = (byRule[id] || 0) + 1;
  }
  return {
    total: results.length,
    bySegment,
    byRule,
    totalBudget,
    scored: results.filter((r) => r.score > 0).length,
    hot: results.filter((r) => r.score >= 40).length,
  };
}

/**
 * Run-over-run diff — the actual product (P2). Returns domains whose signals
 * changed since the previous run of the same profile.
 */
export function diffRuns(previous, current) {
  const prevMap = new Map(previous.map((r) => [r.domain, r]));
  const newlyFiring = [];
  const scoreJumps = [];
  const newDomains = [];

  for (const r of current) {
    const p = prevMap.get(r.domain);
    if (!p) {
      if (r.score > 0) newDomains.push(r);
      continue;
    }
    const gained = r.firedIds.filter((id) => !p.firedIds.includes(id));
    if (gained.length) newlyFiring.push({ ...r, gained });
    if (r.score - p.score >= 15) scoreJumps.push({ ...r, from: p.score, to: r.score });
  }
  return { newlyFiring, scoreJumps, newDomains };
}
