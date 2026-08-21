const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The app ships as ES modules and the server imports these same files, so the
// tests load the real thing rather than a CommonJS copy that could drift.
const appDir = path.join(__dirname, '..', '..', 'digitalizept', 'js');
let computeProposta;
let refreshCalc;
let resolveIvaRate;
let guardrailLevel;
let validateNif;
let parseDemoOutput;
let isDataStepValid;
let dataStep;
let identityStep;
let imagePickerConfig;
let servicesStep;
let invalidateDemoIfDriverField;
let isDominioValid;
let PACKAGE_DELIVERABLES;
let resolveDeliverables;
let includesGooglePresence;
let includesWebsite;
let suggestPackage;
let buildDomainCandidates;
let demoStep;
let diagnosticoStep;
let googleStep;
let buildWhatsAppMessage;
let buildEmailContent;
let buildWhatsAppUrl;
let normalizePhoneForWa;

before(async () => {
    if (typeof globalThis.window === 'undefined') {
        globalThis.window = { location: { hostname: 'localhost', port: '3000' } };
    }
    const calc = await import(pathToFileURL(path.join(appDir, 'proposal-calc.js')).href);
    const nif = await import(pathToFileURL(path.join(appDir, 'deal', 'nif.js')).href);
    const parse = await import(pathToFileURL(path.join(appDir, 'demo', 'parse.js')).href);
    const dataValid = await import(pathToFileURL(path.join(appDir, 'steps', 'data-valid.js')).href);
    const domain = await import(pathToFileURL(path.join(appDir, 'domain.js')).href);
    const contract = await import(pathToFileURL(path.join(appDir, 'deal', 'contract.js')).href);
    const packages = await import(pathToFileURL(path.join(appDir, 'deal', 'packages.js')).href);
    const domainsServer = require(path.join(__dirname, '..', '..', 'server', 'lib', 'digitalizept-domains.js'));
    computeProposta = calc.computeProposta;
    refreshCalc = calc.refreshCalc;
    resolveIvaRate = calc.resolveIvaRate;
    guardrailLevel = calc.guardrailLevel;
    validateNif = nif.validateNif;
    parseDemoOutput = parse.parseDemoOutput;
    isDataStepValid = dataValid.isDataStepValid;
    isDominioValid = domain.isDominioValid;
    PACKAGE_DELIVERABLES = contract.PACKAGE_DELIVERABLES;
    resolveDeliverables = contract.resolveDeliverables;
    includesGooglePresence = contract.includesGooglePresence;
    includesWebsite = packages.includesWebsite;
    suggestPackage = packages.suggestPackage;
    buildDomainCandidates = domainsServer.buildDomainCandidates;
    const followup = await import(pathToFileURL(path.join(appDir, 'demo', 'followup-messages.js')).href);
    buildWhatsAppMessage = followup.buildWhatsAppMessage;
    buildEmailContent = followup.buildEmailContent;
    buildWhatsAppUrl = followup.buildWhatsAppUrl;
    normalizePhoneForWa = followup.normalizePhoneForWa;
    const dataMod = await import(pathToFileURL(path.join(appDir, 'steps', 'data.js')).href);
    const identityMod = await import(pathToFileURL(path.join(appDir, 'steps', 'identity.js')).href);
    const servicesMod = await import(pathToFileURL(path.join(appDir, 'steps', 'services.js')).href);
    dataStep = dataMod.dataStep;
    invalidateDemoIfDriverField = dataMod.invalidateDemoIfDriverField;
    identityStep = identityMod.identityStep;
    imagePickerConfig = identityMod.imagePickerConfig;
    servicesStep = servicesMod.servicesStep;
    const demoMod = await import(pathToFileURL(path.join(appDir, 'steps', 'demo.js')).href);
    const diagMod = await import(pathToFileURL(path.join(appDir, 'steps', 'diagnostico.js')).href);
    demoStep = demoMod.demoStep;
    diagnosticoStep = diagMod.diagnosticoStep;
    const googleMod = await import(pathToFileURL(path.join(appDir, 'steps', 'google.js')).href);
    googleStep = googleMod.googleStep;
});

