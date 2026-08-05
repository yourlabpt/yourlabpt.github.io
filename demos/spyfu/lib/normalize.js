/**
 * URL -> registrable root domain, with dedupe and exclusion handling.
 *
 * Dedupe is COST CONTROL, not tidiness: SpyFu bills per row returned, so every
 * duplicate removed before the call is money saved. The counts this module
 * returns are shown in the UI for exactly that reason.
 */

// Common multi-label public suffixes. Not the full PSL (too big to ship for a
// demo) but it covers the markets this product actually sells into.
const MULTI_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'net.uk', 'sch.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'net.nz', 'org.nz',
  'com.br', 'net.br', 'org.br', 'gov.br',
  'co.za', 'org.za', 'net.za',
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp',
  'com.mx', 'org.mx',
  'com.sg', 'com.tr', 'com.ar', 'com.pl', 'com.pt', 'com.es', 'com.de',
  'co.in', 'net.in', 'org.in',
  'com.ua', 'co.il', 'com.hk', 'com.cn', 'com.tw',
]);

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * @returns {{ ok: boolean, domain: string|null, reason: string|null }}
 */
export function normalizeDomain(raw) {
  if (raw === null || raw === undefined) return fail('empty');
  let s = String(raw).trim().toLowerCase();
  if (!s) return fail('empty');

  // Strip a leading scheme, and anything that looks like an email address.
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  if (s.includes('@')) s = s.slice(s.lastIndexOf('@') + 1);

  // Strip path, query, fragment, port, credentials, trailing dot.
  s = s.split(/[/?#\\]/)[0];
  s = s.split(':')[0];
  s = s.replace(/\.+$/, '');
  if (!s) return fail('empty');

  if (IPV4_RE.test(s)) return fail('ip address');
  if (s === 'localhost') return fail('not a public domain');

  // Drop www / m / www2 style prefixes.
  s = s.replace(/^(www\d*|m|mobile|shop)\./, '');

  const labels = s.split('.');
  if (labels.length < 2) return fail('no TLD');
  for (const l of labels) {
    if (!LABEL_RE.test(l)) return fail('invalid characters');
  }

  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) return fail('invalid TLD');

  const lastTwo = labels.slice(-2).join('.');
  const keep = MULTI_SUFFIXES.has(lastTwo) ? 3 : 2;
  if (labels.length < keep) return fail('incomplete domain');

  return { ok: true, domain: labels.slice(-keep).join('.'), reason: null };
}

function fail(reason) {
  return { ok: false, domain: null, reason };
}

/**
 * Turn raw uploaded rows into a deduped, filtered prospect list.
 *
 * @param rows        array of objects (parsed CSV/XLSX rows)
 * @param urlColumn   the column holding the website
 * @param exclusions  array of strings (domains or URLs) to drop
 * @returns { prospects, stats, invalidRows, excludedRows }
 */
export function buildProspectList(rows, urlColumn, exclusions = []) {
  const excludeSet = new Set();
  for (const e of exclusions) {
    const n = normalizeDomain(e);
    if (n.ok) excludeSet.add(n.domain);
  }

  const seen = new Map();
  const prospects = [];
  const invalidRows = [];
  const excludedRows = [];
  let duplicates = 0;

  rows.forEach((row, i) => {
    const value = row[urlColumn];
    const n = normalizeDomain(value);

    if (!n.ok) {
      invalidRows.push({ rowIndex: i, value: value ?? '', reason: n.reason });
      return;
    }
    if (excludeSet.has(n.domain)) {
      excludedRows.push({ rowIndex: i, domain: n.domain });
      return;
    }
    if (seen.has(n.domain)) {
      duplicates += 1;
      seen.get(n.domain).duplicateOf.push(i);
      return;
    }
    const p = { domain: n.domain, rowIndex: i, original: row, duplicateOf: [] };
    seen.set(n.domain, p);
    prospects.push(p);
  });

  return {
    prospects,
    invalidRows,
    excludedRows,
    stats: {
      uploaded: rows.length,
      valid: prospects.length,
      duplicates,
      invalid: invalidRows.length,
      excluded: excludedRows.length,
    },
  };
}

/**
 * Guess which column holds the website. Scores by header name first, then by
 * how many values in the column actually normalise to a domain.
 */
export function detectUrlColumn(rows, columns) {
  if (!rows.length || !columns.length) return null;
  const sample = rows.slice(0, 60);
  const NAME_HINTS = [
    [/^(website|web site|url|domain|site)$/i, 100],
    [/(website|domain)/i, 70],
    [/\b(url|homepage|www|web)\b/i, 50],
    [/link/i, 20],
  ];

  let best = null;
  for (const col of columns) {
    let score = 0;
    for (const [re, pts] of NAME_HINTS) {
      if (re.test(String(col))) { score += pts; break; }
    }
    let hits = 0;
    for (const r of sample) {
      if (normalizeDomain(r[col]).ok) hits += 1;
    }
    score += (hits / Math.max(1, sample.length)) * 100;
    if (hits === 0) score = -1;
    if (!best || score > best.score) best = { col, score };
  }
  return best && best.score > 25 ? best.col : null;
}
