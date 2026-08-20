const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate, nowIso } = require('../../server/lib/digitalizept-db.js');
const google = require('../../server/lib/maps/google.js');
const { listProviders, getProvider, TESLA_NOTE } = require('../../server/lib/maps/index.js');
const { normalizeEstado, isValidEstado } = require('../../server/lib/maps/states.js');
const {
    isGoogleOnlyDeal,
    includesGooglePresence,
    includesWebsite,
    parsePropostaItens
} = require('../../server/lib/maps/packages.js');
const mapsPresenca = require('../../server/lib/maps/presenca.js');

function openMemoryDb() {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    return db;
}

describe('maps presence — packages', () => {
    it('detects google-only Essencial deals', () => {
        assert.equal(isGoogleOnlyDeal({ pacote: 'google_essencial', extras: [] }), true);
        assert.equal(isGoogleOnlyDeal({ pacote: 'google_essencial', extras: ['google_perfil_completo'] }), true);
        assert.equal(isGoogleOnlyDeal({ pacote: 'site_maps', extras: [] }), false);
        assert.equal(includesWebsite({ pacote: 'site_maps' }), true);
        assert.equal(includesGooglePresence({ pacote: 'renovacao' }), true);
    });
});

describe('maps presence — google guided adapter', () => {
    it('lists missing fields', () => {
        const missing = google.validar({
            nome: '',
            morada: 'Rua A',
            cidade: '',
            telefone: '912',
            horario: '',
            categoria: ''
        });
        const ids = missing.map((m) => m.id);
        assert.ok(ids.includes('nome'));
        assert.ok(ids.includes('cidade'));
        assert.ok(ids.includes('horario'));
        assert.ok(ids.includes('categoria'));
        assert.ok(!ids.includes('morada'));
        assert.ok(!ids.includes('telefone'));
    });

    it('submeter returns guided steps and video script when complete', async () => {
        const result = await google.submeter(null, {
            dados: {
                nome_negocio: 'Café Central',
                morada: 'Rua Augusta 1',
                cidade: 'Lisboa',
                telefone: '912345678',
                horario: '9-19'
            },
            googlePresence: { categoria: 'Café' },
            proposta: { pacote: 'google_essencial', extras: ['google_perfil_completo'] }
        });
        assert.equal(result.ok, true);
        assert.equal(result.estado, 'em_curso');
        assert.ok(result.steps.some((s) => s.id === 'perfil_100'));
        assert.ok(result.guiaoVideo.includes('Café Central'));
        assert.ok(result.contaScript.includes('PRIMARY_OWNER'));
    });

    it('registry exposes stubs without enabling them', () => {
        const list = listProviders();
        assert.ok(list.find((p) => p.id === 'google' && p.enabled));
        assert.ok(list.find((p) => p.id === 'apple' && p.enabled === false));
        assert.ok(TESLA_NOTE.includes('Tesla'));
        assert.equal(getProvider('google').id, 'google');
    });
});

