/**
 * Hand-rolled SVG charts — no charting library, nothing to install.
 * Ported from the React version; same maths, plain DOM output.
 */

import { el, svgEl } from './dom.js';
import { monthLabel, fmtMoney, fmtNum } from '../lib/util.js';

export function sparkline(values, { width = 90, height = 22 } = {}) {
  const vals = (values || []).map((v) => (Number.isFinite(v) ? v : 0));
  if (vals.length < 2) return svgEl('svg', { width, height });

  const max = Math.max(...vals, 1);
  const step = width / (vals.length - 1);
  const pts = vals.map((v, i) =>
    `${(i * step).toFixed(1)},${(height - (v / max) * (height - 2) - 1).toFixed(1)}`);
  const last = vals[vals.length - 1];
  const stroke = last >= vals[vals.length - 2] ? 'var(--accent-color)' : 'var(--red)';

  return svgEl('svg', { width, height, 'aria-hidden': 'true', style: 'display:block' },
    svgEl('polyline', {
      points: pts.join(' '), fill: 'none', stroke, 'stroke-width': '1.5',
      'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: '0.9',
    }),
    svgEl('circle', {
      cx: (vals.length - 1) * step,
      cy: height - (last / max) * (height - 2) - 1,
      r: '2', fill: stroke,
    }),
  );
}

/**
 * Paid budget as bars, organic clicks as a line on a secondary axis.
 * The two together are the drill-down story: paid climbing while organic falls
 * is the entire organic-pain pitch in one picture.
 */
export function trendChart(history, { currency = 'USD', fxRate = 1, height = 190 } = {}) {
  const h = history || [];
  if (h.length < 2) return el('div', { class: 'muted tiny' }, 'Not enough history to chart.');

  const W = 640;
  const H = height;
  const padL = 54;
  const padR = 48;
  const padT = 14;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const budgets = h.map((p) => p.budget || 0);
  const organic = h.map((p) => p.organicClicks || 0);
  const maxB = Math.max(...budgets, 1);
  const maxO = Math.max(...organic, 1);

  const bw = plotW / h.length;
  const barW = Math.max(3, bw * 0.56);
  const x = (i) => padL + i * bw + bw / 2;
  const yB = (v) => padT + plotH - (v / maxB) * plotH;
  const yO = (v) => padT + plotH - (v / maxO) * plotH;

  const parts = [];

  for (const g of [0, 0.25, 0.5, 0.75, 1]) {
    const y = padT + plotH * (1 - g);
    parts.push(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: 'var(--line)', 'stroke-width': '1' }));
    parts.push(svgEl('text', {
      x: padL - 8, y: y + 3.5, 'text-anchor': 'end',
      'font-size': '9.5', fill: 'var(--muted)', 'font-family': 'var(--mono)',
    }, fmtMoney(maxB * g, currency, fxRate)));
  }

  h.forEach((p, i) => {
    const v = p.budget || 0;
    const top = yB(v);
    const isLast = i === h.length - 1;
    parts.push(svgEl('rect', {
      x: x(i) - barW / 2, y: top, width: barW,
      height: Math.max(0, padT + plotH - top), rx: '2',
      fill: isLast ? 'var(--accent-color)' : 'var(--line-strong)',
      opacity: isLast ? '0.95' : '0.85',
    }, svgEl('title', {},
      `${monthLabel(p.month)} · ${fmtMoney(v, currency, fxRate)}/mo · ${fmtNum(p.paidClicks)} paid clicks`)));
  });

  parts.push(svgEl('polyline', {
    points: organic.map((v, i) => `${x(i).toFixed(1)},${yO(v).toFixed(1)}`).join(' '),
    fill: 'none', stroke: 'var(--pink)', 'stroke-width': '1.6',
    'stroke-linejoin': 'round', opacity: '0.85',
  }));

  organic.forEach((v, i) => {
    parts.push(svgEl('circle', { cx: x(i), cy: yO(v), r: '2', fill: 'var(--pink)', opacity: '0.85' },
      svgEl('title', {}, `${monthLabel(h[i].month)} · ${fmtNum(v)} organic clicks`)));
  });

  h.forEach((p, i) => {
    if (i % 2 !== 0 && i !== h.length - 1) return;
    parts.push(svgEl('text', {
      x: x(i), y: H - 8, 'text-anchor': 'middle',
      'font-size': '9.5', fill: 'var(--muted)', 'font-family': 'var(--mono)',
    }, monthLabel(p.month)));
  });

  parts.push(svgEl('text', {
    x: W - padR + 8, y: padT + 4, 'font-size': '9.5', fill: 'var(--pink)', 'font-family': 'var(--mono)',
  }, fmtNum(maxO)));
  parts.push(svgEl('text', {
    x: W - padR + 8, y: padT + plotH, 'font-size': '9.5', fill: 'var(--muted)', 'font-family': 'var(--mono)',
  }, '0'));

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`, width: '100%', height: String(H), role: 'img',
    'aria-label': 'Monthly paid budget and organic clicks',
  }, ...parts);

  return el('div', {},
    svg,
    el('div', { class: 'legend', style: { marginTop: '6px' } },
      el('span', {}, el('i', { style: { background: 'var(--accent-color)' } }), 'Paid search budget (left)'),
      el('span', {}, el('i', { style: { background: 'var(--pink)' } }), 'Organic clicks (right)'),
    ),
  );
}
