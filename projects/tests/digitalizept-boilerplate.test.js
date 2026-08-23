const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('digitalizept landing boilerplate', async () => {
    const {
        mapsHref,
        instagramHref,
        isYes,
        splitItems,
        trustChips,
        destaqueItems,
        interpolate,
        whatsappHref,
        telHref
    } = await import('../../digitalizept/js/demo/boilerplate.js');
    const { seedDemoFromType, ensureSeededDemo } = await import('../../digitalizept/js/demo/seed.js');

    it('prefers a pasted Maps URL over a search query', () => {
        assert.equal(
            mapsHref({ maps_url: 'https://maps.app.goo.gl/abc', morada: 'Rua 1', cidade: 'Porto' }),
            'https://maps.app.goo.gl/abc'
        );
        assert.match(mapsHref({ morada: 'Rua Augusta 12', cidade: 'Lisboa' }), /google\.com\/maps/);
    });

    it('builds WhatsApp and tel links from Portuguese numbers', () => {
        assert.equal(whatsappHref({ whatsapp: '912345678' }), 'https://wa.me/351912345678');
        assert.equal(telHref({ telefone: '912 345 678' }), 'tel:912345678');
    });

    it('builds Instagram links from a handle', () => {
        assert.equal(instagramHref('@loja'), 'https://www.instagram.com/loja');
        assert.equal(instagramHref('https://instagram.com/loja'), 'https://instagram.com/loja');
        assert.equal(instagramHref(''), '');
    });

    it('turns sim/nao and lists into page chips', () => {
        assert.equal(isYes('sim'), true);
        assert.deepEqual(splitItems('Nata, bolo de chocolate; torrada'), ['Nata', 'bolo de chocolate', 'torrada']);
        const chips = trustChips(
            { anos_experiencia: '20', faz_ipo: 'sim' },
            { trust_flags: [{ id: 'faz_ipo', label: 'Pré-inspeção IPO' }] }
        );
        assert.ok(chips.some((c) => /20/.test(c)));
        assert.ok(chips.includes('Pré-inspeção IPO'));
        assert.deepEqual(
            destaqueItems({ pratos_destaque: 'Bacalhau, arroz de pato' }, { destaques_campo: 'pratos_destaque' }),
            ['Bacalhau', 'arroz de pato']
        );
    });

    it('fills copy with the real shop name', () => {
        assert.equal(
            interpolate('{nome} em {cidade}', { nome_negocio: 'Casa da Vila', cidade: 'Póvoa' }, {}),
            'Casa da Vila em Póvoa'
        );
    });

    it('seeds a restaurant page from category copy, not generic lorem', () => {
        const type = JSON.parse(require('fs').readFileSync(
            require('path').join(__dirname, '../../server/config/business-types/restaurante.json'),
            'utf8'
        ));
        const demo = seedDemoFromType({
            data: {
                businessType: type,
                dados: { nome_negocio: 'Tasca do Largo', cidade: 'Porto' }
            }
        });
        assert.equal(demo.servicos.titulo, 'A mesa');
        assert.match(demo.hero.subtitulo, /Porto|portuguesa|almoços/i);
        assert.ok(demo.avaliacoes.itens.length >= 2);
        assert.ok(demo.servicos.itens.some((item) => item.nome === 'Almoços'));
    });

    it('seeds a café page as a morning counter, not a restaurant menu', () => {
        const type = JSON.parse(require('fs').readFileSync(
            require('path').join(__dirname, '../../server/config/business-types/cafe-pastelaria.json'),
            'utf8'
        ));
        const demo = seedDemoFromType({
            data: {
                businessType: type,
                dados: { nome_negocio: 'Café Central', cidade: 'Porto' }
            }
        });
        assert.equal(type.servicos_layout, 'menu');
        assert.match(demo.hero.titulo, /café/i);
        assert.ok(demo.servicos.itens.some((item) => item.nome === 'Cafetaria'));
        assert.ok(demo.servicos.itens.some((item) => /nata|galão|café/i.test(item.descricao)));
        assert.equal(demo.servicos.itens.some((item) => item.nome === 'Almoços'), false);
    });

    it('lets typed principais_servicos replace the category seed list', () => {
        const type = JSON.parse(require('fs').readFileSync(
            require('path').join(__dirname, '../../server/config/business-types/cafe-pastelaria.json'),
            'utf8'
        ));
        const demo = seedDemoFromType({
            data: {
                businessType: type,
                dados: {
                    nome_negocio: 'Pastelaria do Luís',
                    cidade: 'Porto',
                    principais_servicos: 'Nata caseira, Bolo da casa'
                }
            }
        });
        assert.ok(demo.servicos.itens.some((item) => item.nome === 'Nata caseira'));
        assert.ok(demo.servicos.itens.some((item) => item.nome === 'Bolo da casa'));
        assert.equal(demo.servicos.itens.some((item) => item.nome === 'Rissol'), false);
    });

    it('reseeds when demoSeeded so wizard field changes reach both visuals', () => {
        const type = JSON.parse(require('fs').readFileSync(
            require('path').join(__dirname, '../../server/config/business-types/cafe-pastelaria.json'),
            'utf8'
        ));
        const state = {
            data: {
                businessType: type,
                dados: { nome_negocio: 'Café Central', cidade: 'Porto' },
                demoSeeded: true
            }
        };
        const first = seedDemoFromType(state);
        state.data.demo = first;
        state.data.dados.principais_servicos = 'Nata caseira, Bolo da casa';
        const next = ensureSeededDemo(state);
        assert.ok(next.servicos.itens.some((item) => item.nome === 'Nata caseira'));
        assert.ok(next.hero.titulo);
    });

    it('seeds a florist page around ramos, not café copy', () => {
        const type = JSON.parse(require('fs').readFileSync(
            require('path').join(__dirname, '../../server/config/business-types/loja-flores-decoracao.json'),
            'utf8'
        ));
        const demo = seedDemoFromType({
            data: {
                businessType: type,
                dados: { nome_negocio: 'Flores da Praça', cidade: 'Aveiro' }
            }
        });
        assert.equal(type.servicos_layout, 'catalog');
        assert.match(demo.hero.titulo, /ramo/i);
        assert.ok(demo.servicos.itens.some((item) => /ramos/i.test(item.nome)));
        assert.ok(demo.servicos.itens.some((item) => /planta|ramo|flor/i.test(item.descricao)));
        assert.equal(demo.servicos.itens.some((item) => item.nome === 'Cafetaria'), false);
    });
});

