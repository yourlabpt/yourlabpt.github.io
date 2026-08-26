import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { refreshCalc } from '../proposal-calc.js';
import { validateNif } from '../deal/nif.js';
import { buildContractModel, contractInnerHtml } from '../deal/contract.js';
import { currentSubstep, renderAsk, askText } from '../substep.js';
import { appendAdminHint } from '../admin-redirects.js';

/** Live: nome, NIF, email. Morada/telefone prefilled from loja; Admin Ficha if incomplete. */
const FIELDS = [
    { id: 'nome', label: 'Qual é o nome completo do cliente?', hint: 'Quem assina o contrato.', tipo: 'text' },
    { id: 'nif', label: 'Qual é o NIF?', hint: 'Nove dígitos.', tipo: 'tel' },
    { id: 'email', label: 'Qual é o email?', hint: 'Para enviar o contrato.', tipo: 'email' }
];

function ensureCliente(state) {
    const dados = state.data.dados || {};
    if (!state.data.clienteLegal || typeof state.data.clienteLegal !== 'object') {
        state.data.clienteLegal = {
            nome: dados.responsavel || '',
            nif: '',
            morada: dados.morada || '',
            email: dados.email || '',
            telefone: dados.telefone || ''
        };
    } else {
        const c = state.data.clienteLegal;
        if (!c.morada) c.morada = dados.morada || '';
        if (!c.telefone) c.telefone = dados.telefone || '';
        if (!c.email && dados.email) c.email = dados.email;
    }
    return state.data.clienteLegal;
}

function isValid(state) {
    const c = ensureCliente(state);
    if (!c.morada) c.morada = (state.data.dados && state.data.dados.morada) || c.morada || '—';
    if (!c.telefone) c.telefone = (state.data.dados && state.data.dados.telefone) || c.telefone || '';
    return Boolean(c.nome && c.morada && c.email && validateNif(c.nif));
}

function substepCount() {
    return 4;
}

function isSubstepValid(state) {
    const idx = currentSubstep(state);
    const cliente = ensureCliente(state);
    if (idx >= 3) return isValid(state);
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

    if (idx < 3) {
        const field = FIELDS[idx];
        const { control } = renderAsk(body, {
            title: field.label,
            hint: field.hint,
            index: idx,
            total: 4
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
        if (field.id === 'email') appendAdminHint(control, 'ficha');
        persist();
        return;
    }

    const { control } = renderAsk(body, {
        title: 'Contrato',
        hint: 'Leia com o cliente. Morada e telefone vêm da loja.',
        index: 3,
        total: 4
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
    subtitle: 'Nome, NIF e email. O resto preenche da loja ou no admin.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
