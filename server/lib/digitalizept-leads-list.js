'use strict';

const ORDER_SQL = {
    proximo: `CASE WHEN l.proxima_acao_em = '' THEN 1 ELSE 0 END, l.proxima_acao_em ASC, l.criado_em DESC`,
    tipo: `CASE WHEN TRIM(COALESCE(l.business_type, '')) = '' THEN 1 ELSE 0 END, l.business_type COLLATE NOCASE ASC, CASE WHEN l.proxima_acao_em = '' THEN 1 ELSE 0 END, l.proxima_acao_em ASC`,
    criado: 'l.criado_em DESC'
};

function leadsListOrderKey(query) {
    const ordem = String((query && query.ordem) || '').trim().toLowerCase();
    if (ordem === 'tipo' || ordem === 'criado' || ordem === 'proximo') return ordem;
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
