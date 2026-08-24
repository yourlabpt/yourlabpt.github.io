const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { SCHEMA, migrate } = require('../../server/lib/digitalizept-db.js');
const {
    pinColors,
    normalizeEtapa,
    defaultEtapaForQuickLead,
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

    it('pinColors: fill from resultado, stroke from etapa', () => {
        const plain = pinColors('visitado', '');
        assert.equal(plain.color, '#faf8f4');
        assert.equal(plain.strokeColor, ETAPA_COLORS.visitado);
        assert.ok(plain.strokeWidth >= 2);

        const lost = pinColors('demo_apresentada', 'sem_interesse');
        assert.equal(lost.color, RESULTADO_COLORS.sem_interesse);
        assert.equal(lost.strokeColor, ETAPA_COLORS.demo_apresentada);
        assert.equal(lost.faded, true);
        assert.ok(lost.zIndexOffset < 0);

        const won = pinColors('contacto_remoto', 'digitalizado');
        assert.equal(won.color, RESULTADO_COLORS.digitalizado);
        assert.equal(won.strokeColor, ETAPA_COLORS.contacto_remoto);
    });

    it('normalizes etapa and resultado inputs', () => {
        assert.equal(normalizeEtapa('contacto'), 'contacto_remoto');
        assert.equal(normalizeEtapa('demo_criada'), 'demo_criada');
        assert.equal(normalizeResultado('nao_interessa'), 'sem_interesse');
        assert.equal(normalizeResultado(''), '');
        assert.ok(ETAPA_VALUES.includes('demo_apresentada'));
        assert.ok(RESULTADO_VALUES.includes('futuro'));
        assert.equal(RESULTADO_COLORS.sem_interesse, '#b8b4ac');
    });
});

describe('digitalizept coverage category filter', async () => {
    const {
        coverageTypeId,
        coverageCounts,
        coverageResultadoId,
        pinMatchesCoverageFilters
    } = await import('../../digitalizept/js/coverage-filters.js');

    const cafe = { nome: 'Café da Praça', business_type: 'cafe-pastelaria', etapa: 'visitado', resultado: '' };
    const loja = { nome: 'Loja da Rua', business_type: 'loja-roupa', etapa: 'visitado', resultado: 'futuro' };
    const orphan = { nome: 'Visita solta', business_type: '', etapa: 'visitado', resultado: '' };

    it('reads the shop category off the pin', () => {
        assert.equal(coverageTypeId(cafe), 'cafe-pastelaria');
        assert.equal(coverageTypeId(orphan), '');
    });

    it('hides other categories when one is selected', () => {
        const types = new Set(['cafe-pastelaria']);
        assert.equal(pinMatchesCoverageFilters(cafe, { filterTypes: types }), true);
        assert.equal(pinMatchesCoverageFilters(loja, { filterTypes: types }), false);
        assert.equal(pinMatchesCoverageFilters(orphan, { filterTypes: types }), false);
    });

    it('keeps street visits without a type when Sem categoria is on', () => {
        const types = new Set(['']);
        assert.equal(pinMatchesCoverageFilters(orphan, { filterTypes: types }), true);
        assert.equal(pinMatchesCoverageFilters(cafe, { filterTypes: types }), false);
    });

    it('still combines with resultado/etapa chips', () => {
        assert.equal(pinMatchesCoverageFilters(loja, {
            filterIds: new Set(['futuro']),
            filterTypes: new Set(['loja-roupa'])
        }), true);
        assert.equal(pinMatchesCoverageFilters(loja, {
            filterIds: new Set(['sem_interesse']),
            filterTypes: new Set(['loja-roupa'])
        }), false);
    });

    it('treats a closed shop as digitalizado on the map filter', () => {
        const won = { nome: 'Loja Fechada', business_type: 'loja-roupa', etapa: 'demo_apresentada', estado: 'fechado', resultado: '' };
        assert.equal(coverageResultadoId(won), 'digitalizado');
        assert.equal(pinMatchesCoverageFilters(won, {
            filterIds: new Set(['digitalizado'])
        }), true);
        assert.equal(pinMatchesCoverageFilters(cafe, {
            filterIds: new Set(['digitalizado'])
        }), false);
        assert.equal(coverageCounts([won, cafe]).byResultado.get('digitalizado'), 1);
    });

    it('starts novo negócio as contacto remoto even when a pin exists', () => {
        assert.equal(defaultEtapaForQuickLead(), 'contacto_remoto');
        assert.equal(defaultEtapaForQuickLead({ lat: 38.72, lng: -9.14 }), 'contacto_remoto');
        assert.notEqual(defaultEtapaForQuickLead(), 'visitado');
    });

    it('counts sítios, map pins, categories and results', () => {
        const counts = coverageCounts([
            { ...cafe, lat: 38.7, lng: -9.1 },
            { ...loja, lat: 38.8, lng: -9.2, resultado: 'sem_interesse' },
            orphan
        ]);
        assert.equal(counts.total, 3);
        assert.equal(counts.mapped, 2);
        assert.equal(counts.unmapped, 1);
        assert.equal(counts.byType.get('cafe-pastelaria'), 1);
        assert.equal(counts.byType.get('loja-roupa'), 1);
        assert.equal(counts.byType.get(''), 1);
        assert.equal(counts.byResultado.get('sem_interesse'), 1);
        assert.equal(counts.byResultado.get(''), 2);
        assert.equal(counts.byEtapa.get('visitado'), 3);
    });

    it('finds a pin by category name in the search box', () => {
        assert.equal(pinMatchesCoverageFilters(cafe, {
            query: 'pastelaria',
            typeLabel: 'Café / Pastelaria'
        }), true);
        assert.equal(pinMatchesCoverageFilters(loja, {
            query: 'pastelaria',
            typeLabel: 'Loja de roupa'
        }), false);
    });
});
