/**
 * Exports. Original uploaded columns are preserved all the way through — no
 * silent row loss.
 */

import { toCsv } from './csv.js';
import { SEGMENT_LABELS } from './spend-check.js';

export function buildExportRows(results) {
  return results.map((r) => {
    const base = { ...(r.original || {}) };
    const byCountry = Object.entries(r.byCountry || {})
      .map(([code, v]) => `${code}: $${Math.round(v.budget).toLocaleString()}`)
      .join(' | ');
    return {
      ...base,
      'Domain': r.domain,
      'Status': SEGMENT_LABELS[r.segment],
      'Monthly Spend (USD)': Math.round(r.budget),
      'Paid Keywords': r.paidKeywords,
      'Spend by Country': byCountry,
    };
  });
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
 * dependencies. Degrades to CSV if the CDN is unreachable.
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

export async function exportWorkbook(results, filename = 'spyfu-spend-check.xlsx') {
  const rows = buildExportRows(results);
  try {
    const XLSX = await loadSheetJs();
    const wb = XLSX.utils.book_new();
    const add = (name, data) =>
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), name.slice(0, 31));

    add('All prospects', rows);
    add('Qualified', rows.filter((r) => r.Status === SEGMENT_LABELS.qualified));
    add('Below threshold', rows.filter((r) => r.Status === SEGMENT_LABELS.below));
    add('No paid search', rows.filter((r) => r.Status === SEGMENT_LABELS.no_paid));

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
