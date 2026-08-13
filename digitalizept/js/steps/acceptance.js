import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { refreshCalc } from '../proposal-calc.js';
import { validateNif } from '../deal/nif.js';
import { buildContractModel, contractInnerHtml } from '../deal/contract.js';

const FIELDS = [
    { id: 'nome', label: 'Nome completo', tipo: 'text' },
    { id: 'nif', label: 'NIF', tipo: 'tel' },
    { id: 'morada', label: 'Morada', tipo: 'text' },
    { id: 'email', label: 'Email', tipo: 'email' },
    { id: 'telefone', label: 'Telefone', tipo: 'tel' }
];

function ensureCliente(state) {
    if (!state.data.clienteLegal || typeof state.data.clienteLegal !== 'object') {
        const dados = state.data.dados || {};
        state.data.clienteLegal = {
            nome: dados.responsavel || '',
            nif: '',
            morada: dados.morada || '',
            email: dados.email || '',
            telefone: dados.telefone || ''
        };
    }
    return state.data.clienteLegal;
}

function isValid(state) {
    const c = state.data.clienteLegal;
    if (!c) return false;
    return Boolean(c.nome && c.morada && c.email && validateNif(c.nif));
}

async function render(body, ctx) {
    const cliente = ensureCliente(ctx.state);

    function persist() {
        ctx.update({ clienteLegal: cliente });
        ctx.setValid(isValid(ctx.state));
    }

    const group = document.createElement('div');
    group.className = 'id-section';
    group.appendChild(Object.assign(document.createElement('h3'), { className: 'field-group-title', textContent: 'Dados do cliente' }));

    FIELDS.forEach((f) => {
        const wrap = document.createElement('label');
        wrap.className = 'field';
        wrap.appendChild(Object.assign(document.createElement('span'), { className: 'field-label', textContent: f.label }));

        const input = document.createElement('input');
        input.className = 'field-input';
        input.type = f.tipo;
        input.value = cliente[f.id] || '';

        const error = document.createElement('span');
        error.className = 'field-error';

        input.addEventListener('input', () => {
            cliente[f.id] = input.value;
            if (f.id === 'nif') {
                const ok = !input.value || validateNif(input.value);
                error.textContent = ok ? '' : 'NIF inválido.';
                input.classList.toggle('field-input-error', !ok);
            }
            persist();
        });

        wrap.append(input, error);
        group.appendChild(wrap);
    });
    body.appendChild(group);

    // Contract preview
    const previewSection = document.createElement('div');
    previewSection.className = 'id-section';
    previewSection.appendChild(Object.assign(document.createElement('h3'), { className: 'field-group-title', textContent: 'Pré-visualização do contrato' }));
    const contractBox = document.createElement('div');
    contractBox.className = 'dp-contract';
    previewSection.appendChild(contractBox);
    body.appendChild(previewSection);

    let catalog = [];
    let config = null;
    try {
        catalog = await fetchCatalog(ctx) || [];
        config = await fetchConfig(ctx);
    } catch (_) { /* preview still renders with empty items */ }
    if (config) {
        // The client may have gone back and changed services since the proposal.
        refreshCalc(ctx.state, catalog, ctx.state.data.businessType || {}, config.ivaRate);
        ctx.update({ proposta: ctx.state.data.proposta });
    }

    function refreshContract() {
        const model = buildContractModel(ctx.state, catalog, config);
        contractBox.innerHTML = contractInnerHtml(model);
    }
    refreshContract();

    // keep contract in sync as legal fields change
    group.addEventListener('input', refreshContract);

    persist();
}

export const acceptanceStep = {
    name: 'Contrato',
    title: 'Aceitação e contrato',
    subtitle: 'Recolha os dados legais do cliente. O contrato é gerado automaticamente abaixo.',
    isValid,
    render
};
