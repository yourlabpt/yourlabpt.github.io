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
        interpolate
    } = await import('../../digitalizept/js/demo/boilerplate.js');
    const { seedDemoFromType } = await import('../../digitalizept/js/demo/seed.js');

    it('prefers a pasted Maps URL over a search query', () => {
        assert.equal(
            mapsHref({ maps_url: 'https://maps.app.goo.gl/abc', morada: 'Rua 1', cidade: 'Porto' }),
            'https://maps.app.goo.gl/abc'
        );
        assert.match(mapsHref({ morada: 'Rua Augusta 12', cidade: 'Lisboa' }), /google\.com\/maps/);
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
});
