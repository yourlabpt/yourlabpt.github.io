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
