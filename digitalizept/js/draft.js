import { apiRequest } from './api.js';
import { getToken } from './auth.js';
import { bindLeadToNome, detachLeadIfBusinessChanged } from './demo/business-identity.js';

function wizardSnapshot(state) {
    const d = state.data || {};
    const proposta = d.proposta ? { ...d.proposta } : undefined;
    if (proposta && proposta._calc) {
        // Keep totals for display; strip nothing critical.
    }
    const step = Number(state.step);
    const substep = Number(state.substep);
    return {
        googleDiagnostico: d.googleDiagnostico || undefined,
        proposta: proposta || undefined,
        googlePresence: d.googlePresence || undefined,
        clienteLegal: d.clienteLegal || undefined,
        identidade: d.identidade || undefined,
        demoPrompt: d.demoPrompt || '',
        demoRaw: d.demoRaw || '',
        demoHtml: d.demoHtml || '',
        demoHtmlSource: d.demoHtmlSource || '',
        demoHtmlCustom: d.demoHtmlCustom || '',
        demoVisual: d.demoVisual || '',
        demoSeeded: d.demoSeeded === true,
        demoIdentityStamp: d.demoIdentityStamp || '',
        htmlChangeNote: d.htmlChangeNote || '',
        colorPrompt: d.colorPrompt || '',
        gbpSobre: d.gbpSobre || '',
        diagPitch: d.diagPitch || '',
        packagePitch: d.packagePitch || '',
        demoGbp: d.demoGbp === true,
        demoUrl: d.demoUrl || '',
        demo: d.demo || undefined,
        _wizardStep: Number.isFinite(step) && step >= 0 ? Math.floor(step) : 0,
        _wizardSubstep: Number.isFinite(substep) && substep >= 0 ? Math.floor(substep) : 0
    };
}

export async function saveDraftLead(state, ctx) {
    const dados = state.data.dados || {};
    if (!dados.nome_negocio) return null;
    const detached = detachLeadIfBusinessChanged(state);
    if (detached && ctx && typeof ctx.showToast === 'function') {
        ctx.showToast('Nome diferente — a gravar como negócio novo. O lead anterior não foi mexido.');
    }
    const epoch = ctx && typeof ctx.getDealEpoch === 'function' ? ctx.getDealEpoch() : null;
    const { response, data } = await apiRequest('/api/digitalizept/leads', {
        method: 'POST',
        token: getToken(),
        body: {
            leadId: state.data.leadId || '',
            businessType: {
                id: state.data.businessType && state.data.businessType.id,
                nome: state.data.businessType && state.data.businessType.nome
            },
            dados,
            wizard: wizardSnapshot(state)
        }
    });
    if (response.status === 401) {
        if (ctx && ctx.onUnauthorized) ctx.onUnauthorized();
        return null;
    }
    if (!response.ok || !data.leadId) return null;
    if (epoch != null && ctx.getDealEpoch() !== epoch) return data.leadId;
    if (ctx && typeof ctx.update === 'function') {
        ctx.update(bindLeadToNome({ leadId: data.leadId }, dados.nome_negocio), epoch);
    }
    return data.leadId;
}

let draftTimer = null;

export function cancelScheduledDraft() {
    if (draftTimer) {
        clearTimeout(draftTimer);
        draftTimer = null;
    }
}

/** Debounced draft save — used after AI/HTML edits so we don't spam the API. */
export function scheduleSaveDraftLead(state, ctx, delayMs = 500) {
    if (draftTimer) clearTimeout(draftTimer);
    const epoch = ctx && typeof ctx.getDealEpoch === 'function' ? ctx.getDealEpoch() : null;
    draftTimer = setTimeout(() => {
        draftTimer = null;
        if (epoch != null && ctx.getDealEpoch && ctx.getDealEpoch() !== epoch) return;
        saveDraftLead(state, ctx).catch(() => { /* best-effort */ });
    }, delayMs);
}

export { wizardSnapshot };
