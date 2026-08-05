/** Reusable UI pieces, built with the dom.js helpers. */

import { el } from './dom.js';

export function card({ idx, title, note, right, body }) {
  const bodyNode = el('div', { class: 'card-body' });
  const head = (idx || title || right)
    ? el('div', { class: 'card-head' },
        idx && el('span', { class: 'idx' }, idx),
        title && el('h2', {}, title),
        note && el('span', { class: 'card-note' }, note),
        right && el('span', { class: 'spacer' }),
        right || null,
      )
    : null;
  const node = el('section', { class: 'card' }, head, bodyNode);
  node.body = bodyNode;
  if (body) bodyNode.appendChild(body);
  return node;
}

export function field({ label, hint, control }) {
  return el('label', { class: 'field' },
    label && el('span', { class: 'lbl' }, label),
    control,
    hint && el('span', { class: 'hint' }, hint),
  );
}

export function stat({ n, l, sub, tone }) {
  return el('div', { class: 'stat' },
    el('div', { class: 'n', style: tone ? { color: `var(--${tone})` } : {} }, n),
    el('div', { class: 'l' }, l),
    sub && el('div', { class: 'sub' }, sub),
  );
}

export function callout(kind, ...children) {
  return el('div', { class: kind ? `callout ${kind}` : 'callout' }, ...children);
}

export function chip(id, text, opts = {}) {
  const tag = opts.onClick ? 'button' : 'span';
  const node = el(tag, {
    class: id ? `chip chip-${id}` : 'chip',
    type: tag === 'button' ? 'button' : null,
    'data-on': opts.active ? 'true' : null,
    onclick: opts.onClick || null,
  }, text);
  return node;
}

export function scoreBar(score) {
  const colour = score >= 40 ? 'var(--green)' : score >= 20 ? 'var(--accent-color)' : 'var(--slate)';
  return el('div', { class: 'score-cell' },
    el('span', { class: 'score-num', style: { color: score > 0 ? colour : 'var(--muted)' } }, score),
    el('span', { class: 'score-bar' },
      el('i', { style: { width: `${score}%`, background: colour } })),
  );
}

export function progressBar() {
  const bar = el('i');
  const node = el('div', { class: 'progress' }, bar);
  node.set = (v) => { bar.style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`; };
  return node;
}

export function copyButton(text, label = 'Copy') {
  const btn = el('button', {
    class: 'btn btn-sm btn-ghost',
    type: 'button',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = label; }, 1400);
      } catch {
        // Clipboard blocked (insecure context or permission) — select instead
        // of failing silently, so the text is still one keystroke away.
        btn.textContent = 'Select it manually';
        setTimeout(() => { btn.textContent = label; }, 2000);
      }
    },
  }, label);
  return btn;
}

export function input(props) {
  return el('input', { type: 'text', autocomplete: 'off', spellcheck: 'false', ...props });
}

export function select(options, props) {
  return el('select', props, ...options.map((o) => {
    const value = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return el('option', { value, selected: props && props.value === value }, label);
  }));
}

export function numberInput(props) {
  return el('input', { type: 'number', ...props });
}
