/**
 * Node test harness for lib/. Run with:  node test/run-tests.mjs
 *
 * lib/ is deliberately framework-free so this can run without a build step.
 * If you touch lib/, run this.
 */

import assert from 'node:assert/strict';
import { normalizeDomain, buildProspectList, detectUrlColumn } from '../lib/normalize.js';
import { parseCsv, toCsv } from '../lib/csv.js';
import { defaultConfig } from '../lib/config.js';
import { estimateRun, maxDomainsForCap } from '../lib/cost.js';
import { generateRecord, enrichNewKeywords, CURATED } from '../lib/mock.js';
import { scoreRecord, scoreAll, summarise, diffRuns, SEGMENTS } from '../lib/score.js';
import { runAnalysis } from '../lib/provider.js';
import { buildExportRows, buildSkyleadRows } from '../lib/exporters.js';

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

t('prospect list: dedupes, excludes, counts', () => {
  const rows = [
    { Company: 'A', Website: 'https://www.acme.co.uk/' },
    { Company: 'B', Website: 'acme.co.uk' },              // duplicate
    { Company: 'C', Website: 'HTTP://ACME.CO.UK/about' },  // duplicate
    { Company: 'D', Website: 'nope' },                     // invalid
    { Company: 'E', Website: 'client.com' },               // excluded
    { Company: 'F', Website: 'other.io' },
  ];
  const r = buildProspectList(rows, 'Website', ['https://www.client.com']);
  assert.equal(r.stats.uploaded, 6);
  assert.equal(r.stats.valid, 2);
  assert.equal(r.stats.duplicates, 2);
  assert.equal(r.stats.invalid, 1);
  assert.equal(r.stats.excluded, 1);
  assert.deepEqual(r.prospects.map((p) => p.domain), ['acme.co.uk', 'other.io']);
});

t('prospect list: original row is preserved (NFR-11)', () => {
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

  const rows2 = [{ a: 'Acme', b: 'acme.com' }, { a: 'Foo', b: 'foo.io' }];
  assert.equal(detectUrlColumn(rows2, ['a', 'b']), 'b');
});

/* ---------------------------------------------------------------- csv --- */

t('csv: quoted fields, embedded commas and newlines', () => {
  const text = 'Company,Website,Note\r\n"Acme, Ltd",acme.com,"line1\nline2"\r\nFoo,foo.io,ok\r\n';
  const { columns, rows } = parseCsv(text);
  assert.deepEqual(columns, ['Company', 'Website', 'Note']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].Company, 'Acme, Ltd');
  assert.equal(rows[0].Note, 'line1\nline2');
});

t('csv: escaped quotes and semicolon delimiter', () => {
  assert.equal(parseCsv('a,b\n"say ""hi""",2').rows[0].a, 'say "hi"');
  assert.equal(parseCsv('a;b\n1;2').rows[0].b, '2');
});

t('csv: round-trips through toCsv', () => {
  const rows = [{ a: 'x,y', b: 'he said "no"' }];
  const back = parseCsv(toCsv(rows, ['a', 'b'])).rows[0];
  assert.deepEqual(back, rows[0]);
});

/* --------------------------------------------------------------- cost --- */

t('cost: 1000 domains lands in the $3-5 band from the plan', () => {
  const e = estimateRun({ domainCount: 1000, markets: ['UK'], topN: 25 });
  assert.ok(e.total >= 2 && e.total <= 6, `expected $2-6, got $${e.total.toFixed(2)}`);
});

t('cost: expensive endpoints are capped at topN, not the list size', () => {
  const small = estimateRun({ domainCount: 100, markets: ['UK'], topN: 25 });
  const big = estimateRun({ domainCount: 100000, markets: ['UK'], topN: 25 });
  const kwSmall = small.lines.find((l) => l.key === 'newKeywords');
  const kwBig = big.lines.find((l) => l.key === 'newKeywords');
  assert.equal(kwSmall.cost, kwBig.cost);
  assert.equal(kwBig.targets, 25);
});

