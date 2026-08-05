/**
 * Page 2 — Signals.
 *
 * The table re-renders on filter changes; the search input is built once and
 * left alone so typing never loses focus.
 */

import { el, fill, clear, toast, topbar, debounce } from './dom.js';
import { card, stat, callout, chip, scoreBar, progressBar, copyButton, input } from './components.js';
import { sparkline, trendChart } from './charts.js';

import { SEGMENTS, SEGMENT_LABELS, diffRuns } from '../lib/score.js';
import { DEFAULT_WEIGHTS } from '../lib/config.js';
import { buildProspectList } from '../lib/normalize.js';
import { runAnalysis, getProvider } from '../lib/provider.js';
import { drillDownCost } from '../lib/cost.js';
import { buildExportRows, buildSkyleadRows, downloadCsv, exportWorkbook } from '../lib/exporters.js';
import { fmtMoney, fmtMoneyExact, fmtNum, fmtPct, monthLabel } from '../lib/util.js';
import { getState, setState, hydrate } from '../lib/store.js';

const RULE_LABELS = {
  spend_ramp: 'Spend ramp',
  new_advertiser: 'New advertiser',
  spend_collapse: 'Spend collapse',
  new_market: 'New market',
  launch: 'Launch',
  inefficiency: 'Inefficiency',
  organic_pain: 'Organic pain',
  competitive_pressure: 'Competitive pressure',
  messaging_shift: 'Messaging shift',
};

const view = {
  segment: SEGMENTS.QUALIFIED,
  query: '',
  ruleFilter: null,
  sortKey: 'score',
  sortDir: -1,
  open: null,
};

let shell = null;

export function mountSignalsPage(root) {
  hydrate();
  shell = el('main', { class: 'shell' });
  document.body.appendChild(topbar('signals'));
  document.body.appendChild(shell);
  root.remove();

  if (getState().run) renderResults();
  else recoverOrPrompt();
}

/* ----------------------------------------------------------- recovery --- */

