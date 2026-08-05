/** Small shared helpers. Pure. */

export function monthKey(date, offset = 0) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m - 1]} ${String(y).slice(2)}`;
}

export function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function pctChange(from, to) {
  if (!from) return to > 0 ? Infinity : 0;
  return (to - from) / from;
}

export function fmtPct(x, digits = 0) {
  if (!isFinite(x)) return 'new';
  return `${x > 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`;
}

export function fmtMoney(usd, currency = 'USD', rate = 1) {
  const symbols = { USD: '$', GBP: '£', EUR: '€' };
  const v = currency === 'USD' ? usd : usd * rate;
  const s = symbols[currency] || '$';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${s}${(v / 1_000_000).toFixed(1)}m`;
  if (abs >= 10_000) return `${s}${Math.round(v / 1000)}k`;
  if (abs >= 1000) return `${s}${(v / 1000).toFixed(1)}k`;
  return `${s}${Math.round(v)}`;
}

export function fmtMoneyExact(usd, currency = 'USD', rate = 1) {
  const symbols = { USD: '$', GBP: '£', EUR: '€' };
  const v = currency === 'USD' ? usd : usd * rate;
  return `${symbols[currency] || '$'}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString();
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic string hash -> 32-bit seed (xmur3). */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Seeded PRNG (mulberry32). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFor(...parts) {
  return mulberry32(xmur3(parts.join('|'))());
}
