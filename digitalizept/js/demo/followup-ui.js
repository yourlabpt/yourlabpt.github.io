import {
    buildEmailContent,
    buildMailtoUrl,
    buildWhatsAppMessage,
    buildWhatsAppUrl,
    defaultVisitaQuando,
    nextSendableWaStep,
    normalizePhoneForWa,
    outreachLangOf,
    waStepLabel
} from './followup-messages.js';
import {
    defaultFollowupDia,
    localizeFollowupDia,
    normalizeOutreachLang
} from './outreach-lang.js';
import {
    listFalhas,
    pickGancho,
    suggestFalhas,
    sinaisFromWizardState
} from './outreach-ganchos.js';
import { CAMPANHA_PRESETS, normalizeOffer, showPriceBlock } from './outreach-offer.js';
import {
    askCallNotifyPermission,
    callCopy,
    confirmCallState,
    formatCallDue,
    formatCountdown,
    maybeNotifyDueCall
} from './confirm-call.js';
import { renderProviderEditor } from '../provider-editor.js';

function copyText(text, ctx, okMessage) {
    return navigator.clipboard.writeText(text)
        .then(() => ctx.showToast(okMessage))
        .catch(() => ctx.showToast('Não foi possível copiar.', true));
}

function leadIdOf(ctx) {
    return String((ctx.state.data && ctx.state.data.leadId) || '').trim();
}

