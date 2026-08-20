/**
 * Admin cockpit — guided Google Maps delivery for closed deals.
 */

export function renderMapsCockpit(panel, cockpit, {
    api,
    toast,
    field,
    onUpdated
}) {
    panel.innerHTML = '';
    const title = document.createElement('h2');
    title.textContent = `Presença Google — ${cockpit.lead?.nome || 'Negócio'}`;
    panel.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'meta';
    const pacote = cockpit.proposta?.pacote || '—';
    meta.textContent = [
        `Pacote: ${pacote}${cockpit.perfilCompleto ? ' + Perfil 100%' : ''}`,
        cockpit.googleOnly ? 'entrega = Google verificado' : 'site pode entregar sem Google',
        `Estado: ${cockpit.presenca?.estadoLabel || cockpit.estadoGoogle || '—'}`
    ].join(' · ');
    panel.appendChild(meta);

    if (cockpit.teslaNote) {
        const tesla = document.createElement('p');
        tesla.className = 'admin-hint';
        tesla.textContent = cockpit.teslaNote;
        panel.appendChild(tesla);
    }

    const dest = document.createElement('div');
    dest.className = 'maps-destinos';
    const destTitle = document.createElement('p');
    destTitle.className = 'field-label';
    destTitle.textContent = 'Destinos';
    dest.appendChild(destTitle);
    (cockpit.providers || []).forEach((p) => {
        const row = document.createElement('label');
        row.className = 'maps-destino-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.disabled = !p.enabled;
        cb.checked = p.id === 'google' && p.enabled;
        const text = document.createElement('span');
        text.textContent = `${p.nome} — ${p.capabilityLabel || p.capability}`;
        row.append(cb, text);
        dest.appendChild(row);
    });
    panel.appendChild(dest);

    if (Array.isArray(cockpit.missing) && cockpit.missing.length) {
        const miss = document.createElement('div');
        miss.className = 'maps-missing';
        const h = document.createElement('p');
        h.className = 'field-label';
        h.textContent = 'Dados em falta';
        miss.appendChild(h);
        const ul = document.createElement('ul');
        cockpit.missing.forEach((m) => {
            const li = document.createElement('li');
            li.textContent = m.label || m.id;
            ul.appendChild(li);
        });
        miss.appendChild(ul);
        panel.appendChild(miss);
    }

    const actions = document.createElement('div');
    actions.className = 'coverage-pin-actions';

    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'btn-primary';
    start.textContent = cockpit.presenca?.estado === 'nao_iniciado' || cockpit.presenca?.estado === 'em_falta_dados'
        ? 'Começar entrega Google'
        : 'Actualizar guião / continuar';
    start.addEventListener('click', async () => {
        start.disabled = true;
        try {
            const { response, data } = await api(
                `/api/digitalizept/deals/${encodeURIComponent(cockpit.projectId)}/maps/google/start`,
                { method: 'POST', body: {} }
            );
            if (!response.ok) {
                toast(data.error || 'Falha ao iniciar.', true);
                return;
            }
            toast(data.result?.ok ? 'Entrega em curso.' : 'Ainda há dados em falta.');
            if (typeof onUpdated === 'function') onUpdated(data.cockpit || data);
        } finally {
            start.disabled = false;
        }
    });
    actions.appendChild(start);
    panel.appendChild(actions);

    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'maps-steps';
    const stepsTitle = document.createElement('p');
    stepsTitle.className = 'field-label';
    stepsTitle.textContent = 'Passos com o cliente';
    stepsWrap.appendChild(stepsTitle);

    const steps = cockpit.presenca?.steps || [];
    if (!steps.length) {
        const empty = document.createElement('p');
        empty.className = 'meta';
        empty.textContent = 'Carregue “Começar entrega” para gerar a checklist.';
        stepsWrap.appendChild(empty);
    } else {
        steps.forEach((step) => {
            const row = document.createElement('label');
            row.className = 'maps-step-row';
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
                        toast(data.error || 'Falha.', true);
                        return;
                    }
                    if (typeof onUpdated === 'function') onUpdated(data);
                } finally {
                    cb.disabled = false;
                }
            });
            const body = document.createElement('span');
            const strong = document.createElement('strong');
            strong.textContent = step.title;
            const detail = document.createElement('span');
            detail.className = 'meta';
            detail.textContent = step.detail || '';
            body.append(strong, document.createElement('br'), detail);
            row.append(cb, body);
            stepsWrap.appendChild(row);
        });
    }
    panel.appendChild(stepsWrap);

    if (cockpit.presenca?.contaScript) {
        const conta = document.createElement('div');
        conta.className = 'maps-script';
        const h = document.createElement('p');
        h.className = 'field-label';
        h.textContent = 'Conta Google (4 min)';
        const pre = document.createElement('pre');
        pre.className = 'maps-script-pre';
        pre.textContent = cockpit.presenca.contaScript;
        conta.append(h, pre);
        panel.appendChild(conta);
    }

    if (cockpit.presenca?.guiaoVideo) {
        const video = document.createElement('div');
        video.className = 'maps-script';
        const h = document.createElement('p');
        h.className = 'field-label';
        h.textContent = 'Guião do vídeo de verificação';
        const pre = document.createElement('pre');
        pre.className = 'maps-script-pre';
        pre.textContent = cockpit.presenca.guiaoVideo;
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'btn-secondary';
        copy.textContent = 'Copiar guião';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(cockpit.presenca.guiaoVideo);
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
        wa.textContent = 'Enviar por WhatsApp';
        video.append(h, pre, copy, wa);
        panel.appendChild(video);
    }

    const stateActions = document.createElement('div');
    stateActions.className = 'coverage-pin-actions';
    stateActions.style.marginTop = '16px';

    async function runAction(action, okMsg) {
        const { response, data } = await api(
            `/api/digitalizept/deals/${encodeURIComponent(cockpit.projectId)}/maps/google/action`,
            { method: 'POST', body: { action } }
        );
        if (!response.ok) {
            toast(data.error || 'Falha.', true);
            return;
        }
        toast(data.delivered ? 'Google aceite — projeto marcado como entregue.' : okMsg);
        if (typeof onUpdated === 'function') onUpdated(data.cockpit || data);
    }

    const waitBtn = document.createElement('button');
    waitBtn.type = 'button';
    waitBtn.className = 'btn-secondary';
    waitBtn.textContent = 'Validação pedida / vídeo enviado';
    waitBtn.addEventListener('click', () => runAction('aguardar_verificacao', 'A aguardar o Google.'));

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn-primary';
    okBtn.textContent = cockpit.googleOnly
        ? 'Google aceitou — concluir entrega'
        : 'Google aceitou';
    okBtn.addEventListener('click', () => runAction('verificado', 'Marcado como verificado.'));

    const failBtn = document.createElement('button');
    failBtn.type = 'button';
    failBtn.className = 'btn-secondary';
    failBtn.textContent = 'Marcar falha';
    failBtn.addEventListener('click', () => {
        if (!window.confirm('Marcar a presença Google como falhada?')) return;
        runAction('falhou', 'Estado: falhou.');
    });

    stateActions.append(waitBtn, okBtn, failBtn);
    panel.appendChild(stateActions);

    if (cockpit.presenca?.mensagemClienteRascunho) {
        const draft = document.createElement('div');
        draft.className = 'maps-script';
        const h = document.createElement('p');
        h.className = 'field-label';
        h.textContent = 'Rascunho para o cliente (não envia sozinho)';
        const pre = document.createElement('pre');
        pre.className = 'maps-script-pre';
        pre.textContent = cockpit.presenca.mensagemClienteRascunho;
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'btn-secondary';
        copy.textContent = 'Copiar mensagem';
        copy.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(cockpit.presenca.mensagemClienteRascunho);
                toast('Mensagem copiada.');
            } catch (_) {
                toast('Não foi possível copiar.', true);
            }
        });
        draft.append(h, pre, copy);
        panel.appendChild(draft);
    }
}
