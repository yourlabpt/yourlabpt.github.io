/**
 * Dependency-free RFC4180-ish CSV parser and writer.
 * Handles quoted fields, embedded commas/newlines, escaped quotes, BOM, CRLF,
 * and semicolon/tab delimited files (common in exports from European CRMs).
 */

export function sniffDelimiter(text) {
  const line = text.slice(0, 5000).split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = [
    [',', (line.match(/,/g) || []).length],
    [';', (line.match(/;/g) || []).length],
    ['\t', (line.match(/\t/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

export function parseCsv(text, delimiter) {
  let s = String(text).replace(/^﻿/, '');
  const d = delimiter || sniffDelimiter(s);
  const rows = [];
  let field = '';
  let row = [];
  let i = 0;
  let inQuotes = false;

  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"') { inQuotes = true; i += 1; continue; }
    if (c === d) { row.push(field); field = ''; i += 1; continue; }
    if (c === '\r') { i += 1; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; continue; }
    field += c; i += 1;
  }
  row.push(field);
  rows.push(row);

  while (rows.length && rows[rows.length - 1].every((f) => f.trim() === '')) rows.pop();
  if (!rows.length) return { columns: [], rows: [] };

  const header = rows[0].map((h, idx) => (h.trim() || `Column ${idx + 1}`));
  const columns = dedupeHeaders(header);
  const out = rows.slice(1).map((r) => {
    const o = {};
    columns.forEach((c, idx) => { o[c] = (r[idx] ?? '').trim(); });
    return o;
  });
  return { columns, rows: out };
}

function dedupeHeaders(headers) {
  const seen = new Map();
  return headers.map((h) => {
    if (!seen.has(h)) { seen.set(h, 1); return h; }
    const n = seen.get(h) + 1;
    seen.set(h, n);
    return `${h} (${n})`;
  });
}

export function toCsv(rows, columns) {
  const cols = columns || (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map(esc).join(',')];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(','));
  return lines.join('\r\n');
}
