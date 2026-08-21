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
    const src = String(html || '').replace(/<style\b[^>]*data-dp-fix[^>]*>[\s\S]*?<\/style>/gi, '');
    // Last in the document so it wins over AI "app" CSS that locks html/body
    // (overflow:hidden + height:100%) and leaves only the bottom buttons visible.
    const fix = '<style data-dp-fix>html,body{min-height:100%;height:auto;margin:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch}</style>';
    if (/<\/body>/i.test(src)) return src.replace(/<\/body>/i, `${fix}</body>`);
    if (/<\/html>/i.test(src)) return src.replace(/<\/html>/i, `${fix}</html>`);
    return `${src}${fix}`;
}

// Identity overlay (colours, logo, photo data-URLs) is applied at preview time.
// Persisting it inside demoHtml inlines camera JPEGs, blows the 900 KB cap, and
// clipDemoHtml then slices the document in half — hero + broken <img>, rest gone.
export function stripInjectedIdentity(html) {
    let out = String(html || '');
    out = out.replace(/<style\b[^>]*data-dp-identity[^>]*>[\s\S]*?<\/style>/gi, '');
    out = out.replace(/<img\b[^>]*data-dp-injected-logo[^>]*\/?>/gi, '');
    out = out.replace(/<(div|span)\b[^>]*data-dp-photos[^>]*>[\s\S]*?<\/\1>/gi, '');
    const truncated = /<(div|span)\b[^>]*data-dp-photos[^>]*>/i.exec(out);
    if (truncated) out = out.slice(0, truncated.index);
    if (/<html\b/i.test(out) && !/<\/html>/i.test(out)) {
        if (/<body\b/i.test(out) && !/<\/body>/i.test(out)) out += '</body>';
        out += '</html>';
    }
    return out;
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
    out = stripInjectedIdentity(out);
    out = injectLivroReclamacoesHtml(out);
    return injectViewportFix(out);
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

function logoDataUrl(identidade) {
    const logo = (identidade && identidade.logo) || {};
    return logo.tipo === 'upload' && logo.dataUrl ? String(logo.dataUrl) : '';
}

function fotosOf(identidade) {
    return identidade && Array.isArray(identidade.fotos)
        ? identidade.fotos.filter(Boolean).map(String)
        : [];
}

export const DP_LOGO = 'dp-logo://';
export function dpPhoto(index) {
    return `dp-photo://${index}`;
}

const DATA_IMAGE_RE = /data:image\/[a-z0-9.+-]+(?:;[a-z0-9.=+-]+)*;base64,[a-z0-9+/=\s_-]*/gi;
const DATA_IMAGE_FALLBACK_RE = /data:image\/[^\s"'<>)]+/gi;
const BLOB_URL_RE = /blob:[^\s"'()<>]+/gi;
const RESOLVED_PLACEHOLDER_RE = /https?:\/\/[^"'>\s]*?(dp-(?:logo|photo):\/\/(?:\d+|x)?)/gi;

function normalizeDataUrl(url) {
    return String(url || '').replace(/\s+/g, '');
}

function placeholderForDataUrl(url, identidade) {
    const compact = normalizeDataUrl(url);
    if (!compact) return 'dp-photo://x';
    const logo = normalizeDataUrl(logoDataUrl(identidade));
    if (logo && compact === logo) return DP_LOGO;
    const idx = fotosOf(identidade).findIndex((foto) => normalizeDataUrl(foto) === compact);
    return idx >= 0 ? dpPhoto(idx) : 'dp-photo://x';
}

function stripDataImages(html, identidade) {
    return String(html || '')
        .replace(DATA_IMAGE_RE, (url) => placeholderForDataUrl(url, identidade))
        .replace(DATA_IMAGE_FALLBACK_RE, (url) => placeholderForDataUrl(url, identidade))
        .replace(BLOB_URL_RE, 'dp-photo://x')
        .replace(RESOLVED_PLACEHOLDER_RE, '$1');
}

function annotateImgSlots(html) {
    return String(html || '').replace(/<img\b([^>]*?)>/gi, (full, attrs) => {
        if (/dpl-topbar-logo|dpl-hero-logo/.test(full)) {
            let next = full.replace(/src=(["'])[\s\S]*?\1/i, `src="${DP_LOGO}"`);
            if (!/data-dp-logo/.test(next)) next = next.replace(/<img\b/i, '<img data-dp-logo=""');
            return next;
        }
        const photo = /dp-photo:\/\/(\d+)/.exec(full);
        if (photo && !/data-dp-photo\s*=/.test(attrs)) {
            return `<img data-dp-photo="${photo[1]}"${attrs}>`;
        }
        if (/dp-logo:\/\//.test(full) && !/data-dp-logo/.test(attrs)) {
            return `<img data-dp-logo=""${attrs}>`;
        }
        return full;
    });
}

export function compactHtmlForAi(html, identidade) {
    return annotateImgSlots(stripDataImages(stripInjectedIdentity(String(html || '')), identidade));
}

export function restoreHtmlPlaceholders(html, identidade) {
    const fotos = fotosOf(identidade);
    const logo = logoDataUrl(identidade);
    return String(html || '').replace(/dp-photo:\/\/(\d+|x)/g, (_, key) => {
        if (key === 'x') return '';
        return fotos[Number(key)] || '';
    }).replace(/dp-logo:\/\//g, logo || '');
}

export function htmlForAi(state) {
    const html = currentDemoHtml(state)
        || (state.data && state.data.demo && state.data.demo.hero
            ? serializeLandingDocument(state)
            : '');
    return compactHtmlForAi(html, state.data && state.data.identidade);
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
  display: none !important;
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
        doc.querySelectorAll('.dpl-topbar-logo, img[data-dp-logo]').forEach((img) => {
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
        doc.querySelectorAll('.dpl-hero-logo').forEach((img) => {
            const inner = img.closest('.dpl-hero-inner');
            img.remove();
            if (inner && !inner.querySelector('.dpl-hero-name')) {
                const name = doc.createElement('div');
                name.className = 'dpl-hero-name';
                name.textContent = alt;
                inner.insertBefore(name, inner.querySelector('.dpl-hero-title') || inner.firstChild);
            }
        });
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
    const fotos = fotosOf(identidade);
    const hero = doc.querySelector('.dpl-hero-visual');
    if (hero && fotos[0]) fillVisual(hero, fotos[0]);
    const sobre = doc.querySelector('.dpl-sobre-visual');
    if (sobre && fotos[1]) fillVisual(sobre, fotos[1]);
    doc.querySelectorAll('.dpl-galeria-tile').forEach((tile, i) => {
        if (fotos[i]) fillVisual(tile, fotos[i]);
    });

    doc.querySelectorAll('[data-dp-photo]').forEach((node) => {
        const index = Number(node.getAttribute('data-dp-photo'));
        const url = fotos[index];
        if (!url) return;
        if (node.tagName === 'IMG' || node.tagName === 'SOURCE') node.setAttribute('src', url);
        else fillVisual(node, url);
    });

    const landingHasSlots = Boolean(doc.querySelector('.dpl-galeria, .dpl-hero-visual, [data-dp-photo]'));
    let strip = doc.querySelector('[data-dp-photos]');
    if (landingHasSlots || !fotos.length) {
        if (strip) strip.remove();
        return;
    }
    if (!strip) {
        strip = doc.createElement('div');
        strip.setAttribute('data-dp-photos', '');
        if (doc.body) doc.body.appendChild(strip);
        else return;
    }
    strip.setAttribute('hidden', '');
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
    const raw = restoreHtmlPlaceholders(extractHtml(html), identidade);
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

function stateWithImagePlaceholders(state) {
    const identidade = (state && state.data && state.data.identidade) || {};
    const fotos = fotosOf(identidade);
    const logo = identidade.logo || {};
    return {
        ...state,
        data: {
            ...(state.data || {}),
            identidade: {
                ...identidade,
                logo: logo.tipo === 'upload' && logo.dataUrl
                    ? { tipo: 'upload', dataUrl: DP_LOGO }
                    : logo,
                fotos: fotos.map((_, i) => dpPhoto(i))
            }
        }
    };
}

export function serializeLandingDocument(state) {
    const node = renderLanding(stateWithImagePlaceholders(state));
    const dados = state.data.dados || {};
    const cores = (state.data.identidade && state.data.identidade.cores) || {};
    const nome = dados.nome_negocio || 'Demonstração';
    const html = `<!DOCTYPE html>
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
    return compactHtmlForAi(html, state.data && state.data.identidade);
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
    const identidade = state.data.identidade || {};
    const cores = (identidade.cores) || {};
    const fotos = fotosOf(identidade);
    const compact = compactHtmlForAi(html, identidade);
    const slots = [
        logoDataUrl(identidade) ? 'dp-logo:// (logótipo)' : '',
        ...fotos.map((_, i) => `dp-photo://${i} (foto ${i + 1})`)
    ].filter(Boolean);
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
- Usa sempre var(--base), var(--destaque), var(--secundaria) e reserva .brand para o logo.
- Fotos e logo no HTML são PLACEHOLDERS curtos, nunca data:image nem base64:
  ${slots.length ? slots.join(', ') : '(ainda não há fotos — podes deixar dp-photo://0 no sítio da primeira foto)'}.
- Mantém o placeholder no sítio onde a foto deve ficar. Podes movê-lo. Se não quiseres foto nesse sítio, apaga o placeholder.
- Em CSS: url(dp-photo://0). A app substitui depois pelas fotos reais.

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
- NÃO substituas dp-photo:// nem dp-logo:// por URLs reais, stock ou data:image.

HTML ACTUAL
${compact || '(ainda não há HTML — cria a primeira versão a partir do negócio e do pedido. Usa dp-photo://0, dp-photo://1 e dp-logo:// nos sítios das imagens.)'}
`;
}

export function mountHtmlPreview(host, html, { identidade, dados } = {}) {
    const iframe = document.createElement('iframe');
    iframe.className = 'dp-preview-frame';
    iframe.title = 'Pré-visualização HTML';
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.style.cssText = 'width:100%;height:100%;border:0;background:#111;display:block;';
    iframe.setAttribute('scrolling', 'yes');
    host.appendChild(iframe);
    const source = extractHtml(html);
    iframe.srcdoc = identidade
        ? applyIdentityToHtml(source, identidade, dados)
        : source;
    return iframe;
}
