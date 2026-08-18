import { buildPrompt } from '../demo/prompt.js';
import { parseDemoOutput } from '../demo/parse.js';
import { renderLanding } from '../demo/landing.js';
import { mountGbpExample, gbpDataFromState } from '../demo/gbp-example.js';
import { ensureSeededDemo } from '../demo/seed.js';
import {
    buildHtmlChangePrompt,
    clipDemoHtml,
    currentDemoHtml,
    extractHtml,
    htmlTooLarge,
    looksLikeHtml,
    mountHtmlPreview,
    serializeLandingDocument
} from '../demo/html.js';
import {
    buildGbpSobrePrompt,
    plainAiText,
    renderOptionalAi
} from '../optional-ai.js';
import { includesWebsite } from '../deal/packages.js';
import { ensureProposta } from '../proposal-calc.js';
import { apiRequest } from '../api.js';
import { getToken } from '../auth.js';

function getBusinessType(state) {
    return state.data.businessType || null;
}

function isGbpDemo(state) {
    return !includesWebsite(ensureProposta(state));
}

function isValid(state) {
    if (isGbpDemo(state)) {
        const dados = state.data.dados || {};
        return Boolean(dados.nome_negocio);
    }
    if (state.data.demoHtml) return true;
    ensureSeededDemo(state);
    return Boolean(state.data.demo && state.data.demo.hero && state.data.demo.hero.titulo);
}

function copyText(ctx, text, okMessage) {
    return navigator.clipboard.writeText(text)
        .then(() => ctx.showToast(okMessage))
        .catch(() => ctx.showToast('Não foi possível copiar.', true));
}

async function publishDemo(ctx) {
    try {
        const demo = ctx.state.data.demo;
        const demoHtml = ctx.state.data.demoHtml || '';
        if ((!demo || !demo.hero || !demo.hero.titulo) && !demoHtml) return '';
        const { response, data } = await apiRequest('/api/digitalizept/demos', {
            method: 'POST',
            token: getToken(),
            body: {
                leadId: ctx.state.data.leadId || '',
                businessType: ctx.state.data.businessType,
                dados: ctx.state.data.dados,
                identidade: ctx.state.data.identidade,
                demo,
                demoHtml
            }
        });
        if (response.ok && data.url) {
            ctx.update({ leadId: data.leadId || ctx.state.data.leadId, demoUrl: data.url });
            return data.url;
        }
    } catch (_) { /* publishing is best-effort during the visit */ }
    return '';
}

function openPreview(state, ctx) {
    const overlay = document.createElement('div');
    overlay.className = 'dp-preview-overlay';

    const bar = document.createElement('div');
    bar.className = 'dp-preview-bar';
    const label = document.createElement('span');
    label.textContent = isGbpDemo(state)
        ? 'Pré-visualização do Perfil Google'
        : (state.data.demoHtml ? 'Pré-visualização HTML' : 'Pré-visualização da demonstração');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dp-preview-close';
    close.textContent = 'Fechar';
    close.addEventListener('click', () => overlay.remove());
    bar.append(label, close);

    const scroll = document.createElement('div');
    scroll.className = 'dp-preview-scroll';
    try {
        if (isGbpDemo(state)) {
            const wrap = document.createElement('div');
            wrap.style.padding = '16px';
            mountGbpExample(wrap, {
                data: gbpDataFromState(state),
                clientMode: true,
                showPitch: true
            });
            scroll.appendChild(wrap);
        } else if (state.data.demoHtml) {
            mountHtmlPreview(scroll, state.data.demoHtml);
        } else {
            scroll.appendChild(renderLanding(state));
        }
    } catch (_) {
        ctx.showToast('Não foi possível gerar a pré-visualização.', true);
        return;
    }

    overlay.append(bar, scroll);
    document.body.appendChild(overlay);
}

function applyHtml(ctx, raw, showStatus, afterApply) {
    if (htmlTooLarge(raw)) {
        ctx.showToast('HTML demasiado grande — a usar os primeiros 900 KB.', true);
    }
    const html = clipDemoHtml(extractHtml(raw));
    ctx.state.data.demoHtml = html;
    ctx.update({ demoHtml: html });
    ctx.setValid(true);
    showStatus('HTML aplicado. Pode mostrar ao cliente ou pedir alterações.', 'ok');
    if (typeof afterApply === 'function') afterApply();
    openPreview(ctx.state, ctx);
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
    publishDemo(ctx).then((url) => {
        if (url) showStatus(`Demonstração pronta. Link: ${url}`, 'ok');
    });
}

