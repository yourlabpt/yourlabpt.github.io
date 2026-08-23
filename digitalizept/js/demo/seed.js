import { SECTION_LIMITS as L } from './prompt.js';
import { interpolate, rotulo, splitItems } from './boilerplate.js';

function clamp(value, max) {
    const text = String(value == null ? '' : value).trim();
    return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text;
}

function firstCta(businessType) {
    const ctas = Array.isArray(businessType.ctas_hero) ? businessType.ctas_hero : [];
    const first = ctas[0];
    if (!first) return 'Contactar';
    return String(first.label || first).trim() || 'Contactar';
}

function padItems(items, min, fallback) {
    const next = items.slice();
    while (next.length < min) next.push(fallback(next.length));
    return next;
}

function itemNome(item) {
    if (item && typeof item === 'object') return String(item.nome || '').trim();
    return String(item || '').trim();
}

// The typed list describes the whole business, never one service, so it is not a
// per-item fallback: reuse the category description that matches the name, or none.
function seedDescricao(nome, seed) {
    const key = String(nome || '').trim().toLowerCase();
    if (!key) return '';
    const itens = Array.isArray(seed.servicos_itens) ? seed.servicos_itens : [];
    const match = itens.find((item) => itemNome(item).toLowerCase() === key);
    return match ? String(match.descricao || '').trim() : '';
}

function mapServico(item, dados, seed) {
    if (item && typeof item === 'object') {
        return {
            nome: clamp(item.nome, L.servicos.nome),
            descricao: clamp(item.descricao || seedDescricao(item.nome, seed), L.servicos.descricao),
            preco: String(item.preco || '').trim()
        };
    }
    return {
        nome: clamp(item, L.servicos.nome),
        descricao: clamp(seedDescricao(item, seed), L.servicos.descricao),
        preco: ''
    };
}

function seedServicos(businessType, dados, seed) {
    const fromSeed = Array.isArray(seed.servicos_itens) ? seed.servicos_itens : [];
    const fromType = Array.isArray(businessType.servicos_tipicos) ? businessType.servicos_tipicos : [];
    const fallback = fromSeed.length ? fromSeed : fromType;
    const typed = splitItems(dados.principais_servicos);
    const used = new Set();
    const source = [];

    typed.forEach((nome) => {
        if (source.length >= L.servicos.maxItens) return;
        const key = nome.toLowerCase();
        if (used.has(key)) return;
        used.add(key);
        source.push({ nome, descricao: '', preco: '' });
    });

    fallback.forEach((item) => {
        const cap = typed.length ? L.servicos.minItens : L.servicos.maxItens;
        if (source.length >= cap) return;
        const nome = itemNome(item);
        if (!nome) return;
        const key = nome.toLowerCase();
        if (used.has(key)) return;
        used.add(key);
        source.push(item);
    });

    const mapped = source.map((item) => mapServico(item, dados, seed)).filter((item) => item.nome);
    if (mapped.length >= L.servicos.minItens || !fallback.length) {
        return mapped.slice(0, L.servicos.maxItens);
    }
    return padItems(
        mapped,
        L.servicos.minItens,
        (i) => mapServico(fallback[i % fallback.length], dados, seed)
    );
}

function seedReviews(businessType, dados) {
    const fromType = businessType.demo_seed && Array.isArray(businessType.demo_seed.avaliacoes)
        ? businessType.demo_seed.avaliacoes
        : [];
    if (fromType.length) {
        return fromType.slice(0, L.avaliacoes.maxItens).map((item) => ({
            autor: clamp(item.autor || 'Cliente', L.avaliacoes.autor),
            texto: clamp(interpolate(item.texto || item, dados, businessType), L.avaliacoes.texto)
        }));
    }
    const nome = dados.nome_negocio || 'aqui';
    return [
        { autor: 'Cliente da zona', texto: clamp(`Atendimento próximo — voltamos a ${nome} de boa vontade.`, L.avaliacoes.texto) },
        { autor: 'Vizinho', texto: 'Fácil de contactar e claro no que fazem.' }
    ];
}

export function isCustomDemo(state) {
    const d = (state && state.data) || {};
    if (String(d.demoHtml || '').trim() && d.demoHtmlSource !== 'boilerplate') return true;
    if (d.demoSeeded === true) return false;
    if (d.demo && d.demo.hero && d.demo.hero.titulo) return true;
    if (String(d.demoRaw || '').trim()) return true;
    return false;
}

export function seedDemoFromType(state) {
    const businessType = (state.data && state.data.businessType) || {};
    const dados = (state.data && state.data.dados) || {};
    const seed = businessType.demo_seed || {};
    const nome = dados.nome_negocio || seed.nome_negocio || businessType.nome || 'O seu negócio';
    const cidade = dados.cidade || seed.cidade || '';
    const diffsFonte = Array.isArray(businessType.diferenciais_sugeridos)
        ? businessType.diferenciais_sugeridos
        : [];

    const servicos = seedServicos(businessType, dados, seed);

    const diferenciais = padItems(
        diffsFonte.slice(0, L.diferenciais.maxItens).map((item) => clamp(item, L.diferenciais.item)).filter(Boolean),
        L.diferenciais.minItens,
        () => 'Atendimento próximo'
    );

    const sobreFonte = dados.o_que_faz || dados.diferencial || seed.sobre
        || (cidade ? `${nome} em ${cidade}.` : `${nome}.`);
    const subFonte = seed.subtitulo
        || (cidade ? `${businessType.nome || 'Negócio local'} em ${cidade}` : (businessType.nome || ''));

    return {
        hero: {
            titulo: clamp(seed.titulo || nome, L.hero.titulo),
            subtitulo: clamp(interpolate(subFonte, { ...dados, nome_negocio: nome, cidade }, businessType), L.hero.subtitulo),
            cta: clamp(firstCta(businessType), L.hero.cta)
        },
        sobre: {
            titulo: rotulo(businessType, 'sobre', 'Sobre nós'),
            texto: clamp(interpolate(sobreFonte, { ...dados, nome_negocio: nome, cidade }, businessType), L.sobre.texto)
        },
        servicos: {
            titulo: rotulo(businessType, 'servicos', 'Serviços'),
            itens: servicos
        },
        diferenciais: {
            titulo: rotulo(businessType, 'diferenciais', 'Porquê vir'),
            itens: diferenciais
        },
        problemas: {
            titulo: businessType.problemas_titulo || rotulo(businessType, 'problemas', 'Para quando precisa'),
            itens: Array.isArray(seed.problemas)
                ? seed.problemas.map((item) => clamp(item, L.problemas.item))
                : []
        },
        avaliacoes: {
            titulo: rotulo(businessType, 'avaliacoes', 'O que dizem'),
            itens: seedReviews(businessType, { ...dados, nome_negocio: nome, cidade })
        },
        rodape: {
            texto: clamp(
                interpolate(seed.rodape || (cidade ? `${nome} · ${cidade}` : nome), { nome_negocio: nome, cidade }, businessType),
                L.rodape.texto
            )
        }
    };
}

export function ensureSeededDemo(state) {
    if (isCustomDemo(state)) {
        return state.data.demo || null;
    }
    const demo = seedDemoFromType(state);
    state.data.demo = demo;
    state.data.demoSeeded = true;
    return demo;
}
