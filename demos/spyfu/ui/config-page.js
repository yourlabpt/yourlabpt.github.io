/**
 * Page 1 — Configuration.
 *
 * Sections are built once and updated surgically. A full re-render on every
 * keystroke would steal focus from the text inputs, so anything typed updates
 * the store and then calls only the derived regions (stats, cost, run button).
 */

import { el, fill, clear, toast, topbar, debounce } from './dom.js';
import { card, field, stat, callout, chip, progressBar, input, select, numberInput } from './components.js';

import { MARKETS, FX, DEFAULT_THRESHOLDS } from '../lib/config.js';
import { parseCsv } from '../lib/csv.js';
import { parseWorkbook } from '../lib/exporters.js';
import { buildProspectList, detectUrlColumn, normalizeDomain } from '../lib/normalize.js';
import { estimateRun, maxDomainsForCap } from '../lib/cost.js';
import { runAnalysis } from '../lib/provider.js';
import { createSpyfuClient } from '../lib/spyfu.js';
import { fmtMoneyExact } from '../lib/util.js';
import { getState, setState, hydrate, snapshotOf, resetAll, asset } from '../lib/store.js';

let prepared = null;
let estimate = null;

/* ------------------------------------------------------------ helpers --- */

const cfg = () => getState().config;
const upload = () => getState().upload;

function patchConfig(patch) {
  setState((s) => ({ config: { ...s.config, ...patch } }));
}

