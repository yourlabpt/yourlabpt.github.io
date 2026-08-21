function copyText(ctx, text, okMessage) {
    return navigator.clipboard.writeText(text)
        .then(() => ctx.showToast(okMessage))
        .catch(() => ctx.showToast('Não foi possível copiar.', true));
}

export function renderOptionalAi(parent, {
    title = 'Melhorar com AI (opcional)',
    hint = 'O modelo de base já está no ecrã. Use só se quiser um texto à medida.',
    prompt = '',
    placeholder = 'Cole aqui o resultado…',
    applyLabel = 'Aplicar resultado',
    ctx,
    sanitizePrompt,
    onPromptChange,
    onApply
}) {
    const details = document.createElement('details');
    details.className = 'palette-custom optional-ai';
    const summary = document.createElement('summary');
    summary.textContent = title;
    details.appendChild(summary);

    if (hint) {
        const p = document.createElement('p');
        p.className = 'ask-hint';
        p.textContent = hint;
        details.appendChild(p);
    }

    const promptArea = document.createElement('textarea');
    promptArea.className = 'field-input demo-prompt';
    promptArea.rows = 5;
    promptArea.value = prompt || '';
    promptArea.addEventListener('input', () => {
        if (typeof onPromptChange === 'function') onPromptChange(promptArea.value);
    });

    const promptActions = document.createElement('div');
    promptActions.className = 'demo-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'btn-secondary';
    copyBtn.textContent = 'Copiar prompt';
    copyBtn.addEventListener('click', () => {
        let text = promptArea.value;
        if (typeof sanitizePrompt === 'function') {
            text = sanitizePrompt(text) || '';
            if (text !== promptArea.value) {
                promptArea.value = text;
                if (typeof onPromptChange === 'function') onPromptChange(text);
            }
        }
        copyText(ctx, text, 'Prompt copiado.');
    });
    promptActions.appendChild(copyBtn);

    const pasteArea = document.createElement('textarea');
    pasteArea.className = 'field-input demo-paste';
    pasteArea.rows = 3;
    pasteArea.placeholder = placeholder;
    pasteArea.addEventListener('paste', () => {
        setTimeout(() => {
            const raw = pasteArea.value.trim();
            if (!raw || typeof onApply !== 'function') return;
            const htmlish = /^\s*</.test(raw) && /<!DOCTYPE|<html[\s>]|<\/html>/i.test(raw);
            const jsonish = raw.startsWith('{') && raw.includes('"');
            if (htmlish || jsonish) onApply(raw, { promptArea, pasteArea, details, fromPaste: true });
        }, 0);
    });

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'btn-primary';
    applyBtn.textContent = applyLabel;
    applyBtn.addEventListener('click', () => {
        const raw = pasteArea.value.trim();
        if (!raw) {
            ctx.showToast('Cole o resultado primeiro.', true);
            return;
        }
        onApply(raw, { promptArea, pasteArea, details });
    });

    details.append(promptArea, promptActions, pasteArea, applyBtn);
    parent.appendChild(details);
    return { details, promptArea, pasteArea };
}

function unwrap(text) {
    return String(text || '')
        .replace(/^```(?:json|text)?\s*/i, '')
        .replace(/\s*```$/, '')
        .trim();
}

export function plainAiText(raw) {
    const text = unwrap(raw);
    if (text.startsWith('{')) {
        try {
            const parsed = JSON.parse(text);
            return String(parsed.texto || parsed.sobre || parsed.pitch || parsed.o_que_faz || '').trim() || text;
        } catch (_) { /* use raw */ }
    }
    return text.replace(/^["']|["']$/g, '').trim();
}

export function buildDadosCopyPrompt(state, fieldId) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};
    const labels = {
        o_que_faz: 'o que o negócio faz (2–3 frases)',
        principais_servicos: 'lista curta dos principais serviços',
        diferencial: 'o principal diferencial, uma frase'
    };
    return `Escreve em português de Portugal, tom ${businessType.tom || 'claro e próximo'}, para um ${businessType.nome || 'negócio local'}.
Nome: ${dados.nome_negocio || '—'}
Cidade: ${dados.cidade || '—'}
Serviços típicos do setor: ${(businessType.servicos_tipicos || []).join(', ')}
Diferenciais do setor: ${(businessType.diferenciais_sugeridos || []).join(', ')}

TAREFA: ${labels[fieldId] || fieldId}.
Não inventes prémios, anos ou moradas. Devolve só o texto, sem aspas e sem markdown.`;
}

export function buildDiagPitchPrompt(state) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};
    return `Uma frase para dizer na rua, em português de Portugal, a explicar o Perfil Google deste negócio.
Nome: ${dados.nome_negocio || '—'}
Tipo: ${businessType.nome || '—'}
Cidade: ${dados.cidade || '—'}
Devolve só a frase, sem markdown.`;
}

export function buildGbpSobrePrompt(state) {
    const businessType = state.data.businessType || {};
    const dados = state.data.dados || {};
    return `Escreve o texto "Sobre" do Perfil Google Business (máx 400 caracteres) em português de Portugal.
Nome: ${dados.nome_negocio || '—'}
Tipo: ${businessType.nome || '—'}
Cidade: ${dados.cidade || '—'}
O que faz: ${dados.o_que_faz || '—'}
Tom: ${businessType.tom || 'claro e próximo'}
Sem dizer demo ou template. Devolve só o texto.`;
}

export function buildPackagePitchPrompt(state) {
    const proposta = state.data.proposta || {};
    const dados = state.data.dados || {};
    return `Uma frase para o vendedor dizer o pacote escolhido (${proposta.pacote || '—'}) a ${dados.nome_negocio || 'este cliente'}.
Português de Portugal. Sem pressão agressiva. Devolve só a frase.`;
}
