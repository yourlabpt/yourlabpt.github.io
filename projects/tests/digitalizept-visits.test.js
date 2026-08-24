const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');
const { ensureLeadFromVisit, syncLinkedVisitsIdentity } = require('../../server/lib/digitalizept-visit-lead.js');
const { mergeCanonicalDados } = require('../../server/lib/digitalizept-dossier.js');

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

describe('digitalizept ensureLeadFromVisit', () => {
    function insertVisit(db, overrides = {}) {
        const now = new Date().toISOString();
        const visitId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO visita (
                id, nome, morada, cidade, cobertura, resultado, experiencia,
                lat, lng, geocode_status, visitado_em, criado_em, lead_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            visitId,
            overrides.nome != null ? overrides.nome : 'Mercearia do Pin',
            overrides.morada != null ? overrides.morada : 'Rua das Flores 12',
            overrides.cidade != null ? overrides.cidade : 'Porto',
            overrides.cobertura || 'visitado',
            overrides.resultado || '',
            overrides.experiencia != null ? overrides.experiencia : 'Dona Maria atendeu.',
            overrides.lat != null ? overrides.lat : 41.1496,
            overrides.lng != null ? overrides.lng : -8.611,
            overrides.geocode_status || 'manual',
            now,
            now,
            overrides.lead_id || null
        );
        return visitId;
    }

    it('creates a lead from an orphan visit and links visita.lead_id', () => {
        const db = openMemoryDb();
        const visitId = insertVisit(db, { resultado: 'futuro' });
        const first = ensureLeadFromVisit(db, visitId);
        assert.equal(first.ok, true);
        assert.equal(first.created, true);
        assert.ok(first.leadId);
        assert.equal(first.lead.nome, 'Mercearia do Pin');
        assert.equal(first.lead.morada, 'Rua das Flores 12');
        assert.equal(first.lead.cidade, 'Porto');
        assert.equal(first.lead.cobertura, 'visitado');
        assert.equal(first.lead.resultado, 'futuro');
        assert.equal(first.lead.lat, 41.1496);
        assert.equal(first.lead.lng, -8.611);

        const visit = db.prepare('SELECT lead_id FROM visita WHERE id = ?').get(visitId);
        assert.equal(visit.lead_id, first.leadId);

        const dados = db.prepare('SELECT opcionais_json FROM dados_negocio WHERE lead_id = ?').get(first.leadId);
        const opcionais = JSON.parse(dados.opcionais_json);
        assert.equal(opcionais.nome_negocio, 'Mercearia do Pin');

        const notes = db.prepare('SELECT texto FROM nota WHERE lead_id = ?').all(first.leadId);
        assert.equal(notes.length, 0);
        const street = db.prepare('SELECT experiencia FROM visita WHERE id = ?').get(visitId);
        assert.equal(street.experiencia, 'Dona Maria atendeu.');

        const orphans = db.prepare('SELECT id FROM visita WHERE lead_id IS NULL OR lead_id = \'\'').all();
        assert.equal(orphans.length, 0);

        const second = ensureLeadFromVisit(db, visitId);
        assert.equal(second.created, false);
        assert.equal(second.leadId, first.leadId);
        const noteCount = db.prepare('SELECT COUNT(*) AS n FROM nota WHERE lead_id = ?').get(first.leadId);
        assert.equal(noteCount.n, 0);
        db.close();
    });

    it('returns 404 for a missing visit and 400 when the visit has no name', () => {
        const db = openMemoryDb();
        const missing = ensureLeadFromVisit(db, crypto.randomUUID());
        assert.equal(missing.status, 404);

        const empty = insertVisit(db, { nome: '   ', experiencia: '' });
        const rejected = ensureLeadFromVisit(db, empty);
        assert.equal(rejected.status, 400);
        db.close();
    });

    it('creates a new ficha when visita.lead_id points at a deleted lead', () => {
        const db = openMemoryDb();
        const visitId = insertVisit(db, { lead_id: crypto.randomUUID(), experiencia: '' });
        const result = ensureLeadFromVisit(db, visitId);
        assert.equal(result.ok, true);
        assert.equal(result.created, true);
        const visit = db.prepare('SELECT lead_id FROM visita WHERE id = ?').get(visitId);
        assert.equal(visit.lead_id, result.leadId);
        db.close();
    });

    it('reuses a nearby lead with the same shop name instead of forking a ficha', () => {
        const db = openMemoryDb();
        const now = new Date().toISOString();
        const leadId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, criado_em, lat, lng)
            VALUES (?, 'cafe', 'Mercearia do Pin', 'Rua das Flores 12', 'Porto', '222000000', '', 'rascunho', 'demo_criada', ?, ?, ?)
        `).run(leadId, now, 41.1496, -8.611);
        const visitId = insertVisit(db, {
            nome: 'Mercearia do Pin',
            lat: 41.14965,
            lng: -8.61102,
            experiencia: ''
        });
        const result = ensureLeadFromVisit(db, visitId);
        assert.equal(result.created, false);
        assert.equal(result.leadId, leadId);
        const leads = db.prepare('SELECT COUNT(*) AS n FROM lead').get();
        assert.equal(leads.n, 1);
        const visit = db.prepare('SELECT lead_id, nome FROM visita WHERE id = ?').get(visitId);
        assert.equal(visit.lead_id, leadId);
        const lead = db.prepare('SELECT cobertura, telefone FROM lead WHERE id = ?').get(leadId);
        assert.equal(lead.telefone, '222000000');
        assert.equal(lead.cobertura, 'demo_criada');
        db.close();
    });

    it('does not attach a visit to the neighbour shop', () => {
        const db = openMemoryDb();
        const now = new Date().toISOString();
        const thaiId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, criado_em, lat, lng)
            VALUES (?, 'restaurante', 'Thai Golden', 'Rua das Flores 10', 'Porto', '', '', 'rascunho', 'visitado', ?, ?, ?)
        `).run(thaiId, now, 41.1496, -8.611);
        const visitId = insertVisit(db, {
            nome: 'Escondidinho',
            lat: 41.14962,
            lng: -8.61101,
            experiencia: ''
        });
        const result = ensureLeadFromVisit(db, visitId);
        assert.equal(result.created, true);
        assert.notEqual(result.leadId, thaiId);
        db.close();
    });

    it('does not merge two sites that share a name but are far apart', () => {
        const db = openMemoryDb();
        const now = new Date().toISOString();
        const leadId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, criado_em, lat, lng)
            VALUES (?, 'cafe', 'Mercearia do Pin', 'Rua A', 'Porto', '', '', 'rascunho', 'visitado', ?, ?, ?)
        `).run(leadId, now, 41.1496, -8.611);
        const visitId = insertVisit(db, {
            nome: 'Mercearia do Pin',
            lat: 41.16,
            lng: -8.63,
            experiencia: ''
        });
        const result = ensureLeadFromVisit(db, visitId);
        assert.equal(result.created, true);
        assert.notEqual(result.leadId, leadId);
        db.close();
    });

    it('keeps visit identity in sync with the lead after linking', () => {
        const db = openMemoryDb();
        const now = new Date().toISOString();
        const leadId = crypto.randomUUID();
        const visitId = crypto.randomUUID();
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, criado_em)
            VALUES (?, 'loja', 'Silva Unipessoal', 'Rua Nova 1', 'Porto', '', '', 'rascunho', 'visitado', ?)
        `).run(leadId, now);
        db.prepare(`
            INSERT INTO visita (id, nome, morada, cidade, cobertura, resultado, experiencia, lat, lng, geocode_status, visitado_em, criado_em, lead_id)
            VALUES (?, 'silva', 'Rua velha', 'Porto', 'visitado', '', '', NULL, NULL, '', ?, ?, ?)
        `).run(visitId, now, now, leadId);
        syncLinkedVisitsIdentity(db, leadId);
        const visit = db.prepare('SELECT nome, morada FROM visita WHERE id = ?').get(visitId);
        assert.equal(visit.nome, 'Silva Unipessoal');
        assert.equal(visit.morada, 'Rua Nova 1');
        db.close();
    });
});

describe('digitalizept canonical dados', () => {
    it('lets lead columns win over stale dados_negocio JSON', () => {
        const dados = mergeCanonicalDados(
            { nome: 'Café Novo', morada: 'Rua B', cidade: 'Porto', telefone: '222', whatsapp: '' },
            { nome_negocio: 'Nome antigo' },
            { morada: 'Rua antiga', email: 'a@b.pt', whatsapp: '933' }
        );
        assert.equal(dados.nome_negocio, 'Café Novo');
        assert.equal(dados.morada, 'Rua B');
        assert.equal(dados.cidade, 'Porto');
        assert.equal(dados.telefone, '222');
        assert.equal(dados.whatsapp, '933');
        assert.equal(dados.email, 'a@b.pt');
    });
});
