// Derive operational Google fields from the sales conversation (diagnóstico + dados).
// The wizard no longer re-asks these after the demos — this fills the delivery record.

const MAPS_FROM_DIAG = {
    nao: 'nao_existe',
    sim_sem_dono: 'sem_dono',
    sim_acesso: 'sem_dono',
    nao_sei: ''
};

export function suggestedGoogleCategory(state) {
    const cats = state.data.businessType && state.data.businessType.categorias_google;
    if (Array.isArray(cats) && cats[0]) return String(cats[0]).replace(/_/g, ' ');
    return 'estabelecimento local';
}

export function googlePresenceFromWizard(state) {
    const existing = state.data.googlePresence;
    if (existing && typeof existing === 'object' && existing.mapsEstado && !existing._fromDiagnostico) {
        return existing;
    }

    const diag = state.data.googleDiagnostico || {};
    const dados = state.data.dados || {};

    return {
        mapsEstado: MAPS_FROM_DIAG[diag.maps] || (existing && existing.mapsEstado) || '',
        categoria: (existing && existing.categoria) || suggestedGoogleCategory(state),
        atributos: Array.isArray(existing && existing.atributos) ? existing.atributos : [],
        website: (existing && existing.website) || dados.website || '',
        instagram: (existing && existing.instagram) || dados.instagram || '',
        facebook: (existing && existing.facebook) || dados.facebook || '',
        fotos: (existing && existing.fotos) || '',
        descricao: (existing && existing.descricao) || '',
        _fromDiagnostico: true
    };
}