const IVA = 0.23;

const CATALOG = [
    { codigo: 'google_essencial', nome: 'Essencial Google', preco_centimos: 29000, tipo: 'pacote' },
    { codigo: 'site_maps', nome: 'Site + Maps', preco_centimos: 39000, tipo: 'pacote' },
    { codigo: 'digital_completo', nome: 'Completo', preco_centimos: 59000, tipo: 'pacote' },
    { codigo: 'plus', nome: 'Plus', preco_centimos: 99000, tipo: 'pacote' },
    { codigo: 'renovacao', nome: 'Renovação', preco_centimos: 79000, tipo: 'pacote' },
    { codigo: 'google_perfil_completo', nome: 'Perfil 100%', preco_centimos: 8000, tipo: 'extra' },
    { codigo: 'google_avaliacoes', nome: 'Avaliações', preco_centimos: 2500, tipo: 'extra' },
    { codigo: 'email_profissional', nome: 'Email', preco_centimos: 9000, tipo: 'extra' },
    { codigo: 'qr_cartao', nome: 'QR', preco_centimos: 4000, tipo: 'extra' },
    { codigo: 'urgencia', nome: 'Urgência', preco_centimos: 0, percentual: 0.30, tipo: 'ajuste' },
    { codigo: 'manutencao_maps', nome: 'Manutenção Maps', preco_centimos: 1000, tipo: 'manutencao' },
    { codigo: 'hosting_landing', nome: 'Hosting landing', preco_centimos: 500, tipo: 'manutencao' },
    { codigo: 'hosting_site', nome: 'Hosting site', preco_centimos: 1000, tipo: 'manutencao' }
];

function proposta(overrides = {}) {
    return {
        pacote: 'google_essencial',
        extras: [],
        urgencia: false,
        manutencao: null,
        manutencoes: [],
        descontoPct: 0,
        ...overrides
    };
}

describe('digitalizept pricing — IVA regime switch', () => {
    it('adds IVA on top at the taxa normal', () => {
        const c = computeProposta(proposta(), CATALOG, {}, IVA);
        assert.equal(c.totalSemIva, 29000);
        assert.equal(c.iva, 6670);
        assert.equal(c.totalComIva, 35670);
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
        assert.equal(off.entrada, 14500);
        assert.equal(off.final, 14500);
        assert.equal(off.entrada + off.final, off.totalSemIva);
    });

    it('splits the entrada off the IVA-inclusive total, since that is what is paid', () => {
        const on = computeProposta(proposta(), CATALOG, {}, IVA);
        assert.equal(on.entrada + on.final, on.totalComIva);
        assert.ok(on.entrada > 14500, 'entrada must include IVA, not sit on the net total');
    });

    it('treats a missing, negative or junk rate as no IVA rather than guessing', () => {
        for (const rate of [undefined, null, -0.5, NaN, 'abc']) {
            const c = computeProposta(proposta(), CATALOG, {}, rate);
            assert.equal(c.iva, 0, `rate ${String(rate)} should not produce IVA`);
            assert.equal(c.ivaRate, 0);
        }
    });

    it('applies IVA to the monthly maintenance too', () => {
        const c = computeProposta(proposta({ manutencao: 'manutencao_maps' }), CATALOG, {}, IVA);
        assert.equal(c.manutencaoMensal, 1000);
        assert.equal(c.manutencaoMensalComIva, 1230);
    });

    it('sums combined Maps + hosting monthly plans', () => {
        const c = computeProposta(proposta({
            pacote: 'digital_completo',
            manutencoes: ['manutencao_maps', 'hosting_landing']
        }), CATALOG, {}, 0);
        assert.equal(c.manutencaoMensal, 1500);
    });
});

