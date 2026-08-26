const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');
const { leadsListOrderKey, leadsListOrderSql } = require('../../server/lib/digitalizept-leads-list.js');

describe('digitalizept leads list order', () => {
    it('keeps the day queue as the next-step order', () => {
        assert.equal(leadsListOrderKey({ fila: 'hoje' }), 'proximo');
        assert.match(leadsListOrderSql({ ordem: 'proximo' }), /proxima_acao_em ASC/);
    });

    it('orders by shop type, then by the next step inside the type', () => {
        assert.equal(leadsListOrderKey({ ordem: 'tipo' }), 'tipo');
        const sql = leadsListOrderSql({ ordem: 'tipo' });
        assert.match(sql, /business_type COLLATE NOCASE ASC/);
        assert.match(sql, /proxima_acao_em ASC/);
    });

    it('orders by first insert (criação) ascending — never by later edits', () => {
        assert.equal(leadsListOrderKey({ ordem: 'criado' }), 'criado');
        assert.equal(leadsListOrderSql({ ordem: 'criado' }), 'l.criado_em ASC, l.id ASC');
        assert.doesNotMatch(leadsListOrderSql({ ordem: 'criado' }), /atualizado_em/);
    });

    it('orders by last update descending', () => {
        assert.equal(leadsListOrderKey({ ordem: 'atualizado' }), 'atualizado');
        assert.match(leadsListOrderSql({ ordem: 'atualizado' }), /atualizado_em DESC/);
    });

    it('lets ordem win over the old fila=hoje flag, and ignores unknown keys', () => {
        assert.equal(leadsListOrderKey({ ordem: 'tipo', fila: 'hoje' }), 'tipo');
        assert.equal(leadsListOrderKey({}), 'criado');
        assert.equal(leadsListOrderKey({ ordem: 'tipo; drop table lead' }), 'criado');
        assert.doesNotMatch(leadsListOrderSql({ ordem: 'tipo; drop table lead' }), /drop table/i);
    });

    it('ships the sort control on the admin list', () => {
        const html = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'admin.html'),
            'utf8'
        );
        assert.match(html, /id="leads-ordem"/);
        assert.match(html, /value="proximo"/);
        assert.match(html, /value="tipo"/);
        assert.match(html, /value="criado"/);
        assert.match(html, /value="atualizado"/);
        const admin = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'js', 'admin.js'),
            'utf8'
        );
        assert.match(admin, /leads\?\$\{qs\}/);
        assert.match(admin, /fila', 'hoje'/);
        assert.match(admin, /LEADS_ORDEM_KEY/);
        assert.match(admin, /'atualizado'/);
    });

    it('stamps atualizado_em on edit without moving criado_em', () => {
        const db = new Database(':memory:');
        db.exec(SCHEMA);
        migrate(db);
        const id = crypto.randomUUID();
        const created = '2026-01-10T10:00:00.000Z';
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, telefone, whatsapp, estado, criado_em)
            VALUES (?, 'cafe-pastelaria', 'Café A', 'Rua 1', '912345678', '', 'novo', ?)
        `).run(id, created);
        const afterInsert = db.prepare('SELECT criado_em, atualizado_em FROM lead WHERE id = ?').get(id);
        assert.equal(afterInsert.criado_em, created);
        assert.equal(afterInsert.atualizado_em, created);

        db.prepare('UPDATE lead SET nome = ? WHERE id = ?').run('Café A Renovado', id);
        const afterEdit = db.prepare('SELECT criado_em, atualizado_em FROM lead WHERE id = ?').get(id);
        assert.equal(afterEdit.criado_em, created);
        assert.notEqual(afterEdit.atualizado_em, created);
        assert.ok(String(afterEdit.atualizado_em) > created);
    });
});
