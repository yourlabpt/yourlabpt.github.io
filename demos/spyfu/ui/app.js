/**
 * SpyFu Spend Check — single page.
 *
 * Upload a list of websites, optionally point it at a real SpyFu key, get
 * back combined monthly paid-search spend per domain and a
 * qualified / below-threshold / no-paid-search split.
 *
 * Sections update surgically where it matters (text inputs) so typing never
 * steals focus; everything else just re-renders.
 */

import { el, fill, clear, toast, topbar, debounce } from './dom.js';
import { card, field, stat, callout, chip, progressBar, input, numberInput } from './components.js';

import { COUNTRIES, defaultConfig } from '../lib/config.js';
import { parseCsv } from '../lib/csv.js';
import { parseWorkbook, buildExportRows, downloadCsv, exportWorkbook } from '../lib/exporters.js';
import { buildProspectList, detectUrlColumn } from '../lib/normalize.js';
import { runSpendCheck, SEGMENT_LABELS } from '../lib/spend-check.js';
import { createSpyfuClient } from '../lib/spyfu.js';
import { fmtMoneyExact, fmtNum } from '../lib/util.js';

function pickCompanyName(original = {}) {
  const key = Object.keys(original).find((k) => /company|name|organisation|organization|account/i.test(k));
  return key ? original[key] : null;
}
const companyName = (r) => pickCompanyName(r.original) || r.domain;

