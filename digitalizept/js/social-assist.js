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
