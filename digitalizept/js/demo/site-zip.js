import { applyIdentityToHtml, currentDemoHtml } from './html.js';

export const SITE_CSS_START = '/* dp-site-export-start */';
export const SITE_CSS_END = '/* dp-site-export-end */';

const STYLESHEET_HREF = 'css/site.css';

const MIME_EXT = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/avif': 'avif'
};

function siteSlug(nome) {
    return String(nome || 'website')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 60) || 'website';
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[n] = c >>> 0;
}

function utf8(text) {
    return new TextEncoder().encode(String(text || ''));
}

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function u16(value) {
    const b = new Uint8Array(2);
    b[0] = value & 0xff;
    b[1] = (value >>> 8) & 0xff;
    return b;
}

function u32(value) {
    const b = new Uint8Array(4);
    b[0] = value & 0xff;
    b[1] = (value >>> 8) & 0xff;
    b[2] = (value >>> 16) & 0xff;
    b[3] = (value >>> 24) & 0xff;
    return b;
}

function concatBytes(chunks) {
    const total = chunks.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((part) => {
        out.set(part, offset);
        offset += part.length;
    });
    return out;
}

function asBytes(content) {
    if (content instanceof Uint8Array) return content;
    if (content instanceof ArrayBuffer) return new Uint8Array(content);
    return utf8(content);
}

export function packZip(files, { root = '' } = {}) {
    const prefix = root ? `${String(root).replace(/\/+$/, '')}/` : '';
    const locals = [];
    const centrals = [];
    let offset = 0;

    Object.keys(files).sort().forEach((name) => {
        const rel = `${prefix}${String(name).replace(/^\/+/, '')}`.replace(/\\/g, '/');
        const data = asBytes(files[name]);
        const filename = utf8(rel);
        const crc = crc32(data);
        const local = concatBytes([
            u32(0x04034b50),
            u16(20),
            u16(0x0800),
            u16(0),
            u16(0),
            u16(0),
            u32(crc),
            u32(data.length),
            u32(data.length),
            u16(filename.length),
            u16(0),
            filename,
            data
        ]);
        const central = concatBytes([
            u32(0x02014b50),
            u16(20),
            u16(20),
            u16(0x0800),
            u16(0),
            u16(0),
            u16(0),
            u32(crc),
            u32(data.length),
            u32(data.length),
            u16(filename.length),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            u32(0),
            u32(offset),
            filename
        ]);
        locals.push(local);
        centrals.push(central);
        offset += local.length;
    });

    const centralDir = concatBytes(centrals);
    const end = concatBytes([
        u32(0x06054b50),
        u16(0),
        u16(0),
        u16(locals.length),
        u16(locals.length),
        u32(centralDir.length),
        u32(offset),
        u16(0)
    ]);
    return concatBytes([...locals, centralDir, end]);
}

export function extractLandingCss(fullCss) {
    const src = String(fullCss || '');
    const start = src.indexOf(SITE_CSS_START);
    const end = src.indexOf(SITE_CSS_END);
    if (start >= 0 && end > start) {
        return src.slice(start + SITE_CSS_START.length, end).trim();
    }
    const from = src.indexOf('.dp-landing {');
    const to = src.indexOf('/* ---------- Services');
    if (from >= 0 && to > from) return src.slice(from, to).trim();
    return '';
}

export function parseDataUrl(dataUrl) {
    const raw = String(dataUrl || '').replace(/\s+/g, '');
    const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(raw);
    if (!match) return null;
    const mime = String(match[1] || 'application/octet-stream').toLowerCase();
    const payload = match[3] || '';
    let bytes;
    try {
        if (match[2]) {
            const bin = atob(payload);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        } else {
            bytes = utf8(decodeURIComponent(payload));
        }
    } catch (_) {
        return null;
    }
    return { mime, bytes, ext: MIME_EXT[mime] || 'bin' };
}

function coresOf(identidade) {
    const cores = (identidade && identidade.cores) || {};
    return {
        base: cores.base || '#1b1b1b',
        destaque: cores.destaque || '#e8d5b7',
        secundaria: cores.secundaria || '#7a8a99'
    };
}

function logoDataUrl(identidade) {
    const logo = (identidade && identidade.logo) || {};
    return logo.tipo === 'upload' && logo.dataUrl ? String(logo.dataUrl) : '';
}

function fotosOf(identidade) {
    return identidade && Array.isArray(identidade.fotos)
        ? identidade.fotos.filter(Boolean).map(String)
        : [];
}

export function siteFolderName(state) {
    const nome = (state && state.data && state.data.dados && state.data.dados.nome_negocio) || 'website';
    return `${siteSlug(nome)}-website`;
}

