const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');
const {
    findLeadByContact,
    findReusableLead,
    normalizePhoneDigits,
    phoneKeys
} = require('../../server/lib/digitalizept-visit-lead.js');

function openMemoryDb() {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    return db;
}

function insertLead(db, {
    id = crypto.randomUUID(),
    nome = 'Loja Teste',
    telefone = '',
    whatsapp = '',
    email = '',
    cidade = 'Porto'
} = {}) {
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, criado_em)
        VALUES (?, 'generico', ?, '', ?, ?, ?, 'rascunho', ?)
    `).run(id, nome, cidade, telefone, whatsapp, now);
    if (email) {
        db.prepare(`
            INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
            VALUES (?, ?, ?, '{}', ?)
        `).run(crypto.randomUUID(), id, JSON.stringify({ email }), now);
    }
    return id;
}

describe('digitalizept lead contact duplicates', () => {
    it('normalizes PT phone variants to the same keys', () => {
        assert.equal(normalizePhoneDigits('+351 912 345 678'), '912345678');
        assert.equal(normalizePhoneDigits('00351912345678'), '912345678');
        assert.deepEqual(phoneKeys('912345678'), ['912345678', '351912345678']);
        assert.deepEqual(phoneKeys('+351912345678'), ['912345678', '351912345678']);
    });

    it('matches an existing lead by telefone even with different formatting', () => {
        const db = openMemoryDb();
        const id = insertLead(db, { nome: 'Talho da Costa', telefone: '912345678' });
        const hit = findLeadByContact(db, { telefone: '+351 912 345 678' });
        assert.ok(hit);
        assert.equal(hit.lead.id, id);
        assert.equal(hit.matchReason, 'telefone');
        db.close();
    });

    it('matches WhatsApp on lead.whatsapp against incoming telefone', () => {
        const db = openMemoryDb();
        const id = insertLead(db, { nome: 'Café X', whatsapp: '933111222' });
        const hit = findLeadByContact(db, { telefone: '933111222' });
        assert.ok(hit);
        assert.equal(hit.lead.id, id);
        db.close();
    });

    it('matches email from dados_negocio ignoring case', () => {
        const db = openMemoryDb();
        const id = insertLead(db, { nome: 'Ótica Sol', email: 'info@oticasol.pt' });
        const hit = findLeadByContact(db, { email: 'INFO@oticasol.pt' });
        assert.ok(hit);
        assert.equal(hit.lead.id, id);
        assert.equal(hit.matchReason, 'email');
        db.close();
    });

    it('findReusableLead prefers contact over name when phone collides', () => {
        const db = openMemoryDb();
        const id = insertLead(db, {
            nome: 'Nome Diferente',
            telefone: '910000001',
            cidade: 'Braga'
        });
        const match = findReusableLead(db, {
            nome: 'Outro Nome Completo',
            cidade: 'Porto',
            telefone: '910000001'
        });
        assert.ok(match);
        assert.equal(match.id, id);
        assert.equal(match.matchReason, 'telefone');
        db.close();
    });

    it('returns null when contacts do not collide', () => {
        const db = openMemoryDb();
        insertLead(db, { telefone: '910000001', email: 'a@x.pt' });
        assert.equal(findLeadByContact(db, { telefone: '910000002', email: 'b@x.pt' }), null);
        db.close();
    });
});