function recompute() {
  const u = upload();
  if (!u) { prepared = null; estimate = null; return; }
  const exclusions = String(u.exclusions || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  prepared = buildProspectList(u.rows, u.urlColumn, exclusions);
  estimate = estimateRun({
    domainCount: prepared.prospects.length,
    markets: cfg().markets,
    topN: cfg().thresholds.topN,
  });
}

/* -------------------------------------------------------------- mount --- */

export function mountConfigPage(root) {
  hydrate();
  recompute();

  const shell = el('main', { class: 'shell' });
  document.body.appendChild(topbar('config'));
  document.body.appendChild(shell);

  shell.appendChild(el('div', { class: 'page-head' },
    el('h1', {}, 'Configuration'),
    el('p', { class: 'lede' },
      'Point this at a list of companies. It returns the ones showing purchase intent right now, '
      + 'ranked, with a sentence you can open an email with. SpyFu is signal source #1 — spend and '
      + 'keyword behaviour. Other sources plug in behind the same scoring layer.'),
  ));

  const sections = el('div', { class: 'section-gap' });
  shell.appendChild(sections);

  const sourceCard = card({ idx: '01', title: 'Data source' });
  const marketCard = card({ idx: '02', title: 'Markets' });
  const listCard = card({ idx: '03', title: 'Prospect list' });
  const exclCard = card({ idx: '04', title: 'Exclusions', note: 'existing clients and competitors never hit the API' });
  const threshCard = card({ idx: '05', title: 'Thresholds and weights', note: 'saved as part of this profile' });
  const costCard = card({ idx: '06', title: 'Cost estimate', note: 'SpyFu bills per row returned, not per request' });
  const runCard = card({ idx: '07', title: 'Run' });

  sections.append(sourceCard, marketCard, listCard, exclCard, threshCard, costCard, runCard);

  const render = {
    source: () => renderSource(sourceCard, render),
    markets: () => renderMarkets(marketCard, render),
    list: () => renderList(listCard, render),
    exclusions: () => renderExclusions(exclCard, render),
    thresholds: () => renderThresholds(threshCard, render),
    cost: () => renderCost(costCard, render),
    run: () => renderRun(runCard, render),
    derived: () => { recompute(); render.cost(); render.run(); },
    all: () => {
      recompute();
      render.source(); render.markets(); render.list();
      render.exclusions(); render.thresholds(); render.cost(); render.run();
    },
  };

  render.all();
  root.remove();
}

/* ---------------------------------------------------------- 01 source --- */

function renderSource(node, render) {
  const c = cfg();
  const body = clear(node.body);

  const head = node.querySelector('.card-head');
  let badge = head.querySelector('.badge');
  if (!badge) {
    badge = el('span', { class: 'badge' });
    head.append(el('span', { class: 'spacer' }), badge);
  }
  badge.className = `badge ${c.mode === 'live' ? 'badge-live' : 'badge-demo'}`;
  badge.textContent = c.mode === 'live' ? 'Live API' : 'Demo data';

  const result = el('div', {});

  body.appendChild(el('div', { class: 'inline', style: { marginBottom: '16px' } },
    el('button', {
      class: `btn ${c.mode === 'mock' ? 'btn-primary' : ''}`, type: 'button',
      onclick: () => { patchConfig({ mode: 'mock' }); render.source(); },
    }, 'Demo data'),
    el('button', {
      class: `btn ${c.mode === 'live' ? 'btn-primary' : ''}`, type: 'button',
      onclick: () => { patchConfig({ mode: 'live' }); render.source(); },
    }, 'Live SpyFu API'),
    el('span', { class: 'spacer' }),
    el('button', {
      class: 'btn', type: 'button',
      onclick: (e) => testConnection(e.currentTarget, result),
    }, 'Test connection'),
  ));

  if (c.mode === 'mock') {
    body.appendChild(callout(null,
      el('strong', {}, 'Demo data.'),
      ' Figures are generated deterministically from each domain name, so the same list always '
      + 'returns the same answer. Nothing is sent anywhere and no API credit is used. The scoring, '
      + 'cost model and exports are the real ones — only the source data is synthetic.'));
  } else {
    const apiId = input({ value: c.apiId, placeholder: 'SPYFU_API_ID',
      oninput: (e) => patchConfig({ apiId: e.target.value }) });
    const secret = el('input', { type: 'password', autocomplete: 'off', value: c.secretKey,
      placeholder: '••••••••••••••••', oninput: (e) => patchConfig({ secretKey: e.target.value }) });
    const proxy = input({ value: c.proxyUrl, placeholder: 'https://yourlabpt.com/spyfu-proxy',
      oninput: (e) => patchConfig({ proxyUrl: e.target.value }) });

    body.appendChild(el('div', { class: 'grid grid-2' },
      field({ label: 'SpyFu API ID', control: apiId,
        hint: 'Held in memory for this session only. Never written to disk, never logged.' }),
      field({ label: 'Secret key', control: secret,
        hint: 'Masked, and never persisted to browser storage.' }),
    ));
    body.appendChild(field({
      label: 'Proxy URL', control: proxy,
      hint: 'Run server/proxy.mjs on your own machine with SPYFU_API_ID and SPYFU_SECRET_KEY in its environment. The browser talks only to the proxy.',
    }));
    body.appendChild(callout('warn',
      el('strong', {}, 'Requires SpyFu Pro + AI'),
      ' ($40/mo API credit) or Team/Agency ($100/mo). Billing is per row returned, not per request.'));
  }

  body.appendChild(result);
}

async function testConnection(btn, target) {
  const c = cfg();
  btn.disabled = true;
  btn.textContent = 'Testing…';
  clear(target);
  try {
    if (c.mode !== 'live') {
      await new Promise((r) => setTimeout(r, 500));
      // Honest about being simulated — never imply an API call happened.
      fill(target, el('div', { class: 'callout mt' },
        el('strong', {}, 'Simulated check'),
        ' — Demo data mode, no API call was made. ',
        el('span', { class: 'muted' },
          'Switch to Live SpyFu API and point at a running proxy to test a real key.')));
    } else if (!c.proxyUrl) {
      fill(target, el('div', { class: 'callout bad mt' },
        el('strong', {}, 'No proxy URL set.'),
        ' The browser never holds your key. Run server/proxy.mjs and put its URL here.'));
    } else {
      const r = await createSpyfuClient({ proxyUrl: c.proxyUrl }).testConnection();
      const spend = r.monthToDateUsd !== null && r.monthToDateUsd !== undefined
        ? `Month-to-date API spend: $${Number(r.monthToDateUsd).toFixed(2)}`
        : 'Connected. Usage figure not returned by the account endpoint.';
      fill(target, el('div', { class: 'callout mt' },
        el('strong', {}, 'Connected'), ' — Key valid. ', el('span', { class: 'muted' }, spend)));
    }
  } catch (err) {
    fill(target, el('div', { class: 'callout bad mt' },
      el('strong', {}, 'Failed'), ' — ', String(err.message || err)));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test connection';
  }
}

/* --------------------------------------------------------- 02 markets --- */

function renderMarkets(node, render) {
  const c = cfg();
  const body = clear(node.body);
  const note = node.querySelector('.card-note');
  const noteText = `${c.markets.length} selected · spend is reported per country`;
  if (note) note.textContent = noteText;
  else node.querySelector('.card-head').appendChild(el('span', { class: 'card-note' }, noteText));

  body.appendChild(el('div', { class: 'chips', style: { marginBottom: '14px' } },
    ...MARKETS.map((m) => chip(null, m.code, {
      active: c.markets.includes(m.code),
      onClick: () => {
        patchConfig({
          markets: c.markets.includes(m.code)
            ? c.markets.filter((x) => x !== m.code)
            : [...c.markets, m.code],
        });
        render.markets();
        render.derived();
      },
    })),
  ));

  if (c.markets.length < 2) {
    body.appendChild(callout('warn',
      'With one market selected, the ', el('strong', {}, 'new market entry'),
      ' signal cannot fire. Add at least two to detect geographic expansion.'));
  }

  const fx = numberInput({
    step: '0.01', min: '0.01', value: c.currency === 'USD' ? 1 : c.fxRate,
    disabled: c.currency === 'USD',
    oninput: (e) => patchConfig({ fxRate: Number(e.target.value) || 1 }),
  });

  body.appendChild(el('div', { class: 'row mt' },
    field({
      label: 'Reporting currency',
      hint: 'SpyFu reports in USD. Conversion is display only.',
      control: select(Object.keys(FX), {
        value: c.currency,
        onchange: (e) => { patchConfig({ currency: e.target.value }); render.markets(); },
      }),
    }),
    field({ label: 'FX rate (USD → selected)', hint: 'Fixed rate. No live FX call during a demo.', control: fx }),
  ));
}

/* ------------------------------------------------------------ 03 list --- */

function renderList(node, render) {
  const u = upload();
  const body = clear(node.body);
  const note = node.querySelector('.card-note');
  const noteText = u ? u.fileName : 'CSV or XLSX';
  if (note) note.textContent = noteText;
  else node.querySelector('.card-head').appendChild(el('span', { class: 'card-note' }, noteText));

  const error = el('div', {});

  if (!u) {
    const picker = el('input', {
      type: 'file', accept: '.csv,.tsv,.xlsx,.xlsm,.xls', style: { display: 'none' },
      onchange: (e) => { const f = e.target.files && e.target.files[0]; if (f) readFile(f, render, error); },
    });
    const zone = el('div', { class: 'dropzone' },
      el('div', { class: 'big' }, 'Drop a CSV or XLSX here'),
      el('div', { class: 'muted tiny', style: { marginBottom: '16px' } },
        'Any columns. The website column is detected automatically and every original column is '
        + 'preserved through to export.'),
      el('div', { class: 'inline', style: { justifyContent: 'center' } },
        el('button', { class: 'btn', type: 'button', onclick: () => picker.click() }, 'Choose a file'),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => loadSample(render, error) },
          'Use the sample list'),
      ),
      picker,
    );
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.dataset.over = 'true'; });
    zone.addEventListener('dragleave', () => { zone.dataset.over = 'false'; });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.dataset.over = 'false';
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFile(f, render, error);
    });
    body.append(zone, error);
    return;
  }

  body.appendChild(el('div', { class: 'row', style: { marginBottom: '14px' } },
    field({
      label: 'Website column', hint: 'Auto-detected. Change it if we picked wrong.',
      control: select(u.columns, {
        value: u.urlColumn,
        onchange: (e) => {
          setState((s) => ({ upload: { ...s.upload, urlColumn: e.target.value }, run: null }));
          render.list(); render.derived();
        },
      }),
    }),
    el('div', { class: 'shrink' },
      el('button', {
        class: 'btn btn-ghost btn-danger', type: 'button',
        onclick: () => { setState({ upload: null, run: null }); render.list(); render.derived(); },
      }, 'Remove list')),
  ));

  const statsHost = el('div', {});
  statsHost.id = 'upload-stats';
  body.append(statsHost, error);
  renderUploadStats(statsHost);
}