describe('maps presence — estado sync and google-only delivery', () => {
    it('creates presenca_mapa and marks google-only deal entregue on verificado', () => {
        const db = openMemoryDb();
        const now = nowIso();
        const leadId = crypto.randomUUID();
        const propostaId = crypto.randomUUID();
        const contratoId = crypto.randomUUID();
        const projetoId = crypto.randomUUID();

        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, criado_em)
            VALUES (?, 'cafe', 'Café X', 'Rua 1', 'Porto', '911', '', 'fechado', 'contacto_remoto', ?)
        `).run(leadId, now);
        db.prepare(`
            INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
            VALUES (?, ?, ?, '{}', ?)
        `).run(crypto.randomUUID(), leadId, JSON.stringify({
            nome_negocio: 'Café X',
            morada: 'Rua 1',
            cidade: 'Porto',
            telefone: '911',
            horario: '10-20'
        }), now);
        db.prepare(`
            UPDATE lead SET google_presence_json = ? WHERE id = ?
        `).run(JSON.stringify({ categoria: 'Café', fotos: 'depois' }), leadId);

        db.prepare(`
            INSERT INTO proposta (id, lead_id, itens_json, subtotal_centimos, total_centimos, estado, criado_em)
            VALUES (?, ?, ?, 29000, 29000, 'aceite', ?)
        `).run(propostaId, leadId, JSON.stringify({
            pacote: 'google_essencial',
            extras: []
        }), now);
        db.prepare(`
            INSERT INTO contrato (id, proposta_id, template_versao, estado, criado_em)
            VALUES (?, ?, 'v1', 'assinado', ?)
        `).run(contratoId, propostaId, now);
        db.prepare(`
            INSERT INTO projeto (id, contrato_id, estado, estado_google, estado_dominio, criado_em)
            VALUES (?, ?, 'contrato_assinado', 'nao_iniciado', 'por_comprar', ?)
        `).run(projetoId, contratoId, now);

        const cols = db.prepare('PRAGMA table_info(presenca_mapa)').all().map((c) => c.name);
        assert.ok(cols.includes('payload_json'));

        const started = mapsPresenca.startDelivery(db, projetoId, { nowIso: () => now });
        return Promise.resolve(started).then((out) => {
            assert.equal(out.ok, true);
            assert.equal(out.result.ok, true);
            const row = db.prepare('SELECT estado FROM projeto WHERE id = ?').get(projetoId);
            assert.equal(normalizeEstado(row.estado_google || db.prepare('SELECT estado_google FROM projeto WHERE id = ?').get(projetoId).estado_google), 'em_curso');

            const done = mapsPresenca.applyGoogleAction(db, projetoId, 'verificado', { nowIso: () => now });
            assert.equal(done.ok, true);
            assert.equal(done.delivered, true);
            assert.equal(done.projetoEstado, 'entregue');
            const projeto = db.prepare('SELECT estado, estado_google FROM projeto WHERE id = ?').get(projetoId);
            assert.equal(projeto.estado, 'entregue');
            assert.equal(normalizeEstado(projeto.estado_google), 'verificado');
            db.close();
        });
    });

    it('does not auto-deliver site packages on google verificado', () => {
        const db = openMemoryDb();
        const now = nowIso();
        const leadId = crypto.randomUUID();
        const propostaId = crypto.randomUUID();
        const contratoId = crypto.randomUUID();
        const projetoId = crypto.randomUUID();

        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, cidade, telefone, whatsapp, estado, cobertura, criado_em)
            VALUES (?, 'cafe', 'Site Y', 'Rua 2', 'Lisboa', '922', '', 'fechado', 'contacto_remoto', ?)
        `).run(leadId, now);
        db.prepare(`
            INSERT INTO dados_negocio (id, lead_id, obrigatorios_json, opcionais_json, criado_em)
            VALUES (?, ?, ?, '{}', ?)
        `).run(crypto.randomUUID(), leadId, JSON.stringify({
            nome_negocio: 'Site Y',
            morada: 'Rua 2',
            cidade: 'Lisboa',
            telefone: '922',
            horario: '9-18'
        }), now);
        db.prepare(`UPDATE lead SET google_presence_json = ? WHERE id = ?`)
            .run(JSON.stringify({ categoria: 'Café' }), leadId);
        db.prepare(`
            INSERT INTO proposta (id, lead_id, itens_json, subtotal_centimos, total_centimos, estado, criado_em)
            VALUES (?, ?, ?, 39000, 39000, 'aceite', ?)
        `).run(propostaId, leadId, JSON.stringify({ pacote: 'site_maps', extras: [] }), now);
        db.prepare(`
            INSERT INTO contrato (id, proposta_id, template_versao, estado, criado_em)
            VALUES (?, ?, 'v1', 'assinado', ?)
        `).run(contratoId, propostaId, now);
        db.prepare(`
            INSERT INTO projeto (id, contrato_id, estado, estado_google, estado_dominio, criado_em)
            VALUES (?, ?, 'site_no_ar', 'em_curso', 'por_comprar', ?)
        `).run(projetoId, contratoId, now);

        const done = mapsPresenca.applyGoogleAction(db, projetoId, 'verificado', { nowIso: () => now });
        assert.equal(done.delivered, false);
        assert.equal(db.prepare('SELECT estado FROM projeto WHERE id = ?').get(projetoId).estado, 'site_no_ar');
        assert.equal(normalizeEstado(db.prepare('SELECT estado_google FROM projeto WHERE id = ?').get(projetoId).estado_google), 'verificado');
        db.close();
    });

    it('normalises legacy estado_google values', () => {
        assert.equal(normalizeEstado('por_criar'), 'nao_iniciado');
        assert.equal(normalizeEstado('feito'), 'verificado');
        assert.equal(isValidEstado('a_aguardar_verificacao'), true);
        assert.equal(parsePropostaItens('{"pacote":"google_essencial"}').pacote, 'google_essencial');
    });
});
