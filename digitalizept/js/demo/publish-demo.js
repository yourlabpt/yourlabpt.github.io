import { apiRequest } from '../api.js';
import { getToken } from '../auth.js';
import { bindLeadToNome } from './business-identity.js';
import { publishedCustomHtml, VISUAL_CUSTOM } from './demo-visual.js';
import { scheduleSaveDraftLead } from '../draft.js';

export async function publishDemo(ctx) {
    const epoch = ctx.getDealEpoch ? ctx.getDealEpoch() : null;
    try {
        const demo = ctx.state.data.demo;
        const demoHtml = publishedCustomHtml(ctx.state) || (
            ctx.state.data.demoHtmlSource === 'boilerplate' ? '' : (ctx.state.data.demoHtml || '')
        );
        if ((!demo || !demo.hero || !demo.hero.titulo) && !demoHtml) return '';
        const nome = (ctx.state.data.dados && ctx.state.data.dados.nome_negocio) || '';
        const sentId = ctx.state.data.leadId || '';
        const { response, data } = await apiRequest('/api/digitalizept/demos', {
            method: 'POST',
            token: getToken(),
            body: {
                leadId: sentId,
                resumeBound: ctx.state.data.resumeBound === true,
                businessType: ctx.state.data.businessType,
                dados: ctx.state.data.dados,
                identidade: ctx.state.data.identidade,
                demo,
                demoHtml,
                demoHtmlCustom: publishedCustomHtml(ctx.state),
                demoRaw: ctx.state.data.demoRaw || '',
                demoVisual: publishedCustomHtml(ctx.state)
                    ? VISUAL_CUSTOM
                    : (ctx.state.data.demoVisual || ''),
                demoHtmlSource: publishedCustomHtml(ctx.state)
                    ? 'ai'
                    : (ctx.state.data.demoHtmlSource || '')
            }
        });
        if (response.ok && data.url) {
            if (epoch != null && ctx.getDealEpoch && ctx.getDealEpoch() !== epoch) return '';
            ctx.update(bindLeadToNome({
                leadId: data.leadId || ctx.state.data.leadId,
                demoUrl: data.url
            }, nome), epoch);
            if (sentId && data.leadId && data.leadId !== sentId) {
                ctx.showToast('Nome diferente — gravado como negócio novo. O lead anterior não foi mexido.');
            }
            scheduleSaveDraftLead(ctx.state, ctx);
            return data.url;
        }
        if (ctx && typeof ctx.showToast === 'function') {
            ctx.showToast((data && data.error) || 'Não foi possível guardar a demonstração.', true);
        }
    } catch (_) {
        if (ctx && typeof ctx.showToast === 'function') {
            ctx.showToast('Não foi possível guardar a demonstração.', true);
        }
    }
    return '';
}
