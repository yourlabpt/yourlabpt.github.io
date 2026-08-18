import { LIVRO_RECLAMACOES_URL, renderLanding } from './landing.js';

export const DEMO_HTML_MAX = 900000;

export function clipDemoHtml(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw.length > DEMO_HTML_MAX ? raw.slice(0, DEMO_HTML_MAX) : raw;
}

export function htmlTooLarge(value) {
    return String(value || '').length > DEMO_HTML_MAX;
}

function unwrapFence(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .replace(/^```(?:html|htm)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
}

const ANY_DASH = '[-\\u00AD\\u2010\\u2011\\u2012\\u2013\\u2014\\u2015\\u2212]';

function closeUnclosedStyle(html) {
    const opens = (html.match(/<style\b/gi) || []).length;
    const closes = (html.match(/<\/style>/gi) || []).length;
    if (opens <= closes) return html;
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, '</style></head>');
    if (/<body\b/i.test(html)) return html.replace(/<body\b/i, '</style><body');
    return `${html}</style>`;
}

function straightenCssQuotes(html) {
    return html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (full, attrs, css) => {
        const clean = String(css)
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
        return `<style${attrs}>${clean}</style>`;
    });
}

function injectViewportFix(html) {
    if (/data-dp-fix/.test(html)) return html;
    const fix = '<style data-dp-fix>html,body{min-height:100%;margin:0}</style>';
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${fix}</head>`);
    return `${fix}${html}`;
}

const LIVRO_SNIPPET = `<p class="dpl-rodape-legal" data-dp-livro><a class="dpl-rodape-livro" href="${LIVRO_RECLAMACOES_URL}" target="_blank" rel="noopener noreferrer">Livro de Reclamações</a></p>`;

function injectLivroReclamacoesHtml(html) {
    const src = String(html || '');
    if (!src.trim() || /livroreclamacoes\.pt/i.test(src)) return src;
    if (/<\/footer>/i.test(src)) return src.replace(/<\/footer>/i, `${LIVRO_SNIPPET}</footer>`);
    if (/<\/body>/i.test(src)) return src.replace(/<\/body>/i, `${LIVRO_SNIPPET}</body>`);
    return `${src}${LIVRO_SNIPPET}`;
}

function injectLivroReclamacoesDom(doc) {
    if (!doc || /livroreclamacoes\.pt/i.test(doc.documentElement.innerHTML || '')) return;
    const wrap = doc.createElement('p');
    wrap.className = 'dpl-rodape-legal';
    wrap.setAttribute('data-dp-livro', '');
    const a = doc.createElement('a');
    a.className = 'dpl-rodape-livro';
    a.href = LIVRO_RECLAMACOES_URL;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Livro de Reclamações';
    wrap.appendChild(a);
    const footer = doc.querySelector('footer');
    if (footer) footer.appendChild(wrap);
    else if (doc.body) doc.body.appendChild(wrap);
}

// Models often emit en-dashes in CSS variables (var(–base)), curly quotes in
// content/font-family, and forget </style> — all of which render as a blank page.
export function sanitizeDemoHtml(html) {
    let out = closeUnclosedStyle(String(html || ''));
    out = out.replace(new RegExp(`var\\(\\s*${ANY_DASH}+`, 'g'), 'var(--');
    out = straightenCssQuotes(out);
    out = injectViewportFix(out);
    return injectLivroReclamacoesHtml(out);
}

export function looksLikeHtml(text) {
    const raw = unwrapFence(text);
    if (!raw) return false;
    return /^\s*</.test(raw) && /<\/[a-z]|<!DOCTYPE|<html|<div|<main|<section/i.test(raw);
}

export function extractHtml(text) {
    return sanitizeDemoHtml(unwrapFence(text));
}

function coresOf(identidade) {
    const cores = (identidade && identidade.cores) || {};
    return {
        base: cores.base || '#1b1b1b',
        destaque: cores.destaque || '#e8d5b7',
        secundaria: cores.secundaria || '#7a8a99'
    };
}

export function identityFingerprint(identidade) {
    const cores = coresOf(identidade);
    const logo = (identidade && identidade.logo) || {};
    const fotos = identidade && Array.isArray(identidade.fotos) ? identidade.fotos : [];
    const logoKey = logo.tipo === 'upload'
        ? `${String(logo.dataUrl || '').length}:${String(logo.dataUrl || '').slice(-24)}`
        : (logo.tipo || 'nenhum');
    const fotoKey = fotos.map((url) => `${String(url).length}:${String(url).slice(-16)}`).join('|');
    return `${cores.base}~${cores.destaque}~${cores.secundaria}~${logoKey}~${fotoKey}`;
}

