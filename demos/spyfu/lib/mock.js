/**
 * Deterministic demo data provider.
 *
 * Seeded from the domain string, so the same list ALWAYS produces the same
 * result — a demo that changes between rehearsal and the meeting is a demo that
 * fails in the meeting (decision D-08).
 *
 * It works on ANY uploaded list, which is deliberately a better demo than live
 * data: the client can drop in their own prospects and immediately see the shape
 * of the answer.
 */

import { monthKey, rngFor } from './util.js';

const ARCHETYPES = [
  ['ramp', 0.09],
  ['new_advertiser', 0.06],
  ['collapse', 0.08],
  ['new_market', 0.07],
  ['inefficient', 0.06],
  ['declining_organic', 0.06],
  ['steady_high', 0.14],
  ['steady_mid', 0.14],
  ['below_threshold', 0.12],
  ['no_paid', 0.18],
];

/**
 * Pinned archetypes so the top of the demo list is predictable and the run
 * sheet in docs/demo-run-sheet.md matches what actually appears on screen.
 * These domains are in public/sample-prospects.csv.
 */
export const CURATED = {
  'northgate-roofing.co.uk': 'ramp',
  'kestrellogistics.com': 'ramp',
  'brightpath-dental.co.uk': 'new_advertiser',
  'harbourviewaccountants.co.uk': 'new_advertiser',
  'meridianfitout.com': 'collapse',
  'stonebridgelegal.co.uk': 'collapse',
  'valleyhomecare.com': 'new_market',
  'orchardpackaging.co.uk': 'new_market',
  'crestlinehvac.com': 'inefficient',
  'fenwickinteriors.co.uk': 'declining_organic',
  'pinnacle-scaffolding.co.uk': 'steady_high',
  'atlascleaningservices.com': 'below_threshold',
  'quietfoxstudio.co.uk': 'no_paid',
  'ravenswoodgarden.com': 'no_paid',
};

const COMPETITOR_POOL = [
  'apexgroundworks.co.uk', 'summitfacilities.com', 'lantern-industrial.co.uk',
  'redoakservices.com', 'goldfinchmedia.co.uk', 'ironbridgeplant.com',
  'silverbirchcare.co.uk', 'blueharbourlogistics.com', 'foxglovedental.co.uk',
  'westwoodcontracts.com', 'thornburyrenewables.co.uk', 'cedarpointsupply.com',
];

function pickArchetype(u) {
  let acc = 0;
  for (const [name, p] of ARCHETYPES) {
    acc += p;
    if (u <= acc) return name;
  }
  return 'steady_mid';
}

const noise = (rng, amp) => 1 + (rng() * 2 - 1) * amp;

function budgetSeries(archetype, base, rng, n) {
  const out = [];
  switch (archetype) {
    case 'no_paid':
      return new Array(n).fill(0);

    case 'below_threshold': {
      // Kept low enough that even with secondary markets added the total stays
      // under the default spend floor — otherwise the segment test is a lie.
      const small = 120 + rng() * 850;
      for (let i = 0; i < n; i++) out.push(Math.round(small * noise(rng, 0.2)));
      return out;
    }

    case 'new_advertiser': {
      for (let i = 0; i < n - 1; i++) out.push(0);
      out.push(Math.round((1500 + rng() * 14000)));
      return out;
    }

    case 'collapse': {
      for (let i = 0; i < n - 1; i++) out.push(Math.round(base * noise(rng, 0.09)));
      out.push(Math.round(out[n - 2] * (0.12 + rng() * 0.35)));
      return out;
    }

    case 'ramp': {
      for (let i = 0; i < n - 3; i++) out.push(Math.round(base * noise(rng, 0.08)));
      const avg = (out[n - 4] + out[n - 5] + out[n - 6]) / 3;
      out.push(Math.round(avg * (1.12 + rng() * 0.15)));
      out.push(Math.round(avg * (1.35 + rng() * 0.25)));
      out.push(Math.round(avg * (1.7 + rng() * 0.7)));
      return out;
    }

    case 'inefficient': {
      // Budget up, but deliberately under the ramp threshold so this row is
      // about efficiency rather than growth.
      for (let i = 0; i < n - 2; i++) out.push(Math.round(base * noise(rng, 0.06)));
      const avg = (out[n - 3] + out[n - 4] + out[n - 5]) / 3;
      out.push(Math.round(avg * 1.1));
      out.push(Math.round(avg * (1.18 + rng() * 0.08)));
      return out;
    }

    case 'steady_high':
    case 'new_market':
    case 'declining_organic':
    case 'steady_mid':
    default: {
      const drift = 1 + (rng() * 0.4 - 0.2) / n;
      let v = base;
      for (let i = 0; i < n; i++) {
        v *= drift;
        out.push(Math.round(v * noise(rng, 0.09)));
      }
      return out;
    }
  }
}

