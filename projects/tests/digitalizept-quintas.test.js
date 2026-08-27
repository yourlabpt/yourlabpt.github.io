const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const typesDir = path.join(__dirname, '..', '..', 'server', 'config', 'business-types');
const fieldsPath = path.join(__dirname, '..', '..', 'server', 'config', 'fields.json');
const quintas = require(path.join(__dirname, '..', '..', 'server', 'lib', 'digitalizept-quintas'));
const dossier = require(path.join(__dirname, '..', '..', 'server', 'lib', 'digitalizept-dossier'));

let isDataStepValid;
let dataStep;

before(async () => {
    if (typeof globalThis.window === 'undefined') {
        globalThis.window = { location: { hostname: 'localhost', port: '3000' } };
    }
    const appDir = path.join(__dirname, '..', '..', 'digitalizept', 'js');
    const dataValid = await import(pathToFileURL(path.join(appDir, 'steps', 'data-valid.js')).href);
    isDataStepValid = dataValid.isDataStepValid;
    const dataMod = await import(pathToFileURL(path.join(appDir, 'steps', 'data.js')).href);
    dataStep = dataMod.dataStep;
});

function loadType(id) {
    const file = path.join(typesDir, `${id}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadAllTypes() {
    return fs.readdirSync(typesDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(typesDir, f), 'utf8')));
}

describe('quintas-e-hotelaria business type', () => {
    it('loads with three variantes and field groups', () => {
        const types = loadAllTypes();
        const type = types.find((t) => t.id === 'quintas-e-hotelaria');
        assert.ok(type, 'quintas-e-hotelaria must appear in business types');
        assert.equal(type.nome, 'Quintas e hotelaria');
        assert.deepEqual(Object.keys(type.variantes).sort(), ['estadia', 'eventos', 'hibrido']);
        assert.ok(type.grupos_campos.identidade);
        assert.ok(type.grupos_campos.capacidade_eventos);
        assert.ok(type.grupos_campos.alojamento);
        assert.ok(type.grupos_campos.legal);
        assert.ok(type.grupos_campos.presenca);
        assert.ok(type.grupos_campos.conteudo);
        assert.equal(type.paletas_sugeridas.length, 3);
        assert.ok(type.campos_obrigatorios.includes('whatsapp'));
        assert.ok(type.campos_obrigatorios.includes('numero_registo'));
        assert.equal(type.idiomas_default, 'pt, en');
    });

    it('estadia hides event-only groups; eventos hides alojamento; hibrido shows both', () => {
        const type = loadType('quintas-e-hotelaria');

        const estadia = quintas.activeGroupIds(type, 'estadia');
        assert.ok(!estadia.includes('capacidade_eventos'));
        assert.ok(estadia.includes('alojamento'));

        const eventos = quintas.activeGroupIds(type, 'eventos');
        assert.ok(eventos.includes('capacidade_eventos'));
        assert.ok(!eventos.includes('alojamento'));

        const hibrido = quintas.activeGroupIds(type, 'hibrido');
        assert.ok(hibrido.includes('capacidade_eventos'));
        assert.ok(hibrido.includes('alojamento'));

        const estadiaFields = quintas.activeFieldIds(type, { variante: 'estadia' });
        assert.ok(estadiaFields.has('n_unidades'));
        assert.ok(!estadiaFields.has('sentados_max'));

        const eventosFields = quintas.activeFieldIds(type, { variante: 'eventos' });
        assert.ok(eventosFields.has('sentados_max'));
        assert.ok(!eventosFields.has('n_unidades'));

        const hibridoFields = quintas.activeFieldIds(type, { variante: 'hibrido' });
        assert.ok(hibridoFields.has('sentados_max'));
        assert.ok(hibridoFields.has('n_unidades'));
    });

    it('dossier catalog filters by variante', () => {
        const type = loadType('quintas-e-hotelaria');
        const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));

        const catEventos = dossier.buildFieldCatalog(type, fields, { variante: 'eventos' });
        const idsEventos = new Set(catEventos.map((f) => f.id));
        assert.ok(idsEventos.has('sentados_max'));
        assert.ok(!idsEventos.has('n_unidades'));
        assert.ok(idsEventos.has('numero_registo'));
        assert.ok(idsEventos.has('whatsapp'));

        const catEstadia = dossier.buildFieldCatalog(type, fields, { variante: 'estadia' });
        const idsEstadia = new Set(catEstadia.map((f) => f.id));
        assert.ok(idsEstadia.has('n_unidades'));
        assert.ok(!idsEstadia.has('sentados_max'));
    });

    it('requires whatsapp + numero_registo (+ variante) for data step', () => {
        assert.equal(quintas.isQuintasDataValid({
            nome_negocio: 'Quinta',
            morada: 'Rua 1',
            cidade: 'Amarante',
            telefone: '912345678',
            whatsapp: '912345678',
            numero_registo: '12345/AL',
            variante: 'eventos'
        }), true);

        assert.equal(quintas.isQuintasDataValid({
            nome_negocio: 'Quinta',
            morada: 'Rua 1',
            cidade: 'Amarante',
            telefone: '912345678',
            variante: 'eventos',
            numero_registo: '12345/AL'
        }), false, 'whatsapp required');

        assert.equal(quintas.isQuintasDataValid({
            nome_negocio: 'Quinta',
            morada: 'Rua 1',
            cidade: 'Amarante',
            telefone: '912345678',
            whatsapp: '912345678',
            variante: 'eventos'
        }), false, 'numero_registo required');

        const type = loadType('quintas-e-hotelaria');
        assert.equal(isDataStepValid({
            data: {
                businessType: type,
                dados: {
                    nome_negocio: 'Quinta',
                    morada: 'Rua 1',
                    cidade: 'Amarante',
                    telefone: '912345678'
                }
            }
        }), false);
        assert.equal(isDataStepValid({
            data: {
                businessType: type,
                dados: {
                    nome_negocio: 'Quinta',
                    morada: 'Rua 1',
                    cidade: 'Amarante',
                    telefone: '912345678',
                    whatsapp: '912345678',
                    numero_registo: '12345/AL',
                    variante: 'hibrido'
                }
            }
        }), true);
    });

    it('street data step uses variante-ordered pages for this type only', () => {
        const type = loadType('quintas-e-hotelaria');
        const state = {
            data: {
                businessType: type,
                dados: { variante: 'estadia' },
                _standardFields: JSON.parse(fs.readFileSync(fieldsPath, 'utf8'))
            },
            substep: 0
        };
        const count = dataStep.substepCount(state);
        assert.ok(count > 5, 'quintas opens more than the thin CORE_PAGES list');
        const other = {
            data: {
                businessType: { id: 'restaurante', nome: 'Restaurante' },
                dados: {},
                _standardFields: {}
            },
            substep: 0
        };
        assert.equal(dataStep.substepCount(other), 5);
    });

    it('wizard pages drop alojamento screens for eventos', () => {
        const type = loadType('quintas-e-hotelaria');
        const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
        const pages = quintas.wizardPageSpecs(type, { variante: 'eventos' }, fields);
        const ids = pages.map((p) => p.id);
        assert.equal(ids[0], 'variante');
        assert.ok(ids.includes('sentados_max'));
        assert.ok(!ids.includes('n_unidades'));
        assert.ok(ids.includes('whatsapp'));
        assert.ok(ids.includes('numero_registo'));
    });

    it('registers PT-PT labels for new dados keys', () => {
        const fields = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
        assert.equal(fields.numero_registo.label, 'Número de registo (RNAL / RNT)');
        assert.equal(fields.vantagens_diretas.tipo, 'texto_longo');
        assert.ok(fields.modo_fotos.opcoes.some((o) => o.id === 'ausente'));
        assert.equal(fields.variante.label, 'Variante do espaço');
    });

    it('eventos CTA is Marcar visita; estadia prefers Reservar', () => {
        const type = loadType('quintas-e-hotelaria');
        assert.equal(type.variantes.eventos.ctas_hero[0].label, 'Marcar visita');
        assert.equal(type.variantes.estadia.ctas_hero[0].label, 'Reservar');
        const presented = quintas.resolveEffectiveTypePresentation(type, { variante: 'eventos' });
        assert.equal(presented.cta_bloco.botao, 'Marcar visita');
    });
});
