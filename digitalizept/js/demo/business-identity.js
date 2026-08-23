/** Client copy of server/lib/digitalizept-business-identity.js — keep both in sync. */

const GENERIC_TOKENS = new Set([
    'restaurante', 'restaurant', 'restaurants', 'cafe', 'loja', 'shop', 'store',
    'bar', 'hotel', 'the', 'and', 'e', 'de', 'do', 'da', 'dos', 'das',
    'o', 'a', 'os', 'as', 'em', 'no', 'na', 'pt', 'lda', 'unipessoal'
]);

export function normalizeBusinessKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function significantTokens(value, ignoreKeys = []) {
    const ignore = new Set(ignoreKeys.filter(Boolean));
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => (
            token.length >= 4
            && !GENERIC_TOKENS.has(token)
            && !ignore.has(token)
        ));
}

export function sameBusinessName(a, b, { ignore = [] } = {}) {
    const x = normalizeBusinessKey(a);
    const y = normalizeBusinessKey(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (x.length >= 6 && y.length >= 6 && (x.includes(y) || y.includes(x))) return true;
    const ignoreKeys = (Array.isArray(ignore) ? ignore : [ignore]).map(normalizeBusinessKey);
    const left = significantTokens(a, ignoreKeys);
    const right = significantTokens(b, ignoreKeys);
    if (!left.length || !right.length) return false;
    return left.some((token) => right.includes(token));
}

export function bindLeadToNome(data, nome) {
    if (!data || typeof data !== 'object') return data;
    const bound = String(nome || '').trim();
    if (bound) data.leadBoundNome = bound;
    return data;
}

export function detachLeadIfBusinessChanged(state) {
    const data = state && state.data;
    if (!data) return false;
    const current = data.dados && data.dados.nome_negocio;
    const bound = data.leadBoundNome;
    if (!data.leadId || !bound) return false;
    const cidade = data.dados && data.dados.cidade;
    if (sameBusinessName(bound, current, { ignore: [cidade] })) return false;
    delete data.leadId;
    data.leadBoundNome = String(current || '').trim();
    data.demoUrl = '';
    return true;
}
