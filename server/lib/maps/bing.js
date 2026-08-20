/** Bing Places — stub; weekly bulk CSV later (import from GBP). */
module.exports = {
    id: 'bing',
    nome: 'Bing Places',
    capability: 'bulk',
    capabilityLabel: 'Lote semanal (importa do Google) — em breve',
    enabled: false,
    validar() {
        return [{ id: 'bing', label: 'Bing Places ainda não está activo nesta versão' }];
    },
    async procurarExistente() {
        return [];
    },
    async submeter() {
        return {
            ok: false,
            estado: 'nao_iniciado',
            nota: 'Fazer Google primeiro; Bing em lote semanal quando o CSV estiver ligado.'
        };
    },
    async consultarEstado() {
        return { estado: 'nao_iniciado', fonte: 'stub' };
    }
};
