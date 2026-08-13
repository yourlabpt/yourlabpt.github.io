import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { refreshCalc } from '../proposal-calc.js';
import { validateNif } from '../deal/nif.js';
import { buildContractModel, contractInnerHtml } from '../deal/contract.js';
import { currentSubstep, renderAsk, askText } from '../substep.js';

const FIELDS = [
    { id: 'nome', label: 'Qual é o nome completo do cliente?', hint: 'Quem assina o contrato.', tipo: 'text' },
    { id: 'nif', label: 'Qual é o NIF?', hint: 'Nove dígitos.', tipo: 'tel' },
    { id: 'morada', label: 'Qual é a morada fiscal?', tipo: 'text' },
    { id: 'email', label: 'Qual é o email?', hint: 'Para enviar o contrato.', tipo: 'email' },
    { id: 'telefone', label: 'Qual é o telefone?', tipo: 'tel' }
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

function substepCount() {
    return 6;
}

function isSubstepValid(state) {
    const idx = currentSubstep(state);
    const cliente = state.data.clienteLegal || {};
    if (idx >= 5) return isValid(state);
    const field = FIELDS[idx];
    if (!field) return false;
    const value = String(cliente[field.id] || '').trim();
    if (!value) return false;
    if (field.id === 'nif') return validateNif(value);
    return true;
}

async function render(body, ctx) {
    const cliente = ensureCliente(ctx.state);
    const idx = currentSubstep(ctx.state);

    function persist() {
        ctx.update({ clienteLegal: cliente });
        ctx.setValid(isSubstepValid(ctx.state));
    }

    if (idx < 5) {
        const field = FIELDS[idx];
        const { control } = renderAsk(body, {
            title: field.label,
            hint: field.hint,
            index: idx,
            total: 6
        });
        const error = document.createElement('span');
        error.className = 'field-error';
        askText(control, {
            value: cliente[field.id] || '',
            type: field.tipo,
            onChange: (val) => {
                cliente[field.id] = val;
                if (field.id === 'nif') {
                    const ok = !val || validateNif(val);
                    error.textContent = ok ? '' : 'NIF inválido.';
                }
                persist();
            },
            onEnter: () => {
                if (isSubstepValid(ctx.state) && ctx.goNext) ctx.goNext();
            }
        });
        control.appendChild(error);
        if (field.id === 'nif' && cliente.nif && !validateNif(cliente.nif)) {
            error.textContent = 'NIF inválido.';
        }
        persist();
        return;
    }

    const { control } = renderAsk(body, {
        title: 'Contrato',
        hint: 'Leia com o cliente. Continuar só com os dados legais completos.',
        index: 5,
        total: 6
    });
    const contractBox = document.createElement('div');
    contractBox.className = 'dp-contract';
    control.appendChild(contractBox);

    let catalog = ctx.state.data._catalog || [];
    let config = ctx.state.data._config || null;
    try {
        if (!catalog.length) catalog = await fetchCatalog(ctx) || [];
        if (!config) config = await fetchConfig(ctx);
    } catch (_) { /* preview still renders */ }
    if (config) {
        refreshCalc(ctx.state, catalog, ctx.state.data.businessType || {}, config.ivaRate);
        ctx.update({ proposta: ctx.state.data.proposta, _catalog: catalog, _config: config });
    }
    contractBox.innerHTML = contractInnerHtml(buildContractModel(ctx.state, catalog, config));
    persist();
}

export const acceptanceStep = {
    name: 'Contrato',
    title: 'Aceitação e contrato',
    subtitle: 'Recolha os dados legais do cliente. O contrato é gerado automaticamente abaixo.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
