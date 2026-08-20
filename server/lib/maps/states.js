/**
 * Shared estado values for map presence (fornecedor + projeto.estado_google).
 * Legacy aliases are normalised on read.
 */

const ESTADOS = [
    'nao_incluido',
    'nao_iniciado',
    'em_falta_dados',
    'em_curso',
    'a_aguardar_verificacao',
    'verificado',
    'falhou'
];

const LEGACY_GOOGLE = {
    por_criar: 'nao_iniciado',
    feito: 'verificado'
};

const ESTADO_LABELS = {
    nao_incluido: 'Não incluído',
    nao_iniciado: 'Por iniciar',
    em_falta_dados: 'Dados em falta',
    em_curso: 'Em curso',
    a_aguardar_verificacao: 'A aguardar verificação',
    verificado: 'Verificado',
    falhou: 'Falhou',
    // legacy display
    por_criar: 'Por iniciar',
    feito: 'Verificado'
};

function normalizeEstado(raw, fallback = 'nao_iniciado') {
    const v = String(raw || '').trim();
    if (!v) return fallback;
    if (LEGACY_GOOGLE[v]) return LEGACY_GOOGLE[v];
    if (ESTADOS.includes(v)) return v;
    return fallback;
}

function isValidEstado(raw) {
    const v = String(raw || '').trim();
    return ESTADOS.includes(v) || Boolean(LEGACY_GOOGLE[v]);
}

module.exports = {
    ESTADOS,
    LEGACY_GOOGLE,
    ESTADO_LABELS,
    normalizeEstado,
    isValidEstado
};
