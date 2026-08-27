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
    typeColor,
    ETAPA_VALUES,
    RESULTADO_VALUES,
    ETAPA_LABELS,
    RESULTADO_LABELS,
    RESULTADO_COLORS,
    TYPE_COLORS,
    PIN_STROKE_OPEN
} = require('../../server/lib/digitalizept-geocode.js');
const {
    PROCESSO_ESTADOS,
    PROCESSO_COLORS,
    processoPinStyle
} = require('../../server/lib/digitalizept-lead-process.js');

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

    it('pinColors: fill from business type, ring from fecho', () => {
        const plain = pinColors('visitado', '', { businessType: 'cafe-pastelaria' });
        assert.equal(plain.color, TYPE_COLORS['cafe-pastelaria']);
        assert.equal(plain.strokeColor, PIN_STROKE_OPEN);
        assert.ok(plain.strokeWidth >= 2);

        const lost = pinColors('demo_apresentada', 'sem_interesse', { businessType: 'restaurante' });
        assert.equal(lost.color, TYPE_COLORS.restaurante);
        assert.equal(lost.strokeColor, RESULTADO_COLORS.sem_interesse);
        assert.equal(lost.faded, true);
        assert.ok(lost.zIndexOffset < 0);

        const won = pinColors('contacto_remoto', 'digitalizado', { businessType: 'joalharia' });
        assert.equal(won.color, TYPE_COLORS.joalharia);
        assert.equal(won.strokeColor, RESULTADO_COLORS.digitalizado);
    });

    it('pinColors: ignores processo fill — Controlo colours stay on cards', () => {
        const seq = processoPinStyle('EM_SEQUENCIA');
        const open = pinColors('demo_criada', '', { ...seq, businessType: 'otica' });
        assert.equal(open.color, TYPE_COLORS.otica);
        assert.equal(open.strokeColor, PIN_STROKE_OPEN);
        assert.notEqual(open.color, PROCESSO_COLORS.EM_SEQUENCIA);

        const refused = pinColors('visitado', '', { ...processoPinStyle('RECUSADO'), businessType: 'mercadinho' });
        assert.equal(refused.color, TYPE_COLORS.mercadinho);
        assert.equal(refused.faded, true);

        const closedWins = pinColors('demo_apresentada', 'digitalizado', {
            ...processoPinStyle('EM_SEQUENCIA'),
            businessType: 'salao-beleza'
        });
        assert.equal(closedWins.color, TYPE_COLORS['salao-beleza']);
        assert.equal(closedWins.strokeColor, RESULTADO_COLORS.digitalizado);
    });

    it('gives every processo estado a card colour distinct from map type fills', () => {
        const typeFills = new Set(Object.values(TYPE_COLORS));
        PROCESSO_ESTADOS.forEach((id) => {
            assert.ok(PROCESSO_COLORS[id], id);
            assert.match(PROCESSO_COLORS[id], /^#[0-9a-fA-F]{6}$/);
            assert.equal(typeFills.has(PROCESSO_COLORS[id]), false, id);
        });
    });

    it('normalizes etapa and resultado inputs', () => {
        assert.equal(normalizeEtapa('contacto'), 'contacto_remoto');
        assert.equal(normalizeEtapa('demo_criada'), 'demo_criada');
        assert.equal(normalizeResultado('nao_interessa'), 'sem_interesse');
        assert.equal(normalizeResultado(''), '');
        assert.ok(ETAPA_VALUES.includes('demo_apresentada'));
        assert.ok(RESULTADO_VALUES.includes('futuro'));
        assert.equal(RESULTADO_COLORS.sem_interesse, '#78716c');
        assert.equal(ETAPA_LABELS.contacto_remoto, 'Por visitar');
        assert.equal(ETAPA_LABELS.demo_criada, 'Com demo');
        assert.equal(RESULTADO_LABELS.futuro, 'Mais tarde');
        assert.equal(RESULTADO_LABELS.sem_interesse, 'Não quer');
        assert.equal(typeColor('cafe-pastelaria'), TYPE_COLORS['cafe-pastelaria']);
        assert.equal(typeColor('quintas-e-hotelaria'), TYPE_COLORS['quintas-e-hotelaria']);
        assert.equal(TYPE_COLORS['quintas-e-hotelaria'], '#5a4632');
    });
});

describe('digitalizept coverage category filter', async () => {
    const {
        coverageTypeId,
        coverageCounts,
        coverageResultadoId,
        coverageProcessoId,
        pinMatchesCoverageFilters
    } = await import('../../digitalizept/js/coverage-filters.js');

    const cafe = { nome: 'Café da Praça', business_type: 'cafe-pastelaria', etapa: 'visitado', resultado: '', processoEstado: 'DEMO_PRONTO' };
    const loja = { nome: 'Loja da Rua', business_type: 'loja-roupa', etapa: 'visitado', resultado: 'futuro', processoEstado: 'ADORMECIDO' };
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

    it('uses stored Fecho only — closed deals do not invent Cliente on the map', () => {
        const won = { nome: 'Loja Fechada', business_type: 'loja-roupa', etapa: 'demo_apresentada', estado: 'fechado', resultado: '' };
        assert.equal(coverageResultadoId(won), '');
        assert.equal(pinMatchesCoverageFilters(won, {
            filterIds: new Set(['digitalizado'])
        }), false);
        const client = { ...won, resultado: 'digitalizado' };
        assert.equal(coverageResultadoId(client), 'digitalizado');
        assert.equal(pinMatchesCoverageFilters(client, {
            filterIds: new Set(['digitalizado'])
        }), true);
        assert.equal(coverageCounts([client, cafe]).byResultado.get('digitalizado'), 1);
        assert.equal(coverageCounts([won, cafe]).byResultado.get(''), 2);
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
        assert.equal(counts.byProcesso.get('DEMO_PRONTO'), 1);
        assert.equal(counts.byProcesso.get('ADORMECIDO'), 1);
        assert.equal(counts.byProcesso.get(''), 1);
    });

    it('filters and searches by processo estado', () => {
        assert.equal(coverageProcessoId(cafe), 'DEMO_PRONTO');
        assert.equal(pinMatchesCoverageFilters(cafe, {
            filterIds: new Set(['DEMO_PRONTO'])
        }), true);
        assert.equal(pinMatchesCoverageFilters(loja, {
            filterIds: new Set(['DEMO_PRONTO'])
        }), false);
        assert.equal(pinMatchesCoverageFilters(cafe, {
            query: 'demo pronta',
            typeLabel: 'Café / Pastelaria'
        }), false);
        assert.equal(pinMatchesCoverageFilters({
            ...cafe,
            processoEstadoLabel: 'Pronta a enviar'
        }, {
            query: 'pronta a enviar'
        }), true);
        assert.equal(pinMatchesCoverageFilters({
            ...cafe,
            etapaLabel: 'Já passámos'
        }, {
            query: 'já passámos'
        }), true);
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
