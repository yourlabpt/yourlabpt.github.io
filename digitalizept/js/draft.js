import { apiRequest } from './api.js';
import { getToken } from './auth.js';

function wizardSnapshot(state) {
    const d = state.data || {};
    const proposta = d.proposta ? { ...d.proposta } : undefined;
    if (proposta && proposta._calc) {
        // Keep totals for display; strip nothing critical.
    }
    return {
        googleDiagnostico: d.googleDiagnostico || undefined,
        proposta: proposta || undefined,
        googlePresence: d.googlePresence || undefined,
        clienteLegal: d.clienteLegal || undefined,
        demoPrompt: d.demoPrompt || '',
        demoRaw: d.demoRaw || '',
        demoGbp: d.demoGbp === true,
        demoUrl: d.demoUrl || '',
        demo: d.demo || undefined
    };
}

export async function saveDraftLead(state, ctx) {
    const dados = state.data.dados || {};
    if (!dados.nome_negocio) return null;
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
    ctx.update({ leadId: data.leadId });
    return data.leadId;
}
