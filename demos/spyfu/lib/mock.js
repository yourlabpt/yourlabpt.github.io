/**
 * Deterministic demo data.
 *
 * Seeded from the domain + country string, so the same list always produces
 * the same answer — a demo that changes between rehearsal and the meeting is
 * a demo that fails in the meeting. Only the source data is synthetic; the
 * threshold/classification logic downstream is the real thing.
 */

import { rngFor } from './util.js';

/**
 * Pinned so the sample list always shows a believable spread of outcomes.
 * 'high' -> clearly qualified, 'low' -> below threshold, 'none' -> no paid
 * search found. Everything else is drawn from a realistic distribution.
 */
const CURATED = {
  'northgate-roofing.co.uk': 'high',
  'kestrellogistics.com': 'high',
  'brightpath-dental.co.uk': 'high',
  'pinnacle-scaffolding.co.uk': 'high',
  'harbourviewaccountants.co.uk': 'low',
  'atlascleaningservices.com': 'low',
  'crestlinehvac.com': 'low',
  'quietfoxstudio.co.uk': 'none',
  'ravenswoodgarden.com': 'none',
  'meridianfitout.com': 'none',
};

/** One deterministic {budget, paidKeywords} per domain per country. */
export function mockStats(domain, countryCode) {
  const tier = CURATED[domain];
  const rng = rngFor(domain, countryCode, 'spyfu-spend-check-v1');
  const u = rng();

  let budget;
  if (tier === 'none') budget = 0;
  else if (tier === 'high') budget = Math.round(3000 + rng() * 40000);
  else if (tier === 'low') budget = Math.round(50 + rng() * 1200);
  else if (u < 0.38) budget = 0;
  else if (u < 0.68) budget = Math.round(50 + rng() * 1900);
  else budget = Math.round(1500 + rng() * 25000);

  const cpc = 1.2 + rng() * 4;
  const paidKeywords = budget > 0 ? Math.max(3, Math.round(budget / (cpc * 14))) : 0;

  return { domain, budget, paidKeywords };
}
