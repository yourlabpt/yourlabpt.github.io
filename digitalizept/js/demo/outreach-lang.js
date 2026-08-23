/** Client-facing outreach language. Operator chrome stays Portuguese. */

export function normalizeOutreachLang(value) {
    return String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'pt';
}

export function greetingForHour(hour, lang) {
    const en = normalizeOutreachLang(lang) === 'en';
    if (Number(hour) < 13) return en ? 'Good morning' : 'Bom dia';
    return en ? 'Good afternoon' : 'Boa tarde';
}

export function visitaQuandoFor(key, lang) {
    const tarde = String(key || '') === 'tarde';
    if (normalizeOutreachLang(lang) === 'en') return tarde ? 'this afternoon' : 'this morning';
    return tarde ? 'esta tarde' : 'hoje de manhã';
}

export function defaultFollowupDia(lang) {
    return normalizeOutreachLang(lang) === 'en' ? 'tomorrow' : 'amanhã';
}

export function localizeFollowupDia(value, lang) {
    const raw = String(value || '').trim();
    const en = normalizeOutreachLang(lang) === 'en';
    if (en && (!raw || raw === 'amanhã')) return 'tomorrow';
    if (!en && (!raw || raw === 'tomorrow')) return 'amanhã';
    return raw;
}