function rewriteNamedVars(css, cores) {
    let out = String(css || '');
    ['base', 'destaque', 'secundaria'].forEach((name) => {
        const value = cores[name];
        out = out.replace(new RegExp(`(--(?:l-)?${name})\\s*:\\s*[^;\\n}]+`, 'gi'), `$1: ${value}`);
    });
    return out;
}

function fillVisual(el, url) {
    if (!el || !url) return;
    el.classList.add('dpl-visual-photo');
    let img = el.querySelector('img');
    if (!img) {
        img = el.ownerDocument.createElement('img');
        img.className = 'dpl-photo-img';
        img.alt = '';
        el.textContent = '';
        el.appendChild(img);
    }
    img.src = url;
}

function applyCores(doc, cores) {
    doc.querySelectorAll('style').forEach((style) => {
        if (style.hasAttribute('data-dp-fix') || style.hasAttribute('data-dp-identity')) return;
        style.textContent = rewriteNamedVars(style.textContent, cores);
    });
    doc.querySelectorAll('[style]').forEach((node) => {
        const next = rewriteNamedVars(node.getAttribute('style') || '', cores);
        if (next) node.setAttribute('style', next);
    });
    let override = doc.querySelector('style[data-dp-identity]');
    if (!override) {
        override = doc.createElement('style');
        override.setAttribute('data-dp-identity', '');
        (doc.head || doc.documentElement).appendChild(override);
    }
    override.textContent = `
:root, .dp-landing {
  --base: ${cores.base};
  --destaque: ${cores.destaque};
  --secundaria: ${cores.secundaria};
  --l-base: ${cores.base};
  --l-destaque: ${cores.destaque};
  --l-secundaria: ${cores.secundaria};
}
[data-dp-photos] {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 14px 20px;
}
[data-dp-photos] img {
  height: 112px;
  width: 148px;
  object-fit: cover;
  border-radius: 12px;
  flex: 0 0 auto;
}
img[data-dp-injected-logo] {
  height: 32px;
  width: auto;
  max-width: 140px;
  object-fit: contain;
  border-radius: 6px;
}`.trim();
}

function applyLogo(doc, identidade, dados) {
    const logo = (identidade && identidade.logo) || {};
    const url = logo.tipo === 'upload' && logo.dataUrl ? logo.dataUrl : '';
    const alt = (dados && dados.nome_negocio) || 'Logótipo';

    if (url) {
        doc.querySelectorAll('.dpl-topbar-logo, .dpl-hero-logo, img[data-dp-logo]').forEach((img) => {
            img.src = url;
            img.alt = alt;
        });
        const topbar = doc.querySelector('.dpl-topbar');
        if (topbar && !topbar.querySelector('.dpl-topbar-logo')) {
            const img = doc.createElement('img');
            img.className = 'dpl-topbar-logo';
            img.src = url;
            img.alt = alt;
            const brand = topbar.querySelector('.dpl-topbar-brand');
            if (brand) brand.replaceWith(img);
            else topbar.insertBefore(img, topbar.firstChild);
        }
        const heroInner = doc.querySelector('.dpl-hero-inner');
        if (heroInner && !heroInner.querySelector('.dpl-hero-logo')) {
            const img = doc.createElement('img');
            img.className = 'dpl-hero-logo';
            img.src = url;
            img.alt = alt;
            const name = heroInner.querySelector('.dpl-hero-name');
            if (name) name.replaceWith(img);
            else heroInner.insertBefore(img, heroInner.querySelector('.dpl-hero-title') || heroInner.firstChild);
        }
    }

    const brand = doc.querySelector('.brand, header .logo, .topbar .brand');
    if (!brand) return;
    const injected = brand.querySelector('img[data-dp-injected-logo]');
    const mark = brand.querySelector('.brand-mark');
    if (url) {
        let img = injected;
        if (!img) {
            img = doc.createElement('img');
            img.setAttribute('data-dp-injected-logo', '');
            img.alt = alt;
            brand.insertBefore(img, brand.firstChild);
        }
        img.src = url;
        if (mark) mark.setAttribute('hidden', '');
    } else if (injected) {
        injected.remove();
        if (mark) mark.removeAttribute('hidden');
    }
}

function applyFotos(doc, identidade) {
    const fotos = Array.isArray(identidade && identidade.fotos) ? identidade.fotos.filter(Boolean) : [];
    const hero = doc.querySelector('.dpl-hero-visual');
    if (hero && fotos[0]) fillVisual(hero, fotos[0]);
    const sobre = doc.querySelector('.dpl-sobre-visual');
    if (sobre && fotos[1]) fillVisual(sobre, fotos[1]);
    doc.querySelectorAll('.dpl-galeria-tile').forEach((tile, i) => {
        if (fotos[i]) fillVisual(tile, fotos[i]);
    });

    const landingHasSlots = Boolean(doc.querySelector('.dpl-galeria, .dpl-hero-visual'));
    let strip = doc.querySelector('[data-dp-photos]');
    if (landingHasSlots || !fotos.length) {
        if (strip) strip.remove();
        return;
    }
    if (!strip) {
        strip = doc.createElement('div');
        strip.setAttribute('data-dp-photos', '');
        const header = doc.querySelector('header, .topbar');
        if (header) header.insertAdjacentElement('afterend', strip);
        else if (doc.body) doc.body.insertBefore(strip, doc.body.firstChild);
    }
    strip.textContent = '';
    fotos.forEach((url, i) => {
        const img = doc.createElement('img');
        img.src = url;
        img.alt = '';
        img.setAttribute('data-dp-photo', String(i));
        strip.appendChild(img);
    });
}