export function mountApp(root) {
  const config = defaultConfig();
  let upload = null;   // { fileName, columns, rows, urlColumn }
  let prepared = null; // buildProspectList(...)
  let run = null;      // runSpendCheck(...) result
  const view = { segment: 'qualified', query: '' };

  function recompute() {
    prepared = upload ? buildProspectList(upload.rows, upload.urlColumn, []) : null;
  }

  const shell = el('main', { class: 'shell' });
  document.body.appendChild(topbar());
  document.body.appendChild(shell);
  root.remove();

  shell.appendChild(el('div', { class: 'page-head' },
    el('h1', {}, 'SpyFu Spend Check'),
    el('p', { class: 'lede' },
      'Upload a list of companies. Get back combined monthly Google paid-search spend per domain, '
      + 'and which ones clear your threshold. SpyFu only covers Google text ads — treat the figure '
      + 'as a floor, not total media spend.'),
  ));

  const sections = el('div', { class: 'section-gap' });
  shell.appendChild(sections);

  const connectCard = card({ idx: '01', title: 'SpyFu access', note: 'optional — leave blank to use demo data' });
  const listCard = card({ idx: '02', title: 'Websites to check' });
  const runHost = el('div', {});
  const resultsHost = el('div', { class: 'section-gap' });

  sections.append(connectCard, listCard, runHost, resultsHost);

  const render = {
    connect: () => renderConnect(),
    list: () => renderList(),
    run: () => renderRun(),
    results: () => renderResults(),
    all: () => { render.connect(); render.list(); render.run(); render.results(); },
  };

  /* ------------------------------------------------------- 01 connect --- */

  function renderConnect() {
    const body = clear(connectCard.body);
    const head = connectCard.querySelector('.card-head');
    let badge = head.querySelector('.badge');
    if (!badge) {
      badge = el('span', { class: 'badge' });
      head.append(el('span', { class: 'spacer' }), badge);
    }
    const paintBadge = () => {
      const live = Boolean(config.apiId && config.secretKey);
      badge.className = `badge ${live ? 'badge-live' : 'badge-demo'}`;
      badge.textContent = live ? 'Live API' : 'Demo data';
    };
    paintBadge();

    const result = el('div', {});
    const apiId = input({ value: config.apiId, placeholder: 'SPYFU_API_ID',
      oninput: (e) => { config.apiId = e.target.value; paintBadge(); } });
    const secret = el('input', { type: 'password', autocomplete: 'off', value: config.secretKey,
      placeholder: '••••••••••••••••', oninput: (e) => { config.secretKey = e.target.value; paintBadge(); } });

    body.append(
      el('div', { class: 'grid grid-2' },
        field({ label: 'SpyFu API ID', control: apiId,
          hint: 'Account Settings → API Usage. Kept in this page only, never stored.' }),
        field({ label: 'Secret key', control: secret, hint: 'Masked, never saved.' }),
      ),
      el('div', { class: 'inline' },
        el('button', { class: 'btn btn-sm', type: 'button',
          onclick: (e) => testConnection(e.currentTarget, result) }, 'Test connection'),
      ),
      result,
      callout(null,
        'With no key entered, results come from ', el('strong', {}, 'demo data'),
        ' — deterministic, so the same list always gives the same answer, and nothing is sent anywhere. '
        + 'Fill in both fields to switch to your real SpyFu account — your browser never talks to SpyFu '
        + 'directly, this page relays through yourlabpt.com\'s own server.'),
    );
  }

  async function testConnection(btn, target) {
    btn.disabled = true;
    btn.textContent = 'Testing…';
    clear(target);
    try {
      if (!config.apiId || !config.secretKey) {
        fill(target, el('div', { class: 'callout bad mt' },
          el('strong', {}, 'No key entered.'), ' Demo data mode is active — nothing to test yet.'));
      } else {
        const r = await createSpyfuClient({
          apiId: config.apiId, secretKey: config.secretKey,
        }).testConnection();
        const spend = r.monthToDateUsd !== null && r.monthToDateUsd !== undefined
          ? `Month-to-date API spend: $${Number(r.monthToDateUsd).toFixed(2)}`
          : 'Connected. Usage figure not returned by the account endpoint.';
        fill(target, el('div', { class: 'callout mt' },
          el('strong', {}, 'Connected'), ' — key valid. ', el('span', { class: 'muted' }, spend)));
      }
    } catch (err) {
      fill(target, el('div', { class: 'callout bad mt' },
        el('strong', {}, 'Failed'), ' — ', String(err.message || err)));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Test connection';
    }
  }

  /* ---------------------------------------------------------- 02 list --- */

  function renderList() {
    const body = clear(listCard.body);

    body.appendChild(el('div', { class: 'row', style: { marginBottom: '16px' } },
      field({
        label: 'Countries', hint: 'Spend is summed across every country selected.',
        control: el('div', { class: 'chips' },
          ...COUNTRIES.map((m) => chip(null, m.code, {
            active: config.countries.includes(m.code),
            onClick: () => {
              config.countries = config.countries.includes(m.code)
                ? config.countries.filter((x) => x !== m.code)
                : [...config.countries, m.code];
              renderList();
            },
          })),
        ),
      }),
      field({
        label: 'Qualified if combined spend is at least',
        hint: 'SpyFu’s figure covers Google text ads only — a company can spend far more elsewhere.',
        control: numberInput({ min: '0', step: '100', value: config.threshold,
          oninput: (e) => { config.threshold = Number(e.target.value) || 0; } }),
      }),
    ));

    const error = el('div', {});

    if (!upload) {
      const picker = el('input', {
        type: 'file', accept: '.csv,.tsv,.xlsx,.xlsm,.xls', style: { display: 'none' },
        onchange: (e) => { const f = e.target.files && e.target.files[0]; if (f) readFile(f, error); },
      });
      const zone = el('div', { class: 'dropzone' },
        el('div', { class: 'big' }, 'Drop a CSV or XLSX here'),
        el('div', { class: 'muted tiny', style: { marginBottom: '16px' } },
          'Any columns. The website column is detected automatically.'),
        el('div', { class: 'inline', style: { justifyContent: 'center' } },
          el('button', { class: 'btn', type: 'button', onclick: () => picker.click() }, 'Choose a file'),
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => loadSample(error) },
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
        if (f) readFile(f, error);
      });
      body.append(zone, error);
      return;
    }

    body.appendChild(el('div', { class: 'row', style: { marginBottom: '10px' } },
      el('div', { class: 'muted tiny' }, `${upload.fileName} · website column: ${upload.urlColumn}`),
      el('div', { class: 'shrink' },
        el('button', {
          class: 'btn btn-ghost btn-danger btn-sm', type: 'button',
          onclick: () => { upload = null; run = null; recompute(); render.list(); render.run(); render.results(); },
        }, 'Remove list')),
    ));

    if (prepared) {
      const s = prepared.stats;
      body.appendChild(el('div', { class: 'muted tiny mt' },
        `${s.valid} domains ready to check`,
        s.duplicates ? ` · ${s.duplicates} duplicates removed` : '',
        s.invalid ? ` · ${s.invalid} invalid` : '',
        '.'));
    }

    body.appendChild(error);
  }

  async function readFile(file, errorHost) {
    try {
      let parsed;
      if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
        parsed = await parseWorkbook(await file.arrayBuffer());
      } else {
        parsed = parseCsv(await file.text());
      }
      ingest(file.name, parsed.columns, parsed.rows, errorHost);
    } catch (err) {
      fill(errorHost, el('div', { class: 'callout bad mt' },
        /SheetJS/i.test(String(err.message))
          ? 'Excel parsing needs the SheetJS CDN, which is not reachable right now. Save the file as CSV and try again.'
          : `Could not read that file: ${err.message}`));
    }
  }

  function ingest(fileName, columns, rows, errorHost) {
    if (!rows.length) {
      fill(errorHost, el('div', { class: 'callout bad mt' }, 'That file had no data rows.'));
      return;
    }
    upload = { fileName, columns, rows, urlColumn: detectUrlColumn(rows, columns) || columns[0] };
    run = null;
    recompute();
    render.list();
    render.run();
    render.results();
  }

  async function loadSample(errorHost) {
    try {
      const text = await fetch('data/sample-prospects.csv').then((r) => r.text());
      const { columns, rows } = parseCsv(text);
      ingest('sample-prospects.csv', columns, rows, errorHost);
      toast('Sample list loaded');
    } catch {
      fill(errorHost, el('div', { class: 'callout bad mt' },
        'Could not load the sample list. Serve this folder over http rather than opening the file directly.'));
    }
  }

  /* ------------------------------------------------------------ 03 run --- */

  function renderRun() {
    const body = clear(runHost);

    if (!prepared || !prepared.prospects.length) {
      body.appendChild(el('div', { class: 'inline mt' },
        el('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Upload a list first'),
      ));
      return;
    }
    if (!config.countries.length) {
      body.appendChild(callout('warn', 'Select at least one country.'));
      return;
    }

    body.appendChild(el('div', { class: 'inline mt' },
      el('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: () => startRun(),
      }, `Check ${prepared.prospects.length} domains for media spend`),
      el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button',
        onclick: () => { upload = null; run = null; recompute(); render.list(); render.run(); render.results(); },
      }, 'Reset'),
    ));
  }

  async function startRun() {
    const body = clear(runHost);
    const bar = progressBar();
    const label = el('strong', {}, 'Starting');
    const counter = el('span', { class: 'mono tiny muted' }, '');

    fill(body, el('div', { class: 'stack' },
      el('div', { class: 'inline' }, label, el('span', { class: 'spacer' }), counter),
      bar,
    ));

    try {
      run = await runSpendCheck({
        prospects: prepared.prospects,
        countries: config.countries,
        threshold: config.threshold,
        config,
        onProgress: (p) => {
          label.textContent = p.label || '';
          counter.textContent = `${p.done ?? 0} / ${p.total || 1}`;
          bar.set(p.total ? (p.done ?? 0) / p.total : 0);
        },
      });
      view.segment = 'qualified';
      view.query = '';
      render.run();
      render.results();
      resultsHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toast(`Run failed: ${err.message}`);
      render.run();
    }
  }

  /* -------------------------------------------------------- 04 results --- */

  function renderResults() {
    clear(resultsHost);
    if (!run) return;

    const { results, counts, totalBudget } = run;

    resultsHost.appendChild(el('div', { class: 'page-head', style: { padding: '10px 0 6px' } },
      el('h1', { style: { fontSize: '19px' } }, 'Results'),
      el('p', { class: 'lede' },
        `${results.length.toLocaleString()} companies checked`
        + (run.provider === 'demo-data' ? ' · demo data' : ' · live SpyFu') + '.'),
    ));

    const section = card({});
    resultsHost.appendChild(section);
    const body = section.body;

    body.appendChild(el('div', { class: 'grid grid-3', style: { marginBottom: '16px' } },
      stat({ n: counts.qualified, l: 'Qualified', tone: 'accent-color',
        sub: `spending $${config.threshold.toLocaleString()}+/month combined` }),
      stat({ n: counts.below, l: 'Below threshold', sub: 'advertising, but under your bar' }),
      stat({ n: counts.no_paid, l: 'No paid search found', sub: 'not junk — read the note below' }),
    ));

    body.appendChild(el('div', { class: 'kv', style: { marginBottom: '14px' } },
      el('span', { class: 'k' }, 'Combined monthly paid-search spend across the whole list'),
      el('span', { class: 'v' }, fmtMoneyExact(totalBudget))));

    const tabs = el('div', { class: 'tabs', style: { margin: '0 0 14px' } });
    const tableHost = el('div', {});

    const searchInput = input({
      placeholder: 'Search company or domain…', value: view.query,
      style: { maxWidth: '260px' },
      oninput: debounce((e) => { view.query = e.target.value; renderTable(tableHost, results); }, 160),
    });

    const toolbar = el('div', { class: 'inline', style: { marginBottom: '12px' } },
      searchInput, el('span', { class: 'spacer' }),
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: async (e) => {
          const b = e.currentTarget;
          b.disabled = true; b.textContent = 'Building…';
          const out = await exportWorkbook(results);
          b.disabled = false; b.textContent = 'Export XLSX';
          toast(out.format === 'xlsx' ? 'Workbook downloaded' : 'Excel library unavailable — downloaded as CSV instead');
        },
      }, 'Export XLSX'),
      el('button', {
        class: 'btn btn-sm btn-ghost', type: 'button',
        onclick: () => { downloadCsv('spyfu-spend-check.csv', buildExportRows(results)); toast('CSV downloaded'); },
      }, 'Export CSV'),
    );

    body.append(tabs, toolbar, tableHost);

    function paintTabs() {
      fill(tabs, ...['qualified', 'below', 'no_paid'].map((seg) =>
        el('button', {
          class: 'tab', type: 'button', 'data-on': String(view.segment === seg),
          onclick: () => { view.segment = seg; paintTabs(); renderTable(tableHost, results); },
        }, SEGMENT_LABELS[seg], el('span', { class: 'count' }, counts[seg]))));
    }

    paintTabs();
    renderTable(tableHost, results);

    body.appendChild(el('div', { class: 'mt' }, callout('warn',
      el('strong', {}, 'No paid search found is not junk.'),
      ' SpyFu’s figure covers Google text ads only — no Shopping, Performance Max, Display, YouTube '
      + 'or paid social. Brand-only advertisers and Shopping-heavy retailers land here with a zero. '
      + 'Read it as “no paid search found”, never as “spends nothing”.')));
  }

  function renderTable(host, results) {
    let rows = results.filter((r) => r.segment === view.segment);
    if (view.query.trim()) {
      const q = view.query.trim().toLowerCase();
      rows = rows.filter((r) => r.domain.includes(q)
        || Object.values(r.original || {}).some((v) => String(v).toLowerCase().includes(q)));
    }

    const tbody = el('tbody', {});
    if (!rows.length) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '5' },
        el('div', { class: 'empty' }, 'Nothing matches these filters.'))));
    }

    for (const r of rows) {
      const byCountry = Object.entries(r.byCountry || {})
        .filter(([, v]) => v.budget > 0)
        .map(([code, v]) => chip(null, `${code} ${fmtMoneyExact(v.budget)}`));

      tbody.appendChild(el('tr', {},
        el('td', {},
          el('div', { class: 'co-name' }, companyName(r)),
          el('div', { class: 'co-domain' }, r.domain)),
        el('td', {}, el('div', { class: 'chips' },
          byCountry.length ? byCountry : el('span', { class: 'muted tiny' }, '—'))),
        el('td', { class: 'num' }, fmtMoneyExact(r.budget)),
        el('td', { class: 'num' }, fmtNum(r.paidKeywords)),
        el('td', {}, statusBadge(r.segment)),
      ));
    }

    fill(host, el('div', { class: 'table-wrap' },
      el('table', { class: 'results' },
        el('thead', {}, el('tr', {},
          el('th', {}, 'Company'),
          el('th', {}, 'Spend by country'),
          el('th', { class: 'num' }, 'Monthly spend'),
          el('th', { class: 'num' }, 'Paid keywords'),
          el('th', {}, 'Status'),
        )),
        tbody,
      )));
  }

  function statusBadge(segment) {
    const cls = segment === 'qualified' ? 'badge-live' : segment === 'below' ? 'badge-demo' : '';
    return el('span', { class: `badge ${cls}` }, SEGMENT_LABELS[segment]);
  }

  render.all();
}
