/**
 * UI smoke test — actually mounts both pages and drives them.
 *
 *   node test/smoke-ui.mjs
 *
 * Runs the real modules against the DOM shim in dom-shim.mjs. This is what
 * catches the class of bug `node --check` cannot see: a helper that was never
 * imported, a property read off the wrong shape, a render path that throws only
 * when a particular branch is taken.
 */

import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';

const { document, navigation } = installDom();

let pass = 0;
let fail = 0;
const failures = [];

async function t(name, fn) {
  try { await fn(); pass++; }
  catch (e) { fail++; failures.push(`${name}\n    ${String(e && e.message).split('\n')[0]}`); }
}

const text = (node) => (node ? node.textContent : '');
const all = (sel) => document.body.querySelectorAll(sel);
const one = (sel) => document.body.querySelector(sel);
const byText = (sel, needle) =>
  all(sel).find((n) => n.textContent.toLowerCase().includes(needle.toLowerCase()));
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function resetBody() {
  document.body.childNodes = [];
  const boot = document.createElement('div');
  boot.setAttribute('id', 'boot');
  document.body.appendChild(boot);
  return boot;
}

/* =============================================== page 1 — configuration == */

const { mountConfigPage } = await import('../ui/config-page.js');
const store = await import('../lib/store.js');

let boot = resetBody();
mountConfigPage(boot);

await t('config: page mounts with all seven cards and a topbar', () => {
  assert.ok(one('.topbar'), 'no topbar');
  const cards = all('.card');
  assert.equal(cards.length, 7, `expected 7 cards, got ${cards.length}`);
  assert.ok(text(one('.page-head')).includes('Configuration'));
});

await t('config: defaults to demo data and says so', () => {
  const badge = one('.badge');
  assert.ok(badge, 'no mode badge');
  assert.equal(badge.textContent, 'Demo data');
  assert.ok(text(document.body).includes('deterministically from each domain name'),
    'the demo-data honesty note is missing');
});

await t('config: all 28 markets render and UK/US start selected', () => {
  const chips = all('.chips')[0].children;
  assert.equal(chips.length, 28, `expected 28 market chips, got ${chips.length}`);
  const on = chips.filter((c) => c.dataset.on === 'true').map((c) => c.textContent);
  assert.deepEqual(on.sort(), ['UK', 'US']);
});

await t('config: toggling a market updates the store and the chip', () => {
  const de = all('.chips')[0].children.find((c) => c.textContent === 'DE');
  de.click();
  assert.ok(store.getState().config.markets.includes('DE'));
  const after = all('.chips')[0].children.find((c) => c.textContent === 'DE');
  assert.equal(after.dataset.on, 'true');
  after.click(); // back to UK/US so later assertions are on the default config
  assert.ok(!store.getState().config.markets.includes('DE'));
});

await t('config: test connection is honest about being simulated', async () => {
  byText('button', 'Test connection').click();
  await tick(700);
  assert.ok(text(document.body).includes('no API call was made'),
    'simulated-check wording missing');
});

await t('config: switching to live mode reveals key fields and hides them again', () => {
  byText('button', 'Live SpyFu API').click();
  assert.ok(text(document.body).includes('Proxy URL'), 'proxy field missing in live mode');
  assert.ok(text(document.body).includes('Pro + AI'), 'plan requirement missing');
  assert.equal(one('.badge').textContent, 'Live API');
  byText('button', 'Demo data').click();
  assert.equal(one('.badge').textContent, 'Demo data');
});

await t('config: no cost estimate before a list is uploaded', () => {
  assert.ok(text(document.body).includes('Upload a list to see what a run will cost'));
  assert.ok(byText('button', 'Upload a list first').disabled);
});