function buildMarket(archetype, base, rng, months, opts = {}) {
  const n = months.length;
  const budgets = opts.zeroUntilLast
    ? months.map((_, i) => (i >= n - 2 ? Math.round(opts.entryBudget * (i === n - 1 ? 1.5 : 0.55)) : 0))
    : budgetSeries(archetype, base, rng, n);

  const cpc = 1.1 + rng() * 4.2;
  const baseOrganic = Math.round(200 + rng() * 45000);
  const strength = Math.round(4 + rng() * 82);
  const rank0 = 1.2 + rng() * 2.0;

  const flatClicks = archetype === 'inefficient';
  const clicksAnchor = budgets.length ? budgets[Math.max(0, n - 4)] / cpc : 0;

  const history = months.map((month, i) => {
    const budget = budgets[i];
    let paidClicks;
    if (budget <= 0) paidClicks = 0;
    else if (flatClicks) paidClicks = Math.round(clicksAnchor * noise(rng, 0.02));
    else paidClicks = Math.round((budget / cpc) * noise(rng, 0.07));

    let organicClicks;
    if (archetype === 'declining_organic') {
      const step = i >= n - 4 ? 1 - 0.09 * (i - (n - 4) + 1) : 1;
      organicClicks = Math.round(baseOrganic * step * (i >= n - 4 ? 1 : noise(rng, 0.05)));
    } else {
      organicClicks = Math.round(baseOrganic * noise(rng, 0.08));
    }

    let adRank = 0;
    if (budget > 0) {
      adRank = flatClicks ? rank0 + 0.18 * Math.max(0, i - (n - 4)) : rank0 + (rng() * 0.3 - 0.15);
      adRank = Math.round(adRank * 10) / 10;
    }

    return {
      month,
      budget,
      paidClicks,
      paidKeywords: budget > 0 ? Math.max(4, Math.round(budget / (cpc * 14))) : 0,
      organicClicks,
      organicKeywords: Math.round(organicClicks * (0.25 + rng() * 0.5)),
      adRank,
      strength,
    };
  });

  return { history };
}

/**
 * Secondary markets are a SCALED COPY of the primary market, never an
 * independent draw. If they were independent, a big secondary market could
 * outrank the primary one and `primaryMarket()` would evaluate the rules
 * against the wrong series — which is exactly the bug the tests caught.
 */
function scaleMarket(market, factor, rng) {
  return {
    history: market.history.map((p) => ({
      ...p,
      budget: Math.round(p.budget * factor),
      paidClicks: Math.round(p.paidClicks * factor),
      paidKeywords: p.paidKeywords ? Math.max(2, Math.round(p.paidKeywords * factor)) : 0,
      organicClicks: Math.round(p.organicClicks * factor),
      organicKeywords: Math.round(p.organicKeywords * factor),
      adRank: p.adRank ? Math.round((p.adRank + (rng() * 0.4 - 0.2)) * 10) / 10 : 0,
      strength: Math.max(1, Math.round(p.strength * (0.7 + rng() * 0.3))),
    })),
  };
}