/** Split out because the exclusions textarea updates it on every keystroke. */
function renderUploadStats(host) {
  const u = upload();
  if (!u || !prepared) return;
  const s = prepared.stats;

  fill(host,
    el('div', { class: 'grid grid-3', style: { marginBottom: '12px' } },
      stat({ n: s.valid, l: 'Domains to analyse', tone: 'accent-color',
        sub: `from ${s.uploaded} uploaded rows` }),
      stat({ n: s.duplicates, l: 'Duplicates removed',
        sub: 'deduping is cost control — each one saved an API row' }),
      stat({ n: s.invalid + s.excluded, l: 'Invalid or excluded',
        sub: `${s.invalid} unusable · ${s.excluded} on your exclusion list` }),
    ),
    el('details', { class: 'adv' },
      el('summary', {}, 'Show what was cleaned up'),
      el('div', { class: 'grid grid-2 mt' },
        el('div', { class: 'panel' },
          el('h4', {}, 'Normalised'),
          ...u.rows.slice(0, 6).map((r) => {
            const raw = String(r[u.urlColumn] ?? '');
            const n = normalizeDomain(raw);
            return el('div', { class: 'kv' },
              el('span', { class: 'k mono tiny' }, raw || '(blank)'),
              el('span', { class: 'v', style: { color: n.ok ? 'var(--accent-color)' : 'var(--red)' } },
                n.ok ? n.domain : n.reason));
          }),
        ),
        el('div', { class: 'panel' },
          el('h4', {}, 'Dropped rows'),
          (prepared.invalidRows.length === 0 && prepared.excludedRows.length === 0)
            ? el('div', { class: 'muted tiny' }, 'Nothing dropped.') : null,
          ...prepared.invalidRows.slice(0, 5).map((r) => el('div', { class: 'kv' },
            el('span', { class: 'k mono tiny' }, r.value || '(blank)'),
            el('span', { class: 'v', style: { color: 'var(--red)' } }, r.reason))),
          ...prepared.excludedRows.slice(0, 5).map((r) => el('div', { class: 'kv' },
            el('span', { class: 'k mono tiny' }, r.domain),
            el('span', { class: 'v', style: { color: 'var(--amber)' } }, 'excluded'))),
        ),
      ),
    ),
  );
}

