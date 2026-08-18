import { apiRequest } from '../api.js';
import { getToken } from '../auth.js';
import { fetchCatalog } from '../catalog.js';
import { fetchConfig } from '../settings.js';
import { buildContractModel, buildContractDocument } from '../deal/contract.js';
import { downloadDealContract } from '../deal/download.js';
import { enqueueDeal } from '../offline-queue.js';

const PROJECT_STATES = [
    'Demonstração criada', 'Proposta enviada', 'Contrato assinado', 'Entrada recebida',
    'Conteúdo pendente', 'Website em desenvolvimento', 'Revisão do cliente',
    'Publicado', 'Pagamento final pendente', 'Concluído'
];

function isValid() {
    return true; // final step; advancing is disabled anyway
}

function bothSigned(state) {
    return Boolean(
        state.data.assinatura && state.data.assinatura.pngDataUrl
        && state.data.assinaturaPrestador && state.data.assinaturaPrestador.pngDataUrl
    );
}

function buildFinalDocument(state, catalog, config) {
    const model = buildContractModel(state, catalog, config);
    const a = state.data.assinatura || {};
    const p = state.data.assinaturaPrestador || {};
    return buildContractDocument(model, {
        signaturePng: a.pngDataUrl,
        providerSignaturePng: p.pngDataUrl,
        audit: {
            timestamp: a.timestamp,
            dispositivo: a.dispositivo,
            geo: a.geo,
            hash: a.hash || p.hash,
            providerTimestamp: p.timestamp
        }
    });
}

async function downloadContract(ctx, catalog, config, result) {
    const projectId = (result && result.contractDownload && result.projectId)
        || (result && result.projectId)
        || ctx.state.data.projectId;
    const ok = await downloadDealContract({
        projectId: projectId && projectId !== 'pendente' ? projectId : '',
        nome: ctx.state.data.dados && ctx.state.data.dados.nome_negocio,
        onUnauthorized: ctx.onUnauthorized,
        html: buildFinalDocument(ctx.state, catalog, config)
    });
    if (!ok) ctx.showToast('Não foi possível gerar o PDF do contrato.', true);
}

