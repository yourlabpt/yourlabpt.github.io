/**
 * Package helpers for map delivery (CommonJS — used by server adapters).
 */

const WEBSITE = new Set([
    'site_maps',
    'digital_completo',
    'plus',
    'renovacao',
    'essencial',
    'completa'
]);

const GOOGLE = new Set([
    'google_essencial',
    'site_maps',
    'digital_completo',
    'plus',
    'renovacao',
    'completa'
]);

function parsePropostaItens(itensJson) {
    if (!itensJson) return { pacote: '', extras: [] };
    if (typeof itensJson === 'object') {
        return {
            pacote: itensJson.pacote || '',
            extras: Array.isArray(itensJson.extras) ? itensJson.extras : []
        };
    }
    try {
        const parsed = JSON.parse(itensJson);
        return {
            pacote: (parsed && parsed.pacote) || '',
            extras: Array.isArray(parsed && parsed.extras) ? parsed.extras : []
        };
    } catch (_) {
        return { pacote: '', extras: [] };
    }
}

function includesWebsite(proposta) {
    return WEBSITE.has((proposta || {}).pacote);
}

function includesGooglePresence(proposta) {
    const p = proposta || {};
    if (GOOGLE.has(p.pacote)) return true;
    const extras = Array.isArray(p.extras) ? p.extras : [];
    return extras.includes('presenca_google')
        || extras.includes('google_perfil_completo');
}

/** Essencial Google (± Perfil 100%), no website deliverable. */
function isGoogleOnlyDeal(proposta) {
    const p = proposta || {};
    if (p.pacote !== 'google_essencial') return false;
    return !includesWebsite(p);
}

function includesPerfilCompleto(proposta) {
    const extras = Array.isArray((proposta || {}).extras) ? proposta.extras : [];
    return extras.includes('google_perfil_completo');
}

module.exports = {
    WEBSITE,
    GOOGLE,
    parsePropostaItens,
    includesWebsite,
    includesGooglePresence,
    isGoogleOnlyDeal,
    includesPerfilCompleto
};
