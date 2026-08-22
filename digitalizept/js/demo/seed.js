import { SECTION_LIMITS as L } from './prompt.js';
import { interpolate, rotulo } from './boilerplate.js';

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

function seedServicos(businessType, dados, seed) {
    const fromSeed = Array.isArray(seed.servicos_itens) ? seed.servicos_itens : [];
    const source = (fromSeed.length
        ? fromSeed
        : (Array.isArray(businessType.servicos_tipicos) ? businessType.servicos_tipicos : [])
    ).slice(0, L.servicos.maxItens);
    return padItems(
        source.map((item) => {
            if (item && typeof item === 'object') {
                return {
                    nome: clamp(item.nome, L.servicos.nome),
                    descricao: clamp(item.descricao || dados.principais_servicos || '', L.servicos.descricao)
                };
            }
            return {
                nome: clamp(item, L.servicos.nome),
                descricao: clamp(dados.principais_servicos || seed.servico_desc || '', L.servicos.descricao)
            };
        }).filter((item) => item.nome),
        L.servicos.minItens,
        (i) => ({ nome: `Serviço ${i + 1}`, descricao: '' })
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
    if (state.data.demo && state.data.demo.hero && state.data.demo.hero.titulo) {
        return state.data.demo;
    }
    const demo = seedDemoFromType(state);
    state.data.demo = demo;
    state.data.demoSeeded = true;
    return demo;
}
