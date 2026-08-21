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
});