t('cost: ad history is never batched into an estimate', () => {
  const e = estimateRun({ domainCount: 500, markets: ['UK'], topN: 25 });
  assert.equal(e.lines.find((l) => l.key === 'adHistory'), undefined);
});

t('cost: more markets costs proportionally more on per-market endpoints', () => {
  const one = estimateRun({ domainCount: 500, markets: ['UK'], topN: 25 });
  const two = estimateRun({ domainCount: 500, markets: ['UK', 'US'], topN: 25 });
  const b1 = one.lines.find((l) => l.key === 'bulkSnapshot').cost;
  const b2 = two.lines.find((l) => l.key === 'bulkSnapshot').cost;
  assert.ok(Math.abs(b2 - b1 * 2) < 1e-9);
});

t('cost: maxDomainsForCap respects the cap', () => {
  const n = maxDomainsForCap(5, ['UK'], 25);
  assert.ok(estimateRun({ domainCount: n, markets: ['UK'], topN: 25 }).total <= 5);
  assert.ok(estimateRun({ domainCount: n + 1, markets: ['UK'], topN: 25 }).total > 5);
});

/* --------------------------------------------------------------- mock --- */

const cfg = defaultConfig();

t('mock: deterministic — same domain, same numbers', () => {
  const a = generateRecord('acme.co.uk', cfg, new Date(Date.UTC(2026, 7, 1)));
  const b = generateRecord('acme.co.uk', cfg, new Date(Date.UTC(2026, 7, 1)));
  assert.deepEqual(a.markets, b.markets);
  assert.deepEqual(a.competitors, b.competitors);
});

t('mock: history is the right length and monotonic in month order', () => {
  const r = generateRecord('acme.co.uk', cfg, new Date(Date.UTC(2026, 7, 1)));
  const h = r.markets[cfg.markets[0]].history;
  assert.equal(h.length, cfg.thresholds.lookbackMonths + 1);
  for (let i = 1; i < h.length; i++) assert.ok(h[i].month > h[i - 1].month);
  assert.equal(h[h.length - 1].month, '2026-08');
});

t('mock: no NaN / negative budgets anywhere in a 300-domain sample', () => {
  for (let i = 0; i < 300; i++) {
    const r = generateRecord(`sample${i}.com`, cfg);
    for (const m of Object.values(r.markets)) {
      for (const p of m.history) {
        for (const k of ['budget', 'paidClicks', 'paidKeywords', 'organicClicks', 'organicKeywords', 'adRank', 'strength']) {
          assert.ok(Number.isFinite(p[k]), `${k} not finite on sample${i}.com`);
          assert.ok(p[k] >= 0, `${k} negative on sample${i}.com`);
        }
      }
    }
  }
});

/* -------------------------------------------------------------- rules --- */

function scoreOf(domain) {
  let rec = generateRecord(domain, cfg, new Date(Date.UTC(2026, 7, 1)));
  rec = enrichNewKeywords(rec);
  return scoreRecord(rec, cfg);
}

t('rules: curated ramp domains fire spend_ramp', () => {
  for (const d of Object.keys(CURATED).filter((k) => CURATED[k] === 'ramp')) {
    assert.ok(scoreOf(d).firedIds.includes('spend_ramp'), `${d} did not fire spend_ramp`);
  }
});

t('rules: curated new-advertiser domains fire new_advertiser', () => {
  for (const d of Object.keys(CURATED).filter((k) => CURATED[k] === 'new_advertiser')) {
    assert.ok(scoreOf(d).firedIds.includes('new_advertiser'), `${d} did not fire new_advertiser`);
  }
});

t('rules: curated collapse domains fire spend_collapse', () => {
  for (const d of Object.keys(CURATED).filter((k) => CURATED[k] === 'collapse')) {
    assert.ok(scoreOf(d).firedIds.includes('spend_collapse'), `${d} did not fire spend_collapse`);
  }
});

