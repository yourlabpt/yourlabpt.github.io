/**
 * Node test harness for lib/. Run with:  node test/run-tests.mjs
 *
 * lib/ is deliberately framework-free so this can run without a build step.
 * If you touch lib/, run this.
 */

import assert from 'node:assert/strict';
import { normalizeDomain, buildProspectList, detectUrlColumn } from '../lib/normalize.js';
import { parseCsv, toCsv } from '../lib/csv.js';
import { defaultConfig, COUNTRIES, DEFAULT_THRESHOLD } from '../lib/config.js';
import { mockStats } from '../lib/mock.js';
import { classify, runSpendCheck, SEGMENT_LABELS } from '../lib/spend-check.js';
import { buildExportRows } from '../lib/exporters.js';

let pass = 0;
let fail = 0;
const failures = [];

function t(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push(`${name}\n    ${e.message.split('\n')[0]}`); }
}
async function ta(name, fn) {
  try { await fn(); pass++; }
  catch (e) { fail++; failures.push(`${name}\n    ${e.message.split('\n')[0]}`); }
}

/* ---------------------------------------------------------- normalize --- */

t('normalize: strips scheme, www, path, query', () => {
  assert.equal(normalizeDomain('https://www.Example.co.uk/shop?a=1').domain, 'example.co.uk');
  assert.equal(normalizeDomain('HTTP://Foo.COM/a/b/c#x').domain, 'foo.com');
  assert.equal(normalizeDomain('  bar.io  ').domain, 'bar.io');
});

t('normalize: keeps registrable domain for multi-part suffixes', () => {
  assert.equal(normalizeDomain('shop.acme.co.uk').domain, 'acme.co.uk');
  assert.equal(normalizeDomain('news.bbc.com.au').domain, 'bbc.com.au');
  assert.equal(normalizeDomain('a.b.example.com').domain, 'example.com');
});

t('normalize: handles ports, emails, trailing dots', () => {
  assert.equal(normalizeDomain('example.com:8080').domain, 'example.com');
  assert.equal(normalizeDomain('jo@example.com').domain, 'example.com');
  assert.equal(normalizeDomain('example.com.').domain, 'example.com');
});

t('normalize: rejects junk', () => {
  for (const bad of ['', '   ', 'not a domain', 'localhost', '192.168.0.1', 'ftp://', 'com', 'n/a']) {
    assert.equal(normalizeDomain(bad).ok, false, `expected reject: "${bad}"`);
  }
});

t('normalize: null/undefined do not throw', () => {
  assert.equal(normalizeDomain(null).ok, false);
  assert.equal(normalizeDomain(undefined).ok, false);
});

t('prospect list: dedupes and counts', () => {
  const rows = [
    { Company: 'A', Website: 'https://www.acme.co.uk/' },
    { Company: 'B', Website: 'acme.co.uk' },              // duplicate
    { Company: 'C', Website: 'HTTP://ACME.CO.UK/about' },  // duplicate
    { Company: 'D', Website: 'nope' },                     // invalid
    { Company: 'F', Website: 'other.io' },
  ];
  const r = buildProspectList(rows, 'Website', []);
  assert.equal(r.stats.uploaded, 5);
  assert.equal(r.stats.valid, 2);
  assert.equal(r.stats.duplicates, 2);
  assert.equal(r.stats.invalid, 1);
  assert.deepEqual(r.prospects.map((p) => p.domain), ['acme.co.uk', 'other.io']);
});

t('prospect list: original row is preserved', () => {
  const rows = [{ Company: 'A', Owner: 'Jo', Website: 'acme.com' }];
  const r = buildProspectList(rows, 'Website', []);
  assert.equal(r.prospects[0].original.Owner, 'Jo');
});

t('detectUrlColumn: finds the website column by name and by content', () => {
  const rows = [
    { Company: 'A', 'Web Site': 'acme.com', Notes: 'hello' },
    { Company: 'B', 'Web Site': 'foo.co.uk', Notes: 'world' },
  ];
  assert.equal(detectUrlColumn(rows, ['Company', 'Web Site', 'Notes']), 'Web Site');
});

/* ---------------------------------------------------------------- csv --- */

t('csv: quoted fields, embedded commas and newlines', () => {
  const text = 'Company,Website,Note\r\n"Acme, Ltd",acme.com,"line1\nline2"\r\nFoo,foo.io,ok\r\n';
  const { columns, rows } = parseCsv(text);
  assert.deepEqual(columns, ['Company', 'Website', 'Note']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Company, 'Acme, Ltd');
});

