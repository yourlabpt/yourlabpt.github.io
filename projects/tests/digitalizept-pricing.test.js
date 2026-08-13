const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The app ships as ES modules and the server imports these same files, so the
// tests load the real thing rather than a CommonJS copy that could drift.
const appDir = path.join(__dirname, '..', '..', 'digitalizept', 'js');
let computeProposta;
let refreshCalc;
let guardrailLevel;
let validateNif;
let parseDemoOutput;
let isDataStepValid;

before(async () => {
    const calc = await import(pathToFileURL(path.join(appDir, 'proposal-calc.js')).href);
    const nif = await import(pathToFileURL(path.join(appDir, 'deal', 'nif.js')).href);
    const parse = await import(pathToFileURL(path.join(appDir, 'demo', 'parse.js')).href);
    const dataValid = await import(pathToFileURL(path.join(appDir, 'steps', 'data-valid.js')).href);
    computeProposta = calc.computeProposta;
    refreshCalc = calc.refreshCalc;
    guardrailLevel = calc.guardrailLevel;
    validateNif = nif.validateNif;
    parseDemoOutput = parse.parseDemoOutput;
    isDataStepValid = dataValid.isDataStepValid;
});

const IVA = 0.23;

const CATALOG = [
    { codigo: 'essencial', nome: 'Essencial', preco_centimos: 49000, tipo: 'pacote' },
    { codigo: 'plus', nome: 'Plus', preco_centimos: 99000, tipo: 'pacote' },
    { codigo: 'email_profissional', nome: 'Email', preco_centimos: 9000, tipo: 'extra' },
    { codigo: 'qr_cartao', nome: 'QR', preco_centimos: 4000, tipo: 'extra' },
    { codigo: 'urgencia', nome: 'Urgência', preco_centimos: 0, percentual: 0.30, tipo: 'ajuste' },
    { codigo: 'manutencao_base', nome: 'Manutenção Base', preco_centimos: 2900, tipo: 'manutencao' }
];

function proposta(overrides = {}) {
    return {
        pacote: 'essencial',
        extras: [],
        urgencia: false,
        manutencao: null,
        descontoPct: 0,
        ...overrides
    };
}

describe('digitalizept pricing — IVA regime switch', () => {
    it('adds IVA on top at the taxa normal', () => {
        const c = computeProposta(proposta(), CATALOG, {}, IVA);
        assert.equal(c.totalSemIva, 49000);
        assert.equal(c.iva, 11270);
        assert.equal(c.totalComIva, 60270);
        assert.equal(c.ivaRate, IVA);
    });

    it('charges and shows no IVA under the isencao regime', () => {
        const c = computeProposta(proposta(), CATALOG, {}, 0);
        assert.equal(c.iva, 0);
        assert.equal(c.ivaRate, 0);
        assert.equal(c.totalComIva, c.totalSemIva, 'total must not move when there is no IVA');
    });

    it('leaves the entrada split unchanged when IVA is switched off', () => {
        const off = computeProposta(proposta(), CATALOG, {}, 0);
        assert.equal(off.entrada, 24500);
        assert.equal(off.final, 24500);
        assert.equal(off.entrada + off.final, off.totalSemIva);
    });

    it('splits the entrada off the IVA-inclusive total, since that is what is paid', () => {
        const on = computeProposta(proposta(), CATALOG, {}, IVA);
        assert.equal(on.entrada + on.final, on.totalComIva);
        assert.ok(on.entrada > 24500, 'entrada must include IVA, not sit on the net total');
    });

    it('treats a missing, negative or junk rate as no IVA rather than guessing', () => {
        for (const rate of [undefined, null, -0.5, NaN, 'abc']) {
            const c = computeProposta(proposta(), CATALOG, {}, rate);
            assert.equal(c.iva, 0, `rate ${String(rate)} should not produce IVA`);
            assert.equal(c.ivaRate, 0);
        }
    });

    it('applies IVA to the monthly maintenance too', () => {
        const c = computeProposta(proposta({ manutencao: 'manutencao_base' }), CATALOG, {}, IVA);
        assert.equal(c.manutencaoMensal, 2900);
        assert.equal(c.manutencaoMensalComIva, 3567);
    });
});

