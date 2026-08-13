import { buildPrompt } from '../demo/prompt.js';
import { parseDemoOutput } from '../demo/parse.js';
import { renderLanding } from '../demo/landing.js';
import { mountGbpExample, gbpDataFromState } from '../demo/gbp-example.js';
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
    return Boolean(state.data.demo && state.data.demo.hero && state.data.demo.hero.titulo);
}

async function publishDemo(ctx) {
    try {
        const { response, data } = await apiRequest('/api/digitalizept/demos', {
            method: 'POST',
            token: getToken(),
            body: {
                leadId: ctx.state.data.leadId || '',
                businessType: ctx.state.data.businessType,
                dados: ctx.state.data.dados,
                identidade: ctx.state.data.identidade,
                demo: ctx.state.data.demo
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
        : 'Pré-visualização da demonstração';
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

function renderGbpDemo(body, ctx) {
    const title = document.createElement('h3');
    title.className = 'field-group-title';
    title.textContent = 'O Perfil Google deste negócio';

    const hint = document.createElement('p');
    hint.className = 'id-disclaimer';
    hint.textContent = 'Mostre ao cliente como fica no Maps com os dados que acabámos de recolher.';

    const host = document.createElement('div');
    mountGbpExample(host, {
        data: gbpDataFromState(ctx.state),
        clientMode: true,
        showPitch: true
    });

    const actions = document.createElement('div');
    actions.className = 'demo-actions';
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'btn-primary';
    previewBtn.textContent = 'Ver em ecrã cheio';
    previewBtn.addEventListener('click', () => openPreview(ctx.state, ctx));
    actions.appendChild(previewBtn);

    body.append(title, hint, host, actions);
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

    // 1 · Prompt (editable, regenerable)
    if (!ctx.state.data.demoPrompt) {
        ctx.state.data.demoPrompt = buildPrompt(ctx.state);
    }

    const promptGroup = document.createElement('div');
    promptGroup.className = 'id-section';
    const promptTitle = document.createElement('h3');
    promptTitle.className = 'field-group-title';
    promptTitle.textContent = '1 · Copie o prompt';
    const promptHint = document.createElement('p');
    promptHint.className = 'id-disclaimer';
    promptHint.textContent = 'Gere aqui, ou cole no seu assistente se o modelo local não estiver disponível.';

    const promptArea = document.createElement('textarea');
    promptArea.className = 'field-input demo-prompt';
    promptArea.rows = 7;
    promptArea.value = ctx.state.data.demoPrompt;
    promptArea.addEventListener('input', () => {
        ctx.state.data.demoPrompt = promptArea.value;
        ctx.update({ demoPrompt: promptArea.value });
    });

    const promptActions = document.createElement('div');
    promptActions.className = 'demo-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-primary';
    copyBtn.textContent = 'Copiar prompt';
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(promptArea.value)
            .then(() => ctx.showToast('Prompt copiado.'))
            .catch(() => ctx.showToast('Não foi possível copiar.', true));
    });
    const regenBtn = document.createElement('button');
    regenBtn.type = 'button';
    regenBtn.className = 'btn-secondary';
    regenBtn.textContent = 'Repor prompt';
    regenBtn.addEventListener('click', () => {
        const fresh = buildPrompt(ctx.state);
        promptArea.value = fresh;
        ctx.state.data.demoPrompt = fresh;
        ctx.update({ demoPrompt: fresh });
        ctx.showToast('Prompt reposto a partir dos dados.');
    });
    const genNowBtn = document.createElement('button');
    genNowBtn.type = 'button';
    genNowBtn.className = 'btn-primary';
    genNowBtn.textContent = 'Gerar agora';
    genNowBtn.addEventListener('click', async () => {
        genNowBtn.disabled = true;
        showStatus('A gerar o conteúdo…', 'ok');
        try {
            const { response, data } = await apiRequest('/api/digitalizept/demo', {
                method: 'POST',
                token: getToken(),
                body: { prompt: promptArea.value }
            });
            if (response.status === 401) { ctx.onUnauthorized(); return; }
            if (!response.ok || !data.demo) {
                showStatus(data.error || 'Modelo indisponível. Cole o JSON abaixo.', 'error');
                return;
            }
            ctx.state.data.demoRaw = data.raw || JSON.stringify(data.demo, null, 2);
            ctx.state.data.demo = data.demo;
            pasteArea.value = ctx.state.data.demoRaw;
            ctx.update({ demoRaw: ctx.state.data.demoRaw, demo: data.demo });
            ctx.setValid(true);
            previewBtn.disabled = false;
            showStatus(`Demonstração pronta — ${data.demo.servicos.itens.length} serviços.`, 'ok');
            await publishDemo(ctx);
        } catch (_) {
            showStatus('Sem rede. Use o fluxo manual abaixo.', 'error');
        } finally {
            genNowBtn.disabled = false;
        }
    });
    promptActions.append(copyBtn, regenBtn, genNowBtn);
    promptGroup.append(promptTitle, promptHint, promptArea, promptActions);
    body.appendChild(promptGroup);

    // 2 · Paste result
    const pasteGroup = document.createElement('div');
    pasteGroup.className = 'id-section';
    const pasteTitle = document.createElement('h3');
    pasteTitle.className = 'field-group-title';
    pasteTitle.textContent = '2 · Cole o resultado';
    const pasteArea = document.createElement('textarea');
    pasteArea.className = 'field-input demo-paste';
    pasteArea.rows = 6;
    pasteArea.placeholder = 'Cole aqui o JSON gerado pelo assistente…';
    if (ctx.state.data.demoRaw) pasteArea.value = ctx.state.data.demoRaw;

    const status = document.createElement('div');
    status.className = 'demo-status';

    function showStatus(message, kind) {
        status.textContent = message;
        status.className = `demo-status demo-status-${kind}`;
    }

    const previewBtnWrap = document.createElement('div');
    previewBtnWrap.className = 'demo-actions';
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'btn-primary demo-preview-btn';
    previewBtn.textContent = 'Ver demonstração';
    previewBtn.disabled = !isValid(ctx.state);
    previewBtn.addEventListener('click', () => openPreview(ctx.state, ctx));
    previewBtnWrap.appendChild(previewBtn);

    const genBtn = document.createElement('button');
    genBtn.type = 'button';
    genBtn.className = 'btn-primary';
    genBtn.textContent = 'Gerar demonstração';
    genBtn.addEventListener('click', () => {
        const raw = pasteArea.value;
        const result = parseDemoOutput(raw);
        if (!result.ok) {
            showStatus(result.error, 'error');
            return;
        }
        ctx.state.data.demoRaw = raw;
        ctx.state.data.demo = result.demo;
        ctx.update({ demoRaw: raw, demo: result.demo });
        ctx.setValid(true);
        showStatus(`Demonstração pronta — ${result.demo.servicos.itens.length} serviços.`, 'ok');
        previewBtn.disabled = false;
        publishDemo(ctx).then((url) => {
            if (url) showStatus(`Demonstração pronta. Link: ${url}`, 'ok');
        });
    });

    const pasteActions = document.createElement('div');
    pasteActions.className = 'demo-actions';
    pasteActions.appendChild(genBtn);

    pasteGroup.append(pasteTitle, pasteArea, pasteActions, status);
    body.appendChild(pasteGroup);

    // 3 · Preview (enabled once generated)
    const previewGroup = document.createElement('div');
    previewGroup.className = 'id-section';
    const previewTitle = document.createElement('h3');
    previewTitle.className = 'field-group-title';
    previewTitle.textContent = '3 · Mostre ao cliente';
    previewGroup.append(previewTitle, previewBtnWrap);
    body.appendChild(previewGroup);

    if (isValid(ctx.state)) {
        showStatus('Demonstração já gerada. Pode ver, ou gerar de novo.', 'ok');
    }

    ctx.setValid(isValid(ctx.state));
}

export const demoStep = {
    name: 'Demonstração',
    title: 'Gerar a demonstração',
    subtitle: 'Perfil Google (pacotes sem site) ou landing por arquétipo.',
    isValid,
    render
};
