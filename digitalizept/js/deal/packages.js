// Package helpers shared by wizard, contract and pricing.
// Active commercial model: google_essencial · site_maps · digital_completo · plus · renovacao.
// Legacy codes (essencial, completa) remain for old drafts / tests.

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

export const DEFAULT_PACOTE = 'google_essencial';

export const PACKAGE_LABELS = {
    google_essencial: 'Essencial Google',
    site_maps: 'Site + Maps',
    digital_completo: 'Completo 0→100',
    plus: 'Presença Digital Plus',
    renovacao: 'Renovação de Website'
};

export function includesWebsite(proposta) {
    return WEBSITE.has((proposta || {}).pacote);
}

export function includesGooglePresence(proposta) {
    const p = proposta || {};
    if (GOOGLE.has(p.pacote)) return true;
    const extras = Array.isArray(p.extras) ? p.extras : [];
    return extras.includes('presenca_google')
        || extras.includes('google_perfil_completo');
}

// Diagnosis → suggested package (vendedor can still change).
export function suggestPackage(diag) {
    const d = diag || {};
    const prioridade = d.prioridade || '';
    const website = d.website || '';
    const maps = d.maps || '';

    if (prioridade === 'varias_paginas') return 'plus';

    const querSite = prioridade === 'site' || prioridade === 'os_dois';
    const querGoogle = prioridade === 'google' || prioridade === 'os_dois' || !prioridade;
    const temPerfil = maps === 'sim_acesso' || maps === 'sim_sem_dono';
    const semSite = website === 'nao' || !website;

    // Sem site + quer Google (só) → Essencial
    if (semSite && prioridade === 'google') return 'google_essencial';

    // Tem perfil + quer site → Site + Maps
    if (temPerfil && querSite) return 'site_maps';

    // Sem perfil (ou incompleto) + quer site → Completo
    if (!temPerfil && querSite) return 'digital_completo';

    // Os dois sem perfil → Completo
    if (prioridade === 'os_dois') return 'digital_completo';

    // Default Google-first
    if (querGoogle && semSite) return 'google_essencial';
    if (querSite) return temPerfil ? 'site_maps' : 'digital_completo';
    return 'google_essencial';
}
