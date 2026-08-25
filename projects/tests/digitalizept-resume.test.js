const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
    mergeDemoForResume,
    resumeWizardPosition,
    mergeDemoIntoWizardJson
} = require('../../server/lib/digitalizept-resume.js');

const appDir = path.join(__dirname, '..', '..', 'digitalizept', 'js');

describe('digitalizept resume merge', () => {
    it('prefers wizard.demo when demoRaw signals an AI edit over stale demo_json', () => {
        const leadDemo = {
            hero: { titulo: 'Boilerplate Café' },
            servicos: { itens: [{ nome: 'Genérico' }] }
        };
        const wizardDemo = {
            hero: { titulo: 'Café AI' },
            servicos: { itens: [{ nome: 'Brunch' }, { nome: 'Café' }] }
        };
        const merged = mergeDemoForResume({
            leadDemo,
            leadDemoHtml: '',
            wizard: {
                demo: wizardDemo,
                demoRaw: JSON.stringify(wizardDemo, null, 2),
                demoPrompt: 'prompt'
            }
        });
        assert.equal(merged.demo.hero.titulo, 'Café AI');
        assert.equal(merged.demo.servicos.itens.length, 2);
        assert.match(merged.demoRaw, /Café AI/);
    });

    it('restores demoHtml from wizard_json even when demo_slug / column empty', () => {
        const merged = mergeDemoForResume({
            leadDemo: { hero: { titulo: 'Boiler' } },
            leadDemoHtml: '',
            wizard: {
                demoHtml: '<!DOCTYPE html><html><body>AI HTML</body></html>',
                demo: { hero: { titulo: 'Boiler' } }
            }
        });
        assert.match(merged.demoHtml, /AI HTML/);
    });

    it('prefers column demo_html over wizard when both exist', () => {
        const merged = mergeDemoForResume({
            leadDemo: null,
            leadDemoHtml: '<html>published</html>',
            wizard: { demoHtml: '<html>draft</html>' }
        });
        assert.match(merged.demoHtml, /published/);
    });

    it('falls back to lead demo_json when wizard has no AI raw', () => {
        const leadDemo = { hero: { titulo: 'Published' } };
        const merged = mergeDemoForResume({
            leadDemo,
            leadDemoHtml: '',
            wizard: { demo: { hero: { titulo: 'Older draft' } } }
        });
        assert.equal(merged.demo.hero.titulo, 'Published');
    });

    it('reads suggested step and substep from wizard snapshot', () => {
        const pos = resumeWizardPosition({ _wizardStep: 4, _wizardSubstep: 1 });
        assert.equal(pos.suggestedStep, 4);
        assert.equal(pos.suggestedSubstep, 1);
        assert.deepEqual(resumeWizardPosition({}), { suggestedStep: 0, suggestedSubstep: 0 });
    });

    it('does not land on tipo de negócio when the lead already has a demo or ficha', () => {
        const withDemo = resumeWizardPosition({ _wizardStep: 0, _wizardSubstep: 0 }, { hasDemo: true });
        assert.equal(withDemo.suggestedStep, 4);
        assert.equal(withDemo.suggestedSubstep, 1);
        const withType = resumeWizardPosition({}, { hasType: true, hasDados: true, businessTypeId: 'cafe-pastelaria' });
        assert.equal(withType.suggestedStep, 1);
        assert.equal(withType.suggestedSubstep, 0);
        const later = resumeWizardPosition({ _wizardStep: 5, _wizardSubstep: 0 }, { hasDemo: true });
        assert.equal(later.suggestedStep, 5);
    });

    it('does not let a boilerplate publish replace AI HTML', () => {
        const {
            pickCustomHtml,
            persistableCustomHtml,
            mergeDemoForResume,
            mergeDemoIntoWizardJson
        } = require('../../server/lib/digitalizept-resume.js');
        const boiler = '<html lang="pt-PT" data-dp-boilerplate="restaurante"></html>';
        const custom = '<html><body>AI Thailander</body></html>';
        assert.equal(pickCustomHtml(boiler, { demoHtmlCustom: custom }), custom);
        assert.equal(persistableCustomHtml({
            demoHtml: boiler,
            demoHtmlSource: 'boilerplate',
            existingWizard: { demoHtmlCustom: custom }
        }), custom);
        const merged = mergeDemoForResume({
            leadDemo: { hero: { titulo: 'Opção 1' } },
            leadDemoHtml: boiler,
            wizard: { demoHtmlCustom: custom, demoVisual: 'sem-fotos' }
        });
        assert.match(merged.demoHtmlCustom, /AI Thailander/);
        assert.match(merged.demoHtml, /AI Thailander/);
        assert.equal(merged.demoVisual, 'personalizada');
        const next = mergeDemoIntoWizardJson(
            { demoHtmlCustom: custom, demoVisual: 'personalizada' },
            { demoHtml: boiler, demoHtmlSource: 'boilerplate', demoVisual: 'sem-fotos' }
        );
        assert.match(next.demoHtmlCustom, /AI Thailander/);
    });

    it('merges demo fields into existing wizard_json on publish', () => {
        const next = mergeDemoIntoWizardJson(
            { proposta: { pacote: 'site_maps' }, demoPrompt: 'keep' },
            {
                demo: { hero: { titulo: 'Novo' } },
                demoHtml: '<html>x</html>',
                demoRaw: '{"hero":{"titulo":"Novo"}}'
            }
        );
        assert.equal(next.proposta.pacote, 'site_maps');
        assert.equal(next.demoPrompt, 'keep');
        assert.equal(next.demo.hero.titulo, 'Novo');
        assert.match(next.demoHtml, /<html>/);
        assert.match(next.demoRaw, /Novo/);
    });

    it('keeps stored ficha fields when a draft posts blanks', () => {
        const { mergeDadosPreserve } = require('../../server/lib/digitalizept-resume.js');
        const merged = mergeDadosPreserve(
            { nome_negocio: 'Thai Golden', horario: '12-15', instagram: '@thai', telefone: '210000000' },
            { nome_negocio: 'Thai Golden', horario: '', telefone: '211111111' }
        );
        assert.equal(merged.horario, '12-15');
        assert.equal(merged.instagram, '@thai');
        assert.equal(merged.telefone, '211111111');
    });

    it('does not let an empty draft snapshot erase the demo HTML', () => {
        const { mergeWizardSnapshot, mergeDemoIntoWizardJson } = require('../../server/lib/digitalizept-resume.js');
        const existing = {
            demoHtmlCustom: '<html><body>AI Thailander</body></html>',
            demoHtml: '<html><body>AI Thailander</body></html>',
            demoVisual: 'personalizada',
            dados: { nome_negocio: 'Thai Golden', horario: '12-15' },
            identidade: { cores: { base: '#111' } }
        };
        const next = mergeWizardSnapshot(existing, {
            demoHtml: '',
            demoHtmlCustom: '',
            demo: undefined,
            dados: { nome_negocio: 'Thai Golden', horario: '' },
            _wizardStep: 0
        });
        assert.match(next.demoHtmlCustom, /AI Thailander/);
        assert.match(next.demoHtml, /AI Thailander/);
        assert.equal(next.dados.horario, '12-15');
        assert.equal(next.identidade.cores.base, '#111');
        assert.equal(next._wizardStep, 0);

        const emptied = mergeDemoIntoWizardJson(existing, { demoHtml: '', demoHtmlSource: 'boilerplate' });
        assert.match(emptied.demoHtmlCustom, /AI Thailander/);
        assert.match(emptied.demoHtml, /AI Thailander/);
    });

    it('clears the demo when the seller confirms a category change', () => {
        const { mergeWizardSnapshot } = require('../../server/lib/digitalizept-resume.js');
        const next = mergeWizardSnapshot(
            { demoHtmlCustom: '<html>keep</html>', identidade: { cores: { base: '#111' } } },
            { _clearDemo: true, demoHtml: '', demoHtmlCustom: '', identidade: undefined }
        );
        assert.equal(next.demoHtmlCustom, undefined);
        assert.equal(next.identidade, undefined);
        assert.equal(next._clearDemo, undefined);
    });

    it('rebuilds an empty ficha from the published demo, visit and admin columns', () => {
        const { hydrateResumeDados } = require('../../server/lib/digitalizept-resume.js');
        const dados = hydrateResumeDados({
            ficha: { nome_negocio: '', morada: '', cidade: '', telefone: '', whatsapp: '' },
            wizardDados: {},
            visit: { nome: 'Thai Golden', morada: 'Rua A 1', cidade: 'Lisboa' },
            legal: { email: 'thai@example.com', telefone: '210000000' },
            demo: {
                hero: { titulo: 'Comida thai na Baixa' },
                sobre: { texto: 'Curry e wok no Barreiro.' },
                servicos: { itens: [{ nome: 'Curry' }, { nome: 'Wok' }] }
            },
            demoHtml: '<a href="tel:+351210000000">Ligar</a> <a href="https://wa.me/351910000000">WhatsApp</a>',
            slug: 'thai-golden'
        });
        assert.equal(dados.nome_negocio, 'Thai Golden');
        assert.equal(dados.morada, 'Rua A 1');
        assert.equal(dados.cidade, 'Lisboa');
        assert.equal(dados.email, 'thai@example.com');
        assert.equal(dados.telefone, '210000000');
        assert.equal(dados.whatsapp, '351910000000');
        assert.match(dados.o_que_faz, /Curry/);
        assert.match(dados.principais_servicos, /Wok/);
    });
});