t('csv: round-trips through toCsv', () => {
  const rows = [{ a: 'x,y', b: 'he said "no"' }];
  const back = parseCsv(toCsv(rows, ['a', 'b'])).rows[0];
  assert.deepEqual(back, rows[0]);
});

/* --------------------------------------------------------------- mock --- */

t('mock: deterministic — same domain+country, same numbers', () => {
  const a = mockStats('acme.co.uk', 'UK');
  const b = mockStats('acme.co.uk', 'UK');
  assert.deepEqual(a, b);
});

t('mock: different countries can give different numbers', () => {
  const a = mockStats('acme.co.uk', 'UK');
  const b = mockStats('acme.co.uk', 'US');
  assert.notDeepEqual(a, b);
});

t('mock: budgets and keywords are non-negative finite numbers, no zero-only distribution', () => {
  let sawPositive = false;
  for (let i = 0; i < 300; i++) {
    const r = mockStats(`sample${i}.com`, 'UK');
    assert.ok(Number.isFinite(r.budget) && r.budget >= 0);
    assert.ok(Number.isFinite(r.paidKeywords) && r.paidKeywords >= 0);
    if (r.budget > 0) sawPositive = true;
  }
  assert.ok(sawPositive, 'every domain in the sample came back with zero spend');
});

/* ---------------------------------------------------------- classify --- */

t('classify: zero is no_paid, above threshold is qualified, between is below', () => {
  assert.equal(classify(0, 2500), 'no_paid');
  assert.equal(classify(100, 2500), 'below');
  assert.equal(classify(2500, 2500), 'qualified');
  assert.equal(classify(9000, 2500), 'qualified');
});

t('config: default threshold and countries are sane', () => {
  const cfg = defaultConfig();
  assert.equal(cfg.threshold, DEFAULT_THRESHOLD);
  assert.deepEqual(cfg.countries, ['UK', 'US']);
  assert.ok(COUNTRIES.some((c) => c.code === 'UK'));
});

/* -------------------------------------------------------------- engine --- */

await ta('spend check: demo mode combines spend across countries and classifies', async () => {
  const prospects = Array.from({ length: 150 }, (_, i) => ({
    domain: `co${i}.com`, original: { Company: `Co ${i}` },
  }));
  const seen = [];
  const result = await runSpendCheck({
    prospects, countries: ['UK', 'US'], threshold: 2500, config: {},
    onProgress: (p) => seen.push(p),
  });

  assert.equal(result.results.length, 150);
  assert.equal(result.provider, 'demo-data');
  assert.ok(seen.length > 0, 'progress was never reported');
  assert.equal(
    result.counts.qualified + result.counts.below + result.counts.no_paid,
    150,
  );
  assert.ok(result.counts.qualified > 0, 'nobody qualified in a 150-domain sample');
  assert.ok(result.counts.no_paid > 0, 'nobody landed in no_paid in a 150-domain sample');

  for (const r of result.results) {
    const summed = Object.values(r.byCountry).reduce((a, v) => a + v.budget, 0);
    assert.equal(r.budget, summed, `${r.domain}: combined budget does not equal sum of countries`);
    assert.equal(r.segment, classify(r.budget, 2500));
  }
});

await ta('spend check: results are sorted by spend descending', async () => {
  const prospects = Array.from({ length: 80 }, (_, i) => ({ domain: `s${i}.com`, original: {} }));
  const result = await runSpendCheck({ prospects, countries: ['UK'], threshold: 2500, config: {} });
  for (let i = 1; i < result.results.length; i++) {
    assert.ok(result.results[i - 1].budget >= result.results[i].budget);
  }
});

await ta('spend check: single country run only populates that country', async () => {
  const prospects = [{ domain: 'onlyone.com', original: {} }];
  const result = await runSpendCheck({ prospects, countries: ['DE'], threshold: 2500, config: {} });
  assert.deepEqual(Object.keys(result.results[0].byCountry), ['DE']);
});

await ta('spend check: original upload columns survive to export', async () => {
  const prospects = [{ domain: 'acme.com', original: { Company: 'Acme', Owner: 'Jo' } }];
  const result = await runSpendCheck({ prospects, countries: ['UK'], threshold: 2500, config: {} });
  const rows = buildExportRows(result.results);
  assert.equal(rows[0].Company, 'Acme');
  assert.equal(rows[0].Owner, 'Jo');
  assert.equal(rows[0].Status, SEGMENT_LABELS[result.results[0].segment]);
  assert.ok('Monthly Spend (USD)' in rows[0]);
});

/* -------------------------------------------------------------- report --- */

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
