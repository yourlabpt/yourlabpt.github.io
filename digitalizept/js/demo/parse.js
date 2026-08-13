import { SECTION_LIMITS } from './prompt.js';

// Strict schema, tolerant punctuation. Assistants often return curly quotes
// (“ ”) or wrap the object in markdown; the accepted shape is still exact.

function clamp(value, max) {
    const text = String(value == null ? '' : value).trim();
    return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function stripFences(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .replace(/```(?:json)?/gi, '')
        .trim();
}

function sliceObject(text) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return '';
    return text.slice(first, last + 1);
}

// Turn the punctuation models actually emit into JSON the parser can read.
// Schema validation after this step stays strict.
function normalizeJsonText(text) {
    return text
        .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
        .replace(/[\u2018\u2019\u201A]/g, "'")
        .replace(/,\s*([}\]])/g, '$1');
}

function parseObject(raw) {
    const sliced = sliceObject(stripFences(raw));
    if (!sliced) return null;
    try {
        return JSON.parse(sliced);
    } catch (_) {
        try {
            return JSON.parse(normalizeJsonText(sliced));
        } catch (_ignored) {
            return null;
        }
    }
}

export function parseDemoOutput(raw) {
    const json = parseObject(raw);
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
        return { ok: false, error: 'Não encontrei um JSON válido. Cole o objeto completo, de { a }.' };
    }

    const L = SECTION_LIMITS;
    const hero = json.hero || {};
    const sobre = json.sobre || {};
    const servicos = json.servicos || {};
    const diferenciais = json.diferenciais || {};
    const problemas = json.problemas || {};
    const avaliacoes = json.avaliacoes || {};
    const rodape = json.rodape || {};

    if (!hero || typeof hero !== 'object') {
        return { ok: false, error: 'Falta o objeto hero.' };
    }

    const heroTitulo = clamp(hero.titulo, L.hero.titulo);
    if (!heroTitulo) {
        return { ok: false, error: 'Falta hero.titulo.' };
    }

    const servicosItens = (Array.isArray(servicos.itens) ? servicos.itens : [])
        .map((item) => ({
            nome: clamp(item && item.nome, L.servicos.nome),
            descricao: clamp(item && item.descricao, L.servicos.descricao)
        }))
        .filter((item) => item.nome)
        .slice(0, L.servicos.maxItens);

    if (servicosItens.length < L.servicos.minItens) {
        return { ok: false, error: `servicos.itens: mínimo ${L.servicos.minItens}, máximo ${L.servicos.maxItens}.` };
    }

    const diferenciaisItens = (Array.isArray(diferenciais.itens) ? diferenciais.itens : [])
        .map((item) => clamp(item, L.diferenciais.item))
        .filter(Boolean)
        .slice(0, L.diferenciais.maxItens);

    if (diferenciaisItens.length < L.diferenciais.minItens) {
        return { ok: false, error: `diferenciais.itens: mínimo ${L.diferenciais.minItens}, máximo ${L.diferenciais.maxItens}.` };
    }

    const problemasItens = (Array.isArray(problemas.itens) ? problemas.itens : [])
        .map((item) => clamp(item, L.problemas.item))
        .filter(Boolean)
        .slice(0, L.problemas.maxItens);

    const avaliacoesItens = (Array.isArray(avaliacoes.itens) ? avaliacoes.itens : [])
        .map((item) => {
            if (typeof item === 'string') {
                return { autor: '', texto: clamp(item, L.avaliacoes.texto) };
            }
            return {
                autor: clamp(item && item.autor, L.avaliacoes.autor),
                texto: clamp(item && item.texto, L.avaliacoes.texto)
            };
        })
        .filter((item) => item.texto)
        .slice(0, L.avaliacoes.maxItens);

    const demo = {
        hero: {
            titulo: heroTitulo,
            subtitulo: clamp(hero.subtitulo, L.hero.subtitulo),
            cta: clamp(hero.cta, L.hero.cta) || 'Contactar'
        },
        sobre: {
            titulo: clamp(sobre.titulo, L.sobre.titulo) || 'Sobre nós',
            texto: clamp(sobre.texto, L.sobre.texto)
        },
        servicos: {
            titulo: clamp(servicos.titulo, L.servicos.titulo) || 'Serviços',
            itens: servicosItens
        },
        diferenciais: {
            titulo: clamp(diferenciais.titulo, L.diferenciais.titulo) || 'Porquê nós',
            itens: diferenciaisItens
        },
        problemas: {
            titulo: clamp(problemas.titulo, L.problemas.titulo) || 'Problemas que resolvemos',
            itens: problemasItens
        },
        avaliacoes: {
            titulo: clamp(avaliacoes.titulo, 40) || 'O que dizem',
            itens: avaliacoesItens
        },
        rodape: {
            texto: clamp(rodape.texto, L.rodape.texto)
        }
    };

    return { ok: true, demo };
}
