/**
 * Decide whether two shop names are the same business.
 * Used so a new street lead cannot overwrite another lead's demo.
 */

const GENERIC_TOKENS = new Set([
    'restaurante', 'restaurant', 'restaurants', 'cafe', 'loja', 'shop', 'store',
    'bar', 'hotel', 'the', 'and', 'e', 'de', 'do', 'da', 'dos', 'das',
    'o', 'a', 'os', 'as', 'em', 'no', 'na', 'pt', 'lda', 'unipessoal'
]);

function normalizeBusinessKey(value) {
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

function sameBusinessName(a, b, { ignore = [] } = {}) {
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

function reusableLeadId(existing, incomingNome, cidade) {
    if (!existing || !existing.id) return '';
    const stored = String(existing.nome || '').trim();
    const incoming = String(incomingNome || '').trim();
    // A stub or a save that still has no name is this lead — fill it, don't fork.
    if (!stored || !incoming) return existing.id;
    if (sameBusinessName(stored, incoming, { ignore: [cidade] })) return existing.id;
    return '';
}

function slugOwnedByOtherLead(db, slug, leadId) {
    const key = String(slug || '').trim();
    if (!key) return false;
    const row = db.prepare('SELECT id FROM lead WHERE demo_slug = ?').get(key);
    return Boolean(row && row.id && row.id !== leadId);
}

function allocateDemoSlug(db, {
    nome,
    existingSlug = '',
    leadId = '',
    existingNome = '',
    cidade = '',
    makeSlug
} = {}) {
    const current = String(existingSlug || '').trim();
    if (current
        && sameBusinessName(existingNome, nome, { ignore: [cidade] })
        && !slugOwnedByOtherLead(db, current, leadId)) {
        return current;
    }
    for (let i = 0; i < 8; i += 1) {
        const slug = makeSlug(nome);
        if (!slugOwnedByOtherLead(db, slug, leadId)) return slug;
    }
    return `${makeSlug(nome)}-${String(leadId || 'novo').replace(/[^a-z0-9]/gi, '').slice(0, 8)}`;
}

module.exports = {
    GENERIC_TOKENS,
    normalizeBusinessKey,
    significantTokens,
    sameBusinessName,
    reusableLeadId,
    slugOwnedByOtherLead,
    allocateDemoSlug
};
