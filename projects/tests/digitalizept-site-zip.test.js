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

    function sampleState(extra = {}) {
        return {
            data: {
                dados: { nome_negocio: 'Oficina dos Rissóis', cidade: 'Porto' },
                identidade: {
                    cores: { base: '#7A1F2B', destaque: '#F4C430', secundaria: '#F5EFE0' },
                    logo: { tipo: 'upload', dataUrl: PNG_1X1 },
                    fotos: [PNG_1X1],
                    ...(extra.identidade || {})
                },
                demoHtml: extra.demoHtml || `<!DOCTYPE html>
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
        assert.equal(extracted.includes('.dpl-demo-switch'), false);
        assert.equal(extracted.includes(zipMod.SITE_CSS_START), false);
    });

    it('builds an organized client package with localhost scripts and domain playbook', () => {
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

        assert.match(files['scripts/server.mjs'], /localhost/);
        assert.match(files['scripts/abrir-localhost.bat'], /server\.mjs/);
        assert.match(files['scripts/abrir-localhost.command'], /server\.mjs/);
        assert.match(files['scripts/abrir-localhost.sh'], /server\.mjs/);
        assert.match(files['package.json'], /"start": "node scripts\/server\.mjs"/);

        assert.match(files['COMECE-AQUI.txt'], /COMECE AQUI/);
        assert.match(files['COMECE-AQUI.txt'], /abrir-localhost/);
        assert.match(files['docs/01-ver-no-computador.txt'], /localhost:4173/);
        assert.match(files['docs/02-ligar-o-dominio.txt'], /app\.netlify\.com\/drop/);
        assert.match(files['docs/02-ligar-o-dominio.txt'], /nameserver/i);
        assert.match(files['docs/02-ligar-o-dominio.txt'], /Amen/);
        assert.match(files['docs/03-alterar-textos-e-fotos.txt'], /assets\//);
        assert.match(files['LEIA-ME.txt'], /Pôr na Internet|PÔR NA INTERNET|ligar o domínio|LIGAR O SEU DOMÍNIO/i);
        assert.ok(files['assets/logo.png'] instanceof Uint8Array);
        assert.ok(files['assets/foto-0.png'].length > 20);
        assert.match(files['assets/LEIA-ME.txt'], /logo/);

        const bytes = zipMod.packZip(files, { root: folder });
        assert.equal(bytes[0], 0x50);
        assert.equal(bytes[1], 0x4b);
        const asText = Buffer.from(bytes).toString('latin1');
        assert.match(asText, /Oficina_dos_Rissois-website\/index\.html/);
        assert.match(asText, /Oficina_dos_Rissois-website\/scripts\/server\.mjs/);
        assert.match(asText, /Oficina_dos_Rissois-website\/docs\/02-ligar-o-dominio\.txt/);
        assert.equal(asText.includes('data:image/png;base64'), false);
    });

    it('extracts leftover inline images into assets instead of deleting them', () => {
        // Different bytes from identidade.fotos[0] so compactHtmlForAi maps it to dp-photo://x
        const otherPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
        const state = sampleState({
            demoHtml: `<!DOCTYPE html><html><head><title>X</title></head>
<body><img src="${otherPng}" alt="inline"><img src="dp-photo://0"></body></html>`
        });
        const { files } = zipMod.buildStandaloneWebsiteFiles(state, { landingCss: '' });
        assert.equal(/data:image\/|base64,/i.test(files['index.html']), false);
        assert.match(files['index.html'], /assets\/(extra|foto)-/);
        const extras = Object.keys(files).filter((k) => k.startsWith('assets/extra-'));
        assert.ok(extras.length >= 1, 'inline image should become assets/extra-*');
        assert.ok(files[extras[0]] instanceof Uint8Array);
        assert.match(files['index.html'], new RegExp(extras[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });

    it('keeps a placeholder reference image when a photo slot has no data URL', () => {
        const state = sampleState({
            identidade: {
                cores: { base: '#111', destaque: '#222', secundaria: '#333' },
                logo: { tipo: 'nenhum' },
                fotos: ['https://example.com/not-a-data-url.jpg']
            },
            demoHtml: `<!DOCTYPE html><html><body><img src="dp-photo://0" alt="x"><img src="dp-logo://"></body></html>`
        });
        const { files } = zipMod.buildStandaloneWebsiteFiles(state, { landingCss: '' });
        assert.ok(files['assets/foto-0.svg'] instanceof Uint8Array);
        assert.match(files['index.html'], /assets\/foto-0\.svg/);
        assert.ok(files['assets/logo.svg'] instanceof Uint8Array);
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
            const child = spawnSync(process.execPath, ['--check', path.join(root, 'scripts', 'server.mjs')], {
                encoding: 'utf8'
            });
            assert.equal(child.status, 0, child.stderr || child.stdout);
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });
});
