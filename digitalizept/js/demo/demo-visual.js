/** Com fotos / Sem fotos: default from photos, load category boilerplates, persist choice. */

import { applyIdentityToHtml } from './html.js';
import { fillBoilerplateCopy, fillBoilerplateFromDemo } from './boilerplate-copy.js';
import { seedDemoFromType } from './seed.js';

export { fillBoilerplateCopy, fillBoilerplateFromDemo };

export const VISUAL_FOTOS = 'fotos';
export const VISUAL_SEM_FOTOS = 'sem-fotos';

const cache = new Map();

export function typeSlug(stateOrType) {
    if (!stateOrType) return 'generico';
    if (typeof stateOrType === 'string') return stateOrType;
    const type = stateOrType.data ? stateOrType.data.businessType : stateOrType;
    return String((type && type.id) || 'generico');
}

export function fotosCount(identidade) {
    const fotos = identidade && Array.isArray(identidade.fotos) ? identidade.fotos : [];
    return fotos.filter(Boolean).length;
}

export function hasFotos(identidade) {
    return fotosCount(identidade) > 0;
}

export function defaultDemoVisual(state) {
    const identidade = (state && state.data && state.data.identidade) || {};
    return hasFotos(identidade) ? VISUAL_FOTOS : VISUAL_SEM_FOTOS;
}

export function resolveDemoVisual(state, queryVisual, { preferPublishedLanding = false } = {}) {
    const fromQuery = normalizeVisual(queryVisual);
    if (fromQuery) return fromQuery;
    const stored = normalizeVisual(state && state.data && state.data.demoVisual);
    if (stored) return stored;
    if (isCustomHtml(state)) return VISUAL_FOTOS;
    if (isBoilerplateHtml(state && state.data && state.data.demoHtml)) return VISUAL_SEM_FOTOS;
    // Existing /d/:slug landing JSON was already the published site — do not swap it.
    if (preferPublishedLanding && state && state.data && state.data.demo && state.data.demo.hero) {
        return VISUAL_FOTOS;
    }
    return defaultDemoVisual(state);
}

export function normalizeVisual(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === VISUAL_SEM_FOTOS || raw === 'sem' || raw === 'no-photos') return VISUAL_SEM_FOTOS;
    if (raw === VISUAL_FOTOS || raw === 'com-fotos' || raw === 'photos') return VISUAL_FOTOS;
    return '';
}

export function isBoilerplateHtml(html) {
    return /data-dp-boilerplate\s*=/i.test(String(html || ''));
}

export function isCustomHtml(state) {
    const data = (state && state.data) || {};
    const stored = String(data.demoHtmlCustom || '').trim();
    if (stored && !isBoilerplateHtml(stored)) return true;
    const html = String(data.demoHtml || '');
    if (!html.trim()) return false;
    if (data.demoHtmlSource === 'boilerplate') return false;
    if (isBoilerplateHtml(html)) return false;
    return true;
}

