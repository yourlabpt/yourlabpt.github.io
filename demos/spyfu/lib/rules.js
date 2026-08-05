/**
 * The nine intent rules.
 *
 * Every rule is a pure function of (record, ctx) and returns the same shape:
 *   { id, label, weight, fired, applicable, why, chip, metric }
 *
 * `why` is PRODUCT SURFACE, not debug output — it becomes the first line of a
 * cold email. Write it like a person noticed something. See memory/20-signal-model.md.
 */

import { mean, pctChange, fmtPct, fmtMoney } from './util.js';

const MARKET_NAMES = {
  US: 'the US', UK: 'the UK', CA: 'Canada', AU: 'Australia', IE: 'Ireland',
  DE: 'Germany', FR: 'France', ES: 'Spain', IT: 'Italy', PT: 'Portugal',
  NL: 'the Netherlands', BE: 'Belgium', CH: 'Switzerland', AT: 'Austria',
  DK: 'Denmark', NO: 'Norway', SE: 'Sweden', PL: 'Poland', UA: 'Ukraine',
  TR: 'Turkey', BR: 'Brazil', MX: 'Mexico', AR: 'Argentina', ZA: 'South Africa',
  IN: 'India', JP: 'Japan', SG: 'Singapore', NZ: 'New Zealand',
};

const marketName = (c) => MARKET_NAMES[c] || c;

function res(id, label, weight, fired, why, chip, metric, applicable = true) {
  return { id, label, weight, fired, applicable, why, chip, metric };
}

/** Series helpers -------------------------------------------------------- */

function series(record, market, field = 'budget') {
  const m = record.markets[market];
  if (!m) return [];
  return m.history.map((p) => p[field] ?? 0);
}

/** The market this domain is most active in — rules run against it. */
export function primaryMarket(record, markets) {
  let best = null;
  for (const code of markets) {
    const m = record.markets[code];
    if (!m || !m.history.length) continue;
    const cur = m.history[m.history.length - 1].budget || 0;
    const tot = m.history.reduce((a, p) => a + (p.budget || 0), 0);
    if (!best || cur > best.cur || (cur === best.cur && tot > best.tot)) {
      best = { code, cur, tot };
    }
  }
  return best ? best.code : markets[0];
}

export function currentBudget(record, markets) {
  let total = 0;
  for (const code of markets) {
    const m = record.markets[code];
    if (m && m.history.length) total += m.history[m.history.length - 1].budget || 0;
  }
  return total;
}

/** Rules ------------------------------------------------------------------ */

export function ruleSpendRamp(record, ctx) {
  const b = series(record, ctx.market);
  const id = 'spend_ramp';
  const label = 'Spend ramp';
  const w = ctx.weights[id];
  if (b.length < 5) return res(id, label, w, false, null, null, null, false);

  const cur = b[b.length - 1];
  const avg3 = mean(b.slice(-4, -1));
  const delta = pctChange(avg3, cur);

  const fired =
    avg3 >= ctx.thresholds.minBudgetForChange &&
    cur > 0 &&
    delta > ctx.thresholds.rampPct / 100;

  return res(id, label, w, fired,
    fired
      ? `Their Google Ads spend is up ${fmtPct(delta)} on their three-month average (${fmtMoney(avg3)} → ${fmtMoney(cur)} a month) — someone just signed off a budget.`
      : null,
    fired ? `Spend ramp ${fmtPct(delta)}` : null,
    { cur, avg3, delta });
}

export function ruleNewAdvertiser(record, ctx) {
  const b = series(record, ctx.market);
  const id = 'new_advertiser';
  const label = 'New advertiser';
  const w = ctx.weights[id];
  const need = ctx.thresholds.dormantMonths;
  if (b.length < need + 1) return res(id, label, w, false, null, null, null, false);

  const cur = b[b.length - 1];
  const before = b.slice(-(need + 1), -1);
  const dormant = before.every((v) => (v || 0) < 50);
  const fired = dormant && cur >= Math.max(200, ctx.thresholds.minBudgetForChange * 0.4);

  return res(id, label, w, fired,
    fired
      ? `They were not running paid search at all until this month — now they're at ${fmtMoney(cur)} a month. First-time advertiser, no incumbent agency habit yet.`
      : null,
    fired ? 'New advertiser' : null,
    { cur, dormantMonths: need });
}

