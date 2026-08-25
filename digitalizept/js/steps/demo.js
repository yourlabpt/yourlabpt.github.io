import { apiRequest } from '../api.js';
import { getToken } from '../auth.js';
import { buildPrompt } from '../demo/prompt.js';
import { parseDemoOutput } from '../demo/parse.js';
import { renderLanding } from '../demo/landing.js';
import { mountGbpExample, gbpDataFromState } from '../demo/gbp-example.js';
import { ensureSeededDemo } from '../demo/seed.js';
import {
    buildHtmlChangePrompt,
    clipDemoHtml,
    compactHtmlForAi,
    extractHtml,
    htmlForAi,
    htmlTooLarge,
    identityFingerprint,
    looksLikeHtml,
    mountHtmlPreview,
    scrubDemoState,
    assertPromptFitsChat,
    clipboardSizeLabel
} from '../demo/html.js';
import { createWebsiteZipButton } from '../demo/site-zip.js';
import {
    applyVisualToState,
    clearBoilerplateCache,
    htmlForVisual,
    mountDemoSwitch,
    prefetchBoilerplate,
    publishedCustomHtml,
    rememberVisual,
    resolveDemoVisual,
    typeSlug,
    VISUAL_CUSTOM,
    VISUAL_SEM_FOTOS
} from '../demo/demo-visual.js';
import {
    buildGbpSobrePrompt,
    plainAiText,
    renderOptionalAi
} from '../optional-ai.js';
import { includesWebsite } from '../deal/packages.js';
import { ensureProposta } from '../proposal-calc.js';
import { bindLeadToNome } from '../demo/business-identity.js';
import { currentSubstep, renderAsk } from '../substep.js';
import { scheduleSaveDraftLead } from '../draft.js';

function getBusinessType(state) {
    return state.data.businessType || null;
}

function isGbpDemo(state) {
    return !includesWebsite(ensureProposta(state));
}

function isGbpSubstepValid(state) {
    const dados = state.data.dados || {};
    return Boolean(dados.nome_negocio);
}

function isWebsiteSubstepValid(state) {
    if (state.data.demoHtml) return true;
    if (state.data.demoVisual === VISUAL_SEM_FOTOS) return true;
    if (publishedCustomHtml(state)) return true;
    ensureSeededDemo(state);
    return Boolean(state.data.demo && state.data.demo.hero && state.data.demo.hero.titulo);
}

function isSubstepValid(state) {
    const idx = currentSubstep(state);
    return idx === 0 ? isGbpSubstepValid(state) : isWebsiteSubstepValid(state);
}

function isValid(state) {
    return isGbpSubstepValid(state) && isWebsiteSubstepValid(state);
}

function substepCount() {
    return 2;
}

function copyText(ctx, text, okMessage) {
    return navigator.clipboard.writeText(text)
        .then(() => ctx.showToast(okMessage))
        .catch(() => ctx.showToast('Não foi possível copiar.', true));
}