async function readFile(file, render, errorHost) {
  try {
    let parsed;
    if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
      parsed = await parseWorkbook(await file.arrayBuffer());
    } else {
      parsed = parseCsv(await file.text());
    }
    ingest(file.name, parsed.columns, parsed.rows, render, errorHost);
  } catch (err) {
    fill(errorHost, el('div', { class: 'callout bad mt' },
      /SheetJS/i.test(String(err.message))
        ? 'Excel parsing needs the SheetJS CDN, which is not reachable right now. Save the file as CSV and try again.'
        : `Could not read that file: ${err.message}`));
  }
}

function ingest(fileName, columns, rows, render, errorHost) {
  if (!rows.length) {
    fill(errorHost, el('div', { class: 'callout bad mt' }, 'That file had no data rows.'));
    return;
  }
  setState((s) => ({
    upload: {
      fileName, columns, rows,
      urlColumn: detectUrlColumn(rows, columns) || columns[0],
      exclusions: (s.upload && s.upload.exclusions) || '',
    },
    run: null,
  }));
  render.list(); render.exclusions(); render.derived();
}

async function loadSample(render, errorHost) {
  try {
    const text = await fetch(asset('data/sample-prospects.csv')).then((r) => r.text());
    const { columns, rows } = parseCsv(text);
    ingest('sample-prospects.csv', columns, rows, render, errorHost);

    const ex = await fetch(asset('data/sample-exclusions.csv')).then((r) => r.text());
    const domains = parseCsv(ex).rows.map((r) => r.Website).filter(Boolean);
    setState((s) => ({ upload: { ...s.upload, exclusions: domains.join('\n') } }));
    render.exclusions(); render.derived();
    renderUploadStats(document.getElementById('upload-stats'));
    toast('Sample list loaded');
  } catch {
    fill(errorHost, el('div', { class: 'callout bad mt' },
      'Could not load the sample list. Serve this folder over http rather than opening the file directly.'));
  }
}

/* ------------------------------------------------------ 04 exclusions --- */

