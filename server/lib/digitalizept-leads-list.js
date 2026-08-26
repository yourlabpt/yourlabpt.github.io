'use strict';

const ORDER_SQL = {
    proximo: `CASE WHEN l.proxima_acao_em = '' THEN 1 ELSE 0 END, l.proxima_acao_em ASC, l.criado_em ASC, l.id ASC`,
    tipo: `CASE WHEN TRIM(COALESCE(l.business_type, '')) = '' THEN 1 ELSE 0 END, l.business_type COLLATE NOCASE ASC, CASE WHEN l.proxima_acao_em = '' THEN 1 ELSE 0 END, l.proxima_acao_em ASC, l.criado_em ASC, l.id ASC`,
    // First insert only — never reshuffled by later edits.
    criado: 'l.criado_em ASC, l.id ASC',
    // Last change on the lead row (ficha, demo, processo, …).
    atualizado: `CASE WHEN TRIM(COALESCE(l.atualizado_em, '')) = '' THEN 1 ELSE 0 END, l.atualizado_em DESC, l.criado_em ASC, l.id ASC`
};

function leadsListOrderKey(query) {
    const ordem = String((query && query.ordem) || '').trim().toLowerCase();
    if (ordem === 'tipo' || ordem === 'criado' || ordem === 'proximo' || ordem === 'atualizado') {
        return ordem;
    }
    if (String((query && query.fila) || '').trim().toLowerCase() === 'hoje') return 'proximo';
    return 'criado';
}

function leadsListOrderSql(query) {
    return ORDER_SQL[leadsListOrderKey(query)];
}

module.exports = {
    ORDER_SQL,
    leadsListOrderKey,
    leadsListOrderSql
};
