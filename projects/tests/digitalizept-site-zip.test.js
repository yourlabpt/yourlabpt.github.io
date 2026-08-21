const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const appDir = path.join(__dirname, '..', '..', 'digitalizept', 'js');
const cssPath = path.join(__dirname, '..', '..', 'digitalizept', 'digitalizept.css');

const PNG_1X1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('digitalizept standalone website zip', async () => {
    const zipMod = await import(pathToFileURL(path.join(appDir, 'demo', 'site-zip.js')).href);

    function sampleState() {
        return {
            data: {
                dados: { nome_negocio: 'Oficina dos Rissóis', cidade: 'Porto' },
                identidade: {
                    cores: { base: '#7A1F2B', destaque: '#F4C430', secundaria: '#F5EFE0' },
                    logo: { tipo: 'upload', dataUrl: PNG_1X1 },
                    fotos: [PNG_1X1]
                },
                demoHtml: `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<title>Oficina dos Rissóis</title>
<link rel="stylesheet" href="/digitalizept/digitalizept.css">
</head>
<body>
<img class="brand" src="dp-logo://" alt="logo">
<img src="dp-photo://0" alt="prato">
</body>
</html>`
            }
        };
    }

    it('extracts only the landing CSS between export markers', () => {
        const css = fs.readFileSync(cssPath, 'utf8');
        const extracted = zipMod.extractLandingCss(css);
        assert.match(extracted, /\.dp-landing\s*\{/);
        assert.match(extracted, /\.dpl-topbar/);
        assert.equal(extracted.includes('.svc-list'), false);
        assert.equal(extracted.includes('.app-header'), false);
        assert.equal(extracted.includes(zipMod.SITE_CSS_START), false);
    });

    it('builds a zip of a standalone site without embedding camera JPEGs or storing it on disk', () => {
        const landingCss = zipMod.extractLandingCss(fs.readFileSync(cssPath, 'utf8'));
        const { folder, files } = zipMod.buildStandaloneWebsiteFiles(sampleState(), { landingCss });
        assert.equal(folder, 'Oficina_dos_Rissois-website');
        assert.match(files['index.html'], /assets\/logo\.png/);
        assert.match(files['index.html'], /assets\/foto-0\.png/);
        assert.match(files['index.html'], /css\/site\.css/);
        assert.equal(/data:image\/|base64,/i.test(files['index.html']), false);
        assert.equal(files['index.html'].includes('/digitalizept/digitalizept.css'), false);
        assert.match(files['css/site.css'], /--base:\s*#7A1F2B/);
        assert.match(files['css/site.css'], /\.dp-landing/);
        assert.match(files['server.mjs'], /localhost/);
        assert.match(files['package.json'], /"start": "node server\.mjs"/);
        assert.match(files['README.md'], /VER NO WINDOWS/);
        assert.match(files['README.md'], /ver-no-windows\.bat/);
        assert.match(files['README.md'], /app\.netlify\.com\/drop/);
        assert.match(files['README.md'], /Amen/);
        assert.match(files['LEIA-ME.txt'], /PÔR O SITE NA INTERNET/);
        assert.match(files['ver-no-windows.bat'], /index\.html/);
        assert.ok(files['assets/logo.png'] instanceof Uint8Array);
        assert.ok(files['assets/foto-0.png'].length > 20);

        const bytes = zipMod.packZip(files, { root: folder });
        assert.equal(bytes[0], 0x50);
        assert.equal(bytes[1], 0x4b);
        const asText = Buffer.from(bytes).toString('latin1');
        assert.match(asText, /Oficina_dos_Rissois-website\/index\.html/);
        assert.match(asText, /Oficina_dos_Rissois-website\/server\.mjs/);
        assert.equal(asText.includes('data:image/png;base64'), false);
    });

    it('serves the unpacked site with the bundled Node server', () => {
        const { folder, files } = zipMod.buildStandaloneWebsiteFiles(sampleState(), { landingCss: '.dp-landing{color:red}' });
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-site-zip-'));
        const root = path.join(tmp, folder);
        try {
            Object.entries(files).forEach(([rel, content]) => {
                const dest = path.join(root, rel);
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.writeFileSync(dest, content);
            });
            const child = spawnSync(process.execPath, ['--check', path.join(root, 'server.mjs')], {
                encoding: 'utf8'
            });
            assert.equal(child.status, 0, child.stderr || child.stdout);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
