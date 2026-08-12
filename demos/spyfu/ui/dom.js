/**
 * Minimal DOM helpers. No framework, no build step — this folder is served as
 * plain static files by express.static, exactly like your-blocks and your-run.
 */

/**
 * el('div', { class: 'x', onclick: fn, style: {...} }, child, child…)
 * Children may be nodes, strings, numbers, arrays, or null/false (skipped).
 */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  applyProps(node, props);
  append(node, children);
  return node;
}

function applyProps(node, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function fill(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

/** Debounce for text inputs that trigger recalculation. */
export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let toastTimer = null;
export function toast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  clearTimeout(toastTimer);
  const node = el('div', { class: 'toast' }, message);
  document.body.appendChild(node);
  toastTimer = setTimeout(() => node.remove(), 2800);
}

/** Shared top bar. */
export function topbar() {
  return el('div', { class: 'topbar' },
    el('div', { class: 'topbar-inner' },
      el('div', { class: 'brand' },
        el('span', { class: 'brand-mark' }, 'SPYFU SPEND CHECK'),
        el('span', { class: 'brand-sub' }, 'by Your Lab Technologies'),
      ),
      el('span', { class: 'spacer' }),
      el('a', { class: 'site-back', href: '/' }, '← yourlabpt.com'),
    ),
  );
}
