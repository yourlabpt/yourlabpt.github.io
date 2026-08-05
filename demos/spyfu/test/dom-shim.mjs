/**
 * A minimal DOM, enough to actually RUN the UI modules under plain Node.
 *
 * Why this exists: there is no browser binary and no network to fetch one in
 * the environment this was built in, so `node --check` would otherwise be the
 * only verification the UI ever got — and syntax checking finds none of the
 * bugs that matter (undefined helpers, wrong property names, bad assumptions
 * about shapes). This shim lets test/smoke-ui.mjs mount both pages, click
 * things and assert on the result.
 *
 * It is a test harness, not a browser. It implements exactly the surface the
 * app touches. If the app starts using a new DOM API, add it here.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

class ClassList {
  constructor(node) { this.node = node; }
  get _list() { return String(this.node.className || '').split(/\s+/).filter(Boolean); }
  contains(c) { return this._list.includes(c); }
  add(c) { if (!this.contains(c)) this.node.className = [...this._list, c].join(' '); }
  remove(c) { this.node.className = this._list.filter((x) => x !== c).join(' '); }
}

class Node {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
  }

  get children() { return this.childNodes.filter((n) => n instanceof Element); }
  get firstChild() { return this.childNodes[0] || null; }

  appendChild(child) {
    if (child instanceof DocumentFragment) {
      [...child.childNodes].forEach((c) => this.appendChild(c));
      return child;
    }
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  append(...nodes) {
    for (const n of nodes) {
      if (n === null || n === undefined || n === false) continue;
      this.appendChild(n instanceof Node ? n : new Text(String(n)));
    }
  }

  removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) { this.childNodes.splice(i, 1); child.parentNode = null; }
    return child;
  }

  remove() { if (this.parentNode) this.parentNode.removeChild(this); }

  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v !== null && v !== undefined) this.appendChild(new Text(String(v)));
  }

  /** Depth-first walk of every Element under this node. */
  *walk() {
    for (const c of this.childNodes) {
      if (c instanceof Element) { yield c; yield* c.walk(); }
    }
  }

  querySelectorAll(sel) {
    const out = [];
    for (const n of this.walk()) if (matches(n, sel)) out.push(n);
    return out;
  }

  querySelector(sel) {
    for (const n of this.walk()) if (matches(n, sel)) return n;
    return null;
  }
}

class Text extends Node {
  constructor(data) { super(); this.data = String(data); }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
}

class DocumentFragment extends Node {}

class Element extends Node {
  constructor(tagName, ns) {
    super();
    this.tagName = String(tagName).toUpperCase();
    this.namespaceURI = ns || null;
    this.attributes = {};
    this.className = '';
    this.style = new Proxy({}, { set: (t, k, v) => { t[k] = v; return true; } });
    this.dataset = {};
    this.classList = new ClassList(this);
    this._listeners = {};
    this.value = '';
    this.disabled = false;
    this.checked = false;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = String(value);
    }
    if (name === 'id') this.id = String(value);
  }

  getAttribute(name) {
    if (name === 'class') return this.className || null;
    return name in this.attributes ? this.attributes[name] : null;
  }

  removeAttribute(name) { delete this.attributes[name]; }

  set innerHTML(v) { this.childNodes = []; if (v) this.appendChild(new Text(String(v))); }
  get innerHTML() { return this.textContent; }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  removeEventListener(type, fn) {
    this._listeners[type] = (this._listeners[type] || []).filter((f) => f !== fn);
  }

  dispatchEvent(event) {
    const ev = { type: event.type, target: this, currentTarget: this,
      preventDefault() {}, stopPropagation() { ev._stopped = true; }, ...event };
    let node = this;
    while (node) {
      ev.currentTarget = node;
      for (const fn of (node._listeners || {})[ev.type] || []) fn(ev);
      if (ev._stopped) break;
      node = node.parentNode;
    }
    return true;
  }

  click() { return this.dispatchEvent({ type: 'click' }); }
}

/**
 * Compound selectors only — `tag`, `.class`, `#id`, `[attr]`, `[attr="v"]` and
 * any combination of those on one element (`tr.prospect[data-open="true"]`).
 * No descendant or sibling combinators; the app does not use them.
 */
const SELECTOR_PART = /([.#][\w-]+)|(\[[^\]]+\])|(^[a-zA-Z][\w-]*)/g;

function matches(node, sel) {
  const s = sel.trim();
  const parts = s.match(SELECTOR_PART);
  if (!parts) return false;
  for (const part of parts) {
    if (part.startsWith('.')) {
      if (!node.classList.contains(part.slice(1))) return false;
    } else if (part.startsWith('#')) {
      if (node.id !== part.slice(1)) return false;
    } else if (part.startsWith('[')) {
      const m = /^\[([\w-]+)(?:\s*=\s*"?([^"\]]*)"?)?\]$/.exec(part);
      if (!m) return false;
      const actual = node.getAttribute(m[1]);
      if (actual === null) return false;
      if (m[2] !== undefined && actual !== m[2]) return false;
    } else if (node.tagName !== part.toUpperCase()) {
      return false;
    }
  }
  return true;
}

class Document extends Node {
  constructor() {
    super();
    this.head = new Element('head');
    this.body = new Element('body');
    this.appendChild(this.head);
    this.appendChild(this.body);
  }
  createElement(tag) { return new Element(tag); }
  createElementNS(ns, tag) { return new Element(tag, ns); }
  createTextNode(t) { return new Text(t); }
  createDocumentFragment() { return new DocumentFragment(); }
  getElementById(id) { return this.querySelector(`#${id}`); }
}

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(),
    get length() { return map.size; },
  };
}

/** Install the shim onto globalThis. Returns handles the tests use. */
export function installDom({ fetchRoot = join(here, '..') } = {}) {
  const document = new Document();
  const navigation = { href: null };
  const downloads = [];

  globalThis.Node = Node;
  globalThis.Element = Element;
  globalThis.document = document;
  globalThis.localStorage = makeStorage();
  globalThis.sessionStorage = makeStorage();
  // Node 22 defines navigator as a getter-only global, so assignment throws.
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => {} } },
    configurable: true,
    writable: true,
  });
  globalThis.window = {
    document,
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    get location() { return navigation; },
    set location(v) { navigation.href = v; },
    addEventListener() {},
  };
  Object.defineProperty(globalThis.window, 'location', {
    get: () => navigation,
    set: (v) => { navigation.href = String(v); },
    configurable: true,
  });

  globalThis.Blob = class Blob {
    constructor(parts, opts) { this.parts = parts; this.type = (opts || {}).type || ''; }
  };
  globalThis.URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return `blob:mock/${downloads.length}`;
  };
  globalThis.URL.revokeObjectURL = () => {};

  /** Serves the demo folder from disk, so loading the sample list is real. */
  globalThis.fetch = async (url) => {
    const rel = String(url).replace(/^\.?\//, '');
    const body = readFileSync(join(fetchRoot, rel), 'utf8');
    return {
      ok: true,
      status: 200,
      text: async () => body,
      json: async () => JSON.parse(body),
      headers: { get: () => null },
    };
  };

  return { document, navigation, downloads };
}

export { Node, Element, Text };
