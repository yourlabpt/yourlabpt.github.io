import { apiRequest } from '../api.js';
import { getToken } from '../auth.js';
import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { buildContractModel, buildContractDocument } from '../deal/contract.js';

const PROJECT_STATES = [
    'Demonstração criada', 'Proposta enviada', 'Contrato assinado', 'Entrada recebida',
    'Conteúdo pendente', 'Website em desenvolvimento', 'Revisão do cliente',
    'Publicado', 'Pagamento final pendente', 'Concluído'
];

function isValid() {
    return true; // final step; advancing is disabled anyway
}

function buildFinalDocument(state, catalog, config) {
    const model = buildContractModel(state, catalog, config);
    const a = state.data.assinatura || {};
    return buildContractDocument(model, {
        signaturePng: a.pngDataUrl,
        audit: { timestamp: a.timestamp, dispositivo: a.dispositivo, geo: a.geo, hash: a.hash }
    });
}

function downloadContract(state, catalog, config) {
    const doc = buildFinalDocument(state, catalog, config);
    const blob = new Blob([doc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (state.data.dados && state.data.dados.nome_negocio || 'contrato')
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents (ã→a, ç→c…)
        .replace(/[^\w-]+/g, '_');
    a.href = url;
    a.download = `${name}-contrato.html`;
    a.click();
    URL.revokeObjectURL(url);
}

async function render(body, ctx) {
    let catalog = [];
    let config = null;
    try {
        catalog = await fetchCatalog(ctx) || [];
        config = await fetchConfig(ctx);
    } catch (_) { /* ignore */ }

    // Deliberately no refreshCalc here: this screen reproduces the signed deal.
    const signed = Boolean(ctx.state.data.assinatura && ctx.state.data.assinatura.pngDataUrl);
    const model = buildContractModel(ctx.state, catalog, config);
    const c = model.calc || {};
    const euros = (cents) => (cents ? (cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }) : '—');
    const total = euros(c.totalComIva);
    const entrada = euros(c.entrada);

    const recap = document.createElement('div');
    recap.className = 'sum-card';
    recap.innerHTML = `
        <div class="sum-line"><span>Cliente</span><span class="sum-value">${model.cliente.nome || '—'}</span></div>
        ${c.iva > 0 ? `<div class="sum-line"><span>IVA (${Math.round(c.ivaRate * 100)}%)</span><span class="sum-value">${euros(c.iva)}</span></div>` : ''}
        <div class="sum-line sum-strong"><span>Total${c.iva > 0 ? ' c/ IVA' : ''}</span><span class="sum-value">${total}</span></div>
        <div class="sum-line"><span>Entrada hoje (50%)</span><span class="sum-value">${entrada}</span></div>`;
    body.appendChild(recap);

    const result = ctx.state.data.dealResult;

    if (!result) {
        if (!signed) {
            const warn = document.createElement('div');
            warn.className = 'placeholder';
            warn.textContent = 'Falta a assinatura. Volte ao passo anterior para assinar.';
            body.appendChild(warn);
            ctx.setValid(true);
            return;
        }

        const status = document.createElement('div');
        status.className = 'demo-status';

        const sendBtn = document.createElement('button');
        sendBtn.type = 'button';
        sendBtn.className = 'btn-primary';
        sendBtn.style.width = '100%';
        sendBtn.style.height = '52px';
        sendBtn.textContent = 'Enviar por email e criar projeto';
        sendBtn.addEventListener('click', async () => {
            sendBtn.disabled = true;
            status.className = 'demo-status';
            status.textContent = 'A finalizar…';

            const a = ctx.state.data.assinatura;
            const bt = ctx.state.data.businessType || {};
            const payload = {
                businessType: { id: bt.id, nome: bt.nome },
                dados: ctx.state.data.dados,
                proposta: ctx.state.data.proposta,
                clienteLegal: ctx.state.data.clienteLegal,
                contrato: { html: buildFinalDocument(ctx.state, catalog, config), hash: a.hash },
                assinatura: { pngDataUrl: a.pngDataUrl, geo: a.geo, dispositivo: a.dispositivo, timestamp: a.timestamp }
            };

            try {
                const { response, data } = await apiRequest('/api/digitalizept/deals', {
                    method: 'POST', token: getToken(), body: payload
                });
                if (response.status === 401) { ctx.onUnauthorized(); return; }
                if (!response.ok || !data.ok) {
                    throw new Error(data.error || 'Falhou.');
                }
                ctx.state.data.dealResult = data;
                ctx.update({ dealResult: data });
                body.innerHTML = '';
                render(body, ctx);
            } catch (err) {
                sendBtn.disabled = false;
                status.className = 'demo-status demo-status-error';
                status.textContent = err.message || 'Não foi possível finalizar.';
            }
        });

        const sendWrap = document.createElement('div');
        sendWrap.className = 'id-section';
        sendWrap.append(sendBtn, status);
        body.appendChild(sendWrap);
        ctx.setValid(true);
        return;
    }

    // Sent — success view
    const ok = document.createElement('div');
    ok.className = 'demo-status demo-status-ok';
    ok.style.marginBottom = '14px';
    const emailMsg = result.email && result.email.clientSent
        ? 'Contrato enviado ao cliente e arquivado.'
        : 'Projeto criado. Email não enviado (configure o SMTP para envio automático).';
    ok.textContent = `✓ ${emailMsg}`;
    body.appendChild(ok);

    const project = document.createElement('div');
    project.className = 'id-section';
    project.appendChild(Object.assign(document.createElement('h3'), { className: 'field-group-title', textContent: 'Projeto criado' }));
    const stateList = document.createElement('div');
    stateList.className = 'proj-states';
    PROJECT_STATES.forEach((label) => {
        const item = document.createElement('div');
        const active = label === 'Contrato assinado';
        item.className = `proj-state${active ? ' proj-state-active' : ''}`;
        item.textContent = label;
        stateList.appendChild(item);
    });
    project.appendChild(stateList);
    const meta = document.createElement('p');
    meta.className = 'id-disclaimer';
    meta.textContent = `Estado atual: Contrato assinado · Google: por criar · Domínio: por comprar · ID ${result.projectId}`;
    project.appendChild(meta);
    body.appendChild(project);

    const dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'btn-primary';
    dl.style.width = '100%';
    dl.textContent = 'Descarregar contrato';
    dl.addEventListener('click', () => downloadContract(ctx.state, catalog, config));
    body.appendChild(dl);

    ctx.setValid(true);
}

export const conclusionStep = {
    name: 'Conclusão',
    title: 'Concluir',
    subtitle: 'Enviar o contrato, criar o projeto e entregar tudo — antes de sair do estabelecimento.',
    isValid,
    render
};
