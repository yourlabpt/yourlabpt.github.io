import { fetchCatalog } from '../catalog.js';
import { formatEuros } from '../format.js';
import { ensureProposta } from '../proposal-calc.js';
import { ensureDominio, isDominioValid, refreshDominioCandidates } from '../domain.js';
import { currentSubstep, renderAsk, askChoices, askText } from '../substep.js';

const BEGINNER_EXTRAS = [
    'assistencia_uso',
    'ajuda_dominio_cliente',
    'conta_email_gmail',
    'whatsapp_negocio',
    'ligacao_redes'
];

function isValid(state) {
    const p = ensureProposta(state);
    return Boolean(p && p.pacote && isDominioValid(p));
}

function catalogOf(state) {
    return Array.isArray(state.data._catalog) ? state.data._catalog : [];
}

function extrasByGroup(catalog) {
    const extras = (catalog || []).filter((s) => s.tipo === 'extra');
    const beginner = [];
    const rest = [];
    extras.forEach((s) => {
        if (BEGINNER_EXTRAS.includes(s.codigo)) beginner.push(s);
        else rest.push(s);
    });
    beginner.sort((a, b) => BEGINNER_EXTRAS.indexOf(a.codigo) - BEGINNER_EXTRAS.indexOf(b.codigo));
    return { beginner, rest };
}

function pagesFor(state) {
    const catalog = catalogOf(state);
    const { beginner, rest } = extrasByGroup(catalog);
    const pages = [
        { kind: 'pacote' },
        { kind: 'dominio' },
        ...beginner.map((servico) => ({ kind: 'extra', servico }))
    ];
    if (rest.length) pages.push({ kind: 'extrasGate' });
    if (state.data.extrasMore && rest.length) {
        rest.forEach((servico) => pages.push({ kind: 'extra', servico }));
    }
    pages.push({ kind: 'urgencia' }, { kind: 'manutencao' }, { kind: 'contrapartida' });
    return pages;
}

function substepCount(state) {
    return pagesFor(state).length;
}

function isSubstepValid(state) {
    const pages = pagesFor(state);
    const page = pages[currentSubstep(state)];
    if (!page) return false;
    const proposta = state.data.proposta || {};
    if (page.kind === 'pacote') return Boolean(proposta.pacote);
    if (page.kind === 'dominio') return isDominioValid(proposta);
    return true;
}

function priceLabel(servico) {
    if (!servico) return '';
    if (servico.percentual) return `+${Math.round(servico.percentual * 100)}%`;
    return formatEuros(servico.preco_centimos);
}

function setExtra(proposta, codigo, on) {
    const idx = proposta.extras.indexOf(codigo);
    if (on && idx === -1) proposta.extras.push(codigo);
    if (!on && idx !== -1) proposta.extras.splice(idx, 1);
}

