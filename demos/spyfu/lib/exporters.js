/**
 * Exports.
 *
 * FR-17 / NFR-11: the original uploaded columns are preserved all the way
 * through to export. No silent row loss — the "why" line travels with the row.
 */

import { toCsv } from './csv.js';
import { SEGMENT_LABELS } from './score.js';

export function buildExportRows(results, config) {
  return results.map((r) => {
    const base = { ...(r.original || {}) };
    return {
      ...base,
      'Domain': r.domain,
      'Intent Score': r.score,
      'Segment': SEGMENT_LABELS[r.segment],
      'Top Signal': r.topSignal || '',
      'Why (outreach line)': r.whyLine || '',
      'Signals': r.chips.map((c) => c.text).join(' | '),
      'Monthly Budget (USD)': Math.round(r.kpi.budget),
      'Budget Change MoM': isFinite(r.kpi.budgetDelta)
        ? `${(r.kpi.budgetDelta * 100).toFixed(0)}%` : 'new',
      'Paid Keywords': r.kpi.paidKeywords,
      'Paid Clicks': r.kpi.paidClicks,
      'Organic Clicks': r.kpi.organicClicks,
      'Domain Strength': r.kpi.strength,
      'Market': r.market,
      'Run Date': (config && config.runAt) || new Date().toISOString().slice(0, 10),
    };
  });
}

/** Narrow CSV shaped for Skylead / CRM import. */
export function buildSkyleadRows(results) {
  return results
    .filter((r) => r.score > 0)
    .map((r) => ({
      website: `https://${r.domain}`,
      company: pickCompanyName(r.original) || r.domain,
      intent_score: r.score,
      top_signal: r.topSignal || '',
      first_line: r.whyLine || '',
      monthly_budget_usd: Math.round(r.kpi.budget),
    }));
}

function pickCompanyName(original = {}) {
  const key = Object.keys(original).find((k) => /company|name|organisation|organization|account/i.test(k));
  return key ? original[key] : null;
}

export function downloadCsv(filename, rows, columns) {
  const csv = toCsv(rows, columns);
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * XLSX via SheetJS, lazy-loaded from CDN so the app keeps zero npm runtime
 * dependencies (decision D-02). Degrades to CSV if the CDN is unreachable —
 * an offline demo must never hit a dead export button.
 */
let sheetJsPromise = null;
export function loadSheetJs() {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser only'));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('SheetJS did not load')));
    s.onerror = () => reject(new Error('SheetJS CDN unreachable'));
    document.head.appendChild(s);
  });
  return sheetJsPromise;
}

export async function exportWorkbook(results, config, filename = 'intent-signals.xlsx') {
  const rows = buildExportRows(results, config);
  try {
    const XLSX = await loadSheetJs();
    const wb = XLSX.utils.book_new();
    const add = (name, data) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name.slice(0, 31));

    add('All prospects', rows);
    add('Qualified', rows.filter((r) => r.Segment === SEGMENT_LABELS.qualified));
    add('Below threshold', rows.filter((r) => r.Segment === SEGMENT_LABELS.below));
    add('No paid search', rows.filter((r) => r.Segment === SEGMENT_LABELS.no_paid));
    add('Skylead', buildSkyleadRows(results));

    XLSX.writeFile(wb, filename);
    return { ok: true, format: 'xlsx' };
  } catch (err) {
    downloadCsv(filename.replace(/\.xlsx$/, '.csv'), rows);
    return { ok: true, format: 'csv', fallbackReason: String(err.message || err) };
  }
}

/** Read an uploaded .xlsx into { columns, rows } using the same lazy SheetJS. */
export async function parseWorkbook(arrayBuffer) {
  const XLSX = await loadSheetJs();
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { columns, rows };
}