t('rules: curated new-market domains fire new_market', () => {
  for (const d of Object.keys(CURATED).filter((k) => CURATED[k] === 'new_market')) {
    assert.ok(scoreOf(d).firedIds.includes('new_market'), `${d} did not fire new_market`);
  }
});

t('rules: curated inefficient domain fires inefficiency but NOT spend_ramp', () => {
  const s = scoreOf('crestlinehvac.com');
  assert.ok(s.firedIds.includes('inefficiency'), 'inefficiency did not fire');
  assert.ok(!s.firedIds.includes('spend_ramp'), 'spend_ramp should stay below threshold here');
});

t('rules: curated organic-pain domain fires organic_pain', () => {
  assert.ok(scoreOf('fenwickinteriors.co.uk').firedIds.includes('organic_pain'));
});

t('rules: no-paid domains score 0 and land in the No paid search segment', () => {
  for (const d of Object.keys(CURATED).filter((k) => CURATED[k] === 'no_paid')) {
    const s = scoreOf(d);
    assert.equal(s.segment, SEGMENTS.NO_PAID, `${d} segment was ${s.segment}`);
    assert.equal(s.score, 0);
  }
});

t('rules: below-threshold domain is NOT marked qualified', () => {
  assert.equal(scoreOf('atlascleaningservices.com').segment, SEGMENTS.BELOW);
});

t('rules: new_market cannot fire when only one market is selected', () => {
  const one = { ...cfg, markets: ['UK'] };
  const rec = generateRecord('valleyhomecare.com', one, new Date(Date.UTC(2026, 7, 1)));
  assert.ok(!scoreRecord(rec, one).firedIds.includes('new_market'));
});

t('rules: every fired rule carries a non-empty why string and a chip', () => {
  for (const d of Object.keys(CURATED)) {
    const s = scoreOf(d);
    for (const b of s.breakdown.filter((x) => x.fired)) {
      assert.ok(b.why && b.why.length > 20, `${d}/${b.id} has no usable why string`);
    }
    for (const c of s.chips) assert.ok(c.text && c.text.length, `${d} chip empty`);
  }
});