export function ruleSpendCollapse(record, ctx) {
  const b = series(record, ctx.market);
  const id = 'spend_collapse';
  const label = 'Spend collapse';
  const w = ctx.weights[id];
  if (b.length < 2) return res(id, label, w, false, null, null, null, false);

  const cur = b[b.length - 1];
  const prev = b[b.length - 2];
  const delta = pctChange(prev, cur);
  const fired =
    prev >= ctx.thresholds.minBudgetForChange &&
    delta < -(ctx.thresholds.collapsePct / 100);

  return res(id, label, w, fired,
    fired
      ? `Their paid search spend dropped ${fmtPct(Math.abs(delta))} last month (${fmtMoney(prev)} → ${fmtMoney(cur)}). Either they cut the budget or they cut the agency — worth finding out which.`
      : null,
    fired ? `Spend collapse ${fmtPct(delta)}` : null,
    { cur, prev, delta });
}

export function ruleNewMarket(record, ctx) {
  const id = 'new_market';
  const label = 'New market entry';
  const w = ctx.weights[id];
  if (ctx.markets.length < 2) {
    return res(id, label, w, false, null, null, null, false);
  }

  // "Expansion" only means something if there was an established home market to
  // expand from. Without this guard a brand-new advertiser trivially "enters"
  // every market at once and double-counts against the new-advertiser rule.
  const home = series(record, ctx.market).slice(0, -2);
  const established = home.filter((v) => (v || 0) >= ctx.thresholds.minBudgetForChange).length >= 3;
  if (!established) return res(id, label, w, false, null, null, null, false);

  for (const code of ctx.markets) {
    if (code === ctx.market) continue;
    const b = series(record, code);
    if (b.length < 4) continue;
    const cur = b[b.length - 1];
    const history = b.slice(0, -2);
    const wasAbsent = history.every((v) => (v || 0) < 50);
    if (wasAbsent && cur >= 200) {
      return res(id, label, w, true,
        `They've just started buying paid search in ${marketName(code)} — no spend there before this quarter, ${fmtMoney(cur)} a month now. That's an expansion with budget attached.`,
        `Entered ${code}`,
        { market: code, cur });
    }
  }
  return res(id, label, w, false, null, null, null);
}

export function ruleLaunch(record, ctx) {
  const id = 'launch';
  const label = 'Product / campaign launch';
  const w = ctx.weights[id];
  const nk = record.newKeywords;
  if (!nk) return res(id, label, w, false, null, null, null, false);

  const { count = 0, baseline = 0 } = nk;
  const fired = count >= 10 && count > baseline * 1.5;

  return res(id, label, w, fired,
    fired
      ? `They've added ${count} new paid keywords this month against a typical ${Math.round(baseline)} — that pattern usually means a new product or campaign just went live.`
      : null,
    fired ? `Launch: ${count} new keywords` : null,
    { count, baseline });
}

