const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');
const dossier = require('../../server/lib/digitalizept-dossier.js');

function openMemoryDb() {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    return db;
}

describe('digitalizept street shortcuts — vCard', () => {
    it('puts shop name, cell, email and address in the vCard', async () => {
        const { buildVcard, vcardFilename } = await import('../../digitalizept/js/vcard.js');
        const card = buildVcard({
            fn: 'Talho Costa',
            tel: '912345678',
            email: 'costa@talho.pt',
            street: 'Rua A 1',
            city: 'Porto'
        });
        assert.match(card, /^BEGIN:VCARD\r\nVERSION:3.0/m);
        assert.match(card, /FN:Talho Costa/);
        assert.match(card, /ORG:Talho Costa/);
        assert.match(card, /TEL;TYPE=CELL:\+351912345678/);
        assert.match(card, /EMAIL:costa@talho\.pt/);
        assert.match(card, /ADR;TYPE=WORK:;;Rua A 1;Porto;;;Portugal/);
        assert.match(card, /END:VCARD/);
        assert.equal(vcardFilename('Talho Costa'), 'talho-costa.vcf');
    });
});

describe('digitalizept street shortcuts — hash vista=demo', () => {
    it('reads and writes vista=demo on the dossier hash', async () => {
        const { dossierHash, vistaFromHash } = await import('../../digitalizept/js/admin-lead.js');
        assert.equal(vistaFromHash('#dossier=abc&vista=demo'), 'demo');
        assert.equal(vistaFromHash('#dossier=abc&vista=ficha'), 'ficha');
        assert.equal(vistaFromHash('#dossier=abc&vista=controlo'), 'controlo');
        assert.equal(vistaFromHash('#dossier=abc'), 'controlo');
        assert.match(dossierHash('abc', 'demo'), /vista=demo/);
        assert.match(dossierHash('abc', 'ficha'), /vista=ficha/);
        assert.match(dossierHash('abc'), /vista=controlo/);
    });
});

describe('digitalizept street shortcuts — identidade save', () => {
    it('writes identidade_json and wizard_json.identidade without changing the lead', () => {
        const db = openMemoryDb();
        const leadId = crypto.randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, criado_em, demo_slug, wizard_json)
            VALUES (?, 'talho', 'Talho X', 'Rua A 1', 'Porto', '912345678', '912345678', 'demonstracao', ?, 'talho-x', ?)
        `).run(leadId, now, JSON.stringify({ dados: { nome_negocio: 'Talho X' }, demoUrl: '/d/talho-x' }));

        const logo = 'data:image/png;base64,aaa';
        const foto = 'data:image/jpeg;base64,bbb';
        const saved = dossier.saveLeadIdentidade(db, leadId, {
            logo: { tipo: 'upload', dataUrl: logo, nome: 'logo.png', mat: '#111111' },
            paleta: 'clean',
            estilo: 'clean',
            cores: { base: '#1b1b1b', destaque: '#e8d5b7', secundaria: '#7a8a99' },
            fotos: [foto, 'not-an-image']
        });
        assert.equal(saved.logo.tipo, 'upload');
        assert.equal(saved.logo.dataUrl, logo);
        assert.deepEqual(saved.fotos, [foto]);

        const row = db.prepare('SELECT nome, demo_slug, identidade_json, wizard_json FROM lead WHERE id = ?').get(leadId);
        assert.equal(row.nome, 'Talho X');
        assert.equal(row.demo_slug, 'talho-x');
        const stored = JSON.parse(row.identidade_json);
        assert.equal(stored.logo.dataUrl, logo);
        const wizard = JSON.parse(row.wizard_json);
        assert.equal(wizard.identidade.paleta, 'clean');
        assert.equal(wizard.dados.nome_negocio, 'Talho X');
        assert.equal(wizard.demoUrl, '/d/talho-x');
    });

    it('keeps the published demo path on POST /demos, not on PUT identidade', () => {
        const fs = require('fs');
        const path = require('path');
        const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'server.js'), 'utf8');
        const putStart = server.indexOf("app.put('/api/digitalizept/leads/:leadId/identidade'");
        const putEnd = server.indexOf('app.put', putStart + 10);
        const putBlock = server.slice(putStart, putEnd > putStart ? putEnd : putStart + 800);
        assert.match(server, /app\.put\('\/api\/digitalizept\/leads\/:leadId\/identidade'/);
        assert.match(server, /app\.get\('\/api\/digitalizept\/leads\/:leadId\/identidade'/);
        assert.match(server, /app\.post\('\/api\/digitalizept\/demos'/);
        assert.match(putBlock, /dossier\.saveLeadIdentidade/);
        assert.doesNotMatch(putBlock, /writeDemoFolder/);
        assert.doesNotMatch(putBlock, /app\.post\('\/api\/digitalizept\/demos'/);
    });
});