await t('config: loading the sample list cleans it and shows the counters', async () => {
  byText('button', 'Use the sample list').click();
  await tick(120);

  const stats = all('.stat');
  assert.ok(stats.length >= 3, 'cleanup stats did not render');
  const nums = stats.map((s) => Number(s.querySelector('.n').textContent));
  assert.equal(nums[0], 194, `expected 194 analysable domains, got ${nums[0]}`);
  assert.equal(nums[1], 18, `expected 18 duplicates, got ${nums[1]}`);
  assert.equal(nums[2], 6, `expected 6 invalid+excluded, got ${nums[2]}`);
  assert.equal(store.getState().upload.urlColumn, 'Website');
});

await t('config: exclusions were loaded from the sample exclusion file', () => {
  const ex = store.getState().upload.exclusions;
  assert.ok(ex.includes('lockwoodfabrication'), 'exclusion list not populated');
});

await t('config: cost estimate appears and lands in the expected band', () => {
  assert.ok(text(document.body).includes('Estimated total'), 'no cost table');
  const total = text(document.body).match(/Estimated total\$(\d+\.\d\d)/);
  assert.ok(total, 'could not find the estimate total');
  const value = Number(total[1]);
  assert.ok(value > 1 && value < 5, `estimate $${value} outside the sane band`);
});

await t('config: the expensive endpoint is scoped to the top N, not the list', () => {
  const body = text(document.body);
  assert.ok(body.includes('top 25 only'), 'topN scoping not shown in the cost table');
  assert.ok(!body.includes('Ad copy history'), 'ad history must never be in a batch estimate');
});

await t('config: lowering the budget cap surfaces the over-cap warning', () => {
  const capInput = all('input').find((i) =>
    i.parentNode && text(i.parentNode).includes('Hard budget cap'));
  assert.ok(capInput, 'budget cap input not found');
  capInput.value = '0.5';
  capInput.dispatchEvent({ type: 'input', target: capInput });
  assert.ok(text(document.body).includes('Over your cap'), 'no over-cap warning');
  capInput.value = '25';
  capInput.dispatchEvent({ type: 'input', target: capInput });
  assert.ok(!text(document.body).includes('Over your cap'), 'warning did not clear');
});

await t('config: run button is enabled and priced', () => {
  const btn = byText('button', 'Analyse');
  assert.ok(btn, 'run button missing');
  assert.ok(!btn.disabled);
  assert.match(btn.textContent, /Analyse 194 domains · \$\d/);
});

await t('config: running the analysis fills the store and navigates', async () => {
  byText('button', 'Analyse').click();
  for (let i = 0; i < 200 && !store.getState().run; i++) await tick(25);
  const run = store.getState().run;
  assert.ok(run, 'run never completed');
  assert.equal(run.results.length, 194);
  assert.equal(navigation.href, 'signals.html', 'did not navigate to the signals page');
});

await t('config: the run survives into sessionStorage for the next page', () => {
  const raw = globalThis.sessionStorage.getItem('spyfu.intent.run.v1');
  assert.ok(raw, 'run was not persisted — the signals page would re-run it');
  assert.equal(JSON.parse(raw).results.length, 194);
});

/* ====================================================== page 2 — signals == */

const { mountSignalsPage } = await import('../ui/signals-page.js');

boot = resetBody();
mountSignalsPage(boot);

await t('signals: renders the summary, tabs and table from the stored run', () => {
  assert.ok(text(one('.page-head')).includes('Signals'));
  assert.ok(text(document.body).includes('194 companies analysed'));
  assert.equal(all('.tab').length, 3, 'expected three segment tabs');
  assert.ok(all('tr.prospect').length > 0, 'no prospect rows rendered');
});

await t('signals: headline stats are populated, not blank', () => {
  const stats = all('.stat');
  assert.equal(stats.length, 3);
  assert.ok(text(stats[0]).includes('Worth calling this week'));
  assert.ok(Number(stats[0].querySelector('.n').textContent) >= 0);
  assert.match(stats[2].querySelector('.n').textContent, /^\$[\d,]+/);
});

