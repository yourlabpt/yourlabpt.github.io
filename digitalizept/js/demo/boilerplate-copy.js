/** Fill Sem fotos HTML from the same `demo` object Com fotos uses. */

import { seedDemoFromType } from './seed.js';
import {
    destaqueItems,
    interpolate,
    mapsHref,
    telHref,
    trustChips,
    whatsappHref
} from './boilerplate.js';

const LIST_LIMITS = {
    servicos: { min: 3, max: 6 },
    avaliacoes: { min: 0, max: 3 },
    diferenciais: { min: 0, max: 4 },
    destaques: { min: 0, max: 6 },
    trust: { min: 0, max: 6 }
};

function escapeText(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function initials(nome, type) {
    const fromName = String(nome || '')
        .split(/[^\p{L}0-9]+/u)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
    if (fromName) return fromName;
    return String((type && type.icone) || 'GE').slice(0, 2).toUpperCase();
}

function padIndex(i) {
    return String(i + 1).padStart(2, '0');
}

function scalarMap(state) {
    const data = (state && state.data) || {};
    const dados = data.dados || {};
    const type = data.businessType || {};
    const seed = type.demo_seed || {};
    const demo = seedDemoFromType(state);
    const nome = dados.nome_negocio || seed.nome_negocio || type.nome || 'O seu negócio';
    const cidade = dados.cidade || seed.cidade || 'a sua cidade';
    const sobreFonte = dados.o_que_faz || (demo.sobre && demo.sobre.texto) || seed.sobre || '';
    const sobre = interpolate(sobreFonte, { ...dados, nome_negocio: nome, cidade }, type);
    return {
        demo,
        dados,
        type,
        tokens: {
            nome,
            cidade,
            morada: dados.morada || 'Rua do Comércio',
            horario: dados.horario || 'Seg–Sáb, 9h–19h',
            telefone: dados.telefone || dados.whatsapp || '',
            whatsapp: dados.whatsapp || dados.telefone || '',
            sobre,
            monogram: initials(nome, type),
            negocioNome: nome,
            'hero.titulo': (demo.hero && demo.hero.titulo) || nome,
            'hero.subtitulo': (demo.hero && demo.hero.subtitulo) || '',
            'hero.cta': (demo.hero && demo.hero.cta) || 'Contactar'
        }
    };
}

function applyTokens(html, tokens) {
    let out = String(html || '');
    Object.keys(tokens).forEach((key) => {
        const value = escapeText(tokens[key]);
        out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    });
    return out;
}

function setCopyValue(html, key, value) {
    if (!value) return html;
    const attr = `data-dp-copy="${key}"`;
    return html.replace(
        new RegExp(`(<[a-zA-Z][^>]*\\b${attr}[^>]*>)([\\s\\S]*?)(<\\/[a-zA-Z][^>]*>)`, 'gi'),
        (_, open, _inner, close) => `${open}${escapeText(value)}${close}`
    );
}

function applyCopyAttrs(html, tokens) {
    let out = html;
    Object.keys(tokens).forEach((key) => {
        out = setCopyValue(out, key, tokens[key]);
    });
    return out;
}

function findListBlocks(html, listName) {
    const blocks = [];
    const openRe = new RegExp(
        `<([a-zA-Z0-9]+)([^>]*\\bdata-dp-list=["']${listName}["'][^>]*)>`,
        'gi'
    );
    let match;
    while ((match = openRe.exec(html))) {
        const tag = match[1];
        const start = match.index;
        const afterOpen = openRe.lastIndex;
        const closeRe = new RegExp(`</${tag}>`, 'gi');
        closeRe.lastIndex = afterOpen;
        const close = closeRe.exec(html);
        if (!close) continue;
        const end = close.index + close[0].length;
        blocks.push({
            start,
            end,
            openTag: match[0],
            openAttrs: match[2] || '',
            tag,
            inner: html.slice(afterOpen, close.index)
        });
    }
    return blocks;
}

function extractItemTemplate(inner) {
    const openRe = /<([a-zA-Z0-9]+)([^>]*\bdata-dp-item\b[^>]*)>/i;
    const open = openRe.exec(inner);
    if (!open) return null;
    const tag = open[1];
    const start = open.index;
    const afterOpen = start + open[0].length;
    const closeRe = new RegExp(`</${tag}>`, 'i');
    const fromInner = inner.slice(afterOpen);
    const close = closeRe.exec(fromInner);
    if (!close) return null;
    const end = afterOpen + close.index + close[0].length;
    return {
        before: inner.slice(0, start),
        template: inner.slice(start, end),
        after: inner.slice(end)
    };
}

function fillItemTemplate(template, fields) {
    let out = template.replace(/\s+hidden(?:="[^"]*")?/gi, '');
    Object.keys(fields).forEach((key) => {
        const value = fields[key];
        if (value) {
            out = setCopyValue(out, key, value);
            return;
        }
        out = out.replace(
            new RegExp(`<([a-zA-Z0-9]+)([^>]*\\bdata-dp-copy=["']${key}["'][^>]*)>[\\s\\S]*?<\\/\\1>`, 'gi'),
            ''
        );
        out = out.replace(
            new RegExp(`<([a-zA-Z0-9]+)([^>]*\\bdata-dp-copy=["']${key}["'][^>]*)\\s*\\/?>`, 'gi'),
            ''
        );
    });
    return out;
}

function hideListOpen(openTag) {
    if (/\bhidden\b/i.test(openTag)) return openTag;
    return openTag.replace(/>$/, ' hidden>');
}

function applyRepeatingList(html, listName, items, limits) {
    const cap = Math.min((items || []).length, limits.max);
    const list = (items || []).slice(0, cap);
    const blocks = findListBlocks(html, listName);
    if (!blocks.length) return html;
    let out = html;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
        const block = blocks[i];
        const parsed = extractItemTemplate(block.inner);
        if (!parsed) continue;
        if (!list.length) {
            const hiddenOpen = hideListOpen(block.openTag);
            out = out.slice(0, block.start)
                + `${hiddenOpen}${block.inner}</${block.tag}>`
                + out.slice(block.end);
            continue;
        }
        const clones = list.map((item, index) => fillItemTemplate(parsed.template, itemFields(listName, item, index)));
        const inner = `${parsed.before}${clones.join('\n')}${parsed.after}`;
        out = out.slice(0, block.start)
            + `${block.openTag}${inner}</${block.tag}>`
            + out.slice(block.end);
    }
    return out;
}

function itemFields(listName, item, index) {
    if (listName === 'servicos') {
        return {
            'servico.n': padIndex(index),
            'servico.nome': item && item.nome,
            'servico.descricao': item && item.descricao,
            'servico.preco': item && item.preco
        };
    }
    if (listName === 'avaliacoes') {
        return {
            'avaliacao.texto': item && item.texto,
            'avaliacao.autor': item && item.autor
        };
    }
    const text = typeof item === 'string' ? item : (item && (item.texto || item.nome || item.label)) || '';
    if (listName === 'diferenciais') return { 'diferencial.texto': text };
    if (listName === 'destaques') return { 'destaque.texto': text };
    if (listName === 'trust') return { 'trust.texto': text };
    return {};
}

function applyLabels(html, rotulos) {
    const labels = rotulos || {};
    let out = html;
    Object.keys(labels).forEach((key) => {
        const value = labels[key];
        if (!value) return;
        out = out.replace(
            new RegExp(`(<[a-zA-Z][^>]*\\bdata-dp-label=["']${key}["'][^>]*>)([\\s\\S]*?)(<\\/[a-zA-Z][^>]*>)`, 'gi'),
            (_, open, _inner, close) => `${open}${escapeText(value)}${close}`
        );
    });
    return out;
}

function applyHrefs(html, dados) {
    const hrefs = {
        maps: mapsHref(dados),
        whatsapp: whatsappHref(dados),
        tel: telHref(dados)
    };
    let out = html;
    Object.keys(hrefs).forEach((key) => {
        const href = hrefs[key];
        if (!href) return;
        out = out.replace(
            new RegExp(`(data-dp-href=["']${key}["'][^>]*\\bhref=["'])[^"']*(["'])`, 'gi'),
            `$1${href}$2`
        );
        out = out.replace(
            new RegExp(`(\\bhref=["'][^"']*["'][^>]*data-dp-href=["']${key}["'])`, 'gi'),
            (full) => full.replace(/\bhref=["'][^"']*["']/, `href="${href}"`)
        );
    });
    return out;
}

function applyBrand(html, nome) {
    if (!nome) return html;
    return html.replace(
        /(<[a-zA-Z][^>]*\bclass=["'][^"']*\bdpl-topbar-brand\b[^"']*["'][^>]*>)([\s\S]*?)(<\/[a-zA-Z][^>]*>)/gi,
        (_, open, _inner, close) => `${open}${escapeText(nome)}${close}`
    );
}

function applyFallbackIcons(html, monogram) {
    if (!monogram) return html;
    return html.replace(
        /data-fallback-icon=""/g,
        `data-fallback-icon="${escapeText(monogram)}"`
    );
}

export function fillBoilerplateFromDemo(html, state) {
    const { demo, dados, type, tokens } = scalarMap(state);
    let out = applyTokens(html, tokens);
    out = applyCopyAttrs(out, tokens);
    out = applyRepeatingList(out, 'servicos', (demo.servicos && demo.servicos.itens) || [], LIST_LIMITS.servicos);
    out = applyRepeatingList(out, 'avaliacoes', (demo.avaliacoes && demo.avaliacoes.itens) || [], LIST_LIMITS.avaliacoes);
    out = applyRepeatingList(out, 'diferenciais', (demo.diferenciais && demo.diferenciais.itens) || [], LIST_LIMITS.diferenciais);
    out = applyRepeatingList(out, 'destaques', destaqueItems(dados, type), LIST_LIMITS.destaques);
    out = applyRepeatingList(out, 'trust', trustChips(dados, type), LIST_LIMITS.trust);
    out = applyLabels(out, type.rotulos);
    out = applyHrefs(out, dados);
    out = applyBrand(out, tokens.nome);
    out = applyFallbackIcons(out, tokens.monogram);
    return out;
}

export function fillBoilerplateCopy(html, dados, businessType) {
    return fillBoilerplateFromDemo(html, {
        data: { dados: dados || {}, businessType: businessType || {} }
    });
}
