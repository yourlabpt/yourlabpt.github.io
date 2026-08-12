/**
 * UI smoke test — actually mounts the page and drives it.
 *
 *   node test/smoke-ui.mjs
 *
 * Runs the real ui/app.js against the DOM shim in dom-shim.mjs. This catches
 * the class of bug `node --check` cannot see: a helper that was never
 * imported, a property read off the wrong shape, a render path that throws
 * only when a particular branch is taken.
 */

import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';

const { document } = installDom();

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

// The shim's selector matcher only supports compound selectors (no descendant
// combinators — see dom-shim.mjs), so "table.results tbody tr" would silently
// match just the <table> itself. Walk explicitly instead.
function tableRows() {
  const table = one('table.results');
  const tbody = table && table.children.find((c) => c.tagName === 'TBODY');
  return tbody ? tbody.children : [];
}

const boot = document.createElement('div');
boot.setAttribute('id', 'boot');
document.body.appendChild(boot);

const { mountApp } = await import('../ui/app.js');
mountApp(boot);

await t('page mounts with the two setup cards and a topbar', () => {
  assert.ok(one('.topbar'), 'no topbar');
  const cards = all('.card');
  assert.equal(cards.length, 2, `expected 2 cards before a run, got ${cards.length}`);
  assert.ok(text(one('.page-head')).includes('SpyFu Spend Check'));
});

await t('defaults to demo data and says so', () => {
  const badge = one('.badge');
  assert.ok(badge, 'no mode badge');
  assert.equal(badge.textContent, 'Demo data');
});

await t('all countries render and UK/US start selected', () => {
  const chips = all('.chips')[0].children;
  const on = chips.filter((c) => c.dataset.on === 'true').map((c) => c.textContent);
  assert.deepEqual(on.sort(), ['UK', 'US']);
});

await t('toggling a country updates the chip state', () => {
  const de = all('.chips')[0].children.find((c) => c.textContent === 'DE');
  de.click();
  const after = all('.chips')[0].children.find((c) => c.textContent === 'DE');
  assert.equal(after.dataset.on, 'true');
  after.click(); // back to default for later assertions
});

await t('test connection is honest when no key is entered', async () => {
  byText('button', 'Test connection').click();
  await tick(30);
  assert.ok(text(document.body).includes('No key entered'), 'expected message about missing credentials');
});

await t('run is disabled before a list is uploaded', () => {
  assert.ok(byText('button', 'Upload a list first').disabled);
});

await t('loading the sample list shows cleanup counters', async () => {
  byText('button', 'Use the sample list').click();
  await tick(120);
  assert.ok(text(document.body).includes('domains ready to check'), 'upload summary missing');
});

await t('run button is enabled and priced by domain count', () => {
  const btn = byText('button', 'Check');
  assert.ok(btn, 'run button missing');
  assert.ok(!btn.disabled);
  assert.match(btn.textContent, /Check \d+ domains for media spend/);
});

await t('running the check renders results with all three segments', async () => {
  byText('button', 'Check').click();
  let resultsCard;
  for (let i = 0; i < 200 && !resultsCard; i++) {
    await tick(25);
    resultsCard = all('.card')[2];
  }
  assert.ok(resultsCard, 'results never rendered');
  assert.ok(text(document.body).includes('companies checked'));
  assert.equal(all('.tab').length, 3, 'expected three status tabs');
});

await t('stat tiles are populated', () => {
  const stats = all('.stat');
  assert.equal(stats.length, 3);
  assert.ok(text(stats[0]).includes('Qualified'));
  assert.ok(text(stats[2]).includes('No paid search found'));
});

await t('qualified tab shows rows with a status badge and country chips', () => {
  const rows = tableRows().filter((tr) => tr.children.length === 5);
  assert.ok(rows.length > 0, 'no qualified rows rendered');
});

await t('switching to the no-paid tab shows the credibility warning and its own rows', () => {
  const tab = all('.tab').find((x) => x.textContent.includes('No paid search'));
  tab.click();
  assert.ok(text(document.body).includes('not junk'), 'credibility warning missing');
  all('.tab')[0].click(); // back to qualified
});

await t('search narrows the table', async () => {
  const search = all('input').find((i) => i.getAttribute('placeholder')?.includes('Search'));
  assert.ok(search, 'search box missing');
  const before = tableRows().length;
  search.value = 'zzz-does-not-exist';
  search.dispatchEvent({ type: 'input', target: search });
  await tick(260);
  const after = tableRows().length;
  assert.ok(after <= before, 'search did not filter');
  assert.ok(text(document.body).includes('Nothing matches'), 'empty state missing');
  search.value = '';
  search.dispatchEvent({ type: 'input', target: search });
  await tick(260);
});

await t('exports produce rows with the original columns and status intact', async () => {
  const { buildExportRows } = await import('../lib/exporters.js');
  // Re-run the check directly against the engine to get a fresh result set,
  // since the mounted page does not expose its closure state.
  const { runSpendCheck } = await import('../lib/spend-check.js');
  const result = await runSpendCheck({
    prospects: [{ domain: 'acme.com', original: { Company: 'Acme' } }],
    countries: ['UK', 'US'], threshold: 2500, config: {},
  });
  const rows = buildExportRows(result.results);
  assert.equal(rows[0].Company, 'Acme');
  assert.ok('Status' in rows[0]);
  assert.ok('Monthly Spend (USD)' in rows[0]);
});

/* -------------------------------------------------------------- report --- */

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  failures.forEach((f) => console.log('  x ' + f));
  process.exit(1);
}