function recoverOrPrompt() {
  const s = getState();
  const head = el('div', { class: 'page-head' }, el('h1', {}, 'Signals'));

  if (!s.upload) {
    fill(shell, head, card({
      body: el('div', { class: 'empty' },
        el('p', {}, 'No run yet.'),
        el('a', { class: 'btn', href: 'index.html' }, 'Go to configuration')),
    }));
    return;
  }

  // In live mode, silently re-running would re-spend real API credit. Ask first.
  if (s.config.mode === 'live') {
    fill(shell, head, card({
      body: el('div', { class: 'empty' },
        el('p', {}, 'These results were not carried over, and this profile is set to the live API.'),
        el('p', { class: 'muted tiny' },
          'Re-running would spend API credit again, so it will not happen automatically.'),
        el('a', { class: 'btn', href: 'index.html' }, 'Back to configuration')),
    }));
    return;
  }

  const bar = progressBar();
  const label = el('strong', {}, 'Rebuilding your saved list');
  const counter = el('span', { class: 'mono tiny muted' }, '');
  fill(shell, head, card({
    body: el('div', { class: 'stack' },
      el('div', { class: 'inline' }, label, el('span', { class: 'spacer' }), counter),
      bar),
  }));

  const exclusions = String(s.upload.exclusions || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  const prepared = buildProspectList(s.upload.rows, s.upload.urlColumn, exclusions);
  if (!prepared.prospects.length) {
    fill(shell, head, card({
      body: el('div', { class: 'empty' }, 'The saved list has no usable domains.'),
    }));
    return;
  }

  runAnalysis({
    prospects: prepared.prospects,
    config: s.config,
    onProgress: (p) => {
      label.textContent = p.label || p.phase || '';
      counter.textContent = `${p.done ?? 0} / ${p.total || 1}`;
      bar.set(p.total ? (p.done ?? 0) / p.total : 0);
    },
  })
    .then((result) => {
      setState({ run: { ...result, config: s.config, uploadStats: prepared.stats } });
      renderResults();
    })
    .catch((err) => {
      fill(shell, head, card({
        body: callout('bad', `Could not rebuild the list: ${err.message}`),
      }));
    });
}

/* ------------------------------------------------------------- render --- */

function renderResults() {
  const state = getState();
  const run = state.run;
  const config = run.config || state.config;
  const results = run.results;
  const s = run.summary;

  const counts = { qualified: 0, below: 0, no_paid: 0 };
  results.forEach((r) => { counts[r.segment] += 1; });

  const diff = state.lastSnapshot ? diffRuns(state.lastSnapshot, results) : null;

  clear(shell);

  shell.appendChild(el('div', { class: 'page-head' },
    el('h1', {}, 'Signals'),
    el('p', { class: 'lede' },
      `${s.total.toLocaleString()} companies analysed in ${(run.elapsedMs / 1000).toFixed(1)}s`
      + (run.uploadStats
        ? ` · ${run.uploadStats.duplicates} duplicates and ${run.uploadStats.excluded} exclusions were removed before any request`
        : '')
      + (run.provider === 'demo-data' ? ' · demo data' : '') + '.'),
  ));

  const sections = el('div', { class: 'section-gap' });
  shell.appendChild(sections);

  sections.appendChild(el('div', { class: 'grid grid-3' },
    stat({ n: s.hot, l: 'Worth calling this week', tone: 'accent-color',
      sub: 'scored 40 or higher — a real buying signal fired' }),
    stat({ n: counts.qualified, l: 'Qualified',
      sub: `spending over ${fmtMoneyExact(config.thresholds.spendFloor, config.currency, config.fxRate)}/month on paid search` }),
    stat({ n: fmtMoneyExact(s.totalBudget, config.currency, config.fxRate),
      l: 'Combined monthly paid search spend', sub: 'Google text ads only — treat as a floor' }),
  ));

  if (diff && (diff.newlyFiring.length || diff.newDomains.length)) {
    sections.appendChild(card({
      idx: 'Δ', title: 'Changed since your last run', note: 'this is the product — a feed, not a report',
      body: el('div', { class: 'stack' },
        ...diff.newlyFiring.slice(0, 6).map((r) => el('div', { class: 'kv' },
          el('span', { class: 'k' },
            el('strong', {}, companyName(r)), ' ',
            el('span', { class: 'muted tiny' }, 'just started firing'), ' ',
            r.gained.map((id) => RULE_LABELS[id]).join(', ')),
          el('span', { class: 'v' }, r.score))),
        diff.newDomains.length
          ? el('div', { class: 'muted tiny' },
              `${diff.newDomains.length} companies with signals appear that were not in the last run.`)
          : null,
      ),
    }));
  }

  /* ---- main table card ---- */

  const tableCard = card({});
  sections.appendChild(tableCard);
  const body = tableCard.body;

  const tabs = el('div', { class: 'tabs', style: { margin: '-18px -18px 14px' } });
  const segNote = el('div', {});
  const tableHost = el('div', {});

  const searchInput = input({
    placeholder: 'Search company or domain…', value: view.query,
    style: { maxWidth: '260px' },
    oninput: debounce((e) => { view.query = e.target.value; renderTable(tableHost, results, config); }, 160),
  });

  const chipRow = el('div', { class: 'chips' });
  const toolbar = el('div', { class: 'inline', style: { marginBottom: '12px' } },
    searchInput, chipRow, el('span', { class: 'spacer' }),
    el('button', {
      class: 'btn btn-sm', type: 'button',
      onclick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = 'Building…';
        const out = await exportWorkbook(results, config, 'intent-signals.xlsx');
        b.disabled = false; b.textContent = 'Export XLSX';
        toast(out.format === 'xlsx'
          ? 'Workbook downloaded'
          : 'Excel library unavailable offline — downloaded as CSV instead');
      },
    }, 'Export XLSX'),
    el('button', {
      class: 'btn btn-sm', type: 'button',
      onclick: () => { downloadCsv('skylead-import.csv', buildSkyleadRows(results)); toast('Skylead CSV downloaded'); },
    }, 'Export Skylead CSV'),
    el('button', {
      class: 'btn btn-sm btn-ghost', type: 'button',
      onclick: () => { downloadCsv('intent-signals.csv', buildExportRows(results, config)); toast('CSV downloaded'); },
    }, 'Export CSV'),
  );

  body.append(tabs, segNote, toolbar, tableHost);

  function paintTabs() {
    fill(tabs, ...[SEGMENTS.QUALIFIED, SEGMENTS.BELOW, SEGMENTS.NO_PAID].map((seg) =>
      el('button', {
        class: 'tab', type: 'button', 'data-on': String(view.segment === seg),
        onclick: () => {
          view.segment = seg; view.open = null;
          paintTabs(); paintSegNote(); renderTable(tableHost, results, config);
        },
      }, SEGMENT_LABELS[seg], el('span', { class: 'count' }, counts[seg]))));
  }

  function paintSegNote() {
    clear(segNote);
    if (view.segment !== SEGMENTS.NO_PAID) return;
    segNote.appendChild(callout('warn',
      el('strong', {}, 'This tab is not junk.'),
      " SpyFu's budget figure covers Google text ads only — no Shopping, Performance Max, Display, "
      + 'YouTube or paid social. Brand-only advertisers and Shopping-heavy retailers land here with a '
      + 'zero. Read it as “no paid search found”, never as “spends nothing”.'));
    segNote.style.marginBottom = '12px';
  }

  function paintChips() {
    fill(chipRow, ...Object.keys(DEFAULT_WEIGHTS)
      .filter((id) => s.byRule[id])
      .map((id) => chip(id, `${RULE_LABELS[id]} ${s.byRule[id]}`, {
        active: view.ruleFilter === id,
        onClick: () => {
          view.ruleFilter = view.ruleFilter === id ? null : id;
          paintChips(); renderTable(tableHost, results, config);
        },
      })),
      view.ruleFilter
        ? chip(null, 'clear', { onClick: () => { view.ruleFilter = null; paintChips(); renderTable(tableHost, results, config); } })
        : null);
  }

  paintTabs(); paintSegNote(); paintChips();
  renderTable(tableHost, results, config);

  sections.appendChild(scopeCard());
}

