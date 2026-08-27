/**
 * Assisted social discovery for Novo negócio — opens Google / FB / IG tabs.
 * No scraping: seller copies email and links by hand.
 */

function clean(value) {
    return String(value == null ? '' : value).trim();
}

function stripAt(handle) {
    return clean(handle).replace(/^@+/, '');
}

export function googleSearchUrl(query) {
    const q = clean(query);
    if (!q) return '';
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function businessSearchQuery(nome, cidade, extra = '') {
    const parts = [];
    const name = clean(nome);
    const city = clean(cidade);
    const more = clean(extra);
    if (name) parts.push(`"${name}"`);
    if (city) parts.push(city);
    if (more) parts.push(more);
    return parts.join(' ').trim();
}

function cityOrPorto(cidade) {
    return clean(cidade) || 'Porto';
}

/** Google Maps search for a trade + city (opens results; no scrape). */
export function googleMapsSearchUrl({ query = '', cidade = '', nome = '' } = {}) {
    const city = cityOrPorto(cidade);
    const q = clean(query) || clean(nome);
    const terms = [q, city].filter(Boolean).join(' ').trim() || city;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(terms)}`;
}

/**
 * Search terms for a Digitalize business type in a city.
 * Prefer the first palavra_chave when present.
 */
export function businessTypeSearchQuery(type, cidade = '') {
    const city = cityOrPorto(cidade);
    const t = type || {};
    const keyword = Array.isArray(t.palavras_chave) && t.palavras_chave[0]
        ? clean(t.palavras_chave[0])
        : clean(t.nome || t.id || '');
    return [keyword, city].filter(Boolean).join(' ').trim();
}

/** Bundle of discovery deep-links for one type + city. */
export function businessTypeDiscoveryLinks(type, cidade = '') {
    const city = cityOrPorto(cidade);
    const q = businessTypeSearchQuery(type, city);
    const keyword = Array.isArray(type && type.palavras_chave) && type.palavras_chave[0]
        ? clean(type.palavras_chave[0])
        : clean((type && type.nome) || '');
    return {
        query: q,
        cidade: city,
        maps: googleMapsSearchUrl({ query: keyword, cidade: city }),
        google: googleSearchUrl(q),
        facebook: facebookPagesSearchUrl({ query: keyword, cidade: city }),
        marketplace: facebookMarketplaceSearchUrl({ cidade: city, query: keyword }),
        facebookWeb: facebookWebSearchUrl({ query: keyword, cidade: city })
    };
}

/** Google site: search for Facebook pages in a city (default Porto). */
export function facebookPagesSearchUrl({ cidade = '', query = '', nome = '' } = {}) {
    const city = cityOrPorto(cidade);
    const q = clean(query) || clean(nome);
    const parts = [];
    if (q) parts.push(`"${q}"`);
    parts.push(city, 'site:facebook.com');
    return googleSearchUrl(parts.join(' '));
}

/** Facebook web search deep-link (pages / places). Discovery aid only. */
export function facebookWebSearchUrl({ cidade = '', query = '', nome = '' } = {}) {
    const city = cityOrPorto(cidade);
    const q = clean(query) || clean(nome);
    const terms = [q, city].filter(Boolean).join(' ').trim() || city;
    return `https://www.facebook.com/search/top/?q=${encodeURIComponent(terms)}`;
}

/**
 * Marketplace search deep-link for a city (default Porto).
 * Aid for informal sellers — not auto-import.
 */
export function facebookMarketplaceSearchUrl({ cidade = '', query = '' } = {}) {
    const city = cityOrPorto(cidade);
    const q = clean(query);
    const terms = [q, city].filter(Boolean).join(' ').trim() || city;
    return `https://www.facebook.com/marketplace/${encodeURIComponent(city.toLowerCase())}/search/?query=${encodeURIComponent(terms)}`;
}

/** Prefer a named business + city for “find this shop’s page”. */
export function facebookPlacesOrPagesQuery(nome, cidade) {
    return businessSearchQuery(nome, cityOrPorto(cidade), 'site:facebook.com');
}

/** Prefer a direct profile URL; otherwise Google site: search. */
export function facebookOpenUrl(value, { nome = '', cidade = '' } = {}) {
    const raw = clean(value);
    if (raw) {
        const lower = raw.toLowerCase();
        if (lower.includes('facebook.com') || lower.includes('fb.com') || lower.includes('fb.me')) {
            if (/^https?:\/\//i.test(raw)) return raw;
            if (raw.startsWith('//')) return `https:${raw}`;
            return `https://${raw.replace(/^\/+/, '')}`;
        }
        const handle = stripAt(raw);
        // Vanity pages often include dots (e.g. casadavila.braga)
        if (handle && !/\s/.test(handle) && /^[A-Za-z0-9.]+$/.test(handle)) {
            return `https://www.facebook.com/${handle}`;
        }
    }
    const q = businessSearchQuery(nome, cidade, 'site:facebook.com');
    return googleSearchUrl(q);
}

export function instagramOpenUrl(value, { nome = '', cidade = '' } = {}) {
    const raw = clean(value);
    if (raw) {
        const lower = raw.toLowerCase();
        if (lower.includes('instagram.com') || lower.includes('instagr.am')) {
            if (/^https?:\/\//i.test(raw)) return raw;
            if (raw.startsWith('//')) return `https:${raw}`;
            return `https://${raw.replace(/^\/+/, '')}`;
        }
        const handle = stripAt(raw).replace(/\/+$/, '');
        if (handle && !/\s/.test(handle) && /^[A-Za-z0-9._]+$/.test(handle)) {
            return `https://www.instagram.com/${handle}/`;
        }
    }
    const q = businessSearchQuery(nome, cidade, 'site:instagram.com');
    return googleSearchUrl(q);
}

export function googleBusinessSocialSearchUrl(nome, cidade) {
    return googleSearchUrl(businessSearchQuery(nome, cidade, 'facebook OR instagram'));
}

export function copySearchQuery(nome, cidade) {
    return businessSearchQuery(nome, cidade, 'facebook OR instagram');
}

export function openExternal(url) {
    const href = clean(url);
    if (!href || typeof window === 'undefined' || typeof window.open !== 'function') return false;
    window.open(href, '_blank', 'noopener,noreferrer');
    return true;
}