async function render(body, ctx) {
    const proposta = ensureProposta(ctx.state);
    if (!Array.isArray(ctx.state.data._catalog)) {
        const loading = document.createElement('div');
        loading.className = 'placeholder';
        loading.textContent = 'A carregar o catálogo…';
        body.appendChild(loading);
        let catalog;
        try {
            catalog = await fetchCatalog(ctx);
        } catch (_) {
            loading.textContent = 'Não foi possível carregar o catálogo.';
            ctx.setValid(false);
            return;
        }
        if (!catalog) return;
        ctx.update({ _catalog: catalog });
        loading.remove();
    }

    const pages = pagesFor(ctx.state);
    const idx = Math.min(currentSubstep(ctx.state), pages.length - 1);
    const page = pages[idx];
    const catalog = catalogOf(ctx.state);

    function persist() {
        ctx.update({ proposta, extrasMore: ctx.state.data.extrasMore === true, _catalog: catalog });
        ctx.setValid(isSubstepValid(ctx.state));
    }

    if (page.kind === 'pacote') {
        const packages = catalog.filter((s) => s.tipo === 'pacote');
        const { control } = renderAsk(body, {
            title: 'Qual é o pacote?',
            hint: 'Essencial chega para a maioria das lojas.',
            index: idx,
            total: pages.length
        });
        askChoices(control, packages.map((s) => ({
            id: s.codigo,
            name: s.nome,
            desc: s.descricao_cliente,
            meta: priceLabel(s)
        })), {
            selected: proposta.pacote,
            onSelect: (item) => {
                proposta.pacote = item.id;
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'dominio') {
        const dados = ctx.state.data.dados || {};
        const dominio = ensureDominio(proposta);
        const { control } = renderAsk(body, {
            title: 'Que domínio usar?',
            hint: 'Só aparecem nomes livres. Se nenhum servir, o cliente compra o próprio e recebe um ZIP.',
            index: idx,
            total: pages.length
        });
        const status = document.createElement('p');
        status.className = 'domain-status';
        status.textContent = 'A verificar disponibilidade…';
        control.appendChild(status);
        const listHost = document.createElement('div');
        control.appendChild(listHost);

        function paintChoices(items) {
            listHost.innerHTML = '';
            askChoices(listHost, items, {
                selected: (item) => (item.id === 'proprio'
                    ? dominio.modo === 'proprio'
                    : dominio.modo === 'sugerido' && dominio.escolhido === item.id),
                onSelect: (item) => {
                    if (item.id === 'proprio') {
                        dominio.modo = 'proprio';
                        dominio.escolhido = '';
                    } else {
                        dominio.modo = 'sugerido';
                        dominio.escolhido = item.id;
                    }
                    persist();
                }
            });
        }

        const own = {
            id: 'proprio',
            name: 'Cliente compra o próprio domínio',
            desc: 'Entrega do código em ZIP por email'
        };

        if (!dados.nome_negocio) {
            status.textContent = 'Preencha o nome do negócio no passo anterior.';
            paintChoices([own]);
            persist();
            return;
        }

        await refreshDominioCandidates(ctx, proposta, dados);
        const available = dominio.candidatos || [];
        if (!available.length) {
            status.textContent = 'Não encontrámos nomes livres agora. Use a opção de domínio próprio.';
        } else {
            status.textContent = `${available.length} nome${available.length > 1 ? 's' : ''} livre${available.length > 1 ? 's' : ''} para registar.`;
        }
        paintChoices([
            ...available.map((name) => ({ id: name, name, desc: 'Disponível para registar', meta: 'Livre' })),
            own
        ]);
        persist();
        return;
    }

    if (page.kind === 'extra') {
        const s = page.servico;
        const on = proposta.extras.includes(s.codigo);
        const { control } = renderAsk(body, {
            title: s.nome,
            hint: s.descricao_cliente || 'Opcional.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'yes', name: 'Sim', meta: priceLabel(s) },
            { id: 'no', name: 'Não' }
        ], {
            selected: on ? 'yes' : 'no',
            onSelect: (item) => {
                setExtra(proposta, s.codigo, item.id === 'yes');
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'extrasGate') {
        const { control } = renderAsk(body, {
            title: 'Quer ver mais extras?',
            hint: 'Páginas extra, catálogo, email no domínio, marcações… Pode saltar.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'no', name: 'Agora não' },
            { id: 'yes', name: 'Sim, ver o resto' }
        ], {
            selected: ctx.state.data.extrasMore === true ? 'yes' : 'no',
            onSelect: (item) => {
                ctx.state.data.extrasMore = item.id === 'yes';
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'urgencia') {
        const urgencia = catalog.find((s) => s.codigo === 'urgencia');
        const { control } = renderAsk(body, {
            title: 'Entrega em 48h?',
            hint: urgencia ? `Urgência ${priceLabel(urgencia)} sobre o subtotal.` : '',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: 'no', name: 'Não' },
            { id: 'yes', name: 'Sim' }
        ], {
            selected: proposta.urgencia ? 'yes' : 'no',
            onSelect: (item) => {
                proposta.urgencia = item.id === 'yes';
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'manutencao') {
        const planos = catalog.filter((s) => s.tipo === 'manutencao');
        const { control } = renderAsk(body, {
            title: 'Quer manutenção?',
            hint: 'Apresente sempre. Sem manutenção o cliente trata do alojamento.',
            index: idx,
            total: pages.length
        });
        askChoices(control, [
            { id: '', name: 'Sem manutenção' },
            ...planos.map((s) => ({
                id: s.codigo,
                name: s.nome,
                desc: s.descricao_cliente,
                meta: `${priceLabel(s)}/mês`
            }))
        ], {
            selected: proposta.manutencao || '',
            onSelect: (item) => {
                proposta.manutencao = item.id || null;
                persist();
            }
        });
        persist();
        return;
    }

    const { control } = renderAsk(body, {
        title: 'Há contrapartida?',
        hint: 'Fotos, depoimento, indicação — em troca de um desconto. Opcional.',
        index: idx,
        total: pages.length
    });
    askText(control, {
        value: proposta.contrapartida || '',
        rows: 3,
        placeholder: 'Opcional',
        onChange: (val) => {
            proposta.contrapartida = val;
            persist();
        }
    });
    persist();
}

export const servicesStep = {
    name: 'Serviços',
    title: 'Seleção de serviços',
    subtitle: 'Pacote, domínio e extras. Para quem tem pouca prática digital, acrescente a assistência de utilização.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
