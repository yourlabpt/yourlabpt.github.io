/**
 * Closed-deal teardown. The shop stays on the map as a no-interest lead.
 */
const leadProcess = require('./digitalizept-lead-process');

function revisitarEmMeses(meses = 3, from = new Date()) {
    const d = new Date(from);
    d.setMonth(d.getMonth() + meses);
    return d.toISOString().slice(0, 10);
}

function loadClosedDeal(db, projectId) {
    return db.prepare(`
        SELECT pr.id AS projectId, pr.contrato_id AS contratoId,
               c.proposta_id AS propostaId, p.lead_id AS leadId
        FROM projeto pr
        JOIN contrato c ON c.id = pr.contrato_id
        JOIN proposta p ON p.id = c.proposta_id
        WHERE pr.id = ?
    `).get(projectId);
}

function otherClosedDeal(db, leadId, projectId) {
    if (!leadId) return null;
    return db.prepare(`
        SELECT pr.id
        FROM projeto pr
        JOIN contrato c ON c.id = pr.contrato_id
        JOIN proposta p ON p.id = c.proposta_id
        WHERE p.lead_id = ? AND pr.id != ?
        LIMIT 1
    `).get(leadId, projectId);
}

function parkLeadSemInteresse(db, leadId) {
    const row = db.prepare('SELECT estado, demo_slug FROM lead WHERE id = ?').get(leadId);
    const legado = row && row.demo_slug ? 'demonstracao' : 'novo';
    db.prepare(`
        UPDATE lead SET
            estado = CASE WHEN estado = 'fechado' THEN ? ELSE estado END,
            resultado = CASE WHEN resultado = 'digitalizado' THEN '' ELSE resultado END
        WHERE id = ?
    `).run(legado, leadId);
    leadProcess.registarToque(db, leadId, {
        passo: 'R1',
        canal: 'whatsapp',
        estado: 'feito',
        resultado: 'e_nao',
        nota: 'Proposta apagada. Fica no mapa como sem interesse.',
        proximoEstado: 'RECUSADO',
        revisitarEm: revisitarEmMeses(3)
    });
    db.prepare('UPDATE lead SET cobertura_locked = 1 WHERE id = ?').run(leadId);
}

function deleteClosedDeal(db, projectId) {
    const row = loadClosedDeal(db, projectId);
    if (!row) return { error: 'Proposta não encontrada.', status: 404 };
    const keepParked = Boolean(row.leadId && !otherClosedDeal(db, row.leadId, row.projectId));

    db.transaction(() => {
        db.prepare('DELETE FROM presenca_mapa WHERE projeto_id = ?').run(row.projectId);
        db.prepare('DELETE FROM assinatura WHERE contrato_id = ?').run(row.contratoId);
        db.prepare('DELETE FROM evento WHERE entidade = ? AND entidade_id = ?').run('projeto', row.projectId);
        db.prepare('DELETE FROM evento WHERE entidade = ? AND entidade_id = ?').run('contrato', row.contratoId);
        db.prepare('DELETE FROM evento WHERE entidade = ? AND entidade_id = ?').run('proposta', row.propostaId);
        db.prepare('DELETE FROM projeto WHERE id = ?').run(row.projectId);
        db.prepare('DELETE FROM contrato WHERE id = ?').run(row.contratoId);
        db.prepare('DELETE FROM proposta WHERE id = ?').run(row.propostaId);
        if (keepParked) parkLeadSemInteresse(db, row.leadId);
    })();

    return { ok: true, leadId: row.leadId || '', parked: keepParked };
}

module.exports = {
    revisitarEmMeses,
    deleteClosedDeal
};