t('rules: why strings contain no template artefacts', () => {
  for (const d of Object.keys(CURATED)) {
    for (const b of scoreOf(d).breakdown.filter((x) => x.fired)) {
      assert.ok(!/undefined|NaN|\$\{|\[object/.test(b.why), `${d}/${b.id}: "${b.why}"`);
      assert.ok(!/ {2}|\s,|\s\./.test(b.why), `${d}/${b.id} has spacing artefacts: "${b.why}"`);
    }
  }
});

t('score: clamped to 0-100 and decomposes to the rules that fired', () => {
  for (let i = 0; i < 400; i++) {
    const s = scoreOf(`t${i}.com`);
    assert.ok(s.score >= 0 && s.score <= 100);
    const sum = s.breakdown.filter((b) => b.fired).reduce((a, b) => a + b.weight, 0);
    assert.equal(s.score, Math.min(100, sum));
  }
});

t('score: results are sorted by score descending', () => {
  const recs = Array.from({ length: 120 }, (_, i) => generateRecord(`s${i}.com`, cfg));
  const out = scoreAll(recs, cfg);
  for (let i = 1; i < out.length; i++) assert.ok(out[i - 1].score >= out[i].score);
});

t('score: thresholds actually change the answer', () => {
  const rec = generateRecord('northgate-roofing.co.uk', cfg, new Date(Date.UTC(2026, 7, 1)));
  const strict = { ...cfg, thresholds: { ...cfg.thresholds, rampPct: 500 } };
  assert.ok(scoreRecord(rec, cfg).firedIds.includes('spend_ramp'));
  assert.ok(!scoreRecord(rec, strict).firedIds.includes('spend_ramp'));
});

t('score: summarise segments add up to the total', () => {
  const recs = Array.from({ length: 200 }, (_, i) => generateRecord(`u${i}.com`, cfg));
  const s = summarise(scoreAll(recs, cfg));
  assert.equal(s.bySegment.qualified + s.bySegment.below + s.bySegment.no_paid, s.total);
});

t('diff: detects newly firing signals between runs', () => {
  const prev = [{ domain: 'a.com', score: 10, firedIds: ['organic_pain'] },
                { domain: 'b.com', score: 0, firedIds: [] }];
  const cur = [{ domain: 'a.com', score: 35, firedIds: ['organic_pain', 'spend_ramp'] },
               { domain: 'b.com', score: 0, firedIds: [] },
               { domain: 'c.com', score: 20, firedIds: ['new_advertiser'] }];
  const d = diffRuns(prev, cur);
  assert.deepEqual(d.newlyFiring.map((r) => r.domain), ['a.com']);
  assert.deepEqual(d.newDomains.map((r) => r.domain), ['c.com']);
  assert.deepEqual(d.scoreJumps.map((r) => r.domain), ['a.com']);
});

/* ------------------------------------------------------------ pipeline --- */

await ta('pipeline: end-to-end run produces a sane distribution', async () => {
  const prospects = Array.from({ length: 150 }, (_, i) => ({
    domain: `co${i}.com`, original: { Company: `Co ${i}`, Website: `co${i}.com` },
  }));
  const seen = [];
  const run = await runAnalysis({ prospects, config: cfg, onProgress: (p) => seen.push(p) });

  assert.equal(run.results.length, 150);
  assert.ok(seen.length > 5, 'progress was never reported');
  assert.ok(run.summary.bySegment.qualified > 0, 'nobody qualified');
  assert.ok(run.summary.bySegment.no_paid > 0, 'no "no paid search" rows — segment tab would be empty');
  assert.ok(run.summary.hot > 0, 'no high-scoring prospects at all');
  assert.ok(run.summary.hot < run.results.length * 0.6, 'suspiciously many hot prospects');
  assert.ok(run.cost.total > 0);
});

await ta('pipeline: expensive endpoint touched only the top N (the cost rule)', async () => {
  const prospects = Array.from({ length: 120 }, (_, i) => ({ domain: `x${i}.com`, original: {} }));
  const run = await runAnalysis({ prospects, config: cfg });
  const enriched = run.results.filter((r) => r.record.newKeywords !== null).length;
  assert.ok(enriched <= cfg.thresholds.topN,
    `newKeywords ran on ${enriched} domains, topN is ${cfg.thresholds.topN}`);
});

await ta('pipeline: original upload columns survive to export', async () => {
  const prospects = [{ domain: 'acme.com', original: { Company: 'Acme', Owner: 'Jo', Website: 'acme.com' } }];
  const run = await runAnalysis({ prospects, config: cfg });
  const rows = buildExportRows(run.results, cfg);
  assert.equal(rows[0].Company, 'Acme');
  assert.equal(rows[0].Owner, 'Jo');
  assert.ok('Intent Score' in rows[0]);
  assert.ok('Why (outreach line)' in rows[0]);
});

await ta('pipeline: skylead export only contains scored rows and a first line', async () => {
  const prospects = Array.from({ length: 80 }, (_, i) => ({
    domain: `sky${i}.com`, original: { Company: `Sky ${i}` },
  }));
  const run = await runAnalysis({ prospects, config: cfg });
  const rows = buildSkyleadRows(run.results);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(r.intent_score > 0);
    assert.ok(r.website.startsWith('https://'));
    assert.ok(r.first_line && r.first_line.length > 10);
    assert.equal(r.company, `Sky ${r.website.replace('https://sky', '').replace('.com', '')}`);
  }
});

/* -------------------------------------------------------------- report --- */

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