function renderExclusions(node, render) {
  const u = upload();
  const body = clear(node.body);

  const onInput = debounce(() => {
    render.derived();
    renderUploadStats(document.getElementById('upload-stats'));
  }, 220);

  const ta = el('textarea', {
    value: (u && u.exclusions) || '',
    placeholder: 'existingclient.co.uk\ncompetitor.com',
    disabled: !u,
    oninput: (e) => {
      const v = e.target.value;
      setState((s) => ({ upload: s.upload ? { ...s.upload, exclusions: v } : s.upload }));
      onInput();
    },
  });

  const picker = el('input', {
    type: 'file', accept: '.csv,.txt', style: { display: 'none' },
    onchange: async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const { rows, columns } = parseCsv(await f.text());
      const col = detectUrlColumn(rows, columns) || columns[0];
      const domains = rows.map((r) => r[col]).filter(Boolean);
      setState((s) => ({ upload: { ...s.upload, exclusions: domains.join('\n') } }));
      render.exclusions(); render.derived();
      renderUploadStats(document.getElementById('upload-stats'));
    },
  });

  body.append(
    field({
      label: 'One domain per line', control: ta,
      hint: 'Excluded rows are dropped before any request is made, so they cost nothing.',
    }),
    el('div', { class: 'inline' },
      el('button', { class: 'btn btn-sm', type: 'button', disabled: !u, onclick: () => picker.click() },
        'Upload an exclusion list'),
      picker,
    ),
  );
}

/* ------------------------------------------------------ 05 thresholds --- */

function renderThresholds(node, render) {
  const c = cfg();
  const body = clear(node.body);
  const t = (key, value) => {
    patchConfig({ thresholds: { ...cfg().thresholds, [key]: value } });
    render.derived();
  };

  body.appendChild(el('div', { class: 'grid grid-3' },
    field({
      label: 'Spend floor (USD/month)', hint: "Below this a prospect is 'advertising, but small'.",
      control: numberInput({ min: '0', step: '100', value: c.thresholds.spendFloor,
        oninput: (e) => t('spendFloor', Number(e.target.value) || 0) }),
    }),
    field({
      label: 'Ramp threshold (%)', hint: 'Rise vs the trailing 3-month average that counts as a ramp.',
      control: numberInput({ min: '1', step: '5', value: c.thresholds.rampPct,
        oninput: (e) => t('rampPct', Number(e.target.value) || 30) }),
    }),
    field({
      label: 'Collapse threshold (%)', hint: 'Month-on-month drop that counts as a collapse.',
      control: numberInput({ min: '1', step: '5', value: c.thresholds.collapsePct,
        oninput: (e) => t('collapsePct', Number(e.target.value) || 40) }),
    }),
  ));

  body.appendChild(el('details', { class: 'adv' },
    el('summary', {}, 'Signal weights'),
    el('div', { class: 'grid grid-3 mt' },
      ...Object.entries(c.weights).map(([id, w]) => field({
        label: id.replace(/_/g, ' '),
        control: numberInput({ min: '0', max: '50', value: w,
          oninput: (e) => {
            patchConfig({ weights: { ...cfg().weights, [id]: Number(e.target.value) || 0 } });
          } }),
      })),
    ),
    el('button', {
      class: 'btn btn-sm btn-ghost', type: 'button',
      onclick: () => {
        patchConfig({ thresholds: { ...DEFAULT_THRESHOLDS } });
        render.thresholds(); render.derived();
      },
    }, 'Reset thresholds to defaults'),
  ));
}

/* ------------------------------------------------------------ 06 cost --- */

