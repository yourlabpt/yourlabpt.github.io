/** OpenStreetMap — stub; single verified POI edits later (Organised Editing). */
module.exports = {
    id: 'osm',
    nome: 'OpenStreetMap',
    capability: 'api',
    capabilityLabel: 'POI individual verificado no local — em breve',
    enabled: false,
    validar() {
        return [{ id: 'osm', label: 'OpenStreetMap ainda não está activo nesta versão' }];
    },
    async procurarExistente() {
        return [];
    },
    async submeter() {
        return {
            ok: false,
            estado: 'nao_iniciado',
            nota: 'Sem edições em massa. Cada POI será uma edição humana com changeset descritivo.'
        };
    },
    async consultarEstado() {
        return { estado: 'nao_iniciado', fonte: 'stub' };
    }
};
