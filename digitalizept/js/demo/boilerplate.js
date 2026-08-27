/** Category boilerplate helpers: copy, lists, maps, trust chips. Data-driven from businessType. */

export function splitItems(value) {
    return String(value || '')
        .split(/[,;\n•]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function isYes(value) {
    const v = String(value || '').trim().toLowerCase();
    return v === 'sim' || v === 'yes' || v === 'true';
}

export function rotulo(businessType, key, fallback) {
    const labels = (businessType && businessType.rotulos) || {};
    return labels[key] || fallback;
}

export function interpolate(template, dados = {}, businessType = {}) {
    return String(template || '')
        .replace(/\{nome\}/g, dados.nome_negocio || businessType.nome || 'este negócio')
        .replace(/\{cidade\}/g, dados.cidade || 'Portugal')
        .replace(/\{tipo\}/g, businessType.nome || 'negócio');
}

export function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
}

export function waNumber(whatsapp) {
    const d = digitsOnly(whatsapp);
    if (!d) return '';
    return d.length === 9 ? `351${d}` : d;
}

export function mapsHref(dados) {
    const direct = String((dados && dados.maps_url) || '').trim();
    if (/^https?:\/\//i.test(direct)) return direct;
    const query = [dados && dados.morada, dados && dados.cidade].filter(Boolean).join(', ');
    if (!query) return '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function whatsappHref(dados) {
    const wa = waNumber((dados && (dados.whatsapp || dados.telefone)) || '');
    return wa ? `https://wa.me/${wa}` : '';
}

export function telHref(dados) {
    const d = digitsOnly(dados && dados.telefone);
    return d ? `tel:${d}` : '';
}

function cleanSocialRaw(value) {
    return String(value || '')
        .trim()
        .replace(/^['"<\s]+|['">\s]+$/g, '')
        .replace(/\s+/g, '');
}

/** App-relative paths stay as-is (sample demos). */
function isAppRelativePath(raw) {
    return raw.startsWith('/') && !raw.startsWith('//');
}

function ensureHttps(urlLike) {
    const s = String(urlLike || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('//')) return `https:${s}`;
    return `https://${s.replace(/^\/+/, '')}`;
}

function firstPathSegment(pathname) {
    const parts = String(pathname || '')
        .split('/')
        .map((p) => p.trim())
        .filter(Boolean);
    return parts[0] || '';
}

const IG_RESERVED = new Set([
    'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'tv', 'about', 'legal'
]);

/**
 * Accepts @handle, handle, instagram.com/handle, full URLs (with or without https),
 * m.instagram.com, and URLs with tracking query strings.
 */
export function instagramHref(value) {
    const raw = cleanSocialRaw(value);
    if (!raw) return '';
    if (isAppRelativePath(raw)) return raw;

    let s = raw.replace(/^@+/, '');
    s = s.replace(/^(https?:\/\/)?(www\.)?instagram\.com\/?/i, '');
    s = s.replace(/^(https?:\/\/)?(www\.)?instagr\.am\/?/i, '');

    if (/instagram\.com|instagr\.am/i.test(raw) || /^https?:\/\//i.test(raw) || raw.startsWith('//')) {
        try {
            const u = new URL(ensureHttps(raw.includes('instagram') || raw.includes('instagr.am')
                ? raw
                : `https://www.instagram.com/${s}`));
            if (!/instagram\.com$/i.test(u.hostname) && !/(^|\.)instagr\.am$/i.test(u.hostname)) {
                return ensureHttps(raw);
            }
            const seg = firstPathSegment(u.pathname);
            if (!seg) return 'https://www.instagram.com/';
            if (IG_RESERVED.has(seg.toLowerCase())) {
                const path = u.pathname.replace(/\/+$/, '') || `/${seg}`;
                return `https://www.instagram.com${path}${u.search || ''}`;
            }
            const handle = decodeURIComponent(seg).replace(/^@+/, '');
            return handle ? `https://www.instagram.com/${handle}` : '';
        } catch (_) {
            /* fall through to handle parse */
        }
    }

    const handle = s
        .replace(/^@+/, '')
        .split(/[/?#]/)[0]
        .replace(/\/+$/, '');
    if (!handle || /\s/.test(handle)) return '';
    if (!/^[A-Za-z0-9._]+$/.test(handle)) return '';
    return `https://www.instagram.com/${handle}`;
}

const FB_HOST_RE = /(?:^|\.)(?:facebook\.com|fb\.com|fb\.me)$/i;

/**
 * Accepts @page, page, facebook.com/…, fb.com/…, fb.me/…, m.facebook.com/…,
 * profile.php?id=, people/…, pages/…, with or without https.
 */
export function facebookHref(value) {
    const raw = cleanSocialRaw(value);
    if (!raw) return '';
    if (isAppRelativePath(raw)) return raw;

    if (/facebook\.com|fb\.com|fb\.me/i.test(raw)) {
        try {
            const u = new URL(ensureHttps(raw));
            if (!FB_HOST_RE.test(u.hostname)) return ensureHttps(raw);
            const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
            const search = u.search || '';
            if (/profile\.php/i.test(path) || /\/(pages|people|groups|events)\b/i.test(path)) {
                return `https://www.facebook.com${path === '/' ? '' : path}${search}`;
            }
            const seg = firstPathSegment(path);
            if (!seg) return 'https://www.facebook.com/';
            if (/^(permalink\.php|watch|share|story\.php)$/i.test(seg)) {
                return `https://www.facebook.com${path}${search}`;
            }
            const handle = decodeURIComponent(seg).replace(/^@+/, '');
            return handle ? `https://www.facebook.com/${handle}` : '';
        } catch (_) {
            /* fall through */
        }
    }

    let s = raw
        .replace(/^@+/, '')
        .replace(/^(https?:\/\/)?(www\.|m\.)?(facebook\.com|fb\.com|fb\.me)\/?/i, '')
        .replace(/^@+/, '');
    if (/^profile\.php/i.test(s)) {
        return `https://www.facebook.com/${s}`;
    }
    if (/^(pages|people|groups|events)\//i.test(s)) {
        return `https://www.facebook.com/${s.replace(/\/+$/, '')}`;
    }
    const handle = s.split(/[/?#]/)[0].replace(/\/+$/, '');
    if (!handle || /\s/.test(handle)) return '';
    if (!/^[A-Za-z0-9.]+$/.test(handle)) return '';
    return `https://www.facebook.com/${handle}`;
}

export function websiteHref(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
    return `https://${raw.replace(/^\/+/, '')}`;
}

export function mapsDirectionsHref(morada) {
    const q = String(morada || '').trim();
    if (!q) return '';
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export function trustChips(dados, businessType) {
    const chips = [];
    const years = String((dados && dados.anos_experiencia) || '').trim();
    if (years) chips.push(years.match(/ano/i) ? years : `${years} anos`);
    if (dados && dados.certificacoes) chips.push(String(dados.certificacoes).trim());
    const flags = Array.isArray(businessType && businessType.trust_flags)
        ? businessType.trust_flags
        : [];
    flags.forEach((flag) => {
        if (!flag || !flag.id) return;
        if (isYes(dados && dados[flag.id])) chips.push(flag.label);
    });
    return chips.filter(Boolean).slice(0, 6);
}

export function destaqueItems(dados, businessType) {
    const field = (businessType && businessType.destaques_campo) || '';
    if (!field) return [];
    return splitItems(dados && dados[field]);
}

export function marcaItems(dados, businessType) {
    const field = (businessType && businessType.marcas_campo) || 'marcas';
    const extra = field === 'marcas' ? dados && dados.marcas_usadas : '';
    return splitItems((dados && dados[field]) || extra);
}
