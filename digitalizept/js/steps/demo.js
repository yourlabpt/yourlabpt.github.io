import { buildPrompt } from '../demo/prompt.js';
import { parseDemoOutput } from '../demo/parse.js';
import { renderLanding } from '../demo/landing.js';

function getBusinessType(state) {
    return state.data.businessType || null;
}

function isValid(state) {
    return Boolean(state.data.demo && state.data.demo.hero && state.data.demo.hero.titulo);
}

function openPreview(state, ctx) {
    const overlay = document.createElement('div');
    overlay.className = 'dp-preview-overlay';

    const bar = document.createElement('div');
    bar.className = 'dp-preview-bar';
    const label = document.createElement('span');
    label.textContent = 'Pré-visualização da demonstração';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'dp-preview-close';
    close.textContent = '✕ Fechar';
    close.addEventListener('click', () => overlay.remove());
    bar.append(label, close);

    const scroll = document.createElement('div');
    scroll.className = 'dp-preview-scroll';
    try {
        scroll.appendChild(renderLanding(state));
    } catch (_) {
        ctx.showToast('Não foi possível gerar a pré-visualização.', true);
        return;
    }

    overlay.append(bar, scroll);
    document.body.appendChild(overlay);
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
    promptHint.textContent = 'Cole no seu assistente (ChatGPT, Claude, etc.), gere o conteúdo e traga o resultado de volta. Pode ajustar o prompt antes de copiar.';

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
    promptActions.append(copyBtn, regenBtn);
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
    subtitle: 'Prompt → conteúdo → demonstração. É o que mostra ao cliente o site dele a funcionar.',
    isValid,
    render
};
