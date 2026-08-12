import { SECTION_LIMITS } from './prompt.js';

// Strict parse of the pasted LLM output. Only the accepted sections survive;
// anything else is ignored, and every string is clamped to its limit.

function clamp(value, max) {
    const text = String(value == null ? '' : value).trim();
    return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function extractJson(raw) {
    let text = String(raw || '').trim();
    // strip ```json ... ``` or ``` ... ``` fences
    text = text.replace(/```(?:json)?/gi, '');
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first === -1 || last === -1 || last <= first) return null;
    const slice = text.slice(first, last + 1);
    try {
        return JSON.parse(slice);
    } catch (_) {
        return null;
    }
}

export function parseDemoOutput(raw) {
    const json = extractJson(raw);
    if (!json || typeof json !== 'object') {
        return { ok: false, error: 'Não encontrei um JSON válido. Cole o resultado completo do assistente.' };
    }

    const L = SECTION_LIMITS;
    const hero = json.hero || {};
    const sobre = json.sobre || {};
    const servicos = json.servicos || {};
    const diferenciais = json.diferenciais || {};
    const rodape = json.rodape || {};

    const heroTitulo = clamp(hero.titulo, L.hero.titulo);
    if (!heroTitulo) {
        return { ok: false, error: 'Falta o título principal (hero.titulo). Verifique o conteúdo colado.' };
    }

    const servicosItens = (Array.isArray(servicos.itens) ? servicos.itens : [])
        .map((item) => ({
            nome: clamp(item && item.nome, L.servicos.nome),
            descricao: clamp(item && item.descricao, L.servicos.descricao)
        }))
        .filter((item) => item.nome)
        .slice(0, L.servicos.maxItens);

    if (servicosItens.length < L.servicos.minItens) {
        return { ok: false, error: `São precisos pelo menos ${L.servicos.minItens} serviços.` };
    }

    const diferenciaisItens = (Array.isArray(diferenciais.itens) ? diferenciais.itens : [])
        .map((item) => clamp(item, L.diferenciais.item))
        .filter(Boolean)
        .slice(0, L.diferenciais.maxItens);

    if (diferenciaisItens.length < L.diferenciais.minItens) {
        return { ok: false, error: `São precisos pelo menos ${L.diferenciais.minItens} diferenciais.` };
    }

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
        rodape: {
            texto: clamp(rodape.texto, L.rodape.texto)
        }
    };

    return { ok: true, demo };
}
