/**
 * Static configuration: markets, defaults, SpyFu pricing table.
 * Pure data + pure functions. No framework imports (see CLAUDE.md).
 */

export const MARKETS = [
  { code: 'US', name: 'United States' },
  { code: 'UK', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PT', name: 'Portugal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'DK', name: 'Denmark' },
  { code: 'NO', name: 'Norway' },
  { code: 'SE', name: 'Sweden' },
  { code: 'PL', name: 'Poland' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'TR', name: 'Turkey' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'SG', name: 'Singapore' },
  { code: 'NZ', name: 'New Zealand' },
];

export const MARKET_CODES = MARKETS.map((m) => m.code);

/**
 * SpyFu billing is per ROW RETURNED, not per request.
 * cpm = cost per 1000 rows. rowsPerDomain = how many rows one domain costs us.
 * scope: 'all'  -> runs across the whole deduped list
 *        'topN' -> only the top N scored domains
 *        'ondemand' -> only when a human clicks
 */
export const ENDPOINTS = {
  bulkSnapshot: {
    label: 'Bulk domain snapshot',
    path: 'domain_stats_api/v2/getBulkDomainStats',
    rps: 333,
    cpm: 0.4,
    rowsPerDomain: 1,
    perMarket: true,
    scope: 'all',
    note: 'showOnlyLatest=true, <=1000 domains per call',
  },
  trendPoints: {
    label: 'Trend points (M0/-1/-3/-6/-12)',
    path: 'domain_stats_api/v2/getDomainStatsForExactDate',
    rps: 1000,
    cpm: 0.5,
    rowsPerDomain: 5,
    perMarket: true,
    scope: 'all',
    note: '1 row per call; 5 points per domain per market',
  },
  competitors: {
    label: 'Top PPC competitors',
    path: 'competitors_api/v2/ppc/getTopCompetitors',
    rps: 1000,
    cpm: 0.2,
    rowsPerDomain: 5,
    perMarket: false,
    scope: 'all',
    note: 'cheap — safe to run across the list',
  },
  newKeywords: {
    label: 'New PPC keywords (launch signal)',
    path: 'keyword_api/v2/ppc/getNewKeywords',
    rps: 10,
    cpm: 2.0,
    rowsPerDomain: 25,
    perMarket: false,
    scope: 'topN',
    note: 'pageSize=25 -> $0.05/domain. Shortlist only.',
  },
  adHistory: {
    label: 'Ad copy history (positioning shift)',
    path: 'cloud_ad_history_api/v2/domain/getDomainAdHistory',
    rps: 10,
    cpm: 3.0,
    rowsPerDomain: 50,
    perMarket: false,
    scope: 'ondemand',
    note: 'EXPENSIVE — user-triggered only, never batched',
  },
};

export const DEFAULT_THRESHOLDS = {
  spendFloor: 2000,        // USD/month to count as "Qualified"
  rampPct: 30,             // % above trailing 3-month avg
  collapsePct: 40,         // % MoM drop
  dormantMonths: 3,        // months at zero before "new advertiser"
  lookbackMonths: 12,
  minBudgetForChange: 500, // ignore change rules under this — noise floor
  topN: 25,                // how many domains get the expensive endpoints
};

export const DEFAULT_WEIGHTS = {
  spend_ramp: 25,
  new_advertiser: 20,
  spend_collapse: 15,
  new_market: 15,
  launch: 10,
  inefficiency: 10,
  organic_pain: 10,
  competitive_pressure: 5,
  messaging_shift: 5,
};

export const FX = {
  USD: { symbol: '$', rate: 1 },
  GBP: { symbol: '£', rate: 0.78 },
  EUR: { symbol: '€', rate: 0.92 },
};

export function defaultConfig() {
  return {
    mode: 'mock',            // 'mock' | 'live'
    apiId: '',
    secretKey: '',
    proxyUrl: '',
    markets: ['UK', 'US'],
    currency: 'USD',
    fxRate: FX.GBP.rate,
    thresholds: { ...DEFAULT_THRESHOLDS },
    weights: { ...DEFAULT_WEIGHTS },
    budgetCap: 25,
    profileName: 'Default profile',
  };
}