describe('digitalizept no-image boilerplates', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { pathToFileURL } = require('node:url');
    const root = path.join(__dirname, '../../digitalizept/boilerplates');
    const slugs = [
        'cafe-pastelaria', 'clinica-estetica', 'drogaria-ferragens', 'generico',
        'joalharia', 'loja-flores-decoracao', 'loja-roupa', 'mecanico-automovel',
        'mercadinho', 'otica', 'restaurante', 'salao-beleza', 'tapecaria'
    ];
    const visual = await import(pathToFileURL(path.join(__dirname, '../../digitalizept/js/demo/demo-visual.js')).href);

    it('ships all 13 sem-fotos HTML files with pt-PT and photo hooks', () => {
        slugs.forEach((slug) => {
            const file = path.join(root, `${slug}-sem-fotos.html`);
            assert.equal(fs.existsSync(file), true, file);
            const html = fs.readFileSync(file, 'utf8');
            assert.match(html, /lang="pt-PT"/);
            assert.match(html, /data-dp-boilerplate="/);
            assert.match(html, /data-dp-photo|dpl-topbar-brand/);
            assert.doesNotMatch(html, /lorem/i);
            assert.match(html, /<h1[\s>]/);
            assert.match(html, /<meta name="description"/);
        });
    });

    it('lists 13×2 gallery links', () => {
        const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
        slugs.forEach((slug) => {
            assert.match(index, new RegExp(`${slug}-sem-fotos\\.html`));
            assert.match(index, new RegExp(`preview-com-fotos\\.html\\?type=${slug}`));
        });
        assert.equal((index.match(/preview-com-fotos\.html\?type=/g) || []).length, 13);
        assert.equal((index.match(/-sem-fotos\.html/g) || []).length, 13);
    });

    it('fills shop name into boilerplate tokens', () => {
        const raw = '<html><body><h1>{{nome}}</h1><p>{{cidade}}</p></body></html>';
        const out = visual.fillBoilerplateCopy(raw, { nome_negocio: 'Casa da Vila', cidade: 'Póvoa' }, {});
        assert.match(out, /Casa da Vila/);
        assert.match(out, /Póvoa/);
        assert.doesNotMatch(out, /\{\{nome\}\}/);
    });

    it('defaults Sem fotos when there are no photos, Com fotos when there are', () => {
        assert.equal(visual.defaultDemoVisual({ data: { identidade: { fotos: [] } } }), 'sem-fotos');
        assert.equal(visual.defaultDemoVisual({ data: { identidade: { fotos: ['data:image/jpeg;base64,xx'] } } }), 'fotos');
        assert.equal(visual.resolveDemoVisual({ data: { demoVisual: 'sem-fotos', identidade: { fotos: ['x'] } } }), 'sem-fotos');
        assert.equal(visual.normalizeVisual('fotos'), 'fotos');
    });

    it('does not hide existing custom HTML or a published landing behind Sem fotos', () => {
        assert.equal(visual.resolveDemoVisual({
            data: {
                demoHtml: '<html><body>AI café</body></html>',
                identidade: { fotos: [] }
            }
        }), 'fotos');
        assert.equal(visual.resolveDemoVisual({
            data: {
                demo: { hero: { titulo: 'Landing publicada' } },
                identidade: { fotos: [] }
            }
        }, '', { preferPublishedLanding: true }), 'fotos');
        assert.equal(visual.resolveDemoVisual({
            data: {
                demoHtml: '<html data-dp-boilerplate="cafe-pastelaria"></html>',
                identidade: { fotos: [] }
            }
        }), 'sem-fotos');
    });

    it('applyIdentityToHtml fills a dp-photo placeholder', async () => {
        const htmlMod = await import(pathToFileURL(path.join(__dirname, '../../digitalizept/js/demo/html.js')).href);
        const slotted = '<div class="dpl-visual" data-dp-photo="0" style="background-image:url(dp-photo://0)"></div>';
        const out = htmlMod.applyIdentityToHtml(slotted, {
            fotos: ['https://cdn.example/loja.jpg'],
            cores: { base: '#111', destaque: '#c00', secundaria: '#999' }
        }, { nome_negocio: 'Casa da Vila' });
        assert.match(out, /https:\/\/cdn\.example\/loja\.jpg/);
    });

    it('keeps identity photo hooks that applyIdentityToHtml can fill', () => {
        const html = fs.readFileSync(path.join(root, 'generico-sem-fotos.html'), 'utf8');
        assert.match(html, /data-dp-photo="0"/);
        assert.match(html, /data-dp-logo/);
        assert.match(html, /class="dpl-visual/);
        assert.equal(visual.isBoilerplateHtml(html), true);
        assert.match(visual.stripDemoSwitch('<div class="dpl-demo-switch"><button>x</button></div><p>ok</p>'), />ok</);
    });

    it('picks readable ink and on-accent colours for WCAG AA', async () => {
        const { contrastRatio, onColor, readableInk, contrastTokens } = await import(
            pathToFileURL(path.join(__dirname, '../../digitalizept/js/demo/colors.js')).href
        );
        assert.ok(contrastRatio('#17171a', '#fafaf8') >= 4.5);
        assert.equal(onColor('#e8d5b7'), '#17171a');
        assert.equal(onColor('#2d6a64'), '#f4f1ea');
        assert.equal(readableInk('#2a1a12', '#16130f'), '#f4f1ea');
        assert.equal(readableInk('#17171a', '#f7f1e8'), '#17171a');
        const cafe = contrastTokens({ base: '#2b1d14', destaque: '#e8d5b7', secundaria: '#7a8a99' }, '#f7f1e8');
        assert.ok(contrastRatio(cafe.ink, cafe.bg) >= 4.5);
        assert.ok(contrastRatio(cafe.onAccent, cafe.accent) >= 4.5);
        const rest = contrastTokens({ base: '#2a1a12', destaque: '#c9a24b', secundaria: '#2a2419' }, '#16130f');
        assert.ok(contrastRatio(rest.ink, rest.bg) >= 4.5);
        assert.ok(contrastRatio(rest.onAccent, rest.accent) >= 4.5);
    });

    it('passes the north-star: hide photos and the page still has type, colour and icons', () => {
        slugs.forEach((slug) => {
            const html = fs.readFileSync(path.join(root, `${slug}-sem-fotos.html`), 'utf8');
            const stripped = html
                .replace(/<div\b[^>]*data-dp-photo[\s\S]*?<\/div>/gi, '')
                .replace(/<img\b[^>]*>/gi, '');
            assert.match(stripped, /<h1[\s>]/);
            assert.match(stripped, /dpl-btn|dpl-card|dpl-stat|dpl-quote|dpl-menu/);
            assert.match(stripped, /<svg[\s>]/);
            assert.doesNotMatch(stripped, /background-image:\s*url\(\s*\)/);
        });
    });

    it('fills Sem fotos from demo, not baked café prices', () => {
        const type = JSON.parse(fs.readFileSync(
            path.join(__dirname, '../../server/config/business-types/cafe-pastelaria.json'),
            'utf8'
        ));
        const html = fs.readFileSync(path.join(root, 'cafe-pastelaria-sem-fotos.html'), 'utf8');
        const out = visual.fillBoilerplateCopy(html, {
            nome_negocio: 'Pastelaria do Luís',
            cidade: 'Porto',
            principais_servicos: 'Nata caseira, Bolo da casa'
        }, type);
        assert.match(out, /Nata caseira/);
        assert.match(out, /Bolo da casa/);
        assert.match(out, /Pastelaria do Luís/);
        assert.doesNotMatch(out, /1,10\s*€/);
        assert.doesNotMatch(out, />Rissol</);
        assert.match(out, /data-dp-copy="hero.titulo"/);
        assert.match(out, /O café da manhã|Pastelaria do Luís|café/i);
        assert.match(out, /dpl-kicker/);
        assert.match(out, /Porto/);
        assert.match(out, /data-dp-label="avaliacoes"/);
        assert.match(out, /Ver especialidades/);
    });

    it('fills hero and quotes from demo_seed when dados omit them', () => {
        const type = JSON.parse(fs.readFileSync(
            path.join(__dirname, '../../server/config/business-types/cafe-pastelaria.json'),
            'utf8'
        ));
        const html = fs.readFileSync(path.join(root, 'cafe-pastelaria-sem-fotos.html'), 'utf8');
        const out = visual.fillBoilerplateCopy(html, { nome_negocio: 'Casa da Vila', cidade: 'Póvoa' }, type);
        assert.match(out, /Casa da Vila/);
        assert.match(out, /O café da manhã, aqui ao lado/);
        assert.match(out, /Inês|A nata ainda quente/);
    });

    it('does not keep a fabricated price column when preco is empty', () => {
        const html = `<ol data-dp-list="servicos"><li data-dp-item hidden><strong data-dp-copy="servico.nome"></strong><span class="dpl-menu-price" data-dp-copy="servico.preco"></span></li></ol>`;
        const type = {
            demo_seed: { servicos_itens: [{ nome: 'Café', descricao: 'Galão' }] }
        };
        const out = visual.fillBoilerplateCopy(html, { nome_negocio: 'X' }, type);
        assert.match(out, /Café/);
        assert.doesNotMatch(out, /dpl-menu-price/);
        assert.doesNotMatch(out, /€/);
    });

    it('uses a services accordion in the explanation-heavy categories', () => {
        ['clinica-estetica', 'drogaria-ferragens', 'mecanico-automovel', 'tapecaria'].forEach((slug) => {
            const html = fs.readFileSync(path.join(root, `${slug}-sem-fotos.html`), 'utf8');
            assert.match(html, /<ul class="dpl-acc" data-dp-list="servicos">/, slug);
            assert.match(html, /<li class="dpl-acc-item" data-dp-item hidden>/, slug);
            assert.match(html, /<details>\s*<summary>/, slug);
            assert.doesNotMatch(html, /dpl-row|dpl-tile\b|dpl-menu-list/, `${slug} kept old service markup`);
        });
    });

    it('fills the accordion with one real description per service', () => {
        const type = JSON.parse(fs.readFileSync(
            path.join(__dirname, '../../server/config/business-types/clinica-estetica.json'),
            'utf8'
        ));
        const html = fs.readFileSync(path.join(root, 'clinica-estetica-sem-fotos.html'), 'utf8');
        const out = visual.fillBoilerplateCopy(html, { nome_negocio: 'Atelier Teste', cidade: 'Braga' }, type);
        assert.match(out, /Consulta de estética/);
        assert.match(out, /Avaliação da pele/);
        assert.equal((out.match(/class="dpl-acc-item"/g) || []).length, 6);
        assert.equal((out.match(/dpl-acc-body/g) || []).length, 6);
        assert.doesNotMatch(out, /dpl-menu-price/);
    });

    it('never echoes the typed service list as a per-service description', () => {
        const type = JSON.parse(fs.readFileSync(
            path.join(__dirname, '../../server/config/business-types/mecanico-automovel.json'),
            'utf8'
        ));
        const html = fs.readFileSync(path.join(root, 'mecanico-automovel-sem-fotos.html'), 'utf8');
        const out = visual.fillBoilerplateCopy(
            html,
            { nome_negocio: 'Oficina Teste', principais_servicos: 'Chapa e pintura, Pneus' },
            type
        );
        assert.match(out, /Chapa e pintura/);
        assert.match(out, /Pneus/);
        assert.doesNotMatch(out, /Chapa e pintura, Pneus/);
        const bodies = (out.match(/dpl-acc-body/g) || []).length;
        assert.ok(bodies < 3, `typed services invented ${bodies} descriptions`);
    });

    it('only allows named text-align classes in boilerplate CSS and HTML', () => {
        slugs.forEach((slug) => {
            const css = fs.readFileSync(path.join(root, 'css', `${slug}.css`), 'utf8');
            const html = fs.readFileSync(path.join(root, `${slug}-sem-fotos.html`), 'utf8');
            const cssHits = css.match(/text-align\s*:/g) || [];
            assert.equal(cssHits.length, 0, `${slug}.css has text-align`);
            assert.doesNotMatch(html, /style="[^"]*text-align/);
        });
        const base = fs.readFileSync(path.join(root, 'css/dpl-base.css'), 'utf8');
        const named = [...base.matchAll(/([^{}]*)\{\s*[^}]*text-align/g)].map((m) => m[1].trim());
        named.forEach((sel) => {
            assert.match(sel, /dpl-hero--centered|dpl-tile--centered/, sel);
        });
    });

    it('computes accent-ink that reads on paper for failing palettes', async () => {
        const { contrastRatio, contrastTokens } = await import(
            pathToFileURL(path.join(__dirname, '../../digitalizept/js/demo/colors.js')).href
        );
        const clinica = contrastTokens({ base: '#2B2B28', destaque: '#9CAA8C', secundaria: '#D8CDBF' }, '#FAF8F4');
        assert.ok(contrastRatio(clinica.accentInk, clinica.bg) >= 4.5);
        assert.ok(contrastRatio(clinica.accent2Ink, clinica.bg) >= 4.5);
        const cafe = contrastTokens({ base: '#2B211B', destaque: '#C1622D', secundaria: '#8A5A34' }, '#F7F1E8');
        assert.ok(contrastRatio(cafe.accentInk, cafe.bg) >= 4.5);
        assert.ok(contrastRatio(cafe.onAccent, cafe.accentSolid) >= 4.5);
    });
});

