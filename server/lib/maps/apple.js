/** Apple Business Connect — stub until partner API access. */
module.exports = {
    id: 'apple',
    nome: 'Apple Business Connect',
    capability: 'guided_manual',
    capabilityLabel: 'Em breve — fluxo guiado (sem API de parceiro)',
    enabled: false,
    validar() {
        return [{ id: 'apple', label: 'Apple Maps ainda não está activo nesta versão' }];
    },
    async procurarExistente() {
        return [];
    },
    async submeter() {
        return {
            ok: false,
            estado: 'nao_iniciado',
            nota: 'Acesso Apple Business Connect (parceiro) ainda não disponível. Adaptador pronto para capability api.'
        };
    },
    async consultarEstado() {
        return { estado: 'nao_iniciado', fonte: 'stub' };
    }
};