async function fetchText(url) {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Falha a carregar ${url}`);
    return response.text();
}

async function inlineLocalStyles(html, baseHref) {
    if (typeof DOMParser === 'undefined') return html;
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll('link[rel="stylesheet"]')];
    await Promise.all(links.map(async (link) => {
        const href = link.getAttribute('href') || '';
        if (!href || /^https?:\/\//i.test(href)) return;
        const url = new URL(href, baseHref).href;
        try {
            const css = await fetchText(url);
            const style = doc.createElement('style');
            style.setAttribute('data-dp-boilerplate-css', '');
            style.textContent = css;
            link.replaceWith(style);
        } catch (_) { /* leave the link for gallery viewing */ }
    }));
    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

export function boilerplateUrl(slug) {
    return `/digitalizept/boilerplates/${typeSlug(slug)}-sem-fotos.html`;
}

export async function loadBoilerplateHtml(slugOrState, dados, businessType, identidade) {
    const state = slugOrState && slugOrState.data
        ? slugOrState
        : {
            data: {
                businessType: businessType || { id: typeSlug(slugOrState) },
                dados: dados || {},
                identidade: identidade || {}
            }
        };
    const data = state.data || {};
    const id = typeSlug(data.businessType || slugOrState);
    const cacheKey = `raw:${id}`;
    if (!cache.has(cacheKey)) {
        cache.set(cacheKey, fetchText(boilerplateUrl(id))
            .then((html) => inlineLocalStyles(html, new URL(boilerplateUrl(id), window.location.origin).href))
            .catch((err) => {
                cache.delete(cacheKey);
                throw err;
            }));
    }
    const raw = await cache.get(cacheKey);
    const filled = fillBoilerplateFromDemo(raw, state);
    if (state.data && !state.data.demo) state.data.demo = seedDemoFromType(state);
    return applyIdentityToHtml(filled, data.identidade || identidade || {}, data.dados || dados || {});
}

export async function prefetchBoilerplate(slug) {
    try {
        await loadBoilerplateHtml(slug, {}, { id: typeSlug(slug) }, {});
    } catch (_) { /* prefetch is best-effort */ }
}

export async function htmlForVisual(state, visual) {
    const data = (state && state.data) || {};
    const dados = data.dados || {};
    const identidade = data.identidade || {};
    if (visual === VISUAL_SEM_FOTOS) {
        return loadBoilerplateHtml(state);
    }
    const custom = String(data.demoHtmlCustom || (isCustomHtml(state) ? data.demoHtml : '') || '');
    if (custom && !isBoilerplateHtml(custom)) {
        return applyIdentityToHtml(custom, identidade, dados);
    }
    return '';
}

export function applyVisualToState(state, visual, html) {
    if (!state || !state.data) return state;
    const current = String(state.data.demoHtml || '');
    if (current && !isBoilerplateHtml(current) && state.data.demoHtmlSource !== 'boilerplate') {
        state.data.demoHtmlCustom = current;
    }
    if (visual === VISUAL_SEM_FOTOS) {
        state.data.demoHtml = html || state.data.demoHtml || '';
        state.data.demoHtmlSource = 'boilerplate';
        return state;
    }
    const custom = String(state.data.demoHtmlCustom || '').trim();
    if (custom && !isBoilerplateHtml(custom)) {
        state.data.demoHtml = custom;
        state.data.demoHtmlSource = 'ai';
        return state;
    }
    state.data.demoHtml = '';
    state.data.demoHtmlSource = '';
    return state;
}

export function rememberVisual(state, visual) {
    if (!state || !state.data) return;
    state.data.demoVisual = visual;
}

export function currentSectionId(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return '';
    const nodes = [...root.querySelectorAll('[id^="dpl-"]')];
    const top = (root.scrollTop || 0) + 80;
    let current = '';
    nodes.forEach((node) => {
        if (node.offsetTop <= top) current = node.id;
    });
    return current;
}

export function restoreSection(root, sectionId) {
    if (!root || !sectionId) return;
    const target = root.querySelector(`#${CSS.escape(sectionId)}`);
    if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'start' });
        return;
    }
    root.scrollTop = 0;
}

export function mountDemoSwitch(host, { visual, onChange } = {}) {
    if (!host) return null;
    let bar = host.querySelector(':scope > .dpl-demo-switch');
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'dpl-demo-switch';
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', 'Versão da demonstração');
        [
            [VISUAL_FOTOS, 'Com fotos'],
            [VISUAL_SEM_FOTOS, 'Sem fotos']
        ].forEach(([value, label]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.visual = value;
            btn.textContent = label;
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (typeof onChange === 'function') onChange(value);
            });
            bar.appendChild(btn);
        });
        host.appendChild(bar);
    }
    bar.querySelectorAll('button[data-visual]').forEach((btn) => {
        btn.setAttribute('aria-pressed', btn.dataset.visual === visual ? 'true' : 'false');
    });
    const hostIsOverlay = host.classList && host.classList.contains('dp-preview-overlay');
    const publicPage = document.body.classList.contains('dp-public');
    if (hostIsOverlay) host.classList.add('dpl-has-switch');
    else if (publicPage) document.body.classList.add('dpl-has-switch');
    return bar;
}

export function stripDemoSwitch(html) {
    return String(html || '').replace(
        /<div\b[^>]*\bdpl-demo-switch\b[^>]*>[\s\S]*?<\/div>/gi,
        ''
    );
}
