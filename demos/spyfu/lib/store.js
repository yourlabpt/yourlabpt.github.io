/**
 * Tiny client-side store.
 *
 * index.html and signals.html are separate documents, so module memory does not
 * survive the hop between them. Three tiers of persistence:
 *
 *   localStorage   config + uploaded list + a COMPACT snapshot of the last run
 *                  (the snapshot powers the run-over-run diff, FR-19)
 *   sessionStorage the full run results, so opening the Signals page does not
 *                  re-run the analysis — which in live mode would re-spend money
 *   memory only    the API key. Never written anywhere.
 *
 * Every write is quota-guarded. Storage failing degrades the app to "forgets
 * between page loads"; it never breaks it.
 */

import { defaultConfig } from './config.js';

const KEY = 'spyfu.intent.v1';
const RUN_KEY = 'spyfu.intent.run.v1';

let state = {
  config: defaultConfig(),
  upload: null,     // { fileName, columns, rows, urlColumn, exclusions, prospects, stats }
  run: null,        // full result of runAnalysis — mirrored to sessionStorage
  lastSnapshot: null, // [{domain, score, firedIds}] from the previous run
  hydrated: false,
};

const listeners = new Set();

export function getState() { return state; }

export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  persist();
  listeners.forEach((l) => l(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    const { apiId, secretKey, ...safeConfig } = state.config;
    window.localStorage.setItem(KEY, JSON.stringify({
      config: safeConfig,
      upload: state.upload
        ? {
            fileName: state.upload.fileName,
            columns: state.upload.columns,
            rows: state.upload.rows,
            urlColumn: state.upload.urlColumn,
            exclusions: state.upload.exclusions,
          }
        : null,
      lastSnapshot: state.lastSnapshot,
    }));
  } catch {
    /* quota or private mode — the app still works, it just won't remember */
  }
  persistRun();
}

/**
 * The full run goes to sessionStorage so the Signals page can render instantly
 * without re-analysing. `record` carries the raw per-domain payload for
 * traceability (NFR-10); on a big list that is the bulk of the weight, so if we
 * blow the quota we retry once without it. A results table with no drill-down
 * charts beats no results at all.
 */
function persistRun() {
  if (typeof window === 'undefined') return;
  try {
    if (!state.run) { window.sessionStorage.removeItem(RUN_KEY); return; }
    window.sessionStorage.setItem(RUN_KEY, JSON.stringify(state.run));
  } catch {
    try {
      const slim = {
        ...state.run,
        results: state.run.results.map(({ record, ...rest }) => ({ ...rest, record: null })),
        trimmed: true,
      };
      window.sessionStorage.setItem(RUN_KEY, JSON.stringify(slim));
    } catch {
      /* still too big, or storage disabled — the Signals page will re-run */
    }
  }
}

export function hydrate() {
  if (typeof window === 'undefined' || state.hydrated) return state;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = {
        ...state,
        config: { ...defaultConfig(), ...(saved.config || {}),
          thresholds: { ...defaultConfig().thresholds, ...((saved.config || {}).thresholds || {}) },
          weights: { ...defaultConfig().weights, ...((saved.config || {}).weights || {}) },
          apiId: '', secretKey: '' },
        upload: saved.upload || null,
        lastSnapshot: saved.lastSnapshot || null,
      };
    }
  } catch {
    /* corrupt storage — fall back to defaults rather than crashing the page */
  }
  try {
    const rawRun = window.sessionStorage.getItem(RUN_KEY);
    if (rawRun) state = { ...state, run: JSON.parse(rawRun) };
  } catch {
    /* ignore — the Signals page falls back to re-running */
  }
  state = { ...state, hydrated: true };
  return state;
}

export function snapshotOf(results) {
  return results.map((r) => ({ domain: r.domain, score: r.score, firedIds: r.firedIds }));
}

export function resetAll() {
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
    try { window.sessionStorage.removeItem(RUN_KEY); } catch { /* ignore */ }
  }
  state = { config: defaultConfig(), upload: null, run: null, lastSnapshot: null, hydrated: true };
  listeners.forEach((l) => l(state));
}

/**
 * Asset paths are RELATIVE on purpose. index.html and signals.html both sit at
 * the folder root, so 'data/x.csv' resolves correctly from either, and the whole
 * folder can be moved or renamed without touching a line of code.
 */
export function asset(path) {
  return path.replace(/^\//, '');
}