function renderGbpDemo(body, ctx) {
    const title = document.createElement('h3');
    title.className = 'field-group-title';
    title.textContent = 'O Perfil Google deste negócio';

    const hint = document.createElement('p');
    hint.className = 'id-disclaimer';
    hint.textContent = 'Mostre ao cliente como fica no Maps com os dados que acabámos de recolher.';

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
    previewBtn.addEventListener('click', () => openPreview(ctx.state, ctx));
    actions.appendChild(previewBtn);

    body.append(title, hint, host, actions);

    if (!ctx.state.data.gbpSobrePrompt) {
        ctx.state.data.gbpSobrePrompt = buildGbpSobrePrompt(ctx.state);
    }
    renderOptionalAi(body, {
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
    ctx.setValid(isValid(ctx.state));
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

    if (isGbpDemo(ctx.state)) {
        renderGbpDemo(body, ctx);
        return;
    }

    ensureSeededDemo(ctx.state);
    ctx.update({ demo: ctx.state.data.demo, demoSeeded: ctx.state.data.demoSeeded === true });

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
    previewHint.textContent = ctx.state.data.demoSeeded
        ? 'Landing deste tipo de negócio, com o nome e a cidade. Pode avançar já.'
        : 'Demonstração pronta. Pode ver, melhorar com AI, ou avançar.';

    const live = document.createElement('div');
    live.className = 'demo-live';
    live.setAttribute('aria-label', 'Pré-visualização');
    function paintLive() {
        live.innerHTML = '';
        try {
            if (ctx.state.data.demoHtml) {
                mountHtmlPreview(live, ctx.state.data.demoHtml);
            } else {
                live.appendChild(renderLanding(ctx.state));
            }
        } catch (_) { /* keep the rest of the step usable */ }
    }
    paintLive();

    const previewBtnWrap = document.createElement('div');
    previewBtnWrap.className = 'demo-actions';
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'btn-primary demo-preview-btn';
    previewBtn.textContent = 'Ver demonstração';
    previewBtn.disabled = !isValid(ctx.state);
    previewBtn.addEventListener('click', () => {
        openPreview(ctx.state, ctx);
        publishDemo(ctx);
    });
    previewBtnWrap.append(previewBtn);
    previewGroup.append(previewTitle, previewHint, live, previewBtnWrap, status);
    body.appendChild(previewGroup);

    const htmlBox = document.createElement('div');
    htmlBox.className = 'id-section';
    const htmlTitle = document.createElement('h3');
    htmlTitle.className = 'field-group-title';
    htmlTitle.textContent = 'Cole o HTML da demo';
    const htmlHint = document.createElement('p');
    htmlHint.className = 'id-disclaimer';
    htmlHint.textContent = 'Cole o documento completo. A pré-visualização abre em seguida.';
    const htmlPaste = document.createElement('textarea');
    htmlPaste.className = 'field-input demo-paste';
    htmlPaste.rows = 6;
    htmlPaste.placeholder = '<!DOCTYPE html>…';
    function usePastedHtml() {
        const raw = htmlPaste.value.trim();
        if (!raw) {
            ctx.showToast('Cole o HTML primeiro.', true);
            return;
        }
        if (!looksLikeHtml(raw)) {
            ctx.showToast('Isto não parece HTML. Cole o documento completo.', true);
            return;
        }
        applyHtml(ctx, raw, showStatus, () => {
            previewBtn.disabled = false;
            paintLive();
        });
    }
    htmlPaste.addEventListener('paste', () => {
        setTimeout(() => {
            if (looksLikeHtml(htmlPaste.value)) usePastedHtml();
        }, 0);
    });
    const htmlApply = document.createElement('button');
    htmlApply.type = 'button';
    htmlApply.className = 'btn-primary demo-html-apply';
    htmlApply.textContent = 'Aplicar HTML';
    htmlApply.addEventListener('click', usePastedHtml);
    htmlBox.append(htmlTitle, htmlHint, htmlPaste, htmlApply);
    body.appendChild(htmlBox);

    if (!ctx.state.data.demoPrompt) {
        ctx.state.data.demoPrompt = buildPrompt(ctx.state);
    }

    const aiHost = document.createElement('div');
    aiHost.className = 'id-section';
    renderOptionalAi(aiHost, {
        title: 'Melhorar com AI (opcional)',
        hint: 'Copie o prompt da landing (JSON) ou peça uma app mock em HTML. O modelo de base fica no ecrã até aplicar.',
        prompt: ctx.state.data.demoPrompt,
        placeholder: 'Cole o JSON da landing, ou HTML completo.',
        applyLabel: 'Aplicar resultado',
        ctx,
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
        const html = currentDemoHtml(ctx.state) || serializeLandingDocument(ctx.state);
        if (!html) {
            ctx.showToast('Ainda não há HTML para copiar.', true);
            return;
        }
        copyText(ctx, html, 'HTML copiado.');
    });
    const copyChangeBtn = document.createElement('button');
    copyChangeBtn.type = 'button';
    copyChangeBtn.className = 'btn-secondary';
    copyChangeBtn.textContent = 'Copiar prompt de alterações HTML';
    copyChangeBtn.addEventListener('click', () => {
        const html = currentDemoHtml(ctx.state);
        const prompt = buildHtmlChangePrompt(ctx.state, html, changeNote.value);
        ctx.state.data.htmlChangePrompt = prompt;
        ctx.update({ htmlChangePrompt: prompt, htmlChangeNote: changeNote.value });
        copyText(ctx, prompt, 'Prompt de alterações copiado.');
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

    ctx.setValid(isValid(ctx.state));
}

export const demoStep = {
    name: 'Demonstração',
    title: 'A demonstração',
    subtitle: 'Landing deste tipo de negócio — já pode mostrar. AI e HTML mock são opcionais.',
    isValid,
    render
};
