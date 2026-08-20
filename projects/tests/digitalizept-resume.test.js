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
    });
});