describe('digitalizept pricing — discounts, urgency and rounding', () => {
    it('sums extras into the subtotal', () => {
        const c = computeProposta(proposta({ extras: ['email_profissional', 'qr_cartao'] }), CATALOG, {}, 0);
        assert.equal(c.subtotal, 29000 + 9000 + 4000);
    });

    it('applies urgency before the discount', () => {
        const c = computeProposta(proposta({ urgencia: true }), CATALOG, {}, 0);
        assert.equal(c.urgenciaPct, 0.30);
        assert.equal(c.urgencia, 8700);
        assert.equal(c.totalSemIva, 37700);
    });

    it('discounts the subtotal plus urgency, not the subtotal alone', () => {
        const c = computeProposta(proposta({ urgencia: true, descontoPct: 10 }), CATALOG, {}, 0);
        assert.equal(c.desconto, Math.round(37700 * 0.10));
        assert.equal(c.totalSemIva, 37700 - 3770);
    });

    it('clamps the discount to 0-100', () => {
        assert.equal(computeProposta(proposta({ descontoPct: 250 }), CATALOG, {}, 0).descontoPct, 100);
        assert.equal(computeProposta(proposta({ descontoPct: -20 }), CATALOG, {}, 0).descontoPct, 0);
    });

    it('never loses or invents a cent on an odd total', () => {
        // 5% off 290,00 leaves an odd number of cents to halve.
        const c = computeProposta(proposta({ descontoPct: 5 }), CATALOG, {}, IVA);
        assert.ok(c.totalComIva % 2 !== 0, 'fixture should produce an odd total');
        assert.equal(c.entrada + c.final, c.totalComIva);
    });

    it('prices Site + Maps and Completo at the closed defaults', () => {
        assert.equal(computeProposta(proposta({ pacote: 'site_maps' }), CATALOG, {}, 0).subtotal, 39000);
        assert.equal(computeProposta(proposta({ pacote: 'digital_completo' }), CATALOG, {}, 0).subtotal, 59000);
    });

    it('adds Google upgrade extras on Essencial', () => {
        const c = computeProposta(proposta({
            extras: ['google_perfil_completo', 'google_avaliacoes']
        }), CATALOG, {}, 0);
        assert.equal(c.subtotal, 29000 + 8000 + 2500);
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
        assert.equal(c.valorHora, 290 / 5);
    });

    it('bands the guardrail on euros per hour', () => {
        assert.equal(guardrailLevel(120), 'green');
        assert.equal(guardrailLevel(75), 'amber');
        assert.equal(guardrailLevel(40), 'red');
    });
});

