import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { formatEuros } from '../format.js';
import { ensureProposta, computeProposta, resolveIvaRate } from '../proposal-calc.js';
import { renderAsk } from '../substep.js';
import { appendAdminHint } from '../admin-redirects.js';

function isValid(state) {
    return Boolean(state.data.proposta && state.data.proposta.pacote);
}

function isSubstepValid(state) {
    return isValid(state);
}

function substepCount() {
    return 1;
}

function summaryLine(label, value, opts = {}) {
    const row = document.createElement('div');
    row.className = `sum-line${opts.strong ? ' sum-strong' : ''}${opts.muted ? ' sum-muted' : ''}${opts.discount ? ' sum-discount' : ''}`;
    row.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    row.appendChild(Object.assign(document.createElement('span'), { className: 'sum-value', textContent: value }));
    return row;
}

function fillSummary(wrap, c) {
    wrap.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'sum-card';
    card.appendChild(summaryLine('Serviços selecionados', formatEuros(c.subtotal)));
    if (c.urgencia > 0) {
        card.appendChild(summaryLine(`Urgência (+${Math.round(c.urgenciaPct * 100)}%)`, `+${formatEuros(c.urgencia)}`));
    }
    if (c.desconto > 0) {
        card.appendChild(summaryLine(`Desconto (−${c.descontoPct}%)`, `−${formatEuros(c.desconto)}`, { discount: true }));
    }
    card.appendChild(Object.assign(document.createElement('div'), { className: 'sum-divider' }));
    if (c.iva > 0) {
        card.appendChild(summaryLine('Total s/ IVA', formatEuros(c.totalSemIva)));
        card.appendChild(summaryLine(`IVA (${Math.round(c.ivaRate * 100)}%)`, `+${formatEuros(c.iva)}`, { muted: true }));
    }
    card.appendChild(summaryLine(c.iva > 0 ? 'Total c/ IVA' : 'Total', formatEuros(c.totalComIva), { strong: true }));
    card.appendChild(summaryLine('Entrada hoje (50%)', formatEuros(c.entrada)));
    card.appendChild(summaryLine('Na entrega (50%)', formatEuros(c.final)));
    if (c.manutencaoMensal > 0) {
        const mensal = c.iva > 0 ? c.manutencaoMensalComIva : c.manutencaoMensal;
        card.appendChild(summaryLine('Manutenção', `${formatEuros(mensal)}/mês`, { muted: true }));
    }
    wrap.appendChild(card);
}

async function render(body, ctx) {
    const proposta = ensureProposta(ctx.state);
    const businessType = ctx.state.data.businessType || {};

    let catalog = ctx.state.data._catalog;
    let config = ctx.state.data._config;
    if (!catalog || !config) {
        const loading = document.createElement('div');
        loading.className = 'placeholder';
        loading.textContent = 'A calcular…';
        body.appendChild(loading);
        try {
            catalog = catalog || await fetchCatalog(ctx);
            config = config || await fetchConfig(ctx);
        } catch (_) {
            loading.textContent = 'Não foi possível carregar o catálogo.';
            ctx.setValid(false);
            return;
        }
        if (!catalog || !config) return;
        ctx.update({ _catalog: catalog, _config: config });
        loading.remove();
    }

    function recompute() {
        const rate = resolveIvaRate(proposta, config.ivaRate);
        const c = computeProposta(proposta, catalog, businessType, rate);
        ctx.update({ proposta: { ...proposta, _calc: c }, _catalog: catalog, _config: config });
        ctx.setValid(true);
        return c;
    }

    const { control } = renderAsk(body, {
        title: 'Resumo para o cliente',
        hint: 'Mostre o total e a entrada. IVA e desconto: no admin → Continuar venda.',
        index: 0,
        total: 1
    });
    const wrap = document.createElement('div');
    control.appendChild(wrap);
    fillSummary(wrap, recompute());
    appendAdminHint(control, 'extras');
}

export const proposalStep = {
    name: 'Proposta',
    title: 'Resumo financeiro',
    subtitle: 'Um ecrã. IVA e desconto no admin se precisar.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