describe('digitalizept pricing — discounts, urgency and rounding', () => {
    it('sums extras into the subtotal', () => {
        const c = computeProposta(proposta({ extras: ['email_profissional', 'qr_cartao'] }), CATALOG, {}, 0);
        assert.equal(c.subtotal, 49000 + 9000 + 4000);
    });

    it('applies urgency before the discount', () => {
        const c = computeProposta(proposta({ urgencia: true }), CATALOG, {}, 0);
        assert.equal(c.urgenciaPct, 0.30);
        assert.equal(c.urgencia, 14700);
        assert.equal(c.totalSemIva, 63700);
    });

    it('discounts the subtotal plus urgency, not the subtotal alone', () => {
        const c = computeProposta(proposta({ urgencia: true, descontoPct: 10 }), CATALOG, {}, 0);
        assert.equal(c.desconto, Math.round(63700 * 0.10));
        assert.equal(c.totalSemIva, 63700 - 6370);
    });

    it('clamps the discount to 0-100', () => {
        assert.equal(computeProposta(proposta({ descontoPct: 250 }), CATALOG, {}, 0).descontoPct, 100);
        assert.equal(computeProposta(proposta({ descontoPct: -20 }), CATALOG, {}, 0).descontoPct, 0);
    });

    it('never loses or invents a cent on an odd total', () => {
        // 5% off 490,00 leaves an odd number of cents to halve.
        const c = computeProposta(proposta({ descontoPct: 5 }), CATALOG, {}, IVA);
        assert.ok(c.totalComIva % 2 !== 0, 'fixture should produce an odd total');
        assert.equal(c.entrada + c.final, c.totalComIva);
    });

    it('prices an unknown package as zero rather than NaN', () => {
        const c = computeProposta(proposta({ pacote: 'nao-existe' }), CATALOG, {}, IVA);
        assert.equal(c.subtotal, 0);
        assert.equal(c.totalComIva, 0);
    });
});

describe('digitalizept pricing — valor-hora guardrail', () => {
    it('measures revenue, so it does not move when the IVA regime changes', () => {
        const on = computeProposta(proposta(), CATALOG, {}, IVA);
        const off = computeProposta(proposta(), CATALOG, {}, 0);
        assert.equal(on.valorHora, off.valorHora, 'IVA is collected for the State, not revenue');
    });

    it('uses the business-type hour estimate when present', () => {
        const c = computeProposta(proposta(), CATALOG, { horas_estimadas: 5 }, IVA);
        assert.equal(c.horas, 5);
        assert.equal(c.valorHora, 490 / 5);
    });

    it('bands the guardrail on euros per hour', () => {
        assert.equal(guardrailLevel(120), 'green');
        assert.equal(guardrailLevel(75), 'amber');
        assert.equal(guardrailLevel(40), 'red');
    });
});

describe('digitalizept pricing — refreshCalc', () => {
    it('re-prices stale totals in place after a service changes', () => {
        const state = { data: { proposta: proposta() } };
        refreshCalc(state, CATALOG, {}, IVA);
        assert.equal(state.data.proposta._calc.totalComIva, 60270);

        state.data.proposta.pacote = 'plus';
        refreshCalc(state, CATALOG, {}, IVA);
        assert.equal(state.data.proposta._calc.totalSemIva, 99000);
    });

    it('creates a default proposta when the step was skipped', () => {
        const state = { data: {} };
        const c = refreshCalc(state, CATALOG, {}, IVA);
        assert.equal(state.data.proposta.pacote, 'essencial');
        assert.equal(c.totalComIva, 60270);
    });
});

describe('digitalizept NIF validation', () => {
    it('accepts NIFs with a valid mod-11 check digit', () => {
        for (const nif of ['501442600', '123456789', '999999990']) {
            assert.equal(validateNif(nif), true, `${nif} should be valid`);
        }
    });

    it('rejects a wrong check digit', () => {
        assert.equal(validateNif('123456788'), false);
    });

    it('rejects anything that is not nine digits', () => {
        for (const nif of ['', '12345678', '1234567890', 'abcdefghi', null, undefined]) {
            assert.equal(validateNif(nif), false);
        }
    });

    it('ignores spaces and punctuation around the digits', () => {
        assert.equal(validateNif(' 123 456 789 '), true);
    });
});