async function render(body, ctx) {
    let catalog = [];
    let config = null;
    try {
        catalog = await fetchCatalog(ctx) || [];
        config = await fetchConfig(ctx);
    } catch (_) { /* ignore */ }

    // Deliberately no refreshCalc here: this screen reproduces the signed deal.
    const signed = bothSigned(ctx.state);
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
    const existingProjectId = ctx.state.data.projectId;

    function addDownloadButton(label, { primary = false } = {}) {
        const dl = document.createElement('button');
        dl.type = 'button';
        dl.className = primary ? 'btn-primary' : 'btn-secondary';
        dl.style.width = '100%';
        dl.style.marginTop = '10px';
        dl.textContent = label;
        dl.addEventListener('click', () => downloadContract(ctx, catalog, config, result));
        body.appendChild(dl);
    }

    if (!result) {
        if (existingProjectId) {
            addDownloadButton('Descarregar PDF do contrato actual');
        }
        if (!signed) {
            const warn = document.createElement('div');
            warn.className = 'placeholder';
            warn.textContent = 'Faltam as duas assinaturas (cliente e YourLab). Volte ao passo anterior.';
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
        const revising = Boolean(ctx.state.data.revisingDeal);
        sendBtn.textContent = revising
            ? 'Atualizar proposta e reenviar'
            : 'Enviar por email e criar projeto';
        sendBtn.addEventListener('click', async () => {
            sendBtn.disabled = true;
            status.className = 'demo-status';
            status.textContent = revising ? 'A atualizar proposta…' : 'A finalizar…';

            const a = ctx.state.data.assinatura;
            const p = ctx.state.data.assinaturaPrestador;
            const bt = ctx.state.data.businessType || {};
            const payload = {
                leadId: ctx.state.data.leadId || '',
                revisingDeal: revising || undefined,
                propostaId: ctx.state.data.propostaId || undefined,
                contratoId: ctx.state.data.contratoId || undefined,
                projectId: ctx.state.data.projectId || undefined,
                businessType: { id: bt.id, nome: bt.nome },
                dados: ctx.state.data.dados,
                identidade: ctx.state.data.identidade,
                demo: ctx.state.data.demo,
                demoHtml: ctx.state.data.demoHtml || '',
                proposta: ctx.state.data.proposta,
                googlePresence: ctx.state.data.googlePresence || null,
                googleDiagnostico: ctx.state.data.googleDiagnostico || null,
                clienteLegal: ctx.state.data.clienteLegal,
                contrato: { html: buildFinalDocument(ctx.state, catalog, config), hash: a.hash || p.hash },
                assinatura: { pngDataUrl: a.pngDataUrl, geo: a.geo, dispositivo: a.dispositivo, timestamp: a.timestamp },
                assinaturaPrestador: {
                    pngDataUrl: p.pngDataUrl,
                    geo: p.geo,
                    dispositivo: p.dispositivo,
                    timestamp: p.timestamp
                }
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
                const offline = !navigator.onLine || err.name === 'TypeError';
                if (offline) {
                    enqueueDeal(payload);
                    ctx.state.data.dealResult = { ok: true, queued: true, projectId: 'pendente' };
                    ctx.update({ dealResult: ctx.state.data.dealResult });
                    body.innerHTML = '';
                    render(body, ctx);
                    ctx.showToast('Sem rede. O contrato fica na fila e envia-se quando houver ligação.', true);
                    return;
                }
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
    const emailMsg = result.queued
        ? 'Contrato na fila. Envia-se automaticamente quando houver rede.'
        : result.revised
        ? (result.email && result.email.clientSent
            ? `Proposta atualizada (${result.templateVersao || 'v2'}) e reenviada ao cliente.`
            : `Proposta atualizada (${result.templateVersao || 'v2'}). Email não enviado.`)
        : result.email && result.email.clientSent
        ? 'Contrato enviado ao cliente e arquivado.'
        : 'Projeto criado. Email não enviado (configure o SMTP para envio automático).';
    ok.textContent = emailMsg;
    body.appendChild(ok);

    const project = document.createElement('div');
    project.className = 'id-section';
    project.appendChild(Object.assign(document.createElement('h3'), {
        className: 'field-group-title',
        textContent: result.revised ? 'Proposta atualizada' : 'Projeto criado'
    }));
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
    const dominioLabel = result.estados && result.estados.dominio === 'cliente_zip'
        ? 'cliente compra · entrega ZIP'
        : result.estados && result.estados.dominio === 'a_registar'
        ? (result.dominio && result.dominio.escolhido ? result.dominio.escolhido : 'a registar')
        : 'por comprar';
    meta.textContent = `Estado atual: ${result.revised ? `Contrato ${result.templateVersao || 'atualizado'}` : 'Contrato assinado'} · Google: ${(result.estados && result.estados.google) || '—'} · Domínio: ${dominioLabel} · ID ${result.projectId}`;
    project.appendChild(meta);
    body.appendChild(project);

    addDownloadButton('Descarregar PDF do contrato', { primary: true });

    const demoUrl = result.demoUrl || ctx.state.data.demoUrl;
    if (demoUrl) {
        const link = document.createElement('a');
        link.className = 'id-disclaimer';
        link.href = demoUrl;
        link.target = '_blank';
        link.rel = 'noopener';
        link.style.display = 'block';
        link.style.marginTop = '10px';
        link.textContent = `Demonstração pública: ${demoUrl}`;
        body.appendChild(link);
    }

    // The only way out of a closed deal. Without it the next shop starts on this
    // screen with the previous client's data still loaded.
    const novo = document.createElement('button');
    novo.type = 'button';
    novo.className = 'btn-secondary';
    novo.style.width = '100%';
    novo.style.marginTop = '10px';
    novo.textContent = 'Novo negócio';
    novo.addEventListener('click', () => {
        if (window.confirm('Começar um negócio novo? Os dados deste cliente já foram guardados e enviados.')) {
            ctx.reset();
        }
    });
    body.appendChild(novo);

    ctx.setValid(true);
}

export const conclusionStep = {
    name: 'Conclusão',
    title: 'Concluir',
    subtitle: 'Enviar o contrato, criar o projeto e entregar tudo — antes de sair do estabelecimento.',
    isValid,
    render
};
