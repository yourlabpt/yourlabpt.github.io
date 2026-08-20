const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');
const {
    pinColors,
    normalizeEtapa,
    normalizeResultado,
    remapCoberturaToEtapaResultado,
    ETAPA_VALUES,
    RESULTADO_VALUES,
    ETAPA_COLORS,
    RESULTADO_COLORS
} = require('../../server/lib/digitalizept-geocode.js');

function openMemoryDb() {
    const db = new Database(':memory:');
    db.exec(SCHEMA);
    migrate(db);
    return db;
}

describe('digitalizept etapa + resultado tags', () => {
    it('adds resultado column and remaps legacy cobertura on migrate', () => {
        const db = openMemoryDb();
        const now = new Date().toISOString();
        const leadId = crypto.randomUUID();
        // Simulate pre-migration row shape by writing old ids before remap again
        db.prepare(`
            INSERT INTO lead (id, business_type, nome, morada, telefone, whatsapp, estado, cobertura, resultado, criado_em)
            VALUES (?, 'cafe', 'Café', '', '', '', 'novo', 'nao_interessa', '', ?)
        `).run(leadId, now);
        remapCoberturaToEtapaResultado(db);
        const row = db.prepare('SELECT cobertura, resultado FROM lead WHERE id = ?').get(leadId);
        assert.equal(row.cobertura, 'visitado');
        assert.equal(row.resultado, 'sem_interesse');

        const leadCols = db.prepare('PRAGMA table_info(lead)').all().map((c) => c.name);
        const visitCols = db.prepare('PRAGMA table_info(visita)').all().map((c) => c.name);
        assert.ok(leadCols.includes('resultado'));
        assert.ok(visitCols.includes('resultado'));
        db.close();
    });

    it('remaps all legacy cobertura enums', () => {
        const cases = [
            ['contacto', 'contacto_remoto', ''],
            ['demo', 'demo_apresentada', ''],
            ['futuro', 'visitado', 'futuro'],
            ['digitalizado', 'demo_apresentada', 'digitalizado']
        ];
        const db = openMemoryDb();
        const now = new Date().toISOString();
        cases.forEach(([old, etapa, resultado], i) => {
            const id = `lead-${i}`;
            db.prepare(`
                INSERT INTO lead (id, business_type, nome, morada, telefone, whatsapp, estado, cobertura, resultado, criado_em)
                VALUES (?, 'loja', ?, '', '', '', 'novo', ?, '', ?)
            `).run(id, `N${i}`, old, now);
        });
        remapCoberturaToEtapaResultado(db);
        cases.forEach(([old, etapa, resultado], i) => {
            const row = db.prepare('SELECT cobertura, resultado FROM lead WHERE id = ?').get(`lead-${i}`);
            assert.equal(row.cobertura, etapa, old);
            assert.equal(row.resultado, resultado, old);
        });
        db.close();
    });

    it('pinColors: fill from etapa, stroke from resultado when set', () => {
        const plain = pinColors('visitado', '');
        assert.equal(plain.color, ETAPA_COLORS.visitado);
        assert.equal(plain.strokeColor, '#1b1b1b');
        assert.ok(plain.strokeWidth < 2);

        const lost = pinColors('demo_apresentada', 'sem_interesse');
        assert.equal(lost.color, ETAPA_COLORS.demo_apresentada);
        assert.equal(lost.strokeColor, RESULTADO_COLORS.sem_interesse);
        assert.ok(lost.strokeWidth > 2);

        const won = pinColors('contacto_remoto', 'digitalizado');
        assert.equal(won.strokeColor, RESULTADO_COLORS.digitalizado);
    });

    it('normalizes etapa and resultado inputs', () => {
        assert.equal(normalizeEtapa('contacto'), 'contacto_remoto');
        assert.equal(normalizeEtapa('demo_criada'), 'demo_criada');
        assert.equal(normalizeResultado('nao_interessa'), 'sem_interesse');
        assert.equal(normalizeResultado(''), '');
        assert.ok(ETAPA_VALUES.includes('demo_apresentada'));
        assert.ok(RESULTADO_VALUES.includes('futuro'));
    });
});