describe('digitalizept demo parse', () => {
    const valid = {
        hero: { titulo: 'Café da Praça', subtitulo: 'No centro', cta: 'Visitar' },
        sobre: { titulo: 'Sobre', texto: 'Café de bairro.' },
        servicos: {
            titulo: 'Serviços',
            itens: [
                { nome: 'Café', descricao: 'Expresso' },
                { nome: 'Pastelaria', descricao: 'Doçaria' },
                { nome: 'Pequeno-almoço', descricao: 'Menu' }
            ]
        },
        diferenciais: { titulo: 'Porquê', itens: ['Local', 'Fresco', 'Atendimento'] },
        rodape: { texto: 'Braga' }
    };

    it('accepts a complete JSON payload', () => {
        const result = parseDemoOutput(JSON.stringify(valid));
        assert.equal(result.ok, true);
        assert.equal(result.demo.hero.titulo, 'Café da Praça');
    });

    it('rejects fewer than three serviços', () => {
        const raw = JSON.stringify({ ...valid, servicos: { itens: [{ nome: 'Café' }] } });
        const result = parseDemoOutput(raw);
        assert.equal(result.ok, false);
    });

    it('rejects fewer than three diferenciais', () => {
        const raw = JSON.stringify({ ...valid, diferenciais: { itens: ['Local'] } });
        const result = parseDemoOutput(raw);
        assert.equal(result.ok, false);
    });

    it('accepts curly quotes of the kind assistants actually emit', () => {
        const q = '\u201C';
        const p = '\u201D';
        const raw = `{
${q}hero${p}: {
${q}titulo${p}: ${q}Sabor português à sua mesa${p},
${q}subtitulo${p}: ${q}Cozinha de inspiração portuguesa.${p},
${q}cta${p}: ${q}Reservar mesa${p}
},
${q}sobre${p}: { ${q}titulo${p}: ${q}Uma mesa para todos${p}, ${q}texto${p}: ${q}No teste, juntamos o prazer de uma boa refeição.${p} },
${q}servicos${p}: {
${q}titulo${p}: ${q}Para cada momento à mesa${p},
${q}itens${p}: [
{ ${q}nome${p}: ${q}Almoços${p}, ${q}descricao${p}: ${q}Uma pausa saborosa.${p} },
{ ${q}nome${p}: ${q}Jantares${p}, ${q}descricao${p}: ${q}Um ambiente acolhedor.${p} },
{ ${q}nome${p}: ${q}Take-away${p}, ${q}descricao${p}: ${q}Leve o sabor consigo.${p} }
]
},
${q}diferenciais${p}: {
${q}titulo${p}: ${q}O prazer de comer bem${p},
${q}itens${p}: [
${q}Cozinha caseira${p},
${q}Produtos frescos${p},
${q}Ambiente familiar${p}
]
},
${q}rodape${p}: { ${q}texto${p}: ${q}Venha conhecer o teste.${p} }
}`;
        const result = parseDemoOutput(raw);
        assert.equal(result.ok, true, result.error);
        assert.equal(result.demo.hero.titulo, 'Sabor português à sua mesa');
        assert.equal(result.demo.hero.cta, 'Reservar mesa');
        assert.equal(result.demo.servicos.itens.length, 3);
    });

    it('accepts a trailing comma and a markdown fence', () => {
        const raw = '```json\n' + JSON.stringify(valid).replace(/}$/, ',}\n') + '```';
        const result = parseDemoOutput(raw);
        assert.equal(result.ok, true, result.error);
    });
});

describe('digitalizept data step — public shopfront is enough', () => {
    const businessType = {
        id: 'restaurante',
        campos_obrigatorios: [
            'nome_negocio', 'responsavel', 'telefone', 'whatsapp',
            'morada', 'cidade', 'horario', 'o_que_faz', 'principais_servicos', 'diferencial'
        ]
    };

    it('lets Continuar unlock with name, address and business phone', () => {
        assert.equal(isDataStepValid({
            data: {
                businessType,
                dados: {
                    nome_negocio: 'Café Central',
                    morada: 'Rua A 1',
                    cidade: 'Lisboa',
                    telefone: '210000000'
                }
            }
        }), true);
    });

    it('still blocks Continuar when the public contact is missing', () => {
        assert.equal(isDataStepValid({
            data: {
                businessType,
                dados: {
                    nome_negocio: 'Café Central',
                    morada: 'Rua A 1',
                    cidade: 'Lisboa'
                }
            }
        }), false);
    });

    it('does not require the owner name or a written pitch', () => {
        assert.equal(isDataStepValid({
            data: {
                businessType,
                dados: {
                    nome_negocio: 'Café Central',
                    morada: 'Rua A 1',
                    cidade: 'Lisboa',
                    telefone: '210000000',
                    responsavel: '',
                    o_que_faz: ''
                }
            }
        }), true);
    });
});