export function applyIdentityToHtml(html, identidade, dados) {
    const raw = extractHtml(html);
    if (!raw || typeof DOMParser === 'undefined') return raw;
    try {
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        if (!doc || !doc.documentElement) return raw;
        applyCores(doc, coresOf(identidade));
        applyLogo(doc, identidade, dados);
        applyFotos(doc, identidade);
        injectLivroReclamacoesDom(doc);
        return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
    } catch (_) {
        return raw;
    }
}

function escapeText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function serializeLandingDocument(state) {
    const node = renderLanding(state);
    const dados = state.data.dados || {};
    const cores = (state.data.identidade && state.data.identidade.cores) || {};
    const nome = dados.nome_negocio || 'Demonstração';
    return `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeText(nome)}</title>
<link rel="stylesheet" href="/digitalizept/digitalizept.css">
<style>
  html, body { margin: 0; min-height: 100%; }
  .dp-landing {
    --l-base: ${cores.base || '#1b1b1b'};
    --l-destaque: ${cores.destaque || '#e8d5b7'};
    --l-secundaria: ${cores.secundaria || '#7a8a99'};
  }
</style>
</head>
<body>
${node.outerHTML}
</body>
</html>`;
}

export function currentDemoHtml(state) {
    if (state.data.demoHtml) return String(state.data.demoHtml);
    if (state.data.demo && state.data.demo.hero && state.data.demo.hero.titulo) {
        return serializeLandingDocument(state);
    }
    return '';
}

export function buildHtmlChangePrompt(state, html, changeNote) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};
    const cores = (state.data.identidade && state.data.identidade.cores) || {};
    const pedido = String(changeNote || '').trim()
        || '(o vendedor descreve as alterações em voz alta ou acrescenta aqui antes de copiar)';

    return `És um frontend a construir uma DEMO interactiva para mostrar a um cliente na rua.
Não é o site final: dados e acções são MOCK em memória (variáveis JS). Sem backend, sem APIs reais, sem localStorage.

NEGÓCIO
- Nome: ${dados.nome_negocio || '—'}
- Tipo: ${businessType.nome || '—'}
- O que faz: ${dados.o_que_faz || '—'}
- Serviços: ${dados.principais_servicos || '—'}

CORES, LOGO E FOTOS
- Cores (CSS variables): --base: ${cores.base || '#1b1b1b'}; --destaque: ${cores.destaque || '#e8d5b7'}; --secundaria: ${cores.secundaria || '#7a8a99'}.
- A app injecta depois o logo, as fotos e estas cores. Usa sempre var(--base), var(--destaque), var(--secundaria) e reserva .brand para o logo.

PEDIDO DE ALTERAÇÃO
${pedido}

REGRAS
- Devolve UM documento HTML completo (DOCTYPE, css e js inline). Nada antes, nada depois. Sem markdown.
- Português de Portugal. Sem dizer "demo", "template" ou "mock" no ecrã.
- Pode ser uma landing OU uma web app (login falso, listagens, formulários que avançam de ecrã).
- Cliques devem mudar de vista imediatamente (sem página em branco).
- Estado da app: variáveis JS em memória. Proibido localStorage, cookies, fetch ou APIs.
- CSS: variáveis com dois hífenes ASCII, ex. --base e var(--base). Nunca uses travessão (–) nem aspas curvas (“ ”) no CSS.
- Não inventes moradas, preços ou contactos que não estejam no contexto.
- O rodapé deve incluir um link "Livro de Reclamações" para https://www.livroreclamacoes.pt/Inicio/ (target=_blank, rel=noopener).

HTML ACTUAL
${html || '(ainda não há HTML — cria a primeira versão a partir do negócio e do pedido.)'}
`;
}

export function mountHtmlPreview(host, html) {
    const iframe = document.createElement('iframe');
    iframe.className = 'dp-preview-frame';
    iframe.title = 'Pré-visualização HTML';
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.style.cssText = 'width:100%;min-height:70vh;height:100%;border:0;background:#111;display:block;';
    host.appendChild(iframe);
    iframe.srcdoc = extractHtml(html);
    return iframe;
}