async function publishDemo(ctx) {
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

function paintWebsitePreview(host, state) {
    host.innerHTML = '';
    if (state.data.demoHtml) {
        mountHtmlPreview(host, state.data.demoHtml, {
            identidade: state.data.identidade,
            dados: state.data.dados
        });
        return;
    }
    host.appendChild(renderLanding(state));
}

async function switchDemoVisual(ctx, visual, { persist = true, onPaint } = {}) {
    const html = await htmlForVisual(ctx.state, visual);
    applyVisualToState(ctx.state, visual, html);
    if (persist) rememberVisual(ctx.state, visual);
    ctx.update({
        demoVisual: persist ? visual : (ctx.state.data.demoVisual || ''),
        demoHtml: ctx.state.data.demoHtml || '',
        demoHtmlSource: ctx.state.data.demoHtmlSource || '',
        demoHtmlCustom: ctx.state.data.demoHtmlCustom || ''
    });
    if (typeof onPaint === 'function') onPaint();
    if (persist) {
        scheduleSaveDraftLead(ctx.state, ctx);
        publishDemo(ctx);
    }
    prefetchBoilerplate(typeSlug(ctx.state));
}

function openPreview(state, ctx, { mode } = {}) {
    const showGbp = mode === 'gbp' || (mode !== 'website' && isGbpDemo(state));
    const overlay = document.createElement('div');
    overlay.className = 'dp-preview-overlay';

    const bar = document.createElement('div');
    bar.className = 'dp-preview-bar';
    const label = document.createElement('span');
    label.textContent = showGbp
        ? 'Pré-visualização do Perfil Google'
        : (state.data.demoHtml ? 'Pré-visualização HTML' : 'Pré-visualização da demonstração');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dp-preview-close';
    close.textContent = 'Fechar';
    const previousOverflow = document.body.style.overflow;
    const closeOverlay = () => {
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        document.removeEventListener('keydown', onKey);
        overlay.classList.remove('dpl-has-switch');
    };
    const onKey = (event) => {
        if (event.key === 'Escape') closeOverlay();
    };
    close.addEventListener('click', closeOverlay);
    bar.append(label, close);

    const scroll = document.createElement('div');
    scroll.className = 'dp-preview-scroll';
    try {
        if (showGbp) {
            const wrap = document.createElement('div');
            wrap.style.padding = '16px';
            mountGbpExample(wrap, {
                data: gbpDataFromState(state),
                clientMode: true,
                showPitch: true
            });
            scroll.appendChild(wrap);
        } else {
            paintWebsitePreview(scroll, state);
        }
    } catch (_) {
        ctx.showToast('Não foi possível gerar a pré-visualização.', true);
        return;
    }

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    overlay.append(bar, scroll);
    document.body.appendChild(overlay);
    scroll.scrollTop = 0;
    if (!showGbp) {
        const visual = resolveDemoVisual(state);
        const onSwitch = (next) => {
            switchDemoVisual(ctx, next, {
                persist: true,
                onPaint: () => {
                    paintWebsitePreview(scroll, ctx.state);
                    mountDemoSwitch(overlay, {
                        visual: next,
                        state: ctx.state,
                        onChange: onSwitch
                    });
                }
            }).catch(() => ctx.showToast('Não foi possível mudar a versão.', true));
        };
        mountDemoSwitch(overlay, {
            visual,
            state,
            onChange: onSwitch
        });
    }
}

function refreshDemoFromIdentity(ctx, { force = false } = {}) {
    const identidade = ctx.state.data.identidade || {};
    const stamp = identityFingerprint(identidade);
    const stampChanged = ctx.state.data.demoIdentityStamp !== stamp;
    if (stampChanged || force) {
        ctx.update({ demoIdentityStamp: stamp });
        return true;
    }
    return false;
}

function applyHtml(ctx, raw, showStatus, afterApply) {
    const identidade = ctx.state.data.identidade || {};
    const html = clipDemoHtml(compactHtmlForAi(extractHtml(raw), identidade));
    if (htmlTooLarge(html)) {
        ctx.showToast('HTML demasiado grande — a usar os primeiros 900 KB.', true);
    }
    ctx.state.data.demoHtml = html;
    ctx.state.data.demoHtmlSource = 'ai';
    ctx.state.data.demoHtmlCustom = html;
    ctx.state.data.demoVisual = VISUAL_CUSTOM;
    ctx.state.data.demoSeeded = false;
    ctx.update({
        demoHtml: html,
        demoHtmlSource: 'ai',
        demoHtmlCustom: html,
        demoVisual: VISUAL_CUSTOM,
        demoIdentityStamp: identityFingerprint(identidade),
        demoSeeded: false
    });
    ctx.setValid(true);
    showStatus('HTML aplicado. Pode mostrar ao cliente ou pedir alterações.', 'ok');
    if (typeof afterApply === 'function') afterApply();
    scheduleSaveDraftLead(ctx.state, ctx);
    openPreview(ctx.state, ctx, { mode: 'website' });
    publishDemo(ctx).then((url) => {
        if (url) showStatus(`HTML publicado. Link: ${url}`, 'ok');
    });
}

function applyJsonDemo(ctx, demo, raw, showStatus) {
    delete ctx.state.data.demoHtml;
    ctx.state.data.demoSeeded = false;
    ctx.state.data.demo = demo;
    ctx.state.data.demoRaw = raw || JSON.stringify(demo, null, 2);
    ctx.update({ demo, demoRaw: ctx.state.data.demoRaw, demoHtml: '', demoSeeded: false });
    ctx.setValid(true);
    showStatus(`Demonstração actualizada — ${demo.servicos.itens.length} serviços.`, 'ok');
    scheduleSaveDraftLead(ctx.state, ctx);
    publishDemo(ctx).then((url) => {
        if (url) showStatus(`Demonstração pronta. Link: ${url}`, 'ok');
    });
}

function renderGbpDemo(container, ctx) {
    const title = document.createElement('h3');
    title.className = 'field-group-title';
    title.textContent = 'Cartão no Google Maps';

    const hint = document.createElement('p');
    hint.className = 'id-disclaimer';
    hint.textContent = 'Com os dados deste negócio — ainda sem falar de preços.';

    const host = document.createElement('div');
    function paintCard() {
        host.innerHTML = '';
        mountGbpExample(host, {
            data: gbpDataFromState(ctx.state),
            clientMode: true,
            showPitch: true
        });
    }
    paintCard();

    const actions = document.createElement('div');
    actions.className = 'demo-actions';
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'btn-primary';
    previewBtn.textContent = 'Ver em ecrã cheio';
    previewBtn.addEventListener('click', () => openPreview(ctx.state, ctx, { mode: 'gbp' }));
    actions.appendChild(previewBtn);

    container.append(title, hint, host, actions);

    if (!ctx.state.data.gbpSobrePrompt) {
        ctx.state.data.gbpSobrePrompt = buildGbpSobrePrompt(ctx.state);
    }
    renderOptionalAi(container, {
        title: 'Melhorar o “Sobre” com AI (opcional)',
        hint: 'O cartão já usa o nome e a morada. Peça um texto melhor se fizer falta.',
        prompt: ctx.state.data.gbpSobrePrompt,
        placeholder: 'Cole o texto Sobre…',
        ctx,
        onPromptChange: (value) => {
            ctx.state.data.gbpSobrePrompt = value;
            ctx.update({ gbpSobrePrompt: value });
        },
        onApply: (raw) => {
            const texto = plainAiText(raw);
            ctx.state.data.gbpSobre = texto;
            ctx.update({ gbpSobre: texto });
            paintCard();
            ctx.showToast('Texto Sobre aplicado.');
        }
    });

    ctx.state.data.demoGbp = true;
    ctx.update({ demoGbp: true });
    ctx.setValid(isSubstepValid(ctx.state));
}

function renderWebsiteDemo(body, ctx) {
    ensureSeededDemo(ctx.state);
    ctx.update({ demo: ctx.state.data.demo, demoSeeded: ctx.state.data.demoSeeded === true });
    prefetchBoilerplate(typeSlug(ctx.state));

    const beforeHtml = ctx.state.data.demoHtml || '';
    const beforePrompt = ctx.state.data.demoPrompt || '';
    scrubDemoState(ctx.state);
    if (!ctx.state.data.demoPrompt) ctx.state.data.demoPrompt = buildPrompt(ctx.state);
    if ((ctx.state.data.demoHtml || '') !== beforeHtml || (ctx.state.data.demoPrompt || '') !== beforePrompt) {
        ctx.update({
            demoHtml: ctx.state.data.demoHtml || '',
            demoPrompt: ctx.state.data.demoPrompt
        });
        if ((ctx.state.data.demoHtml || '') !== beforeHtml) publishDemo(ctx);
    }

    const status = document.createElement('div');
    status.className = 'demo-status';
    function showStatus(message, kind) {
        status.textContent = message;
        status.className = `demo-status demo-status-${kind}`;
    }

    const previewGroup = document.createElement('div');
    previewGroup.className = 'id-section';
    const previewTitle = document.createElement('h3');
    previewTitle.className = 'field-group-title';
    previewTitle.textContent = 'Mostre ao cliente';
    const previewHint = document.createElement('p');
    previewHint.className = 'id-disclaimer';
    previewHint.textContent = 'Se mudou cores, logo ou fotos no passo anterior, a demo actualiza ao voltar aqui — ou toque em Atualizar demo.';

    const identityChanged = refreshDemoFromIdentity(ctx);

    const stack = document.createElement('div');
    stack.className = 'demo-live-stack';
    let previewBtn;
    const live = document.createElement('div');
    live.className = 'demo-live';
    live.setAttribute('role', 'button');
    live.setAttribute('tabindex', '0');
    live.setAttribute('aria-label', 'Pré-visualização — toque para ecrã cheio');
    function paintLive() {
        live.innerHTML = '';
        try {
            paintWebsitePreview(live, ctx.state);
        } catch (_) { /* keep the rest of the step usable */ }
        const visual = resolveDemoVisual(ctx.state);
        mountDemoSwitch(stack, {
            visual,
            state: ctx.state,
            onChange: (next) => {
                switchDemoVisual(ctx, next, {
                    persist: true,
                    onPaint: () => {
                        paintLive();
                        if (previewBtn) previewBtn.disabled = !isValid(ctx.state);
                    }
                }).catch(() => ctx.showToast('Não foi possível mudar a versão.', true));
            }
        });
    }
    function openLive() {
        if (!isValid(ctx.state)) return;
        openPreview(ctx.state, ctx, { mode: 'website' });
    }
    live.addEventListener('click', openLive);
    live.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openLive();
        }
    });
    stack.appendChild(live);
    const initialVisual = resolveDemoVisual(ctx.state);
    switchDemoVisual(ctx, initialVisual, {
        persist: false,
        onPaint: paintLive
    }).catch(() => paintLive());

    const previewBtnWrap = document.createElement('div');
    previewBtnWrap.className = 'demo-actions';
    previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'btn-primary demo-preview-btn';
    previewBtn.textContent = 'Ver demonstração';
    previewBtn.disabled = !isValid(ctx.state);
    previewBtn.addEventListener('click', () => {
        openPreview(ctx.state, ctx, { mode: 'website' });
        publishDemo(ctx);
    });
    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'btn-secondary';
    refreshBtn.textContent = 'Atualizar demo';
    refreshBtn.addEventListener('click', () => {
        refreshDemoFromIdentity(ctx, { force: true });
        // Refetch the template too, so a regenerated boilerplate reaches this session.
        clearBoilerplateCache();
        refreshBtn.disabled = true;
        showStatus('A actualizar a demo…', 'ok');
        switchDemoVisual(ctx, resolveDemoVisual(ctx.state), {
            persist: false,
            onPaint: paintLive
        }).catch(() => paintLive()).finally(() => {
            refreshBtn.disabled = false;
            previewBtn.disabled = !isValid(ctx.state);
            publishDemo(ctx);
            ctx.showToast('Demo actualizada com cores, logo e fotos.');
            showStatus('Demo actualizada com a identidade actual.', 'ok');
        });
    });
    const zipBtn = createWebsiteZipButton(ctx, {
        className: 'btn-secondary',
        label: 'Descarregar website (ZIP)'
    });
    zipBtn.title = 'Código e servidor para continuar o site real no computador. Não fica guardado na app.';
    previewBtnWrap.append(previewBtn, refreshBtn, zipBtn);
    const zipHint = document.createElement('p');
    zipHint.className = 'id-disclaimer';
    zipHint.textContent = 'Se o cliente quiser o site a sério: descarregue o ZIP. HTML, fotos, CSS e servidor local — nada fica guardado na app.';
    previewGroup.append(previewTitle, previewHint, stack, previewBtnWrap, zipHint, status);
    body.appendChild(previewGroup);

    // Sending lives in the lead's control panel, in the admin, and nowhere else.
    // This page only builds and publishes the demo.
    const controloHint = document.createElement('p');
    controloHint.className = 'id-disclaimer';
    controloHint.textContent = 'Email, WhatsApp e ligações fazem-se no controlo da lead, no admin. Aqui só se constrói e publica a demo.';
    body.appendChild(controloHint);

    if (identityChanged) {
        showStatus('Demo actualizada com as cores, logo e fotos do passo anterior.', 'ok');
        publishDemo(ctx);
    }

    if (!ctx.state.data.demoPrompt) {
        ctx.state.data.demoPrompt = buildPrompt(ctx.state);
    }

    const aiHost = document.createElement('div');
    aiHost.className = 'id-section';
    renderOptionalAi(aiHost, {
        title: 'HTML e AI',
        hint: 'Um sítio só. Copie o prompt, cole no Claude na caixa de mensagem (não como ficheiro) e depois cole o HTML ou JSON abaixo.',
        prompt: ctx.state.data.demoPrompt,
        placeholder: 'Cole aqui o HTML completo ou o JSON…',
        applyLabel: 'Aplicar',
        open: true,
        pasteRows: 8,
        ctx,
        sanitizePrompt: (value) => compactHtmlForAi(value, ctx.state.data.identidade),
        onPromptChange: (value) => {
            ctx.state.data.demoPrompt = value;
            ctx.update({ demoPrompt: value });
        },
        onApply: (raw) => {
            if (looksLikeHtml(raw)) {
                applyHtml(ctx, raw, showStatus, () => {
                    previewBtn.disabled = false;
                    paintLive();
                });
                return;
            }
            const result = parseDemoOutput(raw);
            if (!result.ok) {
                showStatus(result.error, 'error');
                return;
            }
            applyJsonDemo(ctx, result.demo, raw, showStatus);
            previewBtn.disabled = false;
            paintLive();
        }
    });

    const extraActions = document.createElement('div');
    extraActions.className = 'demo-actions';
    const genNowBtn = document.createElement('button');
    genNowBtn.type = 'button';
    genNowBtn.className = 'btn-secondary';
    genNowBtn.textContent = 'Gerar JSON agora';
    genNowBtn.addEventListener('click', async () => {
        genNowBtn.disabled = true;
        showStatus('A gerar o conteúdo…', 'ok');
        try {
            const { response, data } = await apiRequest('/api/digitalizept/demo', {
                method: 'POST',
                token: getToken(),
                body: { prompt: ctx.state.data.demoPrompt }
            });
            if (response.status === 401) { ctx.onUnauthorized(); return; }
            if (!response.ok || !data.demo) {
                showStatus(data.error || 'Modelo indisponível. Cole o JSON abaixo.', 'error');
                return;
            }
            applyJsonDemo(ctx, data.demo, data.raw || JSON.stringify(data.demo, null, 2), showStatus);
            previewBtn.disabled = false;
            paintLive();
        } catch (_) {
            showStatus('Sem rede. Cole o resultado no bloco acima.', 'error');
        } finally {
            genNowBtn.disabled = false;
        }
    });

    const changeNote = document.createElement('textarea');
    changeNote.className = 'field-input demo-paste';
    changeNote.rows = 2;
    changeNote.placeholder = 'O que mudar no HTML? Ex.: ecrã de login falso, lista de marcações…';
    changeNote.value = ctx.state.data.htmlChangeNote || '';
    changeNote.addEventListener('input', () => {
        ctx.state.data.htmlChangeNote = changeNote.value;
        ctx.update({ htmlChangeNote: changeNote.value });
    });

    const htmlActions = document.createElement('div');
    htmlActions.className = 'demo-actions';
    const copyHtmlBtn = document.createElement('button');
    copyHtmlBtn.type = 'button';
    copyHtmlBtn.className = 'btn-secondary';
    copyHtmlBtn.textContent = 'Copiar HTML';
    copyHtmlBtn.addEventListener('click', () => {
        const html = htmlForAi(ctx.state);
        if (!html) {
            ctx.showToast('Ainda não há HTML para copiar.', true);
            return;
        }
        const check = assertPromptFitsChat(html);
        if (!check.ok) {
            ctx.showToast(check.error, true);
            return;
        }
        copyText(ctx, html, `HTML copiado (${clipboardSizeLabel(html)}). Cole na mensagem, não como ficheiro.`);
    });
    const copyChangeBtn = document.createElement('button');
    copyChangeBtn.type = 'button';
    copyChangeBtn.className = 'btn-secondary';
    copyChangeBtn.textContent = 'Copiar prompt de alterações HTML';
    copyChangeBtn.addEventListener('click', () => {
        const prompt = buildHtmlChangePrompt(ctx.state, htmlForAi(ctx.state), changeNote.value);
        const check = assertPromptFitsChat(prompt);
        if (!check.ok) {
            ctx.showToast(check.error, true);
            return;
        }
        copyText(ctx, prompt, `Prompt copiado (${clipboardSizeLabel(prompt)}). Cole na mensagem, não como ficheiro.`);
    });
    htmlActions.append(copyHtmlBtn, copyChangeBtn);
    extraActions.appendChild(genNowBtn);

    const details = aiHost.querySelector('details');
    if (details) details.append(extraActions, changeNote, htmlActions);
    body.appendChild(aiHost);

    if (isValid(ctx.state)) {
        showStatus(ctx.state.data.demoHtml
            ? 'HTML da demo pronto. Pode ver ou pedir alterações.'
            : (ctx.state.data.demoSeeded
                ? 'Landing do tipo pronta. Melhorar com AI é opcional.'
                : 'Demonstração pronta.'), 'ok');
    }

    ctx.setValid(isSubstepValid(ctx.state));
}

function render(body, ctx) {
    const businessType = getBusinessType(ctx.state);
    if (!businessType) {
        const warn = document.createElement('div');
        warn.className = 'placeholder';
        warn.textContent = 'Complete primeiro os passos anteriores.';
        body.appendChild(warn);
        ctx.setValid(false);
        return;
    }

    const idx = currentSubstep(ctx.state);
    const total = substepCount();

    if (idx === 0) {
        const { control } = renderAsk(body, {
            title: 'Perfil Google',
            hint: '1.º exemplo — como aparece no Maps. Ainda sem preços.',
            index: idx,
            total
        });
        renderGbpDemo(control, ctx);
        return;
    }

    const { control } = renderAsk(body, {
        title: 'Site de exemplo',
        hint: '2.º exemplo — como poderia ser uma página web. Depois vem a escolha de pacotes.',
        index: idx,
        total
    });
    renderWebsiteDemo(control, ctx);
}

export const demoStep = {
    name: 'Demonstração',
    title: 'Mostrar as opções',
    subtitle: 'Google Maps e site de exemplo — antes de falar de preços.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
