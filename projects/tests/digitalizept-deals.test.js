const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate, nowIso } = require('../../server/lib/digitalizept-db.js');
const { deleteClosedDeal } = require('../../server/lib/digitalizept-deals.js');

function openMemoryDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA);
    migrate(db);
    return db;
}

function seedClosedDeal(db, { withMaps = false } = {}) {
    const now = nowIso();
    const leadId = crypto.randomUUID();
    const propostaId = crypto.randomUUID();
    const contratoId = crypto.randomUUID();
    const projetoId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, resultado, criado_em, lat, lng)
        VALUES (?, 'cafe', 'Café X', 'Rua 1', 'Porto', '911', '', 'fechado', 'digitalizado', ?, 41.15, -8.61)
    `).run(leadId, now);
    db.prepare(`
        INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
        VALUES (?, ?, '{}', '{}', ?)
    `).run(crypto.randomUUID(), leadId, now);
    db.prepare(`
        INSERT INTO cliente_legal (id, lead_id, nome, nif, morada, email, telefone)
        VALUES (?, ?, 'Dono X', '123', 'Rua 1', 'x@example.com', '911')
    `).run(crypto.randomUUID(), leadId);
    db.prepare(`
        INSERT INTO proposta (id, lead_id, itens_json, subtotal_centimos, total_centimos, estado, criado_em)
        VALUES (?, ?, ?, 29000, 29000, 'aceite', ?)
    `).run(propostaId, leadId, JSON.stringify({ pacote: 'google_essencial', extras: [] }), now);
    db.prepare(`
        INSERT INTO contrato (id, proposta_id, template_versao, estado, criado_em)
        VALUES (?, ?, 'v1', 'assinado', ?)
    `).run(contratoId, propostaId, now);
    db.prepare(`
        INSERT INTO projeto (id, contrato_id, estado, estado_google, estado_dominio, criado_em)
        VALUES (?, ?, 'contrato_assinado', 'em_curso', 'por_comprar', ?)
    `).run(projetoId, contratoId, now);
    if (withMaps) {
        db.prepare(`
            INSERT INTO presenca_mapa (
                id, projeto_id, fornecedor, estado, referencia_externa,
                submetido_em, verificado_em, ultimo_erro, tentativas,
                payload_json, criado_em, actualizado_em
            ) VALUES (?, ?, 'google', 'em_curso', '', '', '', '', 0, '{}', ?, ?)
        `).run(crypto.randomUUID(), projetoId, now, now);
    }
    return { leadId, propostaId, contratoId, projetoId };
}

describe('digitalizept delete closed deal', () => {
    it('removes a Google deal even with presenca_mapa and keeps the shop as sem interesse', () => {
        const db = openMemoryDb();
        const ids = seedClosedDeal(db, { withMaps: true });

        const done = deleteClosedDeal(db, ids.projetoId);
        assert.equal(done.ok, true);
        assert.equal(done.leadId, ids.leadId);
        assert.equal(done.parked, true);

        assert.equal(db.prepare('SELECT id FROM projeto WHERE id = ?').get(ids.projetoId), undefined);
        assert.equal(db.prepare('SELECT id FROM proposta WHERE id = ?').get(ids.propostaId), undefined);
        assert.equal(db.prepare('SELECT id FROM presenca_mapa WHERE projeto_id = ?').get(ids.projetoId), undefined);

        const lead = db.prepare('SELECT id, lat, lng, resultado, processo_estado FROM lead WHERE id = ?').get(ids.leadId);
        assert.ok(lead);
        assert.equal(lead.resultado, 'sem_interesse');
        assert.equal(lead.processo_estado, 'RECUSADO');
        assert.equal(lead.lat, 41.15);
        assert.ok(db.prepare('SELECT id FROM cliente_legal WHERE lead_id = ?').get(ids.leadId));
        db.close();
    });

    it('does not park the lead when another closed deal remains', () => {
        const db = openMemoryDb();
        const first = seedClosedDeal(db);
        const now = nowIso();
        const propostaId = crypto.randomUUID();
        const contratoId = crypto.randomUUID();
        const projetoId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO proposta (id, lead_id, itens_json, subtotal_centimos, total_centimos, estado, criado_em)
            VALUES (?, ?, '{}', 0, 0, 'aceite', ?)
        `).run(propostaId, first.leadId, now);
        db.prepare(`
            INSERT INTO contrato (id, proposta_id, template_versao, estado, criado_em)
            VALUES (?, ?, 'v1', 'assinado', ?)
        `).run(contratoId, propostaId, now);
        db.prepare(`
            INSERT INTO projeto (id, contrato_id, estado, estado_google, estado_dominio, criado_em)
            VALUES (?, ?, 'contrato_assinado', 'nao_incluido', 'por_comprar', ?)
        `).run(projetoId, contratoId, now);

        const done = deleteClosedDeal(db, first.projetoId);
        assert.equal(done.ok, true);
        assert.equal(done.parked, false);
        const lead = db.prepare('SELECT resultado, processo_estado FROM lead WHERE id = ?').get(first.leadId);
        assert.equal(lead.resultado, 'digitalizado');
        assert.ok(db.prepare('SELECT id FROM projeto WHERE id = ?').get(projetoId));
        db.close();
    });

    it('returns 404 when the deal is already gone', () => {
        const db = openMemoryDb();
        const done = deleteClosedDeal(db, crypto.randomUUID());
        assert.equal(done.status, 404);
        db.close();
    });
});