describe('digitalizept pricing — refreshCalc', () => {
    it('re-prices stale totals in place after a service changes', () => {
        const state = { data: { proposta: proposta({ cobrarIva: true }) } };
        refreshCalc(state, CATALOG, {}, IVA);
        assert.equal(state.data.proposta._calc.totalComIva, 35670);

        state.data.proposta.pacote = 'plus';
        refreshCalc(state, CATALOG, {}, IVA);
        assert.equal(state.data.proposta._calc.totalSemIva, 99000);
    });

    it('creates a default proposta when the step was skipped', () => {
        const state = { data: {} };
        const c = refreshCalc(state, CATALOG, {}, IVA);
        assert.equal(state.data.proposta.pacote, 'google_essencial');
        assert.equal(state.data.proposta.cobrarIva, false);
        assert.equal(c.totalComIva, 29000, 'new deals start without IVA until the toggle is on');
        state.data.proposta.cobrarIva = true;
        assert.equal(refreshCalc(state, CATALOG, {}, IVA).totalComIva, 35670);
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

describe('digitalizept per-deal IVA toggle', () => {
    it('keeps IVA off until cobrarIva is explicitly true', () => {
        assert.equal(resolveIvaRate({ cobrarIva: false }, IVA), 0);
        assert.equal(resolveIvaRate({}, IVA), 0);
        assert.equal(resolveIvaRate({ cobrarIva: true }, IVA), IVA);
        assert.equal(resolveIvaRate({ cobrarIva: true }, 0), 0);
    });

    it('refreshCalc respects the deal toggle against the config rate', () => {
        const state = { data: { proposta: { pacote: 'google_essencial', extras: [], urgencia: false, manutencao: null, descontoPct: 0, cobrarIva: false } } };
        const off = refreshCalc(state, CATALOG, {}, IVA);
        assert.equal(off.iva, 0);
        assert.equal(off.totalComIva, 29000);
        state.data.proposta.cobrarIva = true;
        const on = refreshCalc(state, CATALOG, {}, IVA);
        assert.equal(on.iva, 6670);
        assert.equal(on.totalComIva, 35670);
    });
});

describe('digitalizept domain options', () => {
    it('builds distinct candidate names from the shopfront', () => {
        const list = buildDomainCandidates('Café Central', 'Lisboa');
        assert.ok(list.length >= 6);
        assert.equal(new Set(list).size, list.length);
        assert.ok(list.every((d) => /\.(pt|com)$/.test(d)));
    });

    it('accepts a suggested domain or the client-owned ZIP path', () => {
        assert.equal(isDominioValid({ pacote: 'site_maps', dominio: { modo: 'sugerido', escolhido: 'cafecentral.pt' } }), true);
        assert.equal(isDominioValid({ pacote: 'site_maps', dominio: { modo: 'sugerido', escolhido: '' } }), false);
        assert.equal(isDominioValid({ pacote: 'digital_completo', dominio: { modo: 'proprio' } }), true);
        assert.equal(isDominioValid({ pacote: 'site_maps', dominio: { modo: '' } }), false);
    });

    it('skips domain for Google-only Essencial', () => {
        assert.equal(isDominioValid({ pacote: 'google_essencial' }), true);
        assert.equal(includesWebsite({ pacote: 'google_essencial' }), false);
        assert.equal(includesWebsite({ pacote: 'site_maps' }), true);
    });
});

describe('digitalizept contract deliverables', () => {
    it('keeps Essencial Google without website deliverables', () => {
        const lines = PACKAGE_DELIVERABLES.google_essencial.join(' ').toLowerCase();
        assert.match(lines, /google/);
        assert.match(lines, /sem website/);
        assert.doesNotMatch(lines, /landing page/);
        assert.equal(includesGooglePresence({ pacote: 'google_essencial', extras: [] }), true);
    });

    it('adds landing + Google for Completo and Site + Maps', () => {
        const completo = resolveDeliverables({ pacote: 'digital_completo', extras: [] }).join(' ').toLowerCase();
        assert.match(completo, /landing/);
        assert.match(completo, /google/);
        assert.match(completo, /5 dias/);
        const siteMaps = resolveDeliverables({ pacote: 'site_maps', extras: [] }).join(' ').toLowerCase();
        assert.match(siteMaps, /landing/);
        assert.match(siteMaps, /atualizar/);
    });

    it('suggests packages from the diagnosis answers', () => {
        assert.equal(suggestPackage({ maps: 'nao', website: 'nao', prioridade: 'google' }), 'google_essencial');
        assert.equal(suggestPackage({ maps: 'sim_acesso', website: 'nao', prioridade: 'site' }), 'site_maps');
        assert.equal(suggestPackage({ maps: 'nao', website: 'nao', prioridade: 'os_dois' }), 'digital_completo');
        assert.equal(suggestPackage({ maps: 'nao', website: 'nao', prioridade: 'varias_paginas' }), 'plus');
    });
});

describe('digitalizept one-question substeps', () => {
    const empty = {
        substep: 0,
        data: {
            businessType: { id: 'restaurante', campos_obrigatorios: ['nome_negocio', 'responsavel'] },
            dados: {}
        }
    };

    it('asks the public shopfront as seven screens until the client wants more', () => {
        assert.equal(dataStep.substepCount(empty), 7);
        assert.equal(dataStep.isSubstepValid(empty), false);
        empty.data.dados.nome_negocio = 'Café Central';
        assert.equal(dataStep.isSubstepValid(empty), true);
    });

    it('opens extra screens only after Sim on the more-now gate', () => {
        const state = {
            substep: 6,
            data: { ...empty.data, dadosMore: true, dados: { nome_negocio: 'Café Central' } }
        };
        assert.ok(dataStep.substepCount(state) > 7);
    });

    it('keeps identity as three skippable screens', () => {
        const state = { substep: 0, data: { businessType: { id: 'restaurante' } } };
        assert.equal(identityStep.substepCount(state), 3);
        assert.equal(identityStep.isSubstepValid(state), true);
    });

    it('opens the camera only when capture is requested, otherwise the library', () => {
        const camera = imagePickerConfig('camera');
        assert.equal(camera.capture, 'environment');
        assert.equal(camera.multiple, undefined);
        assert.match(camera.accept, /image\/\*/);

        const oneFromLibrary = imagePickerConfig('library');
        assert.equal(oneFromLibrary.capture, undefined);
        assert.equal(oneFromLibrary.multiple, undefined);

        const manyFromLibrary = imagePickerConfig('library', { multiple: true });
        assert.equal(manyFromLibrary.capture, undefined);
        assert.equal(manyFromLibrary.multiple, true);
    });

    it('does not shrink extras to urgência while the catalog is still loading', () => {
        const state = {
            substep: 9,
            data: { proposta: { pacote: 'site_maps', extras: [] } }
        };
        assert.equal(servicesStep.pagesReady(state), false);
        assert.equal(servicesStep.substepCount(state), 1);
        assert.equal(servicesStep.isSubstepValid(state), false);
    });

    it('lists café extras in a stable order after the more-now gate', () => {
        const cafe = {
            id: 'cafe-pastelaria',
            campos_obrigatorios: ['nome_negocio', 'responsavel', 'telefone', 'o_que_faz'],
            perguntas_especificas: [
                { id: 'faz_encomendas', label: 'Aceita encomendas de bolos?', tipo: 'sim_nao' },
                { id: 'tem_esplanada', label: 'Tem esplanada?', tipo: 'sim_nao' }
            ],
            campos_opcionais: ['estacionamento', 'mbway', 'wifi', 'reservas', 'entregas']
        };
        const state = {
            substep: 6,
            data: { businessType: cafe, dadosMore: true, dados: { nome_negocio: 'Café Central' } }
        };
        assert.ok(dataStep.substepCount(state) > 7);
        assert.equal(dataStep.isSubstepValid(state), true);
    });

    it('invalidates seeded demo when core business data changes', () => {
        const state = {
            data: {
                demo: { hero: { titulo: 'Demo antiga' } },
                demoRaw: '',
                demoHtml: '',
                demoSeeded: true,
                demoUrl: 'https://old.example/demo',
                demoIdentityStamp: 'abc123'
            }
        };
        const changed = invalidateDemoIfDriverField(state, 'nome_negocio');
        assert.equal(changed, true);
        assert.equal(state.data.demo, undefined);
        assert.equal(state.data.demoRaw, '');
        assert.equal(state.data.demoHtml, '');
        assert.equal(state.data.demoSeeded, false);
        assert.equal(state.data.demoUrl, '');
        assert.equal(state.data.demoIdentityStamp, '');
    });

    it('keeps an AI or HTML demo when core business data changes', () => {
        const htmlState = {
            data: {
                demo: { hero: { titulo: 'Boilerplate' } },
                demoHtml: '<html>demo da AI</html>',
                demoSeeded: true
            }
        };
        assert.equal(invalidateDemoIfDriverField(htmlState, 'nome_negocio'), false);
        assert.match(htmlState.data.demoHtml, /demo da AI/);
        assert.equal(htmlState.data.demo.hero.titulo, 'Boilerplate');

        const jsonState = {
            data: {
                demo: { hero: { titulo: 'Texto da AI' } },
                demoRaw: '{"hero":{"titulo":"Texto da AI"}}',
                demoHtml: '',
                demoSeeded: false
            }
        };
        assert.equal(invalidateDemoIfDriverField(jsonState, 'cidade'), false);
        assert.equal(jsonState.data.demo.hero.titulo, 'Texto da AI');
        assert.equal(jsonState.data.demoSeeded, false);
    });

    it('does not invalidate demo for non-driver fields', () => {
        const state = {
            data: {
                demo: { hero: { titulo: 'Demo atual' } },
                demoSeeded: true
            }
        };
        const changed = invalidateDemoIfDriverField(state, 'telefone');
        assert.equal(changed, false);
        assert.deepEqual(state.data.demo, { hero: { titulo: 'Demo atual' } });
        assert.equal(state.data.demoSeeded, true);
    });
});

describe('digitalizept demo flow', () => {
    it('diagnóstico ends before pacotes — only understanding questions', () => {
        assert.equal(diagnosticoStep.substepCount(), 6);
        const state = {
            substep: 5,
            data: {
                googleDiagnostico: {
                    exemploVisto: true,
                    diferencaVista: true,
                    maps: 'sim_acesso',
                    validado: 'sim',
                    website: 'nao',
                    prioridade: 'google'
                }
            }
        };
        assert.equal(diagnosticoStep.isSubstepValid(state), true);
        assert.equal(diagnosticoStep.isValid(state), true);
    });

    it('demonstração shows Google Maps and website as two substeps', () => {
        assert.equal(demoStep.substepCount(), 2);
        const gbpOnly = {
            substep: 0,
            data: {
                businessType: { id: 'cafe-pastelaria' },
                dados: { nome_negocio: 'Café Central' }
            }
        };
        assert.equal(demoStep.isSubstepValid(gbpOnly), true);
        const website = {
            substep: 1,
            data: {
                businessType: { id: 'cafe-pastelaria' },
                dados: { nome_negocio: 'Café Central', o_que_faz: 'Café' },
                demo: { hero: { titulo: 'Café Central' }, servicos: { itens: [] } },
                demoSeeded: true
            }
        };
        assert.equal(demoStep.isSubstepValid(website), true);
        assert.equal(demoStep.isValid(website), true);
    });

    it('skips the operational Google checklist during the sales visit', () => {
        assert.equal(googleStep.shouldSkip({ data: { proposta: { pacote: 'google_essencial' } } }), true);
        assert.equal(googleStep.shouldSkip({ data: { proposta: { pacote: 'site_maps' } } }), true);
    });

    it('derives googlePresence from diagnóstico when closing the deal', async () => {
        const mod = await import(pathToFileURL(path.join(appDir, 'google-presence.js')).href);
        const gp = mod.googlePresenceFromWizard({
            data: {
                businessType: { id: 'cafe-pastelaria', categorias_google: ['cafe'] },
                googleDiagnostico: { maps: 'sim_sem_dono', prioridade: 'google' },
                dados: { website: 'https://cafe.pt', instagram: '@cafe' }
            }
        });
        assert.equal(gp.mapsEstado, 'sem_dono');
        assert.equal(gp.website, 'https://cafe.pt');
        assert.equal(gp._fromDiagnostico, true);
    });
});

describe('digitalizept followup messages', () => {
    it('fills templates with demo link and client name', () => {
        const state = {
            data: {
                demoUrl: '/d/cafe-exemplo',
                followupVisita: 'manha',
                followupDia: 'sexta-feira',
                dados: {
                    responsavel: 'Silva',
                    nome_negocio: 'Café do Zé',
                    email: 'cafe@example.com',
                    telefone: '965601954'
                }
            }
        };
        const config = { provider: { responsavel: 'Túlio Soares', telefone: '912345678', site: 'yourlabpt.com' } };
        const wa = buildWhatsAppMessage(state, config);
        assert.match(wa, /Sr\. Silva/);
        assert.match(wa, /Café do Zé/);
        assert.match(wa, /\/d\/cafe-exemplo/);
        assert.match(wa, /YourLab, aqui de/);

        const wa2 = buildWhatsAppMessage(state, config, 2);
        assert.match(wa2, /490 euros/);
        assert.match(wa2, /demonstrador/);
        assert.doesNotMatch(wa2, /google\.com\/maps/);

        const wa3 = buildWhatsAppMessage(state, config, 3);
        assert.match(wa3, /sexta-feira/);

        const email = buildEmailContent(state, config);
        assert.match(email.subject, /Café do Zé/);
        assert.match(email.body, /\/d\/cafe-exemplo/);
        assert.match(email.body, /Túlio Soares/);
    });

    it('builds absolute demo url and whatsapp phone', () => {
        assert.equal(normalizePhoneForWa('965 601 954'), '351965601954');
        const url = buildWhatsAppUrl('351965601954', 'Olá');
        assert.match(url, /^https:\/\/wa\.me\/351965601954\?text=/);
    });
});
