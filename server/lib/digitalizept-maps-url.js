/**
 * Parse Google Maps share URLs for name + coordinates.
 * Does not fetch or scrape Maps HTML — only reads what is already in the URL.
 */

const SHORT_HOSTS = new Set([
    'maps.app.goo.gl',
    'goo.gl',
    'g.co',
    'g.page'
]);

const MAPS_HOSTS = new Set([
    'google.com',
    'google.pt',
    'maps.google.com',
    'maps.google.pt',
    ...SHORT_HOSTS
]);

function decodePlace(raw) {
    const text = String(raw || '')
        .replace(/\+/g, ' ')
        .replace(/%2[bB]/g, ' ');
    try {
        return decodeURIComponent(text).replace(/\s+/g, ' ').trim();
    } catch (_) {
        return text.replace(/\s+/g, ' ').trim();
    }
}

function hostOf(hostname) {
    return String(hostname || '').replace(/^www\./i, '').toLowerCase();
}

function isMapsHost(hostname) {
    const host = hostOf(hostname);
    if (MAPS_HOSTS.has(host)) return true;
    if (host.endsWith('.google.com') || host.endsWith('.google.pt')) return true;
    return false;
}

function isShortMapsHost(hostname) {
    return SHORT_HOSTS.has(hostOf(hostname));
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function setLatLng(out, lat, lng) {
    const a = toNumber(lat);
    const b = toNumber(lng);
    if (a == null || b == null) return;
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return;
    out.lat = a;
    out.lng = b;
}

function parseQueryCoord(value) {
    const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*,\s*\d+(?:\.\d+)?)?$/);
    if (!match) return null;
    return { lat: toNumber(match[1]), lng: toNumber(match[2]) };
}

/**
 * @param {string} input
 * @returns {{
 *   ok: boolean,
 *   error?: string,
 *   url?: string,
 *   nome?: string,
 *   lat?: number | null,
 *   lng?: number | null,
 *   query?: string,
 *   short?: boolean
 * }}
 */
function parseMapsUrl(input) {
    const raw = String(input || '').trim();
    if (!raw) return { ok: false, error: 'Cole um link do Google Maps.' };

    let href = raw;
    if (!/^https?:\/\//i.test(href)) href = `https://${href}`;

    let url;
    try {
        url = new URL(href);
    } catch (_) {
        return { ok: false, error: 'Link inválido.' };
    }

    const host = hostOf(url.hostname);
    const looksLikeMaps = isMapsHost(host)
        || url.pathname.includes('/maps')
        || url.searchParams.has('q')
        || url.searchParams.has('query');
    if (!looksLikeMaps) {
        return { ok: false, error: 'Não parece um link do Google Maps.' };
    }

    const out = {
        ok: true,
        url: url.toString(),
        nome: '',
        lat: null,
        lng: null,
        query: '',
        short: isShortMapsHost(host)
    };

    const placeMatch = url.pathname.match(/\/(?:place|search)\/([^/@]+)/i);
    if (placeMatch) {
        const name = decodePlace(placeMatch[1]);
        if (name && !/^-?\d/.test(name)) out.nome = name.replace(/,+$/, '').trim();
    }

    const atMatch = `${url.pathname}${url.hash}`.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atMatch) setLatLng(out, atMatch[1], atMatch[2]);

    const dataMatch = url.href.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (dataMatch) setLatLng(out, dataMatch[1], dataMatch[2]);

    const ll = url.searchParams.get('ll') || url.searchParams.get('center');
    if (ll) {
        const parsed = parseQueryCoord(ll);
        if (parsed) setLatLng(out, parsed.lat, parsed.lng);
    }

    const q = url.searchParams.get('q')
        || url.searchParams.get('query')
        || url.searchParams.get('destination');
    if (q) {
        out.query = decodePlace(q);
        const parsed = parseQueryCoord(q);
        if (parsed) setLatLng(out, parsed.lat, parsed.lng);
        else if (!out.nome && out.query && !/^ChIJ/i.test(out.query)) {
            out.nome = out.query;
        }
    }

    if (out.nome) {
        out.nome = out.nome
            .replace(/\s+\d{4,5}(?:-\d{3})?\s*$/, '')
            .replace(/\s*,\s*Portugal\s*$/i, '')
            .trim();
    }

    return out;
}

module.exports = {
    parseMapsUrl,
    decodePlace,
    isMapsHost,
    isShortMapsHost
};
