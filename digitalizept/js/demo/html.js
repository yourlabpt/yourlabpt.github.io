import { renderLanding } from './landing.js';

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
        .replace(/^```(?:html|htm)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
}

// Models often emit en-dashes in CSS variables (var(–base)) and curly quotes
// in content/font-family. Both make the demo look like a blank page.
export function sanitizeDemoHtml(html) {
    let out = String(html || '');
    out = out.replace(/var\(\s*[\u2013\u2014\u2212]/g, 'var(--');
    out = out.replace(/(^|[{;\s])[\u2013\u2014\u2212]([A-Za-z_])/gm, '$1--$2');
    out = out.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (full, attrs, css) => {
        const clean = String(css)
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
        return `<style${attrs}>${clean}</style>`;
    });
    return out;
}

export function looksLikeHtml(text) {
    const raw = unwrapFence(text);
    if (!raw) return false;
    return /^\s*</.test(raw) && /<\/[a-z]|<!DOCTYPE|<html|<div|<main|<section/i.test(raw);
}

export function extractHtml(text) {
    return sanitizeDemoHtml(unwrapFence(text));
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

CORES (usa-as como CSS variables)
- base: ${cores.base || '#1b1b1b'}
- destaque: ${cores.destaque || '#e8d5b7'}
- secundaria: ${cores.secundaria || '#7a8a99'}

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

HTML ACTUAL
${html || '(ainda não há HTML — cria a primeira versão a partir do negócio e do pedido.)'}
`;
}

export function mountHtmlPreview(host, html) {
    const iframe = document.createElement('iframe');
    iframe.className = 'dp-preview-frame';
    iframe.title = 'Pré-visualização HTML';
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    iframe.srcdoc = extractHtml(html);
    host.appendChild(iframe);
    return iframe;
}
