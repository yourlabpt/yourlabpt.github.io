import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { formatEuros } from '../format.js';
import { ensureProposta, computeProposta, resolveIvaRate } from '../proposal-calc.js';

const DISCOUNT_PRESETS = [0, 5, 10, 15, 20];

function isValid(state) {
    return Boolean(state.data.proposta && state.data.proposta.pacote);
}

function summaryLine(label, value, opts = {}) {
    const row = document.createElement('div');
    row.className = `sum-line${opts.strong ? ' sum-strong' : ''}${opts.muted ? ' sum-muted' : ''}${opts.discount ? ' sum-discount' : ''}`;
    row.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    row.appendChild(Object.assign(document.createElement('span'), { className: 'sum-value', textContent: value }));
    return row;
}

async function render(body, ctx) {
    const proposta = ensureProposta(ctx.state);
    const businessType = ctx.state.data.businessType || {};

    const loading = document.createElement('div');
    loading.className = 'placeholder';
    loading.textContent = 'A calcular…';
    body.appendChild(loading);

    let catalog;
    let config;
    try {
        catalog = await fetchCatalog(ctx);
        config = await fetchConfig(ctx);
    } catch (_) {
        loading.textContent = 'Não foi possível carregar o catálogo.';
        ctx.setValid(false);
        return;
    }
    if (!catalog || !config) return;
    loading.remove();

    // --- IVA toggle (per deal: no company / no fatura yet) ---
    const ivaGroup = document.createElement('div');
    ivaGroup.className = 'id-section';
    ivaGroup.appendChild(Object.assign(document.createElement('h3'), {
        className: 'field-group-title',
        textContent: 'Fatura e IVA'
    }));
    const ivaHint = document.createElement('p');
    ivaHint.className = 'id-disclaimer';
    ivaHint.textContent = 'Enquanto não houver empresa aberta / fatura, deixe sem IVA. Ative só quando for emitir fatura com IVA.';
    ivaGroup.appendChild(ivaHint);

    const ivaToggle = document.createElement('div');
    ivaToggle.className = 'toggle';
    const ivaOff = document.createElement('button');
    ivaOff.type = 'button';
    ivaOff.className = 'toggle-opt';
    ivaOff.textContent = 'Sem IVA';
    const ivaOn = document.createElement('button');
    ivaOn.type = 'button';
    ivaOn.className = 'toggle-opt';
    ivaOn.textContent = config.ivaRate > 0
        ? `Com IVA (${Math.round(config.ivaRate * 100)}%)`
        : 'Com IVA';
    if (config.ivaRate <= 0) {
        ivaOn.disabled = true;
        ivaHint.textContent = 'A taxa de IVA está desligada no servidor (DIGITALIZEPT_IVA_RATE=0).';
    }
    ivaToggle.append(ivaOff, ivaOn);
    ivaGroup.appendChild(ivaToggle);
    body.appendChild(ivaGroup);

    // --- Discount selector ---
    const discGroup = document.createElement('div');
    discGroup.className = 'id-section';
    discGroup.appendChild(Object.assign(document.createElement('h3'), { className: 'field-group-title', textContent: 'Desconto' }));

    const chips = document.createElement('div');
    chips.className = 'disc-chips';
    const customWrap = document.createElement('div');
    customWrap.className = 'disc-custom hidden';
    const customInput = document.createElement('input');
    customInput.type = 'number';
    customInput.min = '0';
    customInput.max = '100';
    customInput.className = 'field-input';
    customInput.placeholder = '%';

    const summaryWrap = document.createElement('div');

    function paintIvaToggle() {
        ivaOff.classList.toggle('active', proposta.cobrarIva !== true);
        ivaOn.classList.toggle('active', proposta.cobrarIva === true);
    }

    function recompute() {
        const rate = resolveIvaRate(proposta, config.ivaRate);
        const c = computeProposta(proposta, catalog, businessType, rate);

        ctx.update({
            proposta: {
                ...proposta,
                _calc: c
            }
        });

        summaryWrap.innerHTML = '';

        const card = document.createElement('div');
        card.className = 'sum-card';
        card.appendChild(summaryLine('Serviços selecionados', formatEuros(c.subtotal)));
        if (c.urgencia > 0) {
            card.appendChild(summaryLine(`Urgência (+${Math.round(c.urgenciaPct * 100)}%)`, `+${formatEuros(c.urgencia)}`));
        }
        if (c.desconto > 0) {
            card.appendChild(summaryLine(`Desconto (−${c.descontoPct}%)`, `−${formatEuros(c.desconto)}`, { discount: true }));
        }
        const divider = document.createElement('div');
        divider.className = 'sum-divider';
        card.appendChild(divider);
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
        summaryWrap.appendChild(card);
        paintIvaToggle();
    }

    ivaOff.addEventListener('click', () => {
        proposta.cobrarIva = false;
        recompute();
    });
    ivaOn.addEventListener('click', () => {
        if (config.ivaRate <= 0) return;
        proposta.cobrarIva = true;
        recompute();
    });

    function selectDiscount(pct, isCustom) {
        proposta.descontoPct = Math.max(0, Math.min(100, pct));
        chips.querySelectorAll('.disc-chip').forEach((chip) => {
            chip.classList.toggle('active', !isCustom && Number(chip.dataset.pct) === pct);
        });
        customWrap.classList.toggle('hidden', !isCustom);
        recompute();
    }

    DISCOUNT_PRESETS.forEach((pct) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `disc-chip${proposta.descontoPct === pct ? ' active' : ''}`;
        chip.dataset.pct = String(pct);
        chip.textContent = `${pct}%`;
        chip.addEventListener('click', () => selectDiscount(pct, false));
        chips.appendChild(chip);
    });
    const outroChip = document.createElement('button');
    outroChip.type = 'button';
    outroChip.className = `disc-chip${!DISCOUNT_PRESETS.includes(proposta.descontoPct) ? ' active' : ''}`;
    outroChip.textContent = 'Outro';
    outroChip.addEventListener('click', () => {
        customWrap.classList.remove('hidden');
        chips.querySelectorAll('.disc-chip').forEach((chip) => chip.classList.remove('active'));
        outroChip.classList.add('active');
        customInput.value = String(proposta.descontoPct || '');
        customInput.focus();
    });
    chips.appendChild(outroChip);

    customInput.addEventListener('input', () => {
        const val = Math.max(0, Math.min(100, Number(customInput.value) || 0));
        proposta.descontoPct = val;
        recompute();
    });
    customWrap.appendChild(customInput);
    if (!DISCOUNT_PRESETS.includes(proposta.descontoPct)) {
        customWrap.classList.remove('hidden');
        customInput.value = String(proposta.descontoPct);
    }

    discGroup.append(chips, customWrap);
    body.appendChild(discGroup);
    body.appendChild(summaryWrap);

    recompute();
    ctx.setValid(isValid(ctx.state));
}

export const proposalStep = {
    name: 'Proposta',
    title: 'Resumo financeiro',
    subtitle: 'O valor de tabela nunca desaparece. Mostre serviços → desconto → total → entrada.',
    isValid,
    render
};