describe('digitalizept wizard chrome', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const appCss = fs.readFileSync(
        path.join(__dirname, '../../digitalizept/digitalizept.css'), 'utf8'
    );
    const adminCss = fs.readFileSync(
        path.join(__dirname, '../../digitalizept/admin.css'), 'utf8'
    );

    // An undefined custom property silently falls back to its second argument, which is
    // how the follow-up buttons ended up white inside the dark wizard. The wizard may also
    // read boilerplate tokens, which the demo's own stylesheet declares.
    it('defines every custom property the wizard stylesheet consumes', () => {
        const baseCss = fs.readFileSync(
            path.join(__dirname, '../../digitalizept/boilerplates/css/dpl-base.css'), 'utf8'
        );
        const used = new Set(
            [...appCss.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1])
        );
        const declared = new Set(
            [...`${appCss}\n${adminCss}\n${baseCss}`.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)]
                .map((m) => m[1])
        );
        const missing = [...used].filter((name) => !declared.has(name));
        assert.deepEqual(missing, [], `undefined tokens: ${missing.join(', ')}`);
    });

    it('re-points the shared surface tokens for the light admin theme', () => {
        ['--surface-color', '--surface-muted', '--border-color', '--text-color', '--muted-color', '--accent-strong']
            .forEach((token) => {
                assert.match(appCss, new RegExp(`${token}:`), `${token} missing from the wizard`);
                assert.match(adminCss, new RegExp(`${token}:`), `${token} missing from admin`);
            });
    });

    it('never paints follow-up chrome with a hardcoded white fallback', () => {
        const followup = appCss.slice(appCss.indexOf('.followup-share'), appCss.indexOf('.demo-live-stack'));
        assert.doesNotMatch(followup, /#fff\b|#ffffff\b/i);
    });

    it('revalidates boilerplate fetches so a regenerated template is not served stale', () => {
        const visualJs = fs.readFileSync(
            path.join(__dirname, '../../digitalizept/js/demo/demo-visual.js'), 'utf8'
        );
        assert.doesNotMatch(visualJs, /force-cache'/);
        assert.match(visualJs, /cache: 'no-cache'/);
        assert.match(visualJs, /export function clearBoilerplateCache/);
        const demoStep = fs.readFileSync(
            path.join(__dirname, '../../digitalizept/js/steps/demo.js'), 'utf8'
        );
        assert.match(demoStep, /clearBoilerplateCache\(\)/, 'Atualizar demo must drop the cache');
    });
});
