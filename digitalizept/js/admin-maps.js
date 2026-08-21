/**
 * Admin cockpit — guided Maps / Perfil da Empresa delivery for closed deals.
 */

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function detailsBlock(title, text) {
    const wrap = document.createElement('details');
    wrap.className = 'maps-script';
    const summary = document.createElement('summary');
    summary.textContent = title;
    const pre = el('pre', 'maps-script-pre', text);
    wrap.append(summary, pre);
    return { wrap, pre };
}

function addCloseRow(host, onClose) {
    if (typeof onClose !== 'function') return;
    const row = el('div', 'maps-close-row');
    const btn = el('button', 'btn-secondary');
    btn.type = 'button';
    btn.textContent = 'Fechar';
    btn.addEventListener('click', onClose);
    row.appendChild(btn);
    host.appendChild(row);
}

export function renderMapsCockpit(panel, cockpit, {
    api,
    toast,
    onUpdated,
    onClose
}) {
    panel.innerHTML = '';
    addCloseRow(panel, onClose);

    const how = el('div', 'maps-how');
    how.append(
        el('p', 'maps-how-lead', 'Guião para o telemóvel do cliente. A ficha no Google Maps fica na conta dele, não na sua.'),
        el('p', 'admin-hint', 'Maps = o que o público vê. Perfil da Empresa = o painel do dono (app Google Business). Só avançamos com ele ao lado.')
    );
    panel.appendChild(how);

    const status = el('p', 'meta');
    status.textContent = [
        cockpit.lead?.nome || 'Negócio',
        cockpit.proposta?.pacote ? `pacote ${cockpit.proposta.pacote}` : '',
        cockpit.presenca?.estadoLabel || cockpit.estadoGoogle || ''
    ].filter(Boolean).join(' · ');
    panel.appendChild(status);

    if (Array.isArray(cockpit.missing) && cockpit.missing.length) {
        const miss = el('div', 'maps-missing');
        miss.appendChild(el('p', 'field-label', 'Falta preencher na ficha do negócio'));
        const ul = document.createElement('ul');
        cockpit.missing.forEach((m) => {
            ul.appendChild(el('li', '', m.label || m.id));
        });
        miss.appendChild(ul);
        miss.appendChild(el('p', 'admin-hint', 'Volte à proposta, complete estes dados, e abra este guião outra vez.'));
        panel.appendChild(miss);
    }

    const actions = el('div', 'coverage-pin-actions');
    const start = el('button', 'btn-primary');
    start.type = 'button';
    const notStarted = cockpit.presenca?.estado === 'nao_iniciado'
        || cockpit.presenca?.estado === 'em_falta_dados';
    start.textContent = notStarted ? 'Começar' : 'Actualizar lista de passos';
    start.addEventListener('click', async () => {
        start.disabled = true;
        try {
            const { response, data } = await api(
                `/api/digitalizept/deals/${encodeURIComponent(cockpit.projectId)}/maps/google/start`,
                { method: 'POST', body: {} }
            );
            if (!response.ok) {
                toast(data.error || 'Não foi possível começar.', true);
                return;
            }
            toast(data.result?.ok ? 'Lista de passos pronta. Vá um a um com o cliente.' : 'Ainda faltam dados na ficha.');
            if (typeof onUpdated === 'function') onUpdated(data.cockpit || data);
        } finally {
            start.disabled = false;
        }
    });
    actions.appendChild(start);
    panel.appendChild(actions);

    const stepsWrap = el('div', 'maps-steps');
    stepsWrap.appendChild(el('p', 'field-label', 'Com o cliente, neste ordem'));
    const steps = cockpit.presenca?.steps || [];
    if (!steps.length) {
        stepsWrap.appendChild(el('p', 'meta', 'Toque em Começar para ver os passos.'));
    } else {
        steps.forEach((step, i) => {
            const row = el('label', 'maps-step-row');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = Boolean(step.done);
            cb.addEventListener('change', async () => {
                cb.disabled = true;
                try {
                    const { response, data } = await api(
                        `/api/digitalizept/deals/${encodeURIComponent(cockpit.projectId)}/maps/google/steps`,
                        { method: 'POST', body: { stepId: step.id, done: cb.checked } }
                    );
                    if (!response.ok) {
                        cb.checked = !cb.checked;
                        toast(data.error || 'Não gravou.', true);
                        return;
                    }
                    if (typeof onUpdated === 'function') onUpdated(data.cockpit || data);
                } finally {
                    cb.disabled = false;
                }
            });
            const body = document.createElement('span');
            body.append(
                el('strong', '', `${i + 1}. ${step.title}`),
                el('span', 'meta', step.detail || '')
            );
            row.append(cb, body);
            stepsWrap.appendChild(row);
        });
    }
    panel.appendChild(stepsWrap);

    if (cockpit.presenca?.contaScript) {
        const { wrap, pre } = detailsBlock('Como abrir a conta Google (no telemóvel dele)', cockpit.presenca.contaScript);
        const copy = el('button', 'btn-secondary', 'Copiar estes passos');
        copy.type = 'button';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(pre.textContent);
                toast('Passos copiados.');
            } catch (_) {
                toast('Não foi possível copiar.', true);
            }
        });
        wrap.appendChild(copy);
        panel.appendChild(wrap);
    }

    if (cockpit.presenca?.guiaoVideo) {
        const { wrap, pre } = detailsBlock('O que filmar para a Google aceitar o perfil', cockpit.presenca.guiaoVideo);
        const copy = el('button', 'btn-secondary', 'Copiar guião do vídeo');
        copy.type = 'button';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(pre.textContent);
                toast('Guião copiado.');
            } catch (_) {
                toast('Não foi possível copiar.', true);
            }
        });
        const wa = document.createElement('a');
        wa.className = 'btn-secondary';
        wa.target = '_blank';
        wa.rel = 'noopener';
        wa.href = `https://wa.me/?text=${encodeURIComponent(cockpit.presenca.guiaoVideo)}`;
        wa.textContent = 'Enviar guião por WhatsApp';
        wrap.append(copy, wa);
        panel.appendChild(wrap);
    }

    const stateActions = el('div', 'coverage-pin-actions maps-state-actions');
    async function runAction(action, okMsg) {
        const { response, data } = await api(
            `/api/digitalizept/deals/${encodeURIComponent(cockpit.projectId)}/maps/google/action`,
            { method: 'POST', body: { action } }
        );
        if (!response.ok) {
            toast(data.error || 'Não foi possível actualizar.', true);
            return;
        }
        toast(data.delivered ? 'A Google aceitou. Entrega marcada como feita.' : okMsg);
        if (typeof onUpdated === 'function') onUpdated(data.cockpit || data);
    }

    const waitBtn = el('button', 'btn-secondary', 'Já pedi a verificação à Google');
    waitBtn.type = 'button';
    waitBtn.addEventListener('click', () => runAction('aguardar_verificacao', 'À espera da Google. Pode demorar dias.'));

    const okBtn = el('button', 'btn-primary', cockpit.googleOnly
        ? 'A Google aceitou — concluir'
        : 'A Google aceitou');
    okBtn.type = 'button';
    okBtn.addEventListener('click', () => runAction('verificado', 'Marcado como aceite.'));

    const failBtn = el('button', 'btn-secondary', 'Não deu — marcar falha');
    failBtn.type = 'button';
    failBtn.addEventListener('click', () => {
        if (!window.confirm('Marcar a presença no Google como falhada?')) return;
        runAction('falhou', 'Estado: falhou.');
    });
    stateActions.append(waitBtn, okBtn, failBtn);
    panel.appendChild(stateActions);

    if (cockpit.presenca?.mensagemClienteRascunho) {
        const { wrap, pre } = detailsBlock('Mensagem pronta para o cliente (não envia sozinha)', cockpit.presenca.mensagemClienteRascunho);
        const copy = el('button', 'btn-secondary', 'Copiar mensagem');
        copy.type = 'button';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(pre.textContent);
                toast('Mensagem copiada.');
            } catch (_) {
                toast('Não foi possível copiar.', true);
            }
        });
        wrap.appendChild(copy);
        panel.appendChild(wrap);
    }

    addCloseRow(panel, onClose);
}
