const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
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

    it('orders newest first by creation date', () => {
        assert.equal(leadsListOrderKey({ ordem: 'criado' }), 'criado');
        assert.equal(leadsListOrderSql({ ordem: 'criado' }), 'l.criado_em DESC');
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
        const admin = fs.readFileSync(
            path.join(__dirname, '..', '..', 'digitalizept', 'js', 'admin.js'),
            'utf8'
        );
        assert.match(admin, /leads\?\$\{qs\}/);
        assert.match(admin, /fila', 'hoje'/);
        assert.match(admin, /LEADS_ORDEM_KEY/);
    });
});
