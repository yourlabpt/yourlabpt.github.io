import { fetchCatalog } from '../catalog.js';
import { formatEuros } from '../format.js';
import { ensureProposta, computeProposta, guardrailLevel } from '../proposal-calc.js';

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
    try {
        catalog = await fetchCatalog(ctx);
    } catch (_) {
        loading.textContent = 'Não foi possível carregar o catálogo.';
        ctx.setValid(false);
        return;
    }
    if (!catalog) return;
    loading.remove();

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

    function recompute() {
        const c = computeProposta(proposta, catalog, businessType);

        // persist computed values for later slices
        ctx.update({
            proposta: {
                ...proposta,
                _calc: c
            }
        });

        // rebuild summary
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
        card.appendChild(summaryLine('Total', formatEuros(c.total), { strong: true }));
        card.appendChild(summaryLine('Entrada hoje (50%)', formatEuros(c.entrada)));
        card.appendChild(summaryLine('Na entrega (50%)', formatEuros(c.final)));
        if (c.manutencaoMensal > 0) {
            card.appendChild(summaryLine('Manutenção', `${formatEuros(c.manutencaoMensal)}/mês`, { muted: true }));
        }
        summaryWrap.appendChild(card);

        // vendor-only guardrail
        const level = guardrailLevel(c.valorHora);
        const guard = document.createElement('div');
        guard.className = `guardrail guardrail-${level}`;
        guard.appendChild(Object.assign(document.createElement('span'), {
            className: 'guardrail-label',
            textContent: 'Valor-hora (só para si)'
        }));
        guard.appendChild(Object.assign(document.createElement('span'), {
            className: 'guardrail-value',
            textContent: `${c.valorHora.toFixed(0)} €/h`
        }));
        summaryWrap.appendChild(guard);
    }

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
