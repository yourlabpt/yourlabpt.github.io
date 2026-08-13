import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { formatEuros } from '../format.js';
import { ensureProposta, computeProposta, resolveIvaRate } from '../proposal-calc.js';
import { currentSubstep, renderAsk, askChoices } from '../substep.js';

const DISCOUNT_PRESETS = [0, 5, 10, 15, 20];

function isValid(state) {
    return Boolean(state.data.proposta && state.data.proposta.pacote);
}

function isSubstepValid(state) {
    return isValid(state);
}

function substepCount() {
    return 3;
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

    const idx = currentSubstep(ctx.state);

    function recompute() {
        const rate = resolveIvaRate(proposta, config.ivaRate);
        const c = computeProposta(proposta, catalog, businessType, rate);
        ctx.update({ proposta: { ...proposta, _calc: c }, _catalog: catalog, _config: config });
        ctx.setValid(true);
        return c;
    }

    if (idx === 0) {
        const { control } = renderAsk(body, {
            title: 'Fatura com IVA?',
            hint: 'Enquanto não houver empresa aberta, deixe sem IVA.',
            index: 0,
            total: 3
        });
        const ivaOnLabel = config.ivaRate > 0
            ? `Com IVA (${Math.round(config.ivaRate * 100)}%)`
            : 'Com IVA';
        askChoices(control, [
            { id: 'off', name: 'Sem IVA', desc: 'Sem fatura com IVA neste momento' },
            { id: 'on', name: ivaOnLabel, desc: config.ivaRate > 0 ? 'Só quando for emitir fatura' : 'A taxa está desligada no servidor' }
        ], {
            selected: proposta.cobrarIva === true ? 'on' : 'off',
            onSelect: (item) => {
                if (item.id === 'on' && config.ivaRate <= 0) return;
                proposta.cobrarIva = item.id === 'on';
                recompute();
            }
        });
        recompute();
        return;
    }

    if (idx === 1) {
        const { control } = renderAsk(body, {
            title: 'Há desconto?',
            hint: 'O valor de tabela nunca desaparece.',
            index: 1,
            total: 3
        });
        const chips = document.createElement('div');
        chips.className = 'disc-chips';
        const customWrap = document.createElement('div');
        customWrap.className = `disc-custom${DISCOUNT_PRESETS.includes(proposta.descontoPct) ? ' hidden' : ''}`;
        const customInput = document.createElement('input');
        customInput.type = 'number';
        customInput.min = '0';
        customInput.max = '100';
        customInput.className = 'field-input';
        customInput.placeholder = '%';
        customInput.value = DISCOUNT_PRESETS.includes(proposta.descontoPct) ? '' : String(proposta.descontoPct);

        function paintChips() {
            chips.querySelectorAll('.disc-chip').forEach((chip) => {
                const pct = chip.dataset.pct;
                chip.classList.toggle('active', pct !== 'outro' && Number(pct) === proposta.descontoPct);
            });
            const outro = chips.querySelector('[data-pct="outro"]');
            if (outro) outro.classList.toggle('active', !DISCOUNT_PRESETS.includes(proposta.descontoPct));
        }

        DISCOUNT_PRESETS.forEach((pct) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'disc-chip';
            chip.dataset.pct = String(pct);
            chip.textContent = `${pct}%`;
            chip.addEventListener('click', () => {
                proposta.descontoPct = pct;
                customWrap.classList.add('hidden');
                paintChips();
                recompute();
            });
            chips.appendChild(chip);
        });
        const outroChip = document.createElement('button');
        outroChip.type = 'button';
        outroChip.className = 'disc-chip';
        outroChip.dataset.pct = 'outro';
        outroChip.textContent = 'Outro';
        outroChip.addEventListener('click', () => {
            customWrap.classList.remove('hidden');
            customInput.focus();
            paintChips();
        });
        chips.appendChild(outroChip);
        customInput.addEventListener('input', () => {
            proposta.descontoPct = Math.max(0, Math.min(100, Number(customInput.value) || 0));
            paintChips();
            recompute();
        });
        customWrap.appendChild(customInput);
        control.append(chips, customWrap);
        paintChips();
        recompute();
        return;
    }

    const { control } = renderAsk(body, {
        title: 'Resumo para o cliente',
        hint: 'Mostre o total e a entrada. Sem valor-hora no ecrã.',
        index: 2,
        total: 3
    });
    const wrap = document.createElement('div');
    control.appendChild(wrap);
    fillSummary(wrap, recompute());
}

export const proposalStep = {
    name: 'Proposta',
    title: 'Resumo financeiro',
    subtitle: 'O valor de tabela nunca desaparece. Mostre serviços → desconto → total → entrada.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