/** Snapshot + trend + competitors — the cheap pass, runs on every domain. */
export function generateRecord(domain, config, asOf = new Date()) {
  const rng = rngFor(domain, 'spyfu-demo-v1');
  const archetype = CURATED[domain] || pickArchetype(rng());
  let base = Math.round(400 * Math.pow(180, rng()));
  // A new-market entrant needs a primary market big enough that the new
  // territory reads as secondary rather than taking over the record.
  if (archetype === 'new_market') base = Math.max(base, 6000);

  const months = [];
  const look = config.thresholds.lookbackMonths ?? 12;
  for (let i = look; i >= 0; i--) months.push(monthKey(asOf, -i));

  const selected = config.markets.length ? config.markets : ['UK'];
  const primaryIdx = Math.floor(rng() * selected.length);
  const primaryCode = selected[primaryIdx];

  const markets = {};
  markets[primaryCode] = buildMarket(archetype, base, rng, months);
  const primaryCur = markets[primaryCode].history[months.length - 1].budget;
  const newMarketIdx = (primaryIdx + 1) % selected.length;

  selected.forEach((code, idx) => {
    if (idx === primaryIdx) return;
    if (archetype === 'new_market' && idx === newMarketIdx) {
      markets[code] = buildMarket(archetype, base, rng, months, {
        zeroUntilLast: true,
        entryBudget: Math.max(400, primaryCur * (0.18 + rng() * 0.22)),
      });
    } else {
      markets[code] = scaleMarket(markets[primaryCode], 0.12 + rng() * 0.28, rng);
    }
  });

  const cur = primaryCur;

  let competitors = [];
  if (cur > 0) {
    const count = 3 + Math.floor(rng() * 3);
    const pressured = rng() < 0.22;
    for (let i = 0; i < count; i++) {
      const pool = COMPETITOR_POOL[Math.floor(rng() * COMPETITOR_POOL.length)];
      const mult = i === 0 && pressured ? 2.2 + rng() * 2.5 : 0.25 + rng() * 1.3;
      competitors.push({ domain: pool, budget: Math.round(cur * mult) });
    }
    competitors = competitors
      .filter((c, i, arr) => arr.findIndex((x) => x.domain === c.domain) === i)
      .sort((a, b) => b.budget - a.budget);
  }

  return {
    domain,
    archetype,           // demo-only; never shown in the UI
    markets,
    competitors,
    newKeywords: null,   // filled in the expensive pass, top N only
    adCopyTurnover: null, // on-demand only
    source: 'demo-data',
  };
}

/** The expensive pass — only ever called for the top N (cost rule). */
export function enrichNewKeywords(record) {
  const rng = rngFor(record.domain, 'newkw');
  const launching = record.archetype === 'ramp' || record.archetype === 'new_market' || rng() < 0.18;
  const baseline = Math.round(2 + rng() * 9);
  const count = launching ? Math.round(baseline * (2 + rng() * 3) + 8) : Math.round(baseline * (0.4 + rng()));
  return { ...record, newKeywords: { count, baseline } };
}

/** On-demand ad-copy history (the $3 CPM endpoint). */
export function enrichAdHistory(record) {
  const rng = rngFor(record.domain, 'adcopy');
  const shifty = record.archetype === 'ramp' || record.archetype === 'new_market' || rng() < 0.2;
  const turnover = shifty ? 0.5 + rng() * 0.45 : rng() * 0.45;
  const ads = [];
  const n = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < n; i++) {
    ads.push({
      month: record.markets[Object.keys(record.markets)[0]].history[
        Math.max(0, record.markets[Object.keys(record.markets)[0]].history.length - 1 - i * 2)
      ].month,
      headline: AD_HEADLINES[Math.floor(rng() * AD_HEADLINES.length)],
    });
  }
  return { ...record, adCopyTurnover: Math.round(turnover * 100) / 100, adHistory: ads };
}

const AD_HEADLINES = [
  'Trusted Local Specialists — Free Quote in 24h',
  'Now Taking Bookings for Autumn',
  'Rated Excellent by 400+ Customers',
  'Fixed-Price Packages. No Surprises.',
  'New: Same-Week Installation',
  'Talk to a Specialist Today',
  'Nationwide Coverage, Local Teams',
  '20 Years On The Job — Get a Quote',
];