export function ruleInefficiency(record, ctx) {
  const id = 'inefficiency';
  const label = 'Inefficiency flag';
  const w = ctx.weights[id];
  const b = series(record, ctx.market);
  const clicks = series(record, ctx.market, 'paidClicks');
  const rank = series(record, ctx.market, 'adRank');
  if (b.length < 4) return res(id, label, w, false, null, null, null, false);

  const cur = b[b.length - 1];
  const prev3 = mean(b.slice(-4, -1));
  const budgetUp = pctChange(prev3, cur);

  const curClicks = clicks[clicks.length - 1] || 0;
  const prevClicks = mean(clicks.slice(-4, -1)) || 0;
  const clicksUp = pctChange(prevClicks, curClicks);

  const curRank = rank[rank.length - 1] || 0;
  const prevRank = mean(rank.slice(-4, -1)) || 0;
  const rankWorse = curRank - prevRank; // higher ad rank number = worse position

  const spendingMore = cur >= ctx.thresholds.minBudgetForChange && budgetUp > 0.15;
  const flatClicks = isFinite(clicksUp) && clicksUp < 0.03;
  const worseRank = prevRank > 0 && rankWorse >= 0.4;

  const fired = spendingMore && (flatClicks || worseRank);

  let why = null;
  if (fired && flatClicks) {
    why = `They're spending ${fmtPct(budgetUp)} more on Google Ads and getting ${clicksUp <= 0 ? 'fewer' : 'barely any more'} clicks for it — paying more per click for the same traffic.`;
  } else if (fired) {
    why = `Their spend is up ${fmtPct(budgetUp)} but their average ad position has slipped from ${prevRank.toFixed(1)} to ${curRank.toFixed(1)} — they're paying more and ranking worse.`;
  }

  return res(id, label, w, fired, why,
    fired ? 'Paying more, getting less' : null,
    { budgetUp, clicksUp, prevRank, curRank });
}

export function ruleOrganicPain(record, ctx) {
  const id = 'organic_pain';
  const label = 'Organic pain';
  const w = ctx.weights[id];
  const oc = series(record, ctx.market, 'organicClicks');
  if (oc.length < 4) return res(id, label, w, false, null, null, null, false);

  const last4 = oc.slice(-4);
  let falling = true;
  for (let i = 1; i < last4.length; i++) if (last4[i] >= last4[i - 1]) falling = false;
  const drop = pctChange(last4[0], last4[last4.length - 1]);
  const fired = falling && last4[0] > 500 && drop < -0.15;

  return res(id, label, w, fired,
    fired
      ? `Their organic traffic has fallen three months running, down ${fmtPct(Math.abs(drop))} over the quarter. Companies tend to plug an SEO hole with paid budget.`
      : null,
    fired ? `Organic down ${fmtPct(drop)}` : null,
    { drop, last4 });
}

export function ruleCompetitivePressure(record, ctx) {
  const id = 'competitive_pressure';
  const label = 'Under competitive pressure';
  const w = ctx.weights[id];
  const comps = record.competitors || [];
  const cur = series(record, ctx.market).slice(-1)[0] || 0;
  if (!comps.length || cur <= 0) return res(id, label, w, false, null, null, null, false);

  const top = comps.reduce((a, c) => (c.budget > a.budget ? c : a), comps[0]);
  const fired = top.budget >= cur * 2;

  return res(id, label, w, fired,
    fired
      ? `${top.domain} is outspending them roughly ${(top.budget / Math.max(cur, 1)).toFixed(1)}x on the same keywords — they're being priced out of their own category.`
      : null,
    fired ? `Outspent by ${top.domain}` : null,
    { top: top.domain, topBudget: top.budget, cur });
}

export function ruleMessagingShift(record, ctx) {
  const id = 'messaging_shift';
  const label = 'Messaging / positioning shift';
  const w = ctx.weights[id];
  const t = record.adCopyTurnover;
  if (t === null || t === undefined) {
    return res(id, label, w, false, null, null, null, false); // not evaluated — ad history is on-demand
  }
  const fired = t >= 0.5;
  return res(id, label, w, fired,
    fired
      ? `${Math.round(t * 100)}% of their ad copy changed this quarter — that scale of rewrite usually follows a rebrand, a repositioning or an acquisition.`
      : null,
    fired ? 'Messaging shift' : null,
    { turnover: t });
}

export const ALL_RULES = [
  ruleSpendRamp,
  ruleNewAdvertiser,
  ruleSpendCollapse,
  ruleNewMarket,
  ruleLaunch,
  ruleInefficiency,
  ruleOrganicPain,
  ruleCompetitivePressure,
  ruleMessagingShift,
];

export function evaluateRules(record, ctx) {
  return ALL_RULES.map((fn) => fn(record, ctx));
}