export function renderFollowupShare(host, ctx, config, { onPublish, hidePublish = false } = {}) {
    host.innerHTML = '';
    host.className = 'id-section followup-share';

    const title = document.createElement('h3');
    title.className = 'field-group-title';
    title.textContent = 'Enviar demonstração';

    const hint = document.createElement('p');
    hint.className = 'id-disclaimer';
    hint.textContent = 'WhatsApp em 3 passos. Depois do envio, o countdown marca quando ligar a confirmar a receção — para o cliente perceber que há uma pessoa real, não spam.';

    if (!ctx.state.data.followupVisita) {
        ctx.state.data.followupVisita = defaultVisitaQuando().includes('manhã') ? 'manha' : 'tarde';
    }
    if (!ctx.state.data.followup) ctx.state.data.followup = { waStep: 0, lang: 'pt' };
    if (!ctx.state.data.followup.lang) ctx.state.data.followup.lang = 'pt';
    if (!ctx.state.data.followupDia) {
        ctx.state.data.followupDia = defaultFollowupDia(ctx.state.data.followup.lang);
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
    diaInput.value = ctx.state.data.followupDia || defaultFollowupDia(ctx.state.data.followup.lang);
    diaLabel.append(diaSpan, diaInput);

    const langWrap = document.createElement('div');
    langWrap.className = 'field followup-lang';
    const langSpan = document.createElement('span');
    langSpan.className = 'field-label';
    langSpan.textContent = 'Idioma';
    const langRow = document.createElement('div');
    langRow.className = 'followup-lang-row';
    const langButtons = {};
    [
        { id: 'pt', label: 'PT' },
        { id: 'en', label: 'EN' }
    ].forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'followup-lang-btn';
        btn.textContent = opt.label;
        langButtons[opt.id] = btn;
        langRow.appendChild(btn);
    });
    langWrap.append(langSpan, langRow);

    controls.append(langWrap, visitaLabel, diaLabel);

    const linkStatus = document.createElement('p');
    linkStatus.className = 'followup-link-status';

    const seqStatus = document.createElement('p');
    seqStatus.className = 'followup-seq-status';

    const callBox = document.createElement('div');
    callBox.className = 'followup-call hidden';
    const callTitle = document.createElement('p');
    callTitle.className = 'followup-call-title';
    const callCount = document.createElement('p');
    callCount.className = 'followup-call-count';
    const callHint = document.createElement('p');
    callHint.className = 'followup-call-hint';
    const callActions = document.createElement('div');
    callActions.className = 'followup-call-actions';
    const callTel = document.createElement('a');
    callTel.className = 'btn-primary';
    callTel.textContent = 'Ligar';
    const callDoneBtn = document.createElement('button');
    callDoneBtn.type = 'button';
    callDoneBtn.className = 'btn-secondary';
    callDoneBtn.textContent = 'Já liguei';
    callActions.append(callTel, callDoneBtn);
    callBox.append(callTitle, callCount, callHint, callActions);

    const ganchoBox = document.createElement('div');
    ganchoBox.className = 'followup-ganchos';
    const ganchoTitle = document.createElement('p');
    ganchoTitle.className = 'field-group-title';
    ganchoTitle.textContent = 'O que vamos resolver';
    const ganchoList = document.createElement('div');
    ganchoList.className = 'followup-gancho-list';
    const ganchoButtons = {};
    listFalhas().forEach((g) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'followup-gancho';
        btn.dataset.gancho = g.id;
        const name = document.createElement('span');
        name.className = 'followup-gancho-name';
        const label = document.createElement('span');
        label.textContent = g.nomeCurto;
        const badge = document.createElement('span');
        badge.className = 'followup-gancho-suggested hidden';
        badge.textContent = 'Sugerido';
        name.append(label, badge);
        const preview = document.createElement('span');
        preview.className = 'followup-gancho-title';
        preview.textContent = g.ganchoTitulo;
        btn.append(name, preview);
        ganchoButtons[g.id] = { btn, badge, preview };
        ganchoList.appendChild(btn);
    });
    const problemaWrap = document.createElement('label');
    problemaWrap.className = 'field followup-gancho-problema hidden';
    const problemaSpan = document.createElement('span');
    problemaSpan.className = 'field-label';
    problemaSpan.textContent = 'O que está errado na ficha';
    const problemaInput = document.createElement('input');
    problemaInput.type = 'text';
    problemaInput.className = 'field-input';
    problemaInput.placeholder = 'Ex.: que fecham às 18h';
    problemaWrap.append(problemaSpan, problemaInput);
    ganchoBox.append(ganchoTitle, ganchoList, problemaWrap);

    const offerBox = document.createElement('div');
    offerBox.className = 'followup-offer';
    const offerTitle = document.createElement('p');
    offerTitle.className = 'field-group-title';
    offerTitle.textContent = 'Valores e campanha';
    const offerHint = document.createElement('p');
    offerHint.className = 'id-disclaimer';
    offerHint.textContent = 'A campanha fica nesta lead e entra já no desconto da proposta.';
    const priceLabel = document.createElement('span');
    priceLabel.className = 'field-label';
    priceLabel.textContent = 'Valores no email';
    const priceRow = document.createElement('div');
    priceRow.className = 'followup-offer-row';
    const priceOffBtn = document.createElement('button');
    priceOffBtn.type = 'button';
    priceOffBtn.className = 'disc-chip';
    priceOffBtn.textContent = 'Sem valores';
    const priceOnBtn = document.createElement('button');
    priceOnBtn.type = 'button';
    priceOnBtn.className = 'disc-chip';
    priceOnBtn.textContent = 'Com 89 / 129 / 159';
    priceRow.append(priceOffBtn, priceOnBtn);

    const campLabel = document.createElement('span');
    campLabel.className = 'field-label';
    campLabel.textContent = 'Campanha nesta lead';
    const campRow = document.createElement('div');
    campRow.className = 'followup-offer-row disc-chips';
    const campNoneBtn = document.createElement('button');
    campNoneBtn.type = 'button';
    campNoneBtn.className = 'disc-chip';
    campNoneBtn.dataset.pct = '0';
    campNoneBtn.textContent = 'Sem campanha';
    campRow.appendChild(campNoneBtn);
    const campPresetBtns = {};
    CAMPANHA_PRESETS.forEach((pct) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'disc-chip';
        btn.dataset.pct = String(pct);
        btn.textContent = `${pct}%`;
        campPresetBtns[pct] = btn;
        campRow.appendChild(btn);
    });
    const campOutroBtn = document.createElement('button');
    campOutroBtn.type = 'button';
    campOutroBtn.className = 'disc-chip';
    campOutroBtn.textContent = 'Outro';
    campRow.appendChild(campOutroBtn);
    const campCustom = document.createElement('input');
    campCustom.type = 'number';
    campCustom.min = '1';
    campCustom.max = '100';
    campCustom.className = 'field-input followup-offer-custom';
    campCustom.placeholder = '%';
    campCustom.hidden = true;

    const modeLabel = document.createElement('span');
    modeLabel.className = 'field-label';
    modeLabel.textContent = 'Mostrar na campanha';
    const modeRow = document.createElement('div');
    modeRow.className = 'followup-offer-row';
    const modeValuesBtn = document.createElement('button');
    modeValuesBtn.type = 'button';
    modeValuesBtn.className = 'disc-chip';
    modeValuesBtn.textContent = 'Valores com desconto';
    const modePctBtn = document.createElement('button');
    modePctBtn.type = 'button';
    modePctBtn.className = 'disc-chip';
    modePctBtn.textContent = 'Só a percentagem';
    modeRow.append(modeValuesBtn, modePctBtn);
    const modeWrap = document.createElement('div');
    modeWrap.className = 'followup-offer-mode';
    modeWrap.append(modeLabel, modeRow);

    offerBox.append(
        offerTitle,
        offerHint,
        priceLabel,
        priceRow,
        campLabel,
        campRow,
        campCustom,
        modeWrap
    );

    const tabs = document.createElement('div');
    tabs.className = 'followup-tabs';
    let activeStep = nextSendableWaStep(ctx.state.data.followup) || Math.max(1, Number(ctx.state.data.followup.waStep) || 1);
    let langTouched = false;

    function followupOf() {
        return ctx.state.data.followup || { waStep: 0 };
    }

    function suggestedFalhas() {
        return suggestFalhas(sinaisFromWizardState(ctx.state));
    }

    function selectedFalhas() {
        const saved = followupOf().falhas;
        if (Array.isArray(saved) && saved.length) return saved.slice();
        const migrated = followupOf().ganchoId;
        if (migrated) return pickGancho({ override: migrated }).falhas;
        return suggestedFalhas();
    }

    function currentLang() {
        return normalizeOutreachLang(followupOf().lang || outreachLangOf(ctx.state));
    }

    function ganchoPayload() {
        const selected = selectedFalhas();
        const f = followupOf();
        return {
            lang: currentLang(),
            falhas: selected,
            ganchoId: selected[0] || '',
            fichaComErro: selected.includes('ficha_errada') || f.fichaComErro === true,
            siteVelho: f.siteVelho === true,
            problemaFicha: String(f.problemaFicha || '').trim(),
            ...offerPayload()
        };
    }

    function offerPayload() {
        return normalizeOffer(followupOf());
    }

    function persistOffer(patch) {
        const next = normalizeOffer({ ...offerPayload(), ...patch });
        ctx.update({
            followup: { ...followupOf(), ...next },
            proposta: { ...(ctx.state.data.proposta || {}), descontoPct: next.campanhaPct },
            followupWa2: '',
            followupEmailBody: ''
        });
        emailPreview.dataset.autofill = '1';
        emailPreview.value = '';
        paintOffer();
        paintMessages();
        persistOfferRemote(next);
    }

    async function persistOfferRemote(offer) {
        const id = leadIdOf(ctx);
        if (!id || typeof config.api !== 'function') return;
        try {
            const { response, data } = await outreach('/offer', offer);
            if (response.ok && data.followup) {
                ctx.update({
                    followup: { ...followupOf(), ...data.followup },
                    proposta: {
                        ...(ctx.state.data.proposta || {}),
                        descontoPct: data.descontoPct != null ? data.descontoPct : offer.campanhaPct
                    }
                });
            }
        } catch (_) { /* local preview still works */ }
    }

    function paintOffer() {
        const o = offerPayload();
        priceOnBtn.classList.toggle('active', showPriceBlock(o));
        priceOffBtn.classList.toggle('active', !showPriceBlock(o));
        campNoneBtn.classList.toggle('active', o.campanhaPct === 0);
        Object.entries(campPresetBtns).forEach(([pct, btn]) => {
            btn.classList.toggle('active', o.campanhaPct === Number(pct));
        });
        const preset = o.campanhaPct === 0 || CAMPANHA_PRESETS.includes(o.campanhaPct);
        campOutroBtn.classList.toggle('active', o.campanhaPct > 0 && !CAMPANHA_PRESETS.includes(o.campanhaPct));
        campCustom.hidden = preset;
        if (!preset && document.activeElement !== campCustom) {
            campCustom.value = String(o.campanhaPct);
        }
        modeWrap.classList.toggle('hidden', o.campanhaPct <= 0);
        modeValuesBtn.classList.toggle('active', o.campanhaShowPrices);
        modePctBtn.classList.toggle('active', !o.campanhaShowPrices);
    }

    function rewriteCopyFromGancho() {
        ctx.update({ followupWa1: '' });
        emailSubject.dataset.autofill = '1';
        emailPreview.dataset.autofill = '1';
        emailSubject.value = '';
        emailPreview.value = '';
    }

    function persistGancho(patch) {
        ctx.update({
            followup: {
                ...followupOf(),
                ...patch
            }
        });
        rewriteCopyFromGancho();
        paintGanchos();
        paintMessages();
    }

    const waPreview = document.createElement('textarea');
    waPreview.className = 'field-input demo-paste followup-preview';
    waPreview.rows = 12;

    const emailSubject = document.createElement('input');
    emailSubject.type = 'text';
    emailSubject.className = 'field-input';
    emailSubject.placeholder = 'Assunto do email';

    const emailPreview = document.createElement('textarea');
    emailPreview.className = 'field-input demo-paste followup-preview';
    emailPreview.rows = 8;

    function persistEdits() {
        const patch = {
            followupVisita: visitaSelect.value,
            followupDia: diaInput.value.trim() || defaultFollowupDia(currentLang()),
            [`followupWa${activeStep}`]: waPreview.value,
            followupEmailSubject: emailSubject.value,
            followupEmailBody: emailPreview.value,
            followup: {
                ...followupOf(),
                ...ganchoPayload()
            }
        };
        ctx.update(patch);
    }

    function paintGanchos() {
        const selected = new Set(selectedFalhas());
        const suggested = new Set(suggestedFalhas());
        Object.entries(ganchoButtons).forEach(([id, node]) => {
            node.btn.classList.toggle('active', selected.has(id));
            node.btn.classList.toggle('is-active', selected.has(id));
            node.badge.classList.toggle('hidden', !suggested.has(id));
        });
        problemaWrap.classList.toggle('hidden', !selected.has('ficha_errada'));
        const f = followupOf();
        if (document.activeElement !== problemaInput) {
            problemaInput.value = f.problemaFicha || '';
        }
    }

    function paintCall() {
        const followup = ctx.state.data.followup || {};
        const state = confirmCallState(followup);
        const dados = ctx.state.data.dados || {};
        const phone = normalizePhoneForWa(dados.whatsapp || dados.telefone || '');
        if (state.status === 'none') {
            callBox.classList.add('hidden');
            return;
        }
        callBox.classList.remove('hidden');
        callBox.classList.toggle('followup-call-due', state.status === 'due');
        if (state.status === 'done') {
            callTitle.textContent = 'Ligação de confirmação';
            callCount.textContent = 'Feita';
            callHint.textContent = callCopy('done');
            callActions.classList.add('hidden');
            return;
        }
        callActions.classList.remove('hidden');
        callTitle.textContent = state.status === 'due'
            ? 'Ligar agora'
            : 'Ligar a confirmar receção';
        callCount.textContent = state.status === 'due'
            ? 'Agora'
            : formatCountdown(state.remainingMs);
        const when = formatCallDue(state.dueAt);
        callHint.textContent = when
            ? `${callCopy(state.status)} ${when}.`
            : callCopy(state.status);
        if (phone) {
            callTel.href = `tel:+${phone}`;
            callTel.classList.remove('hidden');
        } else {
            callTel.removeAttribute('href');
            callTel.classList.add('hidden');
        }
        maybeNotifyDueCall({
            id: leadIdOf(ctx),
            nome: dados.nome_negocio,
            telefone: dados.telefone,
            whatsapp: dados.whatsapp,
            callDueAt: followup.callDueAt,
            callDoneAt: followup.callDoneAt
        });
    }

    function paintTabs() {
        tabs.innerHTML = '';
        const followup = ctx.state.data.followup || { waStep: 0 };
        const unlocked = followup.waStep || 0;
        [1, 2, 3].forEach((n) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `followup-tab${activeStep === n ? ' active' : ''}`;
            const locked = n > 1 && n > unlocked && !(n === 2 && followup.replied1At) && !(n === 3 && followup.replied2At) && n !== nextSendableWaStep(followup);
            const sent = unlocked >= n;
            btn.textContent = sent ? `${n} enviada` : `${n}`;
            btn.title = waStepLabel(n);
            if (locked && n > Math.max(unlocked, 1) && n !== nextSendableWaStep(followup) && n !== activeStep) {
                btn.disabled = n > unlocked + (followup[`replied${n - 1}At`] ? 1 : 0) && n !== 1;
            }
            btn.addEventListener('click', () => {
                persistEdits();
                activeStep = n;
                paintMessages();
            });
            tabs.appendChild(btn);
        });
    }

    function paintMessages() {
        const hasLink = Boolean((ctx.state.data.demoUrl || '').trim());
        linkStatus.textContent = hasLink
            ? `Link: ${ctx.state.data.demoUrl}`
            : 'Ainda sem link público — publique a demo para incluir o URL nas mensagens.';
        linkStatus.classList.toggle('followup-link-missing', !hasLink);

        const followup = ctx.state.data.followup || { waStep: 0 };
        const next = nextSendableWaStep(followup);
        if (followup.unsubscribed || ctx.state.data.resultado === 'sem_interesse') {
            seqStatus.textContent = 'Sem interesse — no fundo da lista.';
        } else if (followup.waStep >= 3) {
            seqStatus.textContent = 'Sequência WhatsApp completa (3/3).';
        } else if (next) {
            seqStatus.textContent = `Próxima a enviar: ${waStepLabel(next)}.${followup.emailSentAt ? ' Email HTML já enviado.' : ''}`;
        } else {
            seqStatus.textContent = `À espera da resposta à mensagem ${followup.waStep}. Toque em “Cliente respondeu” para desbloquear a seguinte.`;
        }

        paintCall();
        paintGanchos();
        paintOffer();
        paintTabs();
        waPreview.value = buildWhatsAppMessage(ctx.state, config, activeStep);
        const email = buildEmailContent(ctx.state, config);
        if (!emailSubject.value || emailSubject.dataset.autofill === '1') {
            emailSubject.value = email.subject;
            emailSubject.dataset.autofill = '1';
        }
        if (!emailPreview.value || emailPreview.dataset.autofill === '1') {
            emailPreview.value = email.body;
            emailPreview.dataset.autofill = '1';
        }
        ctx.update({
            followupVisita: visitaSelect.value,
            followupDia: diaInput.value.trim() || defaultFollowupDia(currentLang())
        });
        waLabel.textContent = waStepLabel(activeStep);
        paintLang();
    }

    function paintLang() {
        const lang = currentLang();
        Object.entries(langButtons).forEach(([id, btn]) => {
            btn.classList.toggle('active', id === lang);
            btn.setAttribute('aria-pressed', id === lang ? 'true' : 'false');
        });
    }

    function applyLang(next) {
        const lang = normalizeOutreachLang(next);
        if (lang === currentLang()) return;
        langTouched = true;
        const nextDia = localizeFollowupDia(diaInput.value.trim() || defaultFollowupDia(lang), lang);
        diaInput.value = nextDia;
        emailSubject.dataset.autofill = '1';
        emailPreview.dataset.autofill = '1';
        emailSubject.value = '';
        emailPreview.value = '';
        ctx.update({
            followupDia: nextDia,
            followupWa1: '',
            followupWa2: '',
            followupWa3: '',
            followupEmailSubject: '',
            followupEmailBody: '',
            followup: { ...followupOf(), lang }
        });
        paintMessages();
        persistLangRemote(lang);
    }

    async function persistLangRemote(lang) {
        const id = leadIdOf(ctx);
        if (!id || typeof config.api !== 'function') return;
        try {
            const { response, data } = await outreach('/lang', { lang });
            if (response.ok && data.followup) {
                ctx.update({ followup: { ...followupOf(), ...data.followup, lang } });
            }
        } catch (_) { /* local preview still works */ }
    }

    Object.entries(ganchoButtons).forEach(([id, node]) => {
        node.btn.addEventListener('click', () => {
            const next = new Set(selectedFalhas());
            if (next.has(id)) next.delete(id);
            else next.add(id);
            persistGancho({
                falhas: [...next],
                ganchoId: [...next][0] || '',
                fichaComErro: next.has('ficha_errada')
            });
        });
    });
    problemaInput.addEventListener('input', () => {
        persistGancho({
            falhas: selectedFalhas(),
            fichaComErro: true,
            problemaFicha: problemaInput.value.trim()
        });
    });

    priceOnBtn.addEventListener('click', () => persistOffer({ includePrices: true }));
    priceOffBtn.addEventListener('click', () => persistOffer({ includePrices: false, campanhaShowPrices: false }));
    campNoneBtn.addEventListener('click', () => persistOffer({ campanhaPct: 0 }));
    Object.entries(campPresetBtns).forEach(([pct, btn]) => {
        btn.addEventListener('click', () => persistOffer({ campanhaPct: Number(pct) }));
    });
    campOutroBtn.addEventListener('click', () => {
        campCustom.hidden = false;
        campCustom.focus();
        if (!campCustom.value) campCustom.value = '25';
        persistOffer({ campanhaPct: Number(campCustom.value) || 25 });
    });
    campCustom.addEventListener('change', () => {
        persistOffer({ campanhaPct: Number(campCustom.value) || 0 });
    });
    modeValuesBtn.addEventListener('click', () => persistOffer({ campanhaShowPrices: true, includePrices: true }));
    modePctBtn.addEventListener('click', () => persistOffer({ campanhaShowPrices: false }));

    Object.entries(langButtons).forEach(([id, btn]) => {
        btn.addEventListener('click', () => applyLang(id));
    });
    visitaSelect.addEventListener('change', paintMessages);
    diaInput.addEventListener('input', paintMessages);
    waPreview.addEventListener('input', persistEdits);
    emailSubject.addEventListener('input', () => {
        emailSubject.dataset.autofill = '0';
        persistEdits();
    });
    emailPreview.addEventListener('input', () => {
        emailPreview.dataset.autofill = '0';
        persistEdits();
    });

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

    async function outreach(path, body) {
        const id = leadIdOf(ctx);
        if (!id || typeof config.api !== 'function') return null;
        return config.api(`/api/digitalizept/leads/${encodeURIComponent(id)}/outreach${path}`, {
            method: 'POST',
            body
        });
    }

    const waBtn = document.createElement('button');
    waBtn.type = 'button';
    waBtn.className = 'btn-primary followup-wa';
    waBtn.textContent = 'Enviar WhatsApp';
    waBtn.addEventListener('click', async () => {
        persistEdits();
        const msg = waPreview.value.trim();
        if (!msg) return;
        const phone = normalizePhoneForWa(
            (ctx.state.data.dados && (ctx.state.data.dados.whatsapp || ctx.state.data.dados.telefone)) || ''
        );
        window.open(buildWhatsAppUrl(phone, msg), '_blank', 'noopener');
        const id = leadIdOf(ctx);
        if (!id || typeof config.api !== 'function') return;
        try {
            const { response, data } = await outreach('/whatsapp', {
                step: activeStep,
                text: msg,
                followupDia: diaInput.value.trim(),
                visita: visitaSelect.value,
                ...ganchoPayload()
            });
            if (!response.ok) {
                ctx.showToast((data && data.error) || 'WhatsApp aberto; o estado da lead não actualizou.', true);
                return;
            }
            ctx.update({ followup: data.followup || ctx.state.data.followup });
            paintMessages();
            const sent = (data.followup && data.followup.waStep) || activeStep;
            ctx.showToast(`Lead actualizada — WhatsApp ${sent} registado. Countdown da ligação a correr.`);
            askCallNotifyPermission();
            if (typeof config.onPinLead === 'function' && activeStep === 1) {
                config.onPinLead(id).catch(() => {});
            }
        } catch (_) {
            ctx.showToast('WhatsApp aberto; falhou a actualizar a lead.', true);
        }
    });

    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.className = 'btn-secondary';
    replyBtn.textContent = 'Cliente respondeu';
    replyBtn.addEventListener('click', async () => {
        const followup = ctx.state.data.followup || {};
        const step = Number(followup.waStep) || 0;
        if (step < 1 || step > 2) {
            ctx.showToast('Envie primeiro a mensagem actual.', true);
            return;
        }
        const id = leadIdOf(ctx);
        if (!id || typeof config.api !== 'function') {
            ctx.update({
                followup: {
                    ...followup,
                    [`replied${step}At`]: new Date().toISOString()
                }
            });
            activeStep = step + 1;
            paintMessages();
            return;
        }
        try {
            const { response, data } = await outreach('/reply', { step });
            if (!response.ok) {
                ctx.showToast((data && data.error) || 'Não foi possível avançar.', true);
                return;
            }
            ctx.update({ followup: data.followup });
            activeStep = nextSendableWaStep(data.followup) || step + 1;
            paintMessages();
            ctx.showToast(`Resposta registada — prepare a mensagem ${activeStep}.`);
        } catch (_) {
            ctx.showToast('Erro de rede.', true);
        }
    });

    const emailBtn = document.createElement('button');
    emailBtn.type = 'button';
    emailBtn.className = 'btn-secondary';
    emailBtn.textContent = 'Enviar email HTML';
    emailBtn.addEventListener('click', async () => {
        persistEdits();
        const to = ctx.state.data.dados && ctx.state.data.dados.email;
        const id = leadIdOf(ctx);
        if (!to) {
            ctx.showToast('Preencha o email do negócio nos dados.', true);
            return;
        }
        if (!id || typeof config.api !== 'function') {
            window.location.href = buildMailtoUrl(to, emailSubject.value, emailPreview.value);
            return;
        }
        emailBtn.disabled = true;
        try {
            const { response, data } = await outreach('/email', {
                subject: emailSubject.value,
                text: emailPreview.value,
                followupDia: diaInput.value.trim(),
                visita: visitaSelect.value,
                ...ganchoPayload()
            });
            if (!response.ok) {
                ctx.showToast((data && data.error) || 'Não foi possível enviar o email.', true);
                window.location.href = buildMailtoUrl(to, emailSubject.value, emailPreview.value);
                return;
            }
            ctx.update({ followup: data.followup || ctx.state.data.followup });
            paintMessages();
            ctx.showToast('Email HTML enviado. Countdown da ligação a correr — para confirmar que não somos spam.');
            askCallNotifyPermission();
            if (typeof config.onPinLead === 'function') {
                config.onPinLead(id).catch(() => {});
            }
        } catch (_) {
            ctx.showToast('Erro a enviar. A abrir o mail do telemóvel.', true);
            window.location.href = buildMailtoUrl(to, emailSubject.value, emailPreview.value);
        } finally {
            emailBtn.disabled = false;
        }
    });

    const copyWa = document.createElement('button');
    copyWa.type = 'button';
    copyWa.className = 'btn-secondary';
    copyWa.textContent = 'Copiar WhatsApp';
    copyWa.addEventListener('click', () => {
        persistEdits();
        copyText(waPreview.value, ctx, 'Mensagem WhatsApp copiada.');
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn-secondary';
    resetBtn.textContent = 'Repor texto';
    resetBtn.addEventListener('click', () => {
        ctx.update({
            [`followupWa${activeStep}`]: '',
            followupEmailSubject: '',
            followupEmailBody: ''
        });
        emailSubject.dataset.autofill = '1';
        emailPreview.dataset.autofill = '1';
        emailSubject.value = '';
        emailPreview.value = '';
        paintMessages();
    });

    callDoneBtn.addEventListener('click', async () => {
        const id = leadIdOf(ctx);
        if (!id || typeof config.api !== 'function') {
            ctx.update({
                followup: { ...(ctx.state.data.followup || {}), callDoneAt: new Date().toISOString() }
            });
            paintCall();
            return;
        }
        callDoneBtn.disabled = true;
        try {
            const { response, data } = await outreach('/call-done', {});
            if (!response.ok) {
                ctx.showToast((data && data.error) || 'Não foi possível marcar a ligação.', true);
                return;
            }
            ctx.update({ followup: data.followup });
            paintCall();
            ctx.showToast('Ligação marcada como feita.');
        } catch (_) {
            ctx.showToast('Erro de rede.', true);
        } finally {
            callDoneBtn.disabled = false;
        }
    });

    actions.append(waBtn, replyBtn, emailBtn, copyWa, resetBtn);
    if (!hidePublish) actions.prepend(publishBtn);

    const waLabel = document.createElement('p');
    waLabel.className = 'field-group-title';
    waLabel.style.marginTop = '12px';
    waLabel.textContent = waStepLabel(activeStep);

    const emailLabel = document.createElement('p');
    emailLabel.className = 'field-group-title';
    emailLabel.style.marginTop = '12px';
    emailLabel.textContent = 'Email HTML (o cliente recebe o layout YourLab)';

    const senderHost = document.createElement('div');
    renderProviderEditor(senderHost, {
        provider: config.provider || {},
        compact: true,
        toast: (msg, isErr) => ctx.showToast(msg, isErr),
        onUnauthorized: ctx.onUnauthorized,
        onSaved(next) {
            config.provider = { ...(config.provider || {}), ...next };
            paintMessages();
        }
    });

    host.append(title, hint, senderHost, controls, linkStatus, seqStatus, callBox, ganchoBox, offerBox, tabs,
        waLabel, waPreview, emailLabel, emailSubject, emailPreview, actions
    );
    paintMessages();
    if (host._callTick) clearInterval(host._callTick);
    host._callTick = setInterval(paintCall, 1000);

    async function hydrate() {
        const id = leadIdOf(ctx);
        if (!id || typeof config.api !== 'function') return;
        try {
            const { response, data } = await config.api(
                `/api/digitalizept/leads/${encodeURIComponent(id)}/outreach`
            );
            if (!response.ok || !data.followup) return;
            const lang = langTouched
                ? currentLang()
                : normalizeOutreachLang(data.followup.lang);
            const nextDia = localizeFollowupDia(
                ctx.state.data.followupDia || defaultFollowupDia(lang),
                lang
            );
            diaInput.value = nextDia;
            ctx.update({
                followup: { ...data.followup, lang },
                followupDia: nextDia
            });
            const next = nextSendableWaStep(data.followup);
            if (next) activeStep = next;
            else if (data.followup.waStep) activeStep = data.followup.waStep;
            paintMessages();
        } catch (_) { /* local templates still work */ }
    }
    hydrate();

    return { refresh: paintMessages };
}