function renderCost(node, render) {
  const c = cfg();
  const body = clear(node.body);

  if (!estimate) {
    body.appendChild(el('div', { class: 'muted' }, 'Upload a list to see what a run will cost.'));
    return;
  }

  body.appendChild(el('div', { class: 'table-wrap' },
    el('table', { class: 'results' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Endpoint'), el('th', {}, 'Scope'),
        el('th', { class: 'num' }, 'Domains'), el('th', { class: 'num' }, 'Rows'),
        el('th', { class: 'num' }, 'CPM'), el('th', { class: 'num' }, 'Cost'),
      )),
      el('tbody', {},
        ...estimate.lines.map((l) => el('tr', {},
          el('td', {}, l.label, el('div', { class: 'muted tiny' }, l.note)),
          el('td', { class: 'tiny muted' }, l.scope === 'all' ? 'whole list' : `top ${estimate.topN} only`),
          el('td', { class: 'num' }, l.targets.toLocaleString()),
          el('td', { class: 'num' }, l.rows.toLocaleString()),
          el('td', { class: 'num' }, `$${l.cpm.toFixed(2)}`),
          el('td', { class: 'num' }, `$${l.cost.toFixed(3)}`),
        )),
        el('tr', {},
          el('td', { class: 'right', colspan: '5', style: { fontWeight: '600' } }, 'Estimated total'),
          el('td', { class: 'num', style: { fontWeight: '700', color: 'var(--accent-color)' } },
            `$${estimate.total.toFixed(2)}`),
        ),
      ),
    ),
  ));

  body.appendChild(el('div', { class: 'row mt' },
    field({
      label: 'Hard budget cap for this run (USD)',
      hint: 'The run aborts with partial results rather than quietly overspending.',
      control: numberInput({ min: '0', step: '1', value: c.budgetCap,
        oninput: (e) => { patchConfig({ budgetCap: Number(e.target.value) || 0 }); render.derived(); } }),
    }),
    field({
      label: 'Expensive endpoints run on the top N',
      hint: 'Cheap endpoints scan everything; the $2 CPM ones only touch the shortlist.',
      control: numberInput({ min: '1', step: '5', value: c.thresholds.topN,
        oninput: (e) => {
          patchConfig({ thresholds: { ...cfg().thresholds, topN: Number(e.target.value) || 25 } });
          render.derived();
        } }),
    }),
  ));

  if (estimate.total > c.budgetCap) {
    const room = maxDomainsForCap(c.budgetCap, c.markets, c.thresholds.topN);
    body.appendChild(callout('bad',
      el('strong', {}, 'Over your cap.'),
      ` This run is estimated at $${estimate.total.toFixed(2)}, above the $${Number(c.budgetCap).toFixed(2)} cap. `
      + `At these settings the cap covers about ${room.toLocaleString()} domains — trim the list, `
      + 'cut a market, or raise the cap.'));
  }

  if (c.mode === 'mock') {
    body.appendChild(callout(null,
      'This estimate is the real pricing model, calculated from your actual list. In demo data mode '
      + 'nothing is charged — it is shown so you can see what a live run of this size would cost.'));
  }
}

/* ------------------------------------------------------------- 07 run --- */

function renderRun(node, render) {
  const body = clear(node.body);
  const s = getState();

  if (!prepared || !prepared.prospects.length) {
    body.appendChild(el('div', { class: 'inline' },
      el('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Upload a list first'),
      el('span', { class: 'spacer' }),
      resetButton(render),
    ));
    return;
  }

  const label = `Analyse ${prepared.prospects.length} domains · ${fmtMoneyExact(estimate.total)}`;

  body.appendChild(el('div', { class: 'inline' },
    el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: () => startRun(body, render),
    }, label),
    s.lastSnapshot
      ? el('span', { class: 'muted tiny' },
          'A previous run is stored — the results page will show what changed since.')
      : null,
    el('span', { class: 'spacer' }),
    resetButton(render),
  ));
}

function resetButton(render) {
  return el('button', {
    class: 'btn btn-ghost btn-sm', type: 'button',
    onclick: () => { resetAll(); render.all(); },
  }, 'Reset everything');
}

async function startRun(body, render) {
  const bar = progressBar();
  const label = el('strong', {}, 'Starting');
  const counter = el('span', { class: 'mono tiny muted' }, '');

  fill(body, el('div', { class: 'stack' },
    el('div', { class: 'inline' }, label, el('span', { class: 'spacer' }), counter),
    bar,
  ));

  try {
    const result = await runAnalysis({
      prospects: prepared.prospects,
      config: cfg(),
      onProgress: (p) => {
        label.textContent = p.label || p.phase || '';
        counter.textContent = `${p.done ?? 0} / ${p.total || 1}`;
        bar.set(p.total ? (p.done ?? 0) / p.total : 0);
      },
    });
    setState((s) => ({
      run: { ...result, config: cfg(), uploadStats: prepared.stats },
      lastSnapshot: s.run ? snapshotOf(s.run.results) : s.lastSnapshot,
    }));
    window.location.href = 'signals.html';
  } catch (err) {
    toast(`Run failed: ${err.message}`);
    render.run();
  }
}
