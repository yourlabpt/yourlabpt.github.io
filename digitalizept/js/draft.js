import { apiRequest } from './api.js';
import { getToken } from './auth.js';

export async function saveDraftLead(state, ctx) {
    const dados = state.data.dados || {};
    if (!dados.nome_negocio) return null;
    const { response, data } = await apiRequest('/api/digitalizept/leads', {
        method: 'POST',
        token: getToken(),
        body: {
            leadId: state.data.leadId || '',
            businessType: { id: state.data.businessType && state.data.businessType.id, nome: state.data.businessType && state.data.businessType.nome },
            dados
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
