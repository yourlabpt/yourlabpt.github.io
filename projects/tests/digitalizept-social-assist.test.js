const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let googleSearchUrl;
let businessSearchQuery;
let facebookOpenUrl;
let facebookPagesSearchUrl;
let facebookMarketplaceSearchUrl;
let facebookPlacesOrPagesQuery;
let facebookWebSearchUrl;
let googleMapsSearchUrl;
let businessTypeDiscoveryLinks;
let instagramOpenUrl;
let googleBusinessSocialSearchUrl;
let copySearchQuery;

before(async () => {
    const mod = await import(pathToFileURL(
        path.join(__dirname, '..', '..', 'digitalizept', 'js', 'social-assist.js')
    ).href);
    googleSearchUrl = mod.googleSearchUrl;
    businessSearchQuery = mod.businessSearchQuery;
    facebookOpenUrl = mod.facebookOpenUrl;
    facebookPagesSearchUrl = mod.facebookPagesSearchUrl;
    facebookMarketplaceSearchUrl = mod.facebookMarketplaceSearchUrl;
    facebookPlacesOrPagesQuery = mod.facebookPlacesOrPagesQuery;
    facebookWebSearchUrl = mod.facebookWebSearchUrl;
    googleMapsSearchUrl = mod.googleMapsSearchUrl;
    businessTypeDiscoveryLinks = mod.businessTypeDiscoveryLinks;
    instagramOpenUrl = mod.instagramOpenUrl;
    googleBusinessSocialSearchUrl = mod.googleBusinessSocialSearchUrl;
    copySearchQuery = mod.copySearchQuery;
});

describe('digitalizept social-assist', () => {
    it('builds a Google search URL', () => {
        const url = googleSearchUrl('"Quinta do Olival" Amarante facebook');
        assert.match(url, /^https:\/\/www\.google\.com\/search\?q=/);
        assert.match(url, /Quinta/);
        assert.equal(googleSearchUrl(''), '');
    });

    it('builds a business search query with quoted name', () => {
        assert.equal(
            businessSearchQuery('Quinta do Olival', 'Amarante', 'facebook'),
            '"Quinta do Olival" Amarante facebook'
        );
        assert.equal(businessSearchQuery('Só Nome', '', ''), '"Só Nome"');
    });

    it('opens a direct Facebook URL when stored', () => {
        assert.equal(
            facebookOpenUrl('https://www.facebook.com/quintadoolival', { nome: 'X' }),
            'https://www.facebook.com/quintadoolival'
        );
        assert.equal(
            facebookOpenUrl('facebook.com/loja', {}),
            'https://facebook.com/loja'
        );
        assert.equal(
            facebookOpenUrl('@minhaloja', {}),
            'https://www.facebook.com/minhaloja'
        );
    });

    it('falls back to Google site:facebook.com when no FB value', () => {
        const url = facebookOpenUrl('', { nome: 'Quinta do Olival', cidade: 'Amarante' });
        assert.match(url, /google\.com\/search/);
        assert.match(decodeURIComponent(url), /site:facebook\.com/);
        assert.match(decodeURIComponent(url), /Quinta do Olival/);
    });

    it('opens Instagram handle or falls back to site search', () => {
        assert.equal(
            instagramOpenUrl('@quintadoolival', {}),
            'https://www.instagram.com/quintadoolival/'
        );
        assert.equal(
            instagramOpenUrl('https://instagram.com/loja', {}),
            'https://instagram.com/loja'
        );
        const fallback = instagramOpenUrl('', { nome: 'Loja X', cidade: 'Porto' });
        assert.match(fallback, /google\.com\/search/);
        assert.match(decodeURIComponent(fallback), /site:instagram\.com/);
    });

    it('builds combined Google social search and copy query', () => {
        const url = googleBusinessSocialSearchUrl('Café Central', 'Braga');
        assert.match(url, /google\.com\/search/);
        assert.match(decodeURIComponent(url), /facebook OR instagram/);
        assert.equal(
            copySearchQuery('Café Central', 'Braga'),
            '"Café Central" Braga facebook OR instagram'
        );
    });

    it('builds Porto Facebook pages and Marketplace deep-links', () => {
        const pages = facebookPagesSearchUrl({ nome: 'Talho da Costa', cidade: '' });
        assert.match(pages, /google\.com\/search/);
        assert.match(decodeURIComponent(pages), /Talho da Costa/);
        assert.match(decodeURIComponent(pages), /Porto/);
        assert.match(decodeURIComponent(pages), /site:facebook\.com/);

        const market = facebookMarketplaceSearchUrl({ cidade: 'Porto', query: 'cabeleireiro' });
        assert.match(market, /facebook\.com\/marketplace\/porto\/search/);
        assert.match(decodeURIComponent(market), /cabeleireiro/);

        const web = facebookWebSearchUrl({ nome: 'Loja X', cidade: 'Braga' });
        assert.match(web, /facebook\.com\/search\/top/);
        assert.match(decodeURIComponent(web), /Loja X/);

        assert.equal(
            facebookPlacesOrPagesQuery('Quinta do Olival', ''),
            '"Quinta do Olival" Porto site:facebook.com'
        );
    });

    it('builds Maps and type discovery links for Porto', () => {
        const maps = googleMapsSearchUrl({ query: 'cabeleireiro', cidade: '' });
        assert.match(maps, /google\.com\/maps\/search/);
        assert.match(decodeURIComponent(maps), /cabeleireiro/);
        assert.match(decodeURIComponent(maps), /Porto/);

        const pack = businessTypeDiscoveryLinks({
            id: 'salao-beleza',
            nome: 'Salão de Beleza',
            palavras_chave: ['cabeleireiro', 'salão']
        }, '');
        assert.equal(pack.cidade, 'Porto');
        assert.match(pack.query, /cabeleireiro/);
        assert.match(pack.query, /Porto/);
        assert.match(pack.maps, /maps\/search/);
        assert.match(decodeURIComponent(pack.facebook), /site:facebook/);
        assert.match(pack.marketplace, /marketplace/);
    });
});