function companyName(r) {
  return (r.original && (r.original['Company Name'] || r.original.Company)) || r.domain;
}

/* -------------------------------------------------------------- table --- */

function renderTable(host, results, config) {
  let rows = results.filter((r) => r.segment === view.segment);
  if (view.ruleFilter) rows = rows.filter((r) => r.firedIds.includes(view.ruleFilter));
  if (view.query.trim()) {
    const q = view.query.trim().toLowerCase();
    rows = rows.filter((r) => r.domain.includes(q)
      || Object.values(r.original || {}).some((v) => String(v).toLowerCase().includes(q)));
  }

  const key = (r) => ({
    score: r.score,
    budget: r.kpi.budget,
    delta: isFinite(r.kpi.budgetDelta) ? r.kpi.budgetDelta : 99,
    keywords: r.kpi.paidKeywords,
    domain: r.domain,
  }[view.sortKey]);

  rows = [...rows].sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    if (typeof av === 'string') return view.sortDir * av.localeCompare(bv);
    return view.sortDir * (av - bv);
  });

  const th = (label, sortKey, cls) => el('th', {
    class: [sortKey ? 'sortable' : '', cls || ''].filter(Boolean).join(' ') || null,
    onclick: sortKey ? () => {
      if (view.sortKey === sortKey) view.sortDir = -view.sortDir;
      else { view.sortKey = sortKey; view.sortDir = -1; }
      renderTable(host, results, config);
    } : null,
  }, label);

  const tbody = el('tbody', {});

  if (!rows.length) {
    tbody.appendChild(el('tr', {}, el('td', { colspan: '9' },
      el('div', { class: 'empty' }, 'Nothing matches these filters.'))));
  }

  for (const r of rows) {
    const isOpen = view.open === r.domain;
    const hist = ((r.record && r.record.markets[r.market]) || {}).history || [];

    const tr = el('tr', {
      class: 'prospect', 'data-open': isOpen ? 'true' : null,
      onclick: () => {
        view.open = isOpen ? null : r.domain;
        renderTable(host, results, config);
      },
    },
      el('td', { class: 'expander' }, isOpen ? '▾' : '▸'),
      el('td', {},
        el('div', { class: 'co-name' }, companyName(r)),
        el('div', { class: 'co-domain' }, `${r.domain} · ${r.market}`)),
      el('td', {}, scoreBar(r.score)),
      el('td', { class: 'num' }, fmtMoney(r.kpi.budget, config.currency, config.fxRate)),
      el('td', { class: 'num' }, deltaCell(r)),
      el('td', {}, hist.length ? sparkline(hist.map((p) => p.budget)) : el('span', { class: 'muted' }, '—')),
      el('td', { class: 'num' }, fmtNum(r.kpi.paidKeywords)),
      el('td', {}, el('div', { class: 'chips' },
        r.chips.length
          ? r.chips.map((c) => chip(c.id, c.text))
          : el('span', { class: 'muted tiny' }, '—'))),
      el('td', { class: 'why' }, r.whyLine || el('span', { class: 'muted' }, 'No signal fired.')),
    );
    tbody.appendChild(tr);

    if (isOpen) {
      // The refresh callback must go through renderResults, not renderTable:
      // loading ad history replaces the run in the store, and `results` here is
      // a stale closure over the previous array.
      tbody.appendChild(el('tr', {}, el('td', {
        colspan: '9', style: { background: 'var(--primary-dark)' },
      }, drillDown(r, config, renderResults))));
    }
  }

  fill(host, el('div', { class: 'table-wrap' },
    el('table', { class: 'results' },
      el('thead', {}, el('tr', {},
        el('th', { style: { width: '22px' } }, ''),
        th('Company', 'domain'),
        th('Intent', 'score', 'num'),
        th('Spend / mo', 'budget', 'num'),
        th('Δ MoM', 'delta', 'num'),
        el('th', {}, '12-mo'),
        th('Paid kw', 'keywords', 'num'),
        el('th', {}, 'Signals'),
        el('th', {}, 'Why'),
      )),
      tbody,
    )));
}

