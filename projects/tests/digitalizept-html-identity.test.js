const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('node:url');

const { sanitizeDemoHtml } = require('../../server/lib/sanitize-demo-html');

const appDir = path.join(__dirname, '..', '..', 'digitalizept', 'js');

describe('digitalizept HTML identity overlay', async () => {
    const htmlMod = await import(pathToFileURL(path.join(appDir, 'demo', 'html.js')).href);
    const { extractHtml, stripInjectedIdentity, clipDemoHtml, DEMO_HTML_MAX } = htmlMod;

    const original = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><title>Pi</title><style>header{color:red}</style></head>
<body>
<header class="hero">Pi</header>
<main><section>O resto da história</section></main>
<footer>contacto</footer>
</body>
</html>`;

    const bloated = `${original.slice(0, original.indexOf('</header>') + 9)}<div data-dp-photos=""><img src="data:image/jpeg;base64,${'A'.repeat(12000)}"></div>
<main><section>O resto da história</section></main>
<footer>contacto</footer>
</body>
</html>`.replace('<style>header{color:red}</style>', '<style>header{color:red}</style><style data-dp-identity="">:root{--base:#000}[data-dp-photos]{display:flex}</style>');

    const truncated = bloated.slice(0, bloated.indexOf('<div data-dp-photos') + 55) + 'AAAA';

    it('strips a closed photo strip and keeps the rest of the page', () => {
        const out = extractHtml(bloated);
        assert.equal(out.includes('data-dp-photos'), false);
        assert.equal(out.includes('data-dp-identity'), false);
        assert.match(out, /O resto da história/);
        assert.match(out, /<header class="hero">Pi<\/header>/);
        assert.doesNotMatch(out, /A{100}/);
    });

    it('drops a truncated photo strip instead of leaving a broken document', () => {
        const out = extractHtml(truncated);
        assert.equal(out.includes('data-dp-photos'), false);
        assert.match(out, /<header class="hero">Pi<\/header>/);
        assert.match(out, /<\/html>/i);
        assert.doesNotMatch(out, /A{20}/);
    });

    it('does not slice a normal page down to 900 KB', () => {
        const out = clipDemoHtml(extractHtml(original));
        assert.match(out, /O resto da história/);
        assert.ok(out.length < DEMO_HTML_MAX);
    });

    it('server sanitize also removes injected photos before storage', () => {
        const out = sanitizeDemoHtml(bloated);
        assert.equal(out.includes('data-dp-photos'), false);
        assert.equal(out.includes('data-dp-identity'), false);
        assert.match(out, /O resto da história/);
    });

    it('stripInjectedIdentity is idempotent on clean HTML', () => {
        const once = stripInjectedIdentity(original);
        const twice = stripInjectedIdentity(once);
        assert.equal(once, twice);
        assert.match(twice, /O resto da história/);
    });

    it('compacts camera photos to placeholders and restores the same slots', () => {
        const { compactHtmlForAi, restoreHtmlPlaceholders } = htmlMod;
        const foto0 = `data:image/jpeg;base64,${'A'.repeat(80)}`;
        const foto1 = `data:image/jpeg;base64,${'B'.repeat(80)}`;
        const logo = `data:image/png;base64,${'C'.repeat(40)}`;
        const identidade = {
            logo: { tipo: 'upload', dataUrl: logo },
            fotos: [foto0, foto1]
        };
        const bulky = `<!DOCTYPE html><html><body>
<img class="hero" src="${foto0}">
<div style="background-image:url(${foto1})"></div>
<img class="brand" src="${logo}">
</body></html>`;
        const compact = compactHtmlForAi(bulky, identidade);
        assert.ok(compact.length < bulky.length);
        assert.equal(compact.includes('base64'), false);
        assert.match(compact, /dp-photo:\/\/0/);
        assert.match(compact, /dp-photo:\/\/1/);
        assert.match(compact, /dp-logo:\/\//);
        assert.match(compact, /data-dp-photo="0"/);

        const restored = restoreHtmlPlaceholders(compact, identidade);
        assert.ok(restored.includes(foto0));
        assert.ok(restored.includes(foto1));
        assert.ok(restored.includes(logo));
        assert.equal(restored.includes('dp-photo://'), false);
    });

    it('keeps an AI-moved photo slot when compacting unknown leftover data URLs', () => {
        const { compactHtmlForAi, restoreHtmlPlaceholders, buildHtmlChangePrompt } = htmlMod;
        const foto0 = `data:image/jpeg;base64,${'D'.repeat(60)}`;
        const identidade = { fotos: [foto0], logo: { tipo: 'nenhum' }, cores: { base: '#111', destaque: '#aaa', secundaria: '#ccc' } };
        const pasted = `<html><body><section class="gallery"><img src="dp-photo://0" alt="loja"></section>
<img src="data:image/jpeg;base64,${'Z'.repeat(50)}"></body></html>`;
        const compact = compactHtmlForAi(pasted, identidade);
        assert.match(compact, /dp-photo:\/\/0/);
        assert.match(compact, /dp-photo:\/\/x/);
        assert.equal(compact.includes('ZZZZ'), false);
        const restored = restoreHtmlPlaceholders(compact, identidade);
        assert.ok(restored.includes(foto0));
        assert.doesNotMatch(restored, /dp-photo:\/\/0/);

        const prompt = buildHtmlChangePrompt({
            data: { businessType: { nome: 'Café' }, dados: { nome_negocio: 'Central' }, identidade }
        }, bulkyPromptHtml(foto0), '');
        assert.equal(prompt.includes(foto0), false);
        assert.match(prompt, /dp-photo:\/\/0/);
    });

    it('strips wrapped, charset and unmatched camera JPEGs from the AI prompt', () => {
        const { compactHtmlForAi, htmlForAi, buildHtmlChangePrompt } = htmlMod;
        const jpeg = `data:image/jpeg;base64,/9j/${'A+/'.repeat(300)}==`;
        const wrapped = `data:image/jpeg;base64,${'Ab'.repeat(40)}\n${'Cd'.repeat(40)}`;
        const charset = `data:image/png;charset=utf-8;base64,${'E'.repeat(80)}`;
        const identidade = {
            logo: { tipo: 'upload', dataUrl: jpeg },
            fotos: [wrapped],
            cores: { base: '#7a1f2b', destaque: '#f4c430', secundaria: '#f5efe0' }
        };
        const bulky = `<!DOCTYPE html><html><body>
<img class="dpl-topbar-logo" src="${jpeg}" alt="">
<div style="background-image:url(${wrapped})"></div>
<img src="${charset}">
</body></html>`;
        const compact = compactHtmlForAi(bulky, identidade);
        assert.equal(/data:image\/|base64,/i.test(compact), false);
        assert.match(compact, /dp-logo:\/\//);
        assert.match(compact, /dp-photo:\/\/0/);
        assert.match(compact, /dp-photo:\/\/x/);

        const state = {
            data: {
                businessType: { nome: 'Restaurante' },
                dados: { nome_negocio: 'Oficina dos Rissóis' },
                identidade,
                demoHtml: bulky
            }
        };
        const forAi = htmlForAi(state);
        assert.equal(/data:image\/|base64,/i.test(forAi), false);
        const prompt = buildHtmlChangePrompt(state, forAi, 'mais rissóis');
        assert.equal(/data:image\/|base64,/i.test(prompt), false);
        assert.match(prompt, /dp-logo:\/\//);
        assert.match(prompt, /mais rissóis/);
    });

    it('unlocks html/body scroll so a demo cannot freeze on the bottom buttons', () => {
        const locked = `<!DOCTYPE html><html><head><style>html,body{height:100%;overflow:hidden}</style></head>
<body><header>Hero</header><main>Conteúdo</main></body></html>`;
        const out = extractHtml(locked);
        const lastStyle = out.match(/<style data-dp-fix>[\s\S]*?<\/style>/g);
        assert.ok(lastStyle && lastStyle.length === 1);
        assert.match(lastStyle[0], /overflow-y:\s*auto/);
        assert.match(lastStyle[0], /height:\s*auto/);
        assert.match(out, /<\/style><\/body>/);
        const stale = extractHtml(out.replace('height:auto', 'height:100%'));
        assert.match(stale, /height:\s*auto/);
        assert.equal((stale.match(/data-dp-fix/g) || []).length, 1);
    });
});

function bulkyPromptHtml(foto0) {
    return `<html><body><img src="${foto0}"></body></html>`;
}