await t('signals: rows are sorted by intent score descending', () => {
  const scores = all('tr.prospect').map((tr) => Number(tr.querySelector('.score-num').textContent));
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i - 1] >= scores[i], `row ${i} broke the sort: ${scores[i - 1]} then ${scores[i]}`);
  }
});

await t('signals: every scored row carries chips and a why line', () => {
  const rows = all('tr.prospect').filter((tr) =>
    Number(tr.querySelector('.score-num').textContent) > 0);
  assert.ok(rows.length > 0, 'no scored rows in the qualified tab');
  for (const tr of rows.slice(0, 12)) {
    assert.ok(tr.querySelector('.chips').children.length > 0, 'a scored row has no chips');
    const why = text(tr.querySelector('.why'));
    assert.ok(why.length > 30, `why line too short: "${why}"`);
    assert.ok(!/undefined|NaN|\[object/.test(why), `why line has artefacts: "${why}"`);
  }
});

await t('signals: the No paid search tab shows the credibility warning', () => {
  const tab = all('.tab').find((x) => x.textContent.includes('No paid search'));
  tab.click();
  assert.ok(text(document.body).includes('This tab is not junk'), 'warning missing');
  assert.ok(text(document.body).includes('Performance Max'), 'the coverage caveat is missing');
  const rows = all('tr.prospect');
  assert.ok(rows.length > 0, 'no rows in the no-paid segment');
  all('.tab')[0].click(); // back to Qualified
});

await t('signals: a signal chip filters the table and clears again', () => {
  const before = all('tr.prospect').length;
  const filterChip = all('.chip').find((c) => c.textContent.startsWith('Spend ramp'));
  assert.ok(filterChip, 'no spend ramp filter chip');
  filterChip.click();
  const after = all('tr.prospect').length;
  assert.ok(after > 0 && after < before, `filter did nothing (${before} -> ${after})`);
  all('.chip').find((c) => c.textContent === 'clear').click();
  assert.equal(all('tr.prospect').length, before, 'clearing the filter did not restore rows');
});

await t('signals: search narrows the table', async () => {
  const search = all('input').find((i) => i.getAttribute('placeholder')?.includes('Search'));
  const before = all('tr.prospect').length;
  search.value = 'roofing';
  search.dispatchEvent({ type: 'input', target: search });
  await tick(260);
  const after = all('tr.prospect').length;
  assert.ok(after < before, `search did not filter (${before} -> ${after})`);
  search.value = '';
  search.dispatchEvent({ type: 'input', target: search });
  await tick(260);
});

await t('signals: sorting by spend reorders the table', () => {
  const header = all('th').find((h) => h.textContent.includes('Spend / mo'));
  header.click();
  const cells = all('tr.prospect').map((tr) => tr.childNodes[3].textContent);
  assert.ok(cells.length > 2);
  const nums = cells.map((c) => parseFloat(c.replace(/[^0-9.]/g, '')) || 0);
  assert.ok(nums[0] >= nums[nums.length - 1], 'spend sort did not apply');
  all('th').find((h) => h.textContent.includes('Intent')).click();
});

await t('signals: expanding a row renders the drill-down with a real chart', () => {
  all('tr.prospect')[0].click();
  const open = all('tr[data-open="true"]');
  assert.equal(open.length, 1, 'row did not open');
  assert.ok(one('.drill'), 'no drill-down panel');
  const svgs = all('svg').filter((s) => s.getAttribute('role') === 'img');
  assert.equal(svgs.length, 1, 'trend chart did not render');
  assert.ok(svgs[0].querySelectorAll('rect').length >= 12, 'chart has no monthly bars');
  assert.ok(svgs[0].querySelector('polyline'), 'chart has no organic line');
});

await t('signals: the drill-down decomposes the score into all nine rules', () => {
  const rows = all('.breakdown-row');
  assert.equal(rows.length, 9, `expected 9 rules in the breakdown, got ${rows.length}`);
  const fired = rows.filter((r) => r.dataset.fired === 'true');
  assert.ok(fired.length > 0, 'top row fired no rules');
  const weights = fired.map((r) => Number(r.querySelector('.w').textContent.replace('+', '')));
  const shown = Number(text(one('.drill')).match(/Score breakdown · (\d+)\/100/)[1]);
  assert.equal(shown, Math.min(100, weights.reduce((a, b) => a + b, 0)),
    'the displayed score does not equal the sum of the rules that fired');
});

await t('signals: the outreach opener is present and copyable', () => {
  assert.ok(text(one('.drill')).includes('Outreach opener'), 'no outreach panel');
  assert.ok(one('.copybox').textContent.length > 30, 'opener text too short');
  assert.ok(byText('button', 'Copy'), 'no copy button');
});

await t('signals: the ad-history endpoint is gated behind an explicit click', async () => {
  const btn = byText('button', 'Load ad copy history');
  assert.ok(btn, 'ad history button missing');
  assert.match(btn.textContent, /\$0\.15/);
  btn.click();
  await tick(700);
  assert.ok(text(document.body).includes('Ad copy turnover'), 'ad history did not load');
});

await t('signals: clicking inside the drill-down does not collapse the row', () => {
  assert.equal(all('tr[data-open="true"]').length, 1, 'row collapsed when the panel was used');
  all('tr[data-open="true"]')[0].click();
  assert.equal(all('tr[data-open="true"]').length, 0, 'row would not close');
});

await t('signals: exports produce rows with the why line intact', async () => {
  const { buildExportRows, buildSkyleadRows } = await import('../lib/exporters.js');
  const run = store.getState().run;
  const rows = buildExportRows(run.results, run.config);
  assert.equal(rows.length, 194);
  assert.ok('Company Name' in rows[0], 'original upload columns were lost');
  assert.ok('Why (outreach line)' in rows[0]);
  const sky = buildSkyleadRows(run.results);
  assert.ok(sky.length > 0 && sky.every((r) => r.first_line && r.intent_score > 0));
});

await t('signals: the scope disclosure card is on the page', () => {
  const body = text(document.body);
  assert.ok(body.includes('What this does and does not see'));
  assert.ok(body.includes('People moves and new hires'));
  assert.ok(body.includes('not in SpyFu'));
});

/* ---------------------------------------------------------- diff path --- */

await t('signals: a second run surfaces what changed since the last one', async () => {
  const { runAnalysis } = await import('../lib/provider.js');
  const { snapshotOf } = store;
  const first = store.getState().run;

  // Same list, but the previous snapshot is missing two signals — so the diff
  // must report them as newly firing.
  const doctored = snapshotOf(first.results).map((r, i) =>
    (i < 3 ? { ...r, firedIds: [], score: 0 } : r));
  store.setState({ lastSnapshot: doctored });

  const again = await runAnalysis({
    prospects: first.results.map((r) => ({ domain: r.domain, original: r.original })),
    config: first.config,
  });
  store.setState({ run: { ...again, config: first.config, uploadStats: first.uploadStats } });

  boot = resetBody();
  mountSignalsPage(boot);
  assert.ok(text(document.body).includes('Changed since your last run'), 'diff panel missing');
  assert.ok(text(document.body).includes('just started firing'), 'diff detail missing');
});

/* ----------------------------------------------------- empty-state path -- */

await t('signals: with no data at all it points back to configuration', () => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();
  store.resetAll();
  boot = resetBody();
  mountSignalsPage(boot);
  assert.ok(text(document.body).includes('No run yet'), 'empty state missing');
  assert.ok(all('a').some((a) => a.getAttribute('href') === 'index.html'), 'no way back');
});

/* -------------------------------------------------------------- report --- */

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  x ' + f));
  process.exit(1);
}
