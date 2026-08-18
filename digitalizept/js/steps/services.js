import { fetchCatalog } from '../catalog.js';
import { formatEuros } from '../format.js';
import { ensureProposta, ensureManutencoes, setManutencoes } from '../proposal-calc.js';
import { ensureDominio, isDominioValid, refreshDominioCandidates } from '../domain.js';
import { includesWebsite } from '../deal/packages.js';
import { currentSubstep, renderAsk, askChoices, askText } from '../substep.js';
import { buildPackagePitchPrompt, plainAiText, renderOptionalAi } from '../optional-ai.js';

const BEGINNER_EXTRAS = [
    'google_perfil_completo',
    'google_avaliacoes',
    'assistencia_uso',
    'ajuda_dominio_cliente',
    'conta_email_gmail',
    'whatsapp_negocio',
    'ligacao_redes',
    'conteudo_visual'
];

function isValid(state) {
    const p = ensureProposta(state);
    return Boolean(p && p.pacote && isDominioValid(p));
}

function catalogOf(state) {
    return Array.isArray(state.data._catalog) ? state.data._catalog : [];
}

function relevantExtras(catalog, proposta) {
    const extras = (catalog || []).filter((s) => s.tipo === 'extra');
    const hasWebsite = includesWebsite(proposta);
    const isGoogleOnly = proposta && proposta.pacote === 'google_essencial';

    return extras.filter((s) => {
        if (s.codigo === 'ajuda_dominio_cliente' && !hasWebsite) return false;
        if (s.codigo === 'whatsapp_negocio' && isGoogleOnly) return false;
        if (s.codigo === 'ligacao_redes' && isGoogleOnly) return false;
        if (s.codigo === 'google_perfil_completo' && proposta.pacote !== 'google_essencial') return false;
        return true;
    });
}

function extrasByGroup(catalog, proposta) {
    const extras = relevantExtras(catalog, proposta);
    const beginner = [];
    const rest = [];
    extras.forEach((s) => {
        if (BEGINNER_EXTRAS.includes(s.codigo)) beginner.push(s);
        else rest.push(s);
    });
    beginner.sort((a, b) => BEGINNER_EXTRAS.indexOf(a.codigo) - BEGINNER_EXTRAS.indexOf(b.codigo));
    return { beginner, rest };
}

function manutencaoPlans(catalog, proposta) {
    const plans = (catalog || []).filter((s) => s.tipo === 'manutencao');
    const hasWebsite = includesWebsite(proposta);
    const isPlus = proposta && (proposta.pacote === 'plus' || proposta.pacote === 'renovacao');
    return plans.filter((s) => {
        if (s.codigo === 'hosting_landing' && (!hasWebsite || isPlus)) return false;
        if (s.codigo === 'hosting_site' && !isPlus) return false;
        return true;
    });
}

function pagesFor(state) {
    const catalog = catalogOf(state);
    const proposta = state.data.proposta || {};
    const { beginner, rest } = extrasByGroup(catalog, proposta);
    const pages = [];
    // Pacote is chosen in Diagnóstico; allow override here if needed.
    pages.push({ kind: 'pacote' });
    if (includesWebsite(proposta)) pages.push({ kind: 'dominio' });
    beginner.forEach((servico) => pages.push({ kind: 'extra', servico }));
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
            title: 'Confirmar o pacote',
            hint: 'Já veio do diagnóstico — pode ainda mudar aqui.',
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
            goNext: ctx.goNext,
            onSelect: (item) => {
                proposta.pacote = item.id;
                persist();
            }
        });
        if (ctx.state.data.packagePitch) {
            const pitch = document.createElement('p');
            pitch.className = 'ask-hint';
            pitch.textContent = ctx.state.data.packagePitch;
            control.appendChild(pitch);
        }
        if (!ctx.state.data.packagePitchPrompt) {
            ctx.state.data.packagePitchPrompt = buildPackagePitchPrompt(ctx.state);
        }
        renderOptionalAi(control, {
            title: 'Como dizer o pacote (opcional)',
            hint: 'Não altera extras nem preços. Só uma frase para a conversa.',
            prompt: ctx.state.data.packagePitchPrompt,
            placeholder: 'Cole a frase…',
            ctx,
            onPromptChange: (value) => {
                ctx.state.data.packagePitchPrompt = value;
                ctx.update({ packagePitchPrompt: value });
            },
            onApply: (raw) => {
                const texto = plainAiText(raw);
                ctx.state.data.packagePitch = texto;
                ctx.update({ packagePitch: texto, packagePitchPrompt: ctx.state.data.packagePitchPrompt });
                ctx.showToast('Frase guardada.');
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
                goNext: ctx.goNext,
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
            goNext: ctx.goNext,
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
            goNext: ctx.goNext,
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
            goNext: ctx.goNext,
            onSelect: (item) => {
                proposta.urgencia = item.id === 'yes';
                persist();
            }
        });
        persist();
        return;
    }

    if (page.kind === 'manutencao') {
        const planos = manutencaoPlans(catalog, proposta);
        const selected = new Set(ensureManutencoes(proposta));
        const { control } = renderAsk(body, {
            title: 'Manutenção mensal?',
            hint: 'Pode combinar Maps e hosting. Toque para ligar/desligar cada opção.',
            index: idx,
            total: pages.length
        });

        const choices = [
            { id: '', name: 'Nenhum', desc: 'Sem mensalidade neste acordo.' },
            ...planos.map((s) => ({
                id: s.codigo,
                name: s.nome,
                desc: s.descricao_cliente,
                meta: `${priceLabel(s)}/mês`
            }))
        ];

        askChoices(control, choices, {
            selected: (item) => {
                if (!item.id) return selected.size === 0;
                return selected.has(item.id);
            },
            autoAdvance: false,
            onSelect: (item) => {
                if (!item.id) {
                    setManutencoes(proposta, []);
                } else {
                    const next = new Set(ensureManutencoes(proposta));
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    setManutencoes(proposta, [...next]);
                }
                persist();
                // Re-render so multi-select state paints correctly
                body.innerHTML = '';
                render(body, ctx);
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
    title: 'Extras e manutenção',
    subtitle: 'Confirme o pacote, domínio (se houver site), extras e mensais Maps/hosting.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