describe('digitalizept seed guard and wizard snapshot', () => {
    it('does not reseed boilerplate when demoRaw is set', async () => {
        const seed = await import(pathToFileURL(path.join(appDir, 'demo', 'seed.js')).href);
        const state = {
            data: {
                businessType: { id: 'cafe-pastelaria', nome: 'Café' },
                dados: { nome_negocio: 'Café Central' },
                demoRaw: '{"hero":{"titulo":"AI Café"}}'
            }
        };
        const result = seed.ensureSeededDemo(state);
        assert.equal(result, null);
        assert.equal(state.data.demo, undefined);
        assert.notEqual(state.data.demoSeeded, true);
    });

    it('does not reseed when only demoHtmlCustom is set', async () => {
        const seed = await import(pathToFileURL(path.join(appDir, 'demo', 'seed.js')).href);
        const state = {
            data: {
                businessType: { id: 'cafe-pastelaria', nome: 'Café' },
                dados: { nome_negocio: 'Café Central' },
                demoHtml: '',
                demoHtmlCustom: '<html>AI custom</html>',
                demoVisual: 'fotos'
            }
        };
        const result = seed.ensureSeededDemo(state);
        assert.equal(result, null);
        assert.equal(state.data.demo, undefined);
        assert.equal(seed.isCustomDemo(state), true);
    });

    it('does not reseed when demoHtml is set', async () => {
        const seed = await import(pathToFileURL(path.join(appDir, 'demo', 'seed.js')).href);
        const state = {
            data: {
                businessType: { id: 'cafe-pastelaria', nome: 'Café' },
                dados: { nome_negocio: 'Café Central' },
                demoHtml: '<html>custom</html>'
            }
        };
        const result = seed.ensureSeededDemo(state);
        assert.equal(result, null);
        assert.equal(state.data.demo, undefined);
        assert.notEqual(state.data.demoSeeded, true);
    });

    it('does not replace an AI JSON demo with the type boilerplate', async () => {
        const seed = await import(pathToFileURL(path.join(appDir, 'demo', 'seed.js')).href);
        const custom = { hero: { titulo: 'Texto da AI', subtitulo: 'Não apagar' } };
        const state = {
            data: {
                businessType: { id: 'cafe-pastelaria', nome: 'Café', servicos_tipicos: ['X'] },
                dados: { nome_negocio: 'Café Central' },
                demo: custom,
                demoRaw: '{"hero":{"titulo":"Texto da AI"}}',
                demoSeeded: false
            }
        };
        const result = seed.ensureSeededDemo(state);
        assert.equal(result, custom);
        assert.equal(state.data.demo.hero.titulo, 'Texto da AI');
        assert.equal(state.data.demoSeeded, false);
    });

    it('wizardSnapshot includes step, substep and demo metadata', async () => {
        if (typeof globalThis.window === 'undefined') {
            globalThis.window = { location: { hostname: 'localhost', port: '3000' } };
        }
        const draft = await import(pathToFileURL(path.join(appDir, 'draft.js')).href);
        const snap = draft.wizardSnapshot({
            step: 4,
            substep: 1,
            data: {
                demo: { hero: { titulo: 'AI' } },
                demoRaw: '{"hero":{"titulo":"AI"}}',
                demoHtml: '',
                demoSeeded: false,
                demoIdentityStamp: 'abc',
                dados: { nome_negocio: 'X' }
            }
        });
        assert.equal(snap._wizardStep, 4);
        assert.equal(snap._wizardSubstep, 1);
        assert.equal(snap.demo.hero.titulo, 'AI');
        assert.match(snap.demoRaw, /AI/);
        assert.equal(snap.demoSeeded, false);
        assert.equal(snap.demoIdentityStamp, 'abc');
        assert.equal(snap.dados.nome_negocio, 'X');
        assert.equal(snap._clearDemo, false);
    });
});
