import { applyIdentityToHtml, currentDemoHtml } from './html.js';
import { stripDemoSwitch } from './demo-visual.js';

export const SITE_CSS_START = '/* dp-site-export-start */';
export const SITE_CSS_END = '/* dp-site-export-end */';

const STYLESHEET_HREF = 'css/site.css';
const SERVER_REL = 'scripts/server.mjs';

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

function placeholderSvg(label) {
    const safe = String(label || 'Foto')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return utf8(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#e7e5e4"/>
  <rect x="40" y="40" width="1120" height="720" fill="none" stroke="#a8a29e" stroke-width="4" stroke-dasharray="14 10"/>
  <text x="600" y="390" text-anchor="middle" fill="#78716c" font-family="system-ui,-apple-system,sans-serif" font-size="36">${safe}</text>
  <text x="600" y="440" text-anchor="middle" fill="#a8a29e" font-family="system-ui,-apple-system,sans-serif" font-size="22">Substitua este ficheiro em assets/</text>
</svg>`);
}

/**
 * Pull any leftover data:image… out of the HTML into assets/ so the demo
 * never loses reference photos when we remove base64 from the markup.
 */
export function extractInlineImagesToAssets(html, files, { startIndex = 0, prefix = 'extra' } = {}) {
    let index = startIndex;
    const out = String(html || '').replace(
        /data:image\/[a-z0-9.+-]+(?:;[a-z0-9.=+-]+)*;base64,[a-z0-9+/=\s_-]*/gi,
        (match) => {
            const parsed = parseDataUrl(match);
            if (!parsed || !parsed.bytes || !parsed.bytes.length) return '';
            const href = `assets/${prefix}-${index}.${parsed.ext}`;
            files[href] = parsed.bytes;
            index += 1;
            return href;
        }
    );
    return { html: out, nextIndex: index };
}

export function siteFolderName(state) {
    const nome = (state && state.data && state.data.dados && state.data.dados.nome_negocio) || 'website';
    return `${siteSlug(nome)}-website`;
}

export function rewriteHtmlToAssetPaths(html, {
    logoHref = '',
    photoHrefs = [],
    stylesheetHref = STYLESHEET_HREF,
    orphanHrefs = [],
    onMissingRef = null
} = {}) {
    let out = String(html || '');
    let orphanIdx = 0;
    if (logoHref) out = out.replace(/dp-logo:\/\//g, logoHref);
    else out = out.replace(/dp-logo:\/\//g, '');
    out = out.replace(/dp-photo:\/\/(\d+)/g, (_, key) => photoHrefs[Number(key)] || '');
    out = out.replace(/dp-photo:\/\/x/g, () => {
        if (orphanIdx < orphanHrefs.length) {
            const href = orphanHrefs[orphanIdx];
            orphanIdx += 1;
            return href;
        }
        if (typeof onMissingRef === 'function') return onMissingRef();
        return '';
    });
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

function comeceAqui(nome) {
    return `${nome} — o seu website
================================

Esta pasta É O SITE. Pode ver no computador e pôr na Internet.
Tudo o que precisa está aqui.

COMECE AQUI (3 passos)
----------------------

1. VER NO COMPUTADOR
   Windows → faça duplo clique em:  scripts\\abrir-localhost.bat
   Mac     → faça duplo clique em:  scripts/abrir-localhost.command
   (se o Mac pedir permissão: botão direito → Abrir)

   Abre http://localhost:4173 com as fotos e o visual intactos.

2. PÔR NA INTERNET + LIGAR O SEU DOMÍNIO
   Abra o guia:  docs/02-ligar-o-dominio.txt
   (Netlify Drop gratuito + apontar o domínio que já tem)

3. MUDAR TEXTOS OU FOTOS
   Abra o guia:  docs/03-alterar-textos-e-fotos.txt


PASTA — O QUE É CADA COISA
--------------------------

  COMECE-AQUI.txt     ← este ficheiro
  index.html          ← a página do site
  css/site.css        ← cores e estilo
  assets/             ← logo e fotos (não apague)
  scripts/            ← programas para ver em localhost
  docs/               ← guias passo a passo
  package.json        ← para quem tem Node (npm start)


NÃO PRECISA DE INSTALAR NADA ESPECIAL
-------------------------------------

- Sem Node: o script abre o index.html no browser.
- Com Node (recomendado): o site corre em localhost como num servidor real.

A conta Netlify, o domínio e estes ficheiros ficam SEUS.
`;
}

function docVerComputador() {
    return `01 — Ver o site no computador
=============================

WINDOWS
-------

1. Extraia o ZIP (botão direito → Extrair tudo).
2. Abra a pasta extraída.
3. Entre em scripts\\
4. Duplo clique em abrir-localhost.bat

   • Se tiver Node.js instalado, o site abre em
     http://localhost:4173  (melhor — fotos e ligações corretas).
   • Se não tiver, abre o index.html directamente no browser.

Se o Windows disser "O Windows protegeu o PC":
  Mais informações → Executar na mesma.


MAC
---

1. Extraia o ZIP (duplo clique).
2. Entre na pasta → scripts
3. Duplo clique em abrir-localhost.command
   (na primeira vez: botão direito → Abrir → Abrir)

   Ou, no Terminal, dentro da pasta do site:

     npm start
     # ou:  node scripts/server.mjs

   Depois abra http://localhost:4173


SEM NODE (qualquer sistema)
---------------------------

Duplo clique em index.html
ou, no Terminal, dentro da pasta do site:

  python3 -m http.server 4173

Depois: http://localhost:4173


PROBLEMAS COMUNS
----------------

• Página sem fotos → confirme que a pasta assets/ está ao lado do index.html
  (não abra só o HTML de dentro de outra cópia).
• Porta 4173 ocupada → feche a janela do Terminal e volte a abrir o script,
  ou use:  PORT=4174 node scripts/server.mjs
`;
}

function docLigarDominio() {
    return `02 — Pôr o site na Internet e ligar o seu domínio
=================================================

Isto é o caminho mais simples para um site estático (Presença Digital).
Não precisa de programar.


A. PUBLICAR (gratuito) — Netlify Drop
-------------------------------------

1. No browser abra:  https://app.netlify.com/drop
2. Crie conta com o seu email (se pedir).
3. Arraste ESTA PASTA INTEIRA para a página
   (a pasta que tem index.html, css/, assets/, scripts/, docs/).
4. Espere uns segundos.
5. Aparece um endereço tipo:  alguma-coisa.netlify.app
   Já pode partilhar esse link.


B. LIGAR O DOMÍNIO QUE JÁ TEM (ex. oseunegocio.pt)
-------------------------------------------------

Faça isto DEPOIS do passo A.

1. No Netlify, abra o site que publicou.
2. Vá a Domain management / Domain settings.
3. Add a domain / Add custom domain.
4. Escreva o domínio que comprou (com ou sem www).
5. O Netlify mostra os nameservers (dois nomes, tipo dns1.netlify.com).

6. No sítio onde comprou o domínio (Amen, PTServidor, GoDaddy, Cloudflare…):
   - Abra DNS / Name servers / Servidores DNS
   - Escolha "Usar nameservers personalizados" (ou equivalente)
   - Cole os dois nomes que o Netlify deu
   - Guarde

7. Espere. Pode demorar de minutos até 24 horas.
   Quando estiver pronto, https://oseudominio.pt abre o site.


CHECKLIST RÁPIDO
----------------

[ ] Publiquei a pasta no Netlify Drop
[ ] Tenho o link .netlify.app a abrir bem (com fotos)
[ ] Adicionei o domínio no Netlify
[ ] Troquei os nameservers no registador
[ ] Testei o domínio em telemóvel e computador


NOTAS
-----

• O domínio, a conta Netlify e estes ficheiros ficam em nome do cliente.
• Se já tem website noutro sítio, trocar nameservers aponta o domínio
  para ESTE site (o antigo deixa de responder nesse domínio).
• Precisa de email @dominio? Peça ao registador ou a quem lhe faz o email
  — o Netlify Drop só aloja o site, não as caixas de email.
`;
}

function docAlterarConteudo() {
    return `03 — Alterar textos e fotos
===========================

TEXTOS
------

1. Abra index.html com um editor simples
   (Bloco de Notas, TextEdit, VS Code…).
2. Procure o texto que quer mudar e altere.
3. Guarde. Recarregue o browser (F5).


FOTOS E LOGO
------------

Tudo está na pasta assets/:

  logo.png (ou .jpg / .webp)   → logótipo
  foto-0.jpg, foto-1.jpg…      → fotos da página

Para substituir:
1. Prepare a nova imagem (JPG ou PNG).
2. Dê-lhe EXACTAMENTE o mesmo nome do ficheiro antigo.
3. Substitua o ficheiro dentro de assets/ (substituir / overwrite).
4. Recarregue o browser com Ctrl+F5 (ou Cmd+Shift+R no Mac).

Não apague a pasta assets nem a pasta css.


CORES
-----

Abra css/site.css e mude as linhas:

  --base: …
  --destaque: …
  --secundaria: …


DEPOIS DE ALTERAR
-----------------

Se o site já está no Netlify: volte a arrastar a pasta inteira
para https://app.netlify.com/drop (ou faça deploy na sua conta)
para actualizar a versão online.
`;
}

function assetsReadme() {
    return `Pasta de imagens do site
========================

logo.*     — logótipo
foto-N.*   — fotografias usadas na página
extra-N.*  — imagens que vinham embutidas no HTML da demo

Substitua os ficheiros mantendo o mesmo nome.
Veja docs/03-alterar-textos-e-fotos.txt
`;
}

function windowsBat() {
    return `@echo off
chcp 65001 >nul
cd /d "%~dp0\\.."
echo.
echo A abrir o website em localhost...
echo.
where node >nul 2>&1
if %errorlevel%==0 (
  start "" "http://localhost:4173"
  node scripts\\server.mjs
  goto :eof
)
echo Node.js nao encontrado — a abrir index.html directamente.
echo Para localhost completo, instale Node em https://nodejs.org
echo.
start "" "index.html"
`;
}

function macCommand() {
    return `#!/bin/bash
cd "$(dirname "$0")/.."
open "http://localhost:4173" 2>/dev/null || true
if command -v node >/dev/null 2>&1; then
  exec node scripts/server.mjs
fi
echo "Node.js nao encontrado — a abrir index.html"
open "index.html"
`;
}

function shellStart() {
    return `#!/usr/bin/env bash
cd "$(dirname "$0")/.."
if command -v node >/dev/null 2>&1; then
  echo "Website em http://localhost:4173"
  exec node scripts/server.mjs
fi
echo "Instale Node.js (https://nodejs.org) ou use: python3 -m http.server 4173"
exit 1
`;
}

function packageJsonFor(folder) {
    return `${JSON.stringify({
        name: folder.toLowerCase().replace(/_/g, '-'),
        private: true,
        type: 'module',
        scripts: {
            start: 'node scripts/server.mjs',
            serve: 'node scripts/server.mjs'
        }
    }, null, 2)}\n`;
}

function serverScript() {
    return `#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
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
    let file = safeFile(req.url);
    if (!file) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }
    fs.stat(file, (statErr, stat) => {
        if (!statErr && stat.isDirectory()) {
            file = path.join(file, 'index.html');
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
});

server.listen(PORT, () => {
    console.log('');
    console.log('  Website a correr.');
    console.log('  Abra: http://localhost:' + PORT);
    console.log('  Ctrl+C para parar.');
    console.log('');
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
    const knownDataUrls = new Set();
    let logoHref = '';
    const parsedLogo = parseDataUrl(logoDataUrl(identidade));
    if (parsedLogo) {
        logoHref = `assets/logo.${parsedLogo.ext}`;
        files[logoHref] = parsedLogo.bytes;
        knownDataUrls.add(normalizeDataUrlKey(logoDataUrl(identidade)));
    }

    const photoHrefs = [];
    const rawFotos = identidade && Array.isArray(identidade.fotos) ? identidade.fotos : [];
    rawFotos.forEach((url, i) => {
        if (!url) {
            photoHrefs[i] = '';
            return;
        }
        const asText = String(url);
        const parsed = parseDataUrl(asText);
        if (parsed) {
            const href = `assets/foto-${i}.${parsed.ext}`;
            photoHrefs[i] = href;
            files[href] = parsed.bytes;
            knownDataUrls.add(normalizeDataUrlKey(asText));
            return;
        }
        const href = `assets/foto-${i}.svg`;
        photoHrefs[i] = href;
        files[href] = placeholderSvg(`Foto ${i + 1}`);
    });

    // Harvest any inline demo images that are not already the logo/fotos above,
    // so compactHtmlForAi's dp-photo://x slots still resolve to real files.
    const orphanHrefs = [];
    let extraIndex = 0;
    [data.demoHtml, data.demoHtmlCustom].filter(Boolean).forEach((src) => {
        String(src).replace(
            /data:image\/[a-z0-9.+-]+(?:;[a-z0-9.=+-]+)*;base64,[a-z0-9+/=\s_-]*/gi,
            (match) => {
                const key = normalizeDataUrlKey(match);
                if (!key || knownDataUrls.has(key)) return match;
                const parsed = parseDataUrl(match);
                if (!parsed || !parsed.bytes || !parsed.bytes.length) return match;
                const href = `assets/extra-${extraIndex}.${parsed.ext}`;
                extraIndex += 1;
                files[href] = parsed.bytes;
                orphanHrefs.push(href);
                knownDataUrls.add(key);
                return match;
            }
        );
    });

    const neededSlots = [...String(compact || '').matchAll(/dp-photo:\/\/(\d+)/g)]
        .map((m) => Number(m[1]))
        .filter((n) => Number.isInteger(n) && n >= 0);
    neededSlots.forEach((i) => {
        if (photoHrefs[i]) return;
        const href = `assets/foto-${i}.svg`;
        photoHrefs[i] = href;
        files[href] = placeholderSvg(`Foto ${i + 1}`);
    });

    if (!logoHref && /dp-logo:\/\//.test(compact)) {
        logoHref = 'assets/logo.svg';
        files[logoHref] = placeholderSvg('Logo');
    }

    let missingRef = 0;
    const onMissingRef = () => {
        const href = `assets/foto-ref-${missingRef}.svg`;
        missingRef += 1;
        files[href] = placeholderSvg('Foto');
        return href;
    };

    const fileIdentidade = {
        ...identidade,
        logo: logoHref
            ? { tipo: 'upload', dataUrl: logoHref, mat: identidade.logo && identidade.logo.mat }
            : (identidade.logo && identidade.logo.tipo !== 'upload'
                ? identidade.logo
                : { tipo: 'nenhum' }),
        fotos: photoHrefs
    };

    let html = rewriteHtmlToAssetPaths(compact, {
        logoHref,
        photoHrefs,
        stylesheetHref: STYLESHEET_HREF,
        orphanHrefs,
        onMissingRef
    });
    // Identity after placeholders → assets, so restoreHtmlPlaceholders cannot wipe dp-photo://x.
    html = applyIdentityToHtml(html, fileIdentidade, dados);
    html = stripDemoSwitch(html);
    html = rewriteHtmlToAssetPaths(html, {
        logoHref,
        photoHrefs,
        stylesheetHref: STYLESHEET_HREF,
        orphanHrefs,
        onMissingRef
    });

    if (/data:image\/|base64,/i.test(html)) {
        const extracted = extractInlineImagesToAssets(html, files, {
            startIndex: extraIndex,
            prefix: 'extra'
        });
        html = extracted.html;
        html = rewriteHtmlToAssetPaths(html, {
            logoHref,
            photoHrefs,
            stylesheetHref: STYLESHEET_HREF,
            orphanHrefs,
            onMissingRef
        });
    }

    const folder = siteFolderName(state);
    const nome = dados.nome_negocio || 'Website';
    const intro = comeceAqui(nome);

    files['index.html'] = html;
    files[STYLESHEET_HREF] = siteCss(cores, landingCss);
    files['assets/LEIA-ME.txt'] = `\uFEFF${assetsReadme()}`;
    files[SERVER_REL] = serverScript();
    files['scripts/abrir-localhost.bat'] = windowsBat();
    files['scripts/abrir-localhost.command'] = macCommand();
    files['scripts/abrir-localhost.sh'] = shellStart();
    files['package.json'] = packageJsonFor(folder);
    files['COMECE-AQUI.txt'] = `\uFEFF${intro}`;
    files['LEIA-ME.txt'] = `\uFEFF${intro}`;
    files['README.md'] = intro;
    files['docs/01-ver-no-computador.txt'] = `\uFEFF${docVerComputador()}`;
    files['docs/02-ligar-o-dominio.txt'] = `\uFEFF${docLigarDominio()}`;
    files['docs/03-alterar-textos-e-fotos.txt'] = `\uFEFF${docAlterarConteudo()}`;

    return { folder, files };
}

function normalizeDataUrlKey(value) {
    return String(value || '').replace(/\s+/g, '');
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