export function rewriteHtmlToAssetPaths(html, { logoHref = '', photoHrefs = [], stylesheetHref = STYLESHEET_HREF } = {}) {
    let out = String(html || '');
    if (logoHref) out = out.replace(/dp-logo:\/\//g, logoHref);
    else out = out.replace(/dp-logo:\/\//g, '');
    out = out.replace(/dp-photo:\/\/(\d+)/g, (_, key) => photoHrefs[Number(key)] || '');
    out = out.replace(/dp-photo:\/\/x/g, '');
    out = out.replace(
        /href=(["'])(?:\/digitalizept\/digitalizept\.css|\.\/digitalizept\.css)\1/gi,
        `href=$1${stylesheetHref}$1`
    );
    if (stylesheetHref && !new RegExp(stylesheetHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(out)) {
        if (/<\/head>/i.test(out)) {
            out = out.replace(/<\/head>/i, `<link rel="stylesheet" href="${stylesheetHref}">\n</head>`);
        }
    }
    return out;
}

function siteCss(cores, landingCss) {
    return `/* Website gerado a partir da demonstração. Edite à vontade. */
:root, .dp-landing {
  --base: ${cores.base};
  --destaque: ${cores.destaque};
  --secundaria: ${cores.secundaria};
  --l-base: ${cores.base};
  --l-destaque: ${cores.destaque};
  --l-secundaria: ${cores.secundaria};
}
html, body {
  margin: 0;
  min-height: 100%;
}
${landingCss ? `\n${landingCss}\n` : ''}`;
}

function windowsBat() {
    return `@echo off
cd /d "%~dp0"
start "" "index.html"
`;
}

function readmeFor(nome) {
    return `${nome} — o seu website
==============================

Esta pasta é o site. É seu: pode ver no computador e pôr na Internet.

1. VER NO WINDOWS
-----------------

1. Extraia o ZIP (botão direito no ficheiro → Extrair tudo).
2. Abra a pasta extraída.
3. Faça duplo clique em ver-no-windows.bat
   O site abre no browser.

Se o Windows disser "O Windows protegeu o PC":
clique em Mais informações e depois em Executar na mesma.

Se ainda não abrir: faça duplo clique em index.html


2. PÔR O SITE NA INTERNET (Netlify)
-----------------------------------

O Netlify é gratuito para um site simples. Não precisa de programar.

1. No browser, abra: https://app.netlify.com/drop
2. Se pedir conta, crie com o seu email.
3. Arraste ESTA PASTA INTEIRA para a página
   (a pasta que tem o ficheiro index.html lá dentro).
4. Espere uns segundos.
5. Aparece um endereço, por exemplo: alguma-coisa.netlify.app
   Esse já é o site na Internet. Pode enviá-lo a alguém para ver.

Usar o seu domínio (ex. oseunegocio.pt):

1. No Netlify, abra o site que acabou de criar.
2. Clique em Domain settings (definições de domínio).
3. Clique em Add a domain / Add custom domain (adicionar domínio).
4. Escreva o domínio que comprou.
5. O Netlify indica os servidores DNS (dois nomes, tipo dns1.netlify.com).
6. No sítio onde comprou o domínio (Amen, PTServidor, GoDaddy, ou outro):
   abra DNS / Name servers e coloque esses dois nomes.
7. Espere. Pode demorar até 24 horas até o endereço novo abrir.

A conta Netlify, o domínio e o site ficam em seu nome.


3. MUDAR TEXTOS OU FOTOS
------------------------

- Textos: clique com o botão direito em index.html → Abrir com → Bloco de Notas.
- Fotos: na pasta assets, substitua os ficheiros (mantenha o mesmo nome).
- Cores: abra css\\site.css no Bloco de Notas.

Não apague a pasta css nem a pasta assets.


4. OUTRO COMPUTADOR (Mac)
-------------------------

Faça duplo clique em index.html, ou no Terminal, dentro desta pasta:

   python3 -m http.server 4173

Depois abra http://localhost:4173
`;
}

function packageJsonFor(folder) {
    return `${JSON.stringify({
        name: folder.toLowerCase().replace(/_/g, '-'),
        private: true,
        type: 'module',
        scripts: { start: 'node server.mjs' }
    }, null, 2)}\n`;
}

function serverScript() {
    return `#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

function safeFile(urlPath) {
    const rel = decodeURIComponent((urlPath || '/').split('?')[0]);
    const clean = rel === '/' ? 'index.html' : rel.replace(/^\\/+/, '');
    const file = path.normalize(path.join(ROOT, clean));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
    return file;
}

const server = http.createServer((req, res) => {
    const file = safeFile(req.url);
    if (!file) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Não encontrado');
            return;
        }
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(\`Website em http://localhost:\${PORT}\`);
});
`;
}

export function buildStandaloneWebsiteFiles(state, { landingCss = '' } = {}) {
    const data = (state && state.data) || {};
    const identidade = data.identidade || {};
    const dados = data.dados || {};
    const cores = coresOf(identidade);
    const compact = currentDemoHtml(state);
    if (!String(compact || '').trim()) {
        throw new Error('Ainda não há website na demonstração para descarregar.');
    }

    const files = {};
    let logoHref = '';
    const parsedLogo = parseDataUrl(logoDataUrl(identidade));
    if (parsedLogo) {
        logoHref = `assets/logo.${parsedLogo.ext}`;
        files[logoHref] = parsedLogo.bytes;
    }

    const photoHrefs = [];
    fotosOf(identidade).forEach((url, i) => {
        const parsed = parseDataUrl(url);
        if (!parsed) {
            photoHrefs[i] = '';
            return;
        }
        const href = `assets/foto-${i}.${parsed.ext}`;
        photoHrefs[i] = href;
        files[href] = parsed.bytes;
    });

    const fileIdentidade = {
        ...identidade,
        logo: logoHref
            ? { tipo: 'upload', dataUrl: logoHref }
            : (identidade.logo && identidade.logo.tipo !== 'upload'
                ? identidade.logo
                : { tipo: 'nenhum' }),
        fotos: photoHrefs
    };

    let html = applyIdentityToHtml(compact, fileIdentidade, dados);
    html = rewriteHtmlToAssetPaths(html, { logoHref, photoHrefs, stylesheetHref: STYLESHEET_HREF });
    if (/data:image\/|base64,/i.test(html)) {
        html = rewriteHtmlToAssetPaths(
            html.replace(/data:image\/[a-z0-9.+-]+(?:;[a-z0-9.=+-]+)*;base64,[a-z0-9+/=\s_-]*/gi, ''),
            { logoHref, photoHrefs, stylesheetHref: STYLESHEET_HREF }
        );
    }

    const folder = siteFolderName(state);
    const nome = dados.nome_negocio || 'Website';
    files['index.html'] = html;
    files[STYLESHEET_HREF] = siteCss(cores, landingCss);
    files['server.mjs'] = serverScript();
    files['package.json'] = packageJsonFor(folder);
    const readme = readmeFor(nome);
    files['README.md'] = readme;
    files['LEIA-ME.txt'] = `\uFEFF${readme}`;
    files['ver-no-windows.bat'] = windowsBat();
    return { folder, files };
}

export async function loadLandingCss() {
    const urls = [
        '/digitalizept/digitalizept.css',
        new URL('../../digitalizept.css', import.meta.url).href
    ];
    for (const url of urls) {
        try {
            const response = await fetch(url, { cache: 'no-store' });
            if (!response.ok) continue;
            const extracted = extractLandingCss(await response.text());
            if (extracted) return extracted;
        } catch (_) { /* try next */ }
    }
    return '';
}

export async function downloadStandaloneWebsiteZip(state, { landingCss } = {}) {
    const css = landingCss == null ? await loadLandingCss() : landingCss;
    const { folder, files } = buildStandaloneWebsiteFiles(state, { landingCss: css });
    const bytes = packZip(files, { root: folder });
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    saveBlob(new Blob([copy], { type: 'application/zip' }), `${folder}.zip`);
    return folder;
}

export function createWebsiteZipButton(ctx, { className = 'btn-secondary', label = 'Descarregar website (ZIP)' } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
            const folder = await downloadStandaloneWebsiteZip(ctx.state);
            ctx.showToast(`Website descarregado (${folder}.zip). Nada foi guardado na app.`);
        } catch (err) {
            ctx.showToast((err && err.message) || 'Não foi possível criar o ZIP.', true);
        } finally {
            btn.disabled = false;
        }
    });
    return btn;
}

export async function downloadStandaloneWebsiteZipFromLead(leadId, { api } = {}) {
    if (!leadId || typeof api !== 'function') {
        throw new Error('Lead em falta.');
    }
    const { response, data } = await api(
        `/api/digitalizept/leads/${encodeURIComponent(leadId)}/resume`
    );
    if (!response.ok) {
        throw new Error((data && data.error) || 'Não foi possível carregar a demo.');
    }
    return downloadStandaloneWebsiteZip({ data: (data && data.data) || {} });
}

export function createLeadWebsiteZipButton({
    api,
    leadId,
    toast,
    className = 'btn-secondary',
    label = 'Descarregar website (ZIP)'
} = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
            const folder = await downloadStandaloneWebsiteZipFromLead(leadId, { api });
            if (typeof toast === 'function') toast(`Website descarregado (${folder}.zip).`);
        } catch (err) {
            if (typeof toast === 'function') {
                toast((err && err.message) || 'Não foi possível criar o ZIP.', true);
            }
        } finally {
            btn.disabled = false;
        }
    });
    return btn;
}
