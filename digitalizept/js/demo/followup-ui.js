import {
    buildEmailContent,
    buildMailtoUrl,
    buildWhatsAppMessage,
    buildWhatsAppUrl,
    defaultVisitaQuando,
    normalizePhoneForWa
} from './followup-messages.js';

function copyText(text, ctx, okMessage) {
    return navigator.clipboard.writeText(text)
        .then(() => ctx.showToast(okMessage))
        .catch(() => ctx.showToast('Não foi possível copiar.', true));
}

export function renderFollowupShare(host, ctx, config, { onPublish, hidePublish = false } = {}) {
    host.innerHTML = '';
    host.className = 'id-section followup-share';

    const title = document.createElement('h3');
    title.className = 'field-group-title';
    title.textContent = 'Enviar demonstração';

    const hint = document.createElement('p');
    hint.className = 'id-disclaimer';
    hint.textContent = 'WhatsApp — enviar até 3 horas depois da visita. Email — no mesmo dia. O link da demo entra automaticamente.';

    if (!ctx.state.data.followupVisita) {
        ctx.state.data.followupVisita = defaultVisitaQuando().includes('manhã') ? 'manha' : 'tarde';
    }
    if (!ctx.state.data.followupDia) {
        ctx.state.data.followupDia = 'amanhã';
    }

    const controls = document.createElement('div');
    controls.className = 'followup-controls';

    const visitaLabel = document.createElement('label');
    visitaLabel.className = 'field';
    const visitaSpan = document.createElement('span');
    visitaSpan.className = 'field-label';
    visitaSpan.textContent = 'Visita foi';
    const visitaSelect = document.createElement('select');
    visitaSelect.className = 'field-input';
    [
        { id: 'manha', label: 'Hoje de manhã' },
        { id: 'tarde', label: 'Esta tarde' }
    ].forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.id;
        o.textContent = opt.label;
        if (ctx.state.data.followupVisita === opt.id) o.selected = true;
        visitaSelect.appendChild(o);
    });
    visitaLabel.append(visitaSpan, visitaSelect);

    const diaLabel = document.createElement('label');
    diaLabel.className = 'field';
    const diaSpan = document.createElement('span');
    diaSpan.className = 'field-label';
    diaSpan.textContent = 'Passo aí (follow-up)';
    const diaInput = document.createElement('input');
    diaInput.type = 'text';
    diaInput.className = 'field-input';
    diaInput.placeholder = 'Ex.: amanhã, sexta-feira';
    diaInput.value = ctx.state.data.followupDia || 'amanhã';
    diaLabel.append(diaSpan, diaInput);

    controls.append(visitaLabel, diaLabel);

    const linkStatus = document.createElement('p');
    linkStatus.className = 'followup-link-status';

    const waPreview = document.createElement('textarea');
    waPreview.className = 'field-input demo-paste followup-preview';
    waPreview.rows = 8;

    const emailSubject = document.createElement('input');
    emailSubject.type = 'text';
    emailSubject.className = 'field-input';
    emailSubject.placeholder = 'Assunto do email';

    const emailPreview = document.createElement('textarea');
    emailPreview.className = 'field-input demo-paste followup-preview';
    emailPreview.rows = 10;

    function paintMessages() {
        const hasLink = Boolean((ctx.state.data.demoUrl || '').trim());
        linkStatus.textContent = hasLink
            ? `Link: ${ctx.state.data.demoUrl}`
            : 'Ainda sem link público — publique a demo para incluir o URL nas mensagens.';
        linkStatus.classList.toggle('followup-link-missing', !hasLink);

        waPreview.value = buildWhatsAppMessage(ctx.state, config);
        const email = buildEmailContent(ctx.state, config);
        emailSubject.value = email.subject;
        emailPreview.value = email.body;
        ctx.update({
            followupVisita: visitaSelect.value,
            followupDia: diaInput.value.trim() || 'amanhã'
        });
    }

    visitaSelect.addEventListener('change', paintMessages);
    diaInput.addEventListener('input', paintMessages);

    const actions = document.createElement('div');
    actions.className = 'demo-actions followup-actions';

    const publishBtn = document.createElement('button');
    publishBtn.type = 'button';
    publishBtn.className = 'btn-secondary';
    publishBtn.textContent = 'Publicar demo e actualizar link';
    publishBtn.addEventListener('click', async () => {
        publishBtn.disabled = true;
        try {
            if (typeof onPublish === 'function') await onPublish();
            paintMessages();
            ctx.showToast('Link da demo actualizado nas mensagens.');
        } catch (_) {
            ctx.showToast('Não foi possível publicar a demo.', true);
        } finally {
            publishBtn.disabled = false;
        }
    });
    const waBtn = document.createElement('button');
    waBtn.type = 'button';
    waBtn.className = 'btn-primary followup-wa';
    waBtn.textContent = 'Abrir WhatsApp';
    waBtn.addEventListener('click', () => {
        const msg = waPreview.value.trim();
        if (!msg) return;
        const phone = normalizePhoneForWa(
            (ctx.state.data.dados && (ctx.state.data.dados.whatsapp || ctx.state.data.dados.telefone)) || ''
        );
        window.open(buildWhatsAppUrl(phone, msg), '_blank', 'noopener');
    });

    const emailBtn = document.createElement('button');
    emailBtn.type = 'button';
    emailBtn.className = 'btn-secondary';
    emailBtn.textContent = 'Abrir email';
    emailBtn.addEventListener('click', () => {
        const to = ctx.state.data.dados && ctx.state.data.dados.email;
        if (!to) {
            ctx.showToast('Preencha o email do negócio nos dados.', true);
            return;
        }
        window.location.href = buildMailtoUrl(to, emailSubject.value, emailPreview.value);
    });

    const copyWa = document.createElement('button');
    copyWa.type = 'button';
    copyWa.className = 'btn-secondary';
    copyWa.textContent = 'Copiar WhatsApp';
    copyWa.addEventListener('click', () => copyText(waPreview.value, ctx, 'Mensagem WhatsApp copiada.'));

    const copyEmail = document.createElement('button');
    copyEmail.type = 'button';
    copyEmail.className = 'btn-secondary';
    copyEmail.textContent = 'Copiar email';
    copyEmail.addEventListener('click', () => {
        const block = `Assunto: ${emailSubject.value}\n\n${emailPreview.value}`;
        copyText(block, ctx, 'Email copiado.');
    });

    actions.append(waBtn, emailBtn, copyWa, copyEmail);
    if (!hidePublish) actions.prepend(publishBtn);

    const waLabel = document.createElement('p');
    waLabel.className = 'field-group-title';
    waLabel.style.marginTop = '12px';
    waLabel.textContent = 'WhatsApp';

    const emailLabel = document.createElement('p');
    emailLabel.className = 'field-group-title';
    emailLabel.style.marginTop = '12px';
    emailLabel.textContent = 'Email';

    host.append(title, hint, controls, linkStatus, waLabel, waPreview, emailLabel, emailSubject, emailPreview, actions);
    paintMessages();

    return { refresh: paintMessages };
}
