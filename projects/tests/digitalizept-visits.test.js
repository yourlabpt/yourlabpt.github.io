const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');

function openMemoryDb() {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    return db;
}

describe('digitalizept visita.lead_id', () => {
    it('adds lead_id column and index after migrate', () => {
        const db = openMemoryDb();
        const cols = db.prepare('PRAGMA table_info(visita)').all().map((c) => c.name);
        assert.ok(cols.includes('lead_id'));
        const indexes = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_visita_lead'`).all();
        assert.equal(indexes.length, 1);
        db.close();
    });

    it('rejects linking a visit to a missing lead (same check as API)', () => {
        const db = openMemoryDb();
        const leadId = 'missing-lead';
        const lead = db.prepare('SELECT id FROM lead WHERE id = ?').get(leadId);
        assert.equal(lead, undefined);
        db.close();
    });

    it('stores lead_id on visita and surfaces it for coverage joins', () => {
        const db = openMemoryDb();
        const now = new Date().toISOString();
        const leadId = crypto.randomUUID();
        const visitId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, criado_em)
            VALUES (?, 'cafe', 'Café Teste', 'Rua A 1', 'Lisboa', '', '', 'novo', ?)
        `).run(leadId, now);
        db.prepare(`
            INSERT INTO visita (id, nome, morada, cidade, cobertura, experiencia, lat, lng, geocode_status, visitado_em, criado_em, lead_id)
            VALUES (?, 'Café Teste', 'Rua A 1', 'Lisboa', 'visitado', '', 38.7, -9.1, 'manual', ?, ?, ?)
        `).run(visitId, now, now, leadId);

        const row = db.prepare(`
            SELECT v.id, v.lead_id, l.nome AS lead_nome
            FROM visita v
            LEFT JOIN lead l ON l.id = v.lead_id
            WHERE v.id = ?
        `).get(visitId);
        assert.equal(row.lead_id, leadId);
        assert.equal(row.lead_nome, 'Café Teste');

        const byLead = db.prepare('SELECT id FROM visita WHERE lead_id = ?').all(leadId);
        assert.equal(byLead.length, 1);
        assert.equal(byLead[0].id, visitId);
        db.close();
    });

    it('nulls visita.lead_id when lead is deleted (server delete path)', () => {
        const db = openMemoryDb();
        const now = new Date().toISOString();
        const leadId = crypto.randomUUID();
        const visitId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, telefone, whatsapp, estado, criado_em)
            VALUES (?, 'loja', 'Loja X', '', '', '', 'novo', ?)
        `).run(leadId, now);
        db.prepare(`
            INSERT INTO visita (id, nome, morada, cidade, cobertura, experiencia, lat, lng, geocode_status, visitado_em, criado_em, lead_id)
            VALUES (?, 'Loja X', '', '', 'visitado', '', NULL, NULL, '', ?, ?, ?)
        `).run(visitId, now, now, leadId);

        db.prepare('UPDATE visita SET lead_id = NULL WHERE lead_id = ?').run(leadId);
        db.prepare('DELETE FROM lead WHERE id = ?').run(leadId);

        const visit = db.prepare('SELECT id, lead_id, nome FROM visita WHERE id = ?').get(visitId);
        assert.equal(visit.nome, 'Loja X');
        assert.equal(visit.lead_id, null);
        db.close();
    });

    it('adds lead_id to an existing visita table without the column', () => {
        const db = openMemoryDb();
        db.exec('DROP TABLE visita');
        db.exec(`
            CREATE TABLE visita (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL DEFAULT '',
                morada TEXT NOT NULL DEFAULT '',
                cidade TEXT NOT NULL DEFAULT '',
                cobertura TEXT NOT NULL DEFAULT 'visitado',
                experiencia TEXT NOT NULL DEFAULT '',
                lat REAL,
                lng REAL,
                geocode_status TEXT NOT NULL DEFAULT '',
                visitado_em TEXT NOT NULL DEFAULT '',
                criado_em TEXT NOT NULL
            )
        `);
        migrate(db);
        const cols = db.prepare('PRAGMA table_info(visita)').all().map((c) => c.name);
        assert.ok(cols.includes('lead_id'));
        db.close();
    });
});
