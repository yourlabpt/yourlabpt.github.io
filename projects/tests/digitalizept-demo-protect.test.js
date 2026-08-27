const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('node:url');
const {
    WATERMARK,
    DEMO_IFRAME_SANDBOX,
    injectProtectIntoHtml,
    isSellerCookie
} = require('../../server/lib/digitalizept-demo-protect');

describe('digitalizept demo protect', () => {
    it('detects the seller cookie', () => {
        assert.equal(isSellerCookie('digitalizept_seller=1'), true);
        assert.equal(isSellerCookie('foo=1; digitalizept_seller=1; bar=2'), true);
        assert.equal(isSellerCookie('digitalizept_seller=0'), false);
        assert.equal(isSellerCookie(''), false);
    });

    it('keeps popup permissions so client CTAs can leave the iframe', () => {
        assert.match(DEMO_IFRAME_SANDBOX, /allow-popups/);
        assert.match(DEMO_IFRAME_SANDBOX, /allow-popups-to-escape-sandbox/);
        assert.match(DEMO_IFRAME_SANDBOX, /allow-scripts/);
    });

    it('injects protect style, script and watermark into HTML', () => {
        const html = `<!DOCTYPE html><html><head><title>X</title></head><body><img src="a.jpg"><a href="https://wa.me/351912345678">WhatsApp</a><p>Olá</p></body></html>`;
        const out = injectProtectIntoHtml(html);
        assert.match(out, /data-dp-protect/);
        assert.match(out, /dp-protect-wm/);
        assert.match(out, new RegExp(WATERMARK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.match(out, /pointer-events:auto/);
        assert.doesNotMatch(out, /html\.dp-protect svg\{[^}]*pointer-events:none/);
        assert.match(out, /<\/head>/i);
        assert.match(out, /<\/body>/i);
        assert.equal(injectProtectIntoHtml(out), out);
    });

    it('mirrors protect helpers in the browser module', async () => {
        const mod = await import(pathToFileURL(
            path.join(__dirname, '../../digitalizept/js/demo/protect-demo.js')
        ).href);
        assert.equal(mod.WATERMARK, WATERMARK);
        assert.equal(mod.DEMO_IFRAME_SANDBOX, DEMO_IFRAME_SANDBOX);
        const out = mod.injectProtectIntoHtml('<html><body>Hi</body></html>');
        assert.match(out, /data-dp-protect/);
        assert.match(out, /dp-protect-wm/);
    });

    it('preview iframe uses the popup-friendly sandbox', async () => {
        const htmlMod = await import(pathToFileURL(
            path.join(__dirname, '../../digitalizept/js/demo/html.js')
        ).href);
        const src = require('fs').readFileSync(
            path.join(__dirname, '../../digitalizept/js/demo/html.js'),
            'utf8'
        );
        assert.match(src, /DEMO_IFRAME_SANDBOX/);
        assert.equal(typeof htmlMod.mountHtmlPreview, 'function');
    });

    it('guards boilerplates and samples in server.js', () => {
        const fs = require('fs');
        const server = fs.readFileSync(
            path.join(__dirname, '../../server/server.js'),
            'utf8'
        );
        assert.match(server, /app\.use\('\/digitalizept\/boilerplates',\s*sellerAssetGuard\)/);
        assert.match(server, /app\.use\('\/digitalizept\/samples',\s*sellerAssetGuard\)/);
        assert.match(server, /isSellerCookie\(req\.get\('cookie'\)/);
    });

    it('public shell only mounts the demo switch for sellers', () => {
        const fs = require('fs');
        const publicHtml = fs.readFileSync(
            path.join(__dirname, '../../digitalizept/public.html'),
            'utf8'
        );
        assert.match(publicHtml, /isSellerBrowser/);
        assert.match(publicHtml, /installShellProtect/);
        assert.match(publicHtml, /protect/);
        assert.match(publicHtml, /if \(!seller\)/);
        assert.match(publicHtml, /mountDemoSwitch/);
    });
});
