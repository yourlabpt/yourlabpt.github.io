/**
 * Static configuration: countries and defaults.
 * Pure data, no framework imports.
 */

export const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'UK', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'PT', name: 'Portugal' },
  { code: 'NL', name: 'Netherlands' },
];

/** USD/month. SpyFu reports in USD; this is a floor (Google text ads only). */
export const DEFAULT_THRESHOLD = 2500;

export function defaultConfig() {
  return {
    apiId: '',
    secretKey: '',
    proxyUrl: '',
    countries: ['UK', 'US'],
    threshold: DEFAULT_THRESHOLD,
  };
}
