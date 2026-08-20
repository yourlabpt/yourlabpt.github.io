import { SECTION_LIMITS as L } from './prompt.js';

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

export function seedDemoFromType(state) {
    const businessType = (state.data && state.data.businessType) || {};
    const dados = (state.data && state.data.dados) || {};
    const nome = dados.nome_negocio || businessType.nome || 'O seu negócio';
    const cidade = dados.cidade || '';
    const servicosFonte = Array.isArray(businessType.servicos_tipicos) ? businessType.servicos_tipicos : [];
    const diffsFonte = Array.isArray(businessType.diferenciais_sugeridos)
        ? businessType.diferenciais_sugeridos
        : [];

    const servicos = padItems(
        servicosFonte.slice(0, L.servicos.maxItens).map((name) => ({
            nome: clamp(name, L.servicos.nome),
            descricao: clamp(dados.principais_servicos || '', L.servicos.descricao)
        })).filter((item) => item.nome),
        L.servicos.minItens,
        (i) => ({ nome: `Serviço ${i + 1}`, descricao: '' })
    );

    const diferenciais = padItems(
        diffsFonte.slice(0, L.diferenciais.maxItens).map((item) => clamp(item, L.diferenciais.item)).filter(Boolean),
        L.diferenciais.minItens,
        () => 'Atendimento próximo'
    );

    const sobre = dados.o_que_faz || dados.diferencial
        || (cidade ? `${nome} em ${cidade}.` : `${nome}.`);

    return {
        hero: {
            titulo: clamp(nome, L.hero.titulo),
            subtitulo: clamp(
                cidade ? `${businessType.nome || 'Negócio local'} em ${cidade}` : (businessType.nome || ''),
                L.hero.subtitulo
            ),
            cta: clamp(firstCta(businessType), L.hero.cta)
        },
        sobre: {
            titulo: 'Sobre nós',
            texto: clamp(sobre, L.sobre.texto)
        },
        servicos: {
            titulo: 'Serviços',
            itens: servicos
        },
        diferenciais: {
            titulo: 'Porquê vir',
            itens: diferenciais
        },
        problemas: {
            titulo: 'Para quando precisa',
            itens: []
        },
        avaliacoes: {
            titulo: 'O que dizem',
            itens: [
                { autor: 'Cliente', texto: 'Atendimento próximo e de confiança.' },
                { autor: 'Vizinho', texto: 'Fica aqui ao lado — voltamos sempre.' }
            ]
        },
        rodape: {
            texto: clamp(cidade ? `${nome} · ${cidade}` : nome, L.rodape.texto)
        }
    };
}

export function ensureSeededDemo(state) {
    if (state.data.demo && state.data.demo.hero && state.data.demo.hero.titulo) {
        return state.data.demo;
    }
    // AI/HTML edits must not be replaced by the type boilerplate on re-entry.
    if (state.data.demoHtml) return state.data.demo || null;
    if (String(state.data.demoRaw || '').trim()) return state.data.demo || null;
    const demo = seedDemoFromType(state);
    state.data.demo = demo;
    state.data.demoSeeded = true;
    return demo;
}
