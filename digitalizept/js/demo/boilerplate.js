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

export function instagramHref(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
    const handle = raw.replace(/^@/, '');
    return handle ? `https://www.instagram.com/${handle}` : '';
}

export function facebookHref(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
    const handle = raw
        .replace(/^@/, '')
        .replace(/^https?:\/\/(www\.)?facebook\.com\//i, '')
        .replace(/\/$/, '');
    return handle ? `https://www.facebook.com/${handle}` : '';
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
