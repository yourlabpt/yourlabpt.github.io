const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let googleSearchUrl;
let businessSearchQuery;
let facebookOpenUrl;
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
});