function deltaCell(r) {
  if (r.kpi.budgetPrev === 0 && r.kpi.budget > 0) return el('span', { class: 'delta-up' }, 'new');
  if (r.kpi.budget === 0) return el('span', { class: 'muted' }, '—');
  return el('span', { class: r.kpi.budgetDelta >= 0 ? 'delta-up' : 'delta-down' }, fmtPct(r.kpi.budgetDelta));
}

/* ---------------------------------------------------------- drilldown --- */

function drillDown(result, config, rerender) {
  const rec = result.record;

  if (!rec) {
    return el('div', { class: 'drill' }, callout('warn',
      'The raw per-domain data was dropped to fit this run into browser storage. '
      + 'Re-run from the configuration page to get drill-downs back.'));
  }

  const history = (rec.markets[result.market] || {}).history || [];
  const otherMarkets = Object.keys(rec.markets).filter((m) => m !== result.market);

  const adPanel = el('div', { class: 'panel' });
  paintAdPanel();

  function paintAdPanel() {
    clear(adPanel);
    adPanel.appendChild(el('h4', {}, 'Ad copy history · positioning shift'));
    if (rec.adCopyTurnover === null || rec.adCopyTurnover === undefined) {
      adPanel.append(
        el('p', { class: 'muted tiny' },
          'The ad-history endpoint is the expensive one ($3 per 1,000 rows). It is never run across '
          + 'a list — only when you ask for it on a single domain.'),
        el('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: async (e) => {
            e.stopPropagation();
            const b = e.currentTarget;
            b.disabled = true; b.textContent = 'Loading…';
            try {
              const updated = await getProvider(config).adHistory(rec, config);
              setState((s) => ({
                run: s.run ? {
                  ...s.run,
                  results: s.run.results.map((x) =>
                    x.domain === updated.domain ? { ...x, record: updated } : x),
                } : s.run,
              }));
              rerender();
            } catch (err) {
              b.disabled = false;
              b.textContent = 'Load ad copy history';
              adPanel.appendChild(callout('bad', String(err.message || err)));
            }
          },
        }, `Load ad copy history · ~$${drillDownCost().toFixed(2)}`),
      );
    } else {
      adPanel.appendChild(el('div', { class: 'kv' },
        el('span', { class: 'k' }, 'Ad copy turnover this quarter'),
        el('span', { class: 'v' }, `${Math.round(rec.adCopyTurnover * 100)}%`)));
      for (const a of rec.adHistory || []) {
        adPanel.appendChild(el('div', { class: 'kv' },
          el('span', { class: 'k tiny' }, a.month ? monthLabel(a.month) : ''),
          el('span', { class: 'v tiny', style: { fontFamily: 'var(--sans)' } }, a.headline || a.title)));
      }
    }
  }

  const node = el('div', { class: 'drill' },
    el('div', { class: 'drill-grid' },
      el('div', { class: 'panel' },
        el('h4', {}, `Paid budget and organic clicks · ${result.market} · last ${history.length} months`),
        trendChart(history, { currency: config.currency, fxRate: config.fxRate }),
        otherMarkets.length
          ? el('div', { style: { marginTop: '14px' } },
              el('h4', {}, 'Other selected markets'),
              ...otherMarkets.map((m) => {
                const h = rec.markets[m].history;
                const cur = h.length ? h[h.length - 1].budget : 0;
                const prev = h.length > 1 ? h[h.length - 2].budget : 0;
                return el('div', { class: 'kv' },
                  el('span', { class: 'k' }, m),
                  el('span', { class: 'v' },
                    `${fmtMoney(cur, config.currency, config.fxRate)}/mo `,
                    prev > 0
                      ? el('span', { class: cur >= prev ? 'delta-up' : 'delta-down' }, fmtPct((cur - prev) / prev))
                      : (cur > 0 ? el('span', { class: 'delta-up' }, 'new') : null)));
              }))
          : null,
      ),
      el('div', { class: 'stack' },
        el('div', { class: 'panel' },
          el('h4', {}, `Score breakdown · ${result.score}/100`),
          ...result.breakdown.map((b) => el('div', { class: 'breakdown-row', 'data-fired': String(b.fired) },
            el('span', { class: 'w' }, b.fired ? `+${b.weight}` : '—'),
            el('span', { style: { flex: '1' } }, b.label,
              !b.applicable ? el('span', { class: 'muted tiny' }, ' · not evaluated') : null))),
          el('div', { class: 'muted tiny', style: { marginTop: '8px' } },
            'The score is a ranking device, not a spend estimate.'),
        ),
        el('div', { class: 'panel' },
          el('h4', {}, 'Current month'),
          kv('Paid budget', fmtMoneyExact(result.kpi.budget, config.currency, config.fxRate)),
          kv('Paid clicks', fmtNum(result.kpi.paidClicks)),
          kv('Paid keywords', fmtNum(result.kpi.paidKeywords)),
          kv('Organic clicks', fmtNum(result.kpi.organicClicks)),
          kv('Avg ad rank', result.kpi.adRank ? result.kpi.adRank.toFixed(1) : '—'),
          kv('Domain strength', fmtNum(result.kpi.strength)),
        ),
      ),
    ),
    el('div', { class: 'drill-grid' },
      el('div', { class: 'stack' },
        result.whyLine
          ? el('div', { class: 'panel' },
              el('h4', {}, 'Outreach opener', el('span', { class: 'spacer' }), copyButton(result.whyLine)),
              el('div', { class: 'copybox' }, result.whyLine),
              ...result.breakdown
                .filter((b) => b.fired && b.why !== result.whyLine)
                .map((b) => el('div', { class: 'copybox', style: { opacity: '0.85' } }, b.why)),
            )
          : null,
        adPanel,
      ),
      el('div', { class: 'stack' },
        el('div', { class: 'panel' },
          el('h4', {}, 'Top PPC competitors'),
          (rec.competitors || []).length
            ? (rec.competitors || []).map((c) => el('div', { class: 'kv' },
                el('span', { class: 'k mono tiny' }, c.domain),
                el('span', { class: 'v' }, `${fmtMoney(c.budget, config.currency, config.fxRate)}/mo`)))
            : el('div', { class: 'muted tiny' }, 'No paid competitors found — they are not bidding.'),
        ),
        el('div', { class: 'panel' },
          el('h4', {}, 'Launch signal'),
          rec.newKeywords
            ? [kv('New paid keywords this month', rec.newKeywords.count),
               kv('Their typical monthly baseline', Math.round(rec.newKeywords.baseline))]
            : el('div', { class: 'muted tiny' },
                `Not fetched — this domain was not in the top ${config.thresholds.topN} of the `
                + 'preliminary score, so the $2 CPM endpoint was skipped for it. That is the cost rule working.'),
        ),
      ),
    ),
  );

  // Clicks inside the drill-down must not collapse the row.
  node.addEventListener('click', (e) => e.stopPropagation());
  return node;
}

function kv(k, v) {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v' }, v));
}

/* --------------------------------------------------------- scope card --- */

function scopeCard() {
  return card({
    title: 'What this does and does not see', note: 'read this before quoting a number',
    body: el('div', {},
      el('div', { class: 'grid grid-2' },
        el('div', {},
          el('p', { class: 'tiny muted' }, 'Covered today'),
          kv('Google paid search spend and change', 'yes'),
          kv('Marketing intensity as a growth proxy', 'yes'),
          kv('New market / new campaign launch', 'yes'),
          kv('Rebrand or M&A', 'weak proxy'),
        ),
        el('div', {},
          el('p', { class: 'tiny muted' }, 'Not covered by this source'),
          kv('People moves and new hires', 'LinkedIn'),
          kv('New technology adopted', 'BuiltWith'),
          kv('Confirmed M&A and funding', 'news / registry'),
          kv('Shopping, PMax, Display, paid social', 'not in SpyFu'),
        ),
      ),
      el('div', { class: 'mt' }, callout(null,
        'Each of those sits behind the same interface as SpyFu does. Adding one is a new provider, '
        + 'not a new product.')),
    ),
  });
}
