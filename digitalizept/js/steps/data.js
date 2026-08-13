import { fetchSettings } from '../settings.js';

function getBusinessType(state) {
    return state.data.businessType || null;
}

function getDados(state) {
    if (!state.data.dados || typeof state.data.dados !== 'object') {
        state.data.dados = {};
    }
    return state.data.dados;
}

// Which required fields (standard + specific) still need a value.
function requiredFieldIds(businessType) {
    const standard = Array.isArray(businessType.campos_obrigatorios) ? businessType.campos_obrigatorios : [];
    const specific = Array.isArray(businessType.perguntas_especificas)
        ? businessType.perguntas_especificas.map((q) => q.id)
        : [];
    return [...standard, ...specific];
}

function isValid(state) {
    const businessType = getBusinessType(state);
    if (!businessType) return false;
    const dados = getDados(state);
    return requiredFieldIds(businessType).every((id) => String(dados[id] || '').trim().length > 0);
}

function speechAvailable() {
    return typeof window !== 'undefined'
        && (window.SpeechRecognition || window.webkitSpeechRecognition);
}

function attachDictation(inputEl, micBtn) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognizer = null;
    let listening = false;

    micBtn.addEventListener('click', () => {
        if (listening && recognizer) {
            recognizer.stop();
            return;
        }
        recognizer = new Recognition();
        recognizer.lang = 'pt-PT';
        recognizer.interimResults = false;
        recognizer.continuous = false;

        recognizer.onstart = () => { listening = true; micBtn.classList.add('listening'); };
        recognizer.onend = () => { listening = false; micBtn.classList.remove('listening'); };
        recognizer.onerror = () => { listening = false; micBtn.classList.remove('listening'); };
        recognizer.onresult = (event) => {
            const text = Array.from(event.results).map((r) => r[0].transcript).join(' ').trim();
            inputEl.value = inputEl.value ? `${inputEl.value} ${text}` : text;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        };
        recognizer.start();
    });
}

function buildField(def, id, value, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'field';

    const labelRow = document.createElement('span');
    labelRow.className = 'field-label';
    labelRow.textContent = def.label || id;
    wrap.appendChild(labelRow);

    const tipo = def.tipo || 'texto';

    if (tipo === 'sim_nao') {
        const toggle = document.createElement('div');
        toggle.className = 'toggle';
        ['Sim', 'Não'].forEach((opt) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `toggle-opt${value === opt ? ' active' : ''}`;
            btn.textContent = opt;
            btn.addEventListener('click', () => {
                toggle.querySelectorAll('.toggle-opt').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                onChange(opt);
            });
            toggle.appendChild(btn);
        });
        wrap.appendChild(toggle);
        return wrap;
    }

    const isLong = tipo === 'texto_longo';
    const input = document.createElement(isLong ? 'textarea' : 'input');
    input.className = 'field-input';
    input.value = value || '';
    if (def.placeholder) input.placeholder = def.placeholder;

    if (!isLong) {
        input.type = tipo === 'telefone' ? 'tel'
            : tipo === 'email' ? 'email'
            : tipo === 'url' ? 'url'
            : 'text';
    } else {
        input.rows = 3;
    }

    input.addEventListener('input', () => onChange(input.value));

    // Voice dictation on long-text fields, where typing on a phone hurts most.
    if (isLong && speechAvailable()) {
        const row = document.createElement('div');
        row.className = 'field-voice-row';
        const mic = document.createElement('button');
        mic.type = 'button';
        mic.className = 'mic-btn';
        mic.setAttribute('aria-label', 'Ditar por voz');
        mic.textContent = 'voz';
        attachDictation(input, mic);
        row.append(input, mic);
        wrap.appendChild(row);
        return wrap;
    }

    wrap.appendChild(input);
    return wrap;
}

function renderGroup(container, titleText) {
    const group = document.createElement('div');
    group.className = 'field-group';
    if (titleText) {
        const h = document.createElement('h3');
        h.className = 'field-group-title';
        h.textContent = titleText;
        group.appendChild(h);
    }
    container.appendChild(group);
    return group;
}

async function ensureStandardFields(ctx) {
    const settings = await fetchSettings(ctx);
    return settings ? settings.standardFields : null;
}

async function render(body, ctx) {
    const businessType = getBusinessType(ctx.state);
    if (!businessType) {
        const warn = document.createElement('div');
        warn.className = 'placeholder';
        warn.textContent = 'Escolha primeiro o tipo de negócio.';
        body.appendChild(warn);
        ctx.setValid(false);
        return;
    }

    const loading = document.createElement('div');
    loading.className = 'placeholder';
    loading.textContent = 'A preparar o formulário…';
    body.appendChild(loading);

    const standardFields = await ensureStandardFields(ctx);
    if (!standardFields) return;
    loading.remove();

    const dados = getDados(ctx.state);

    function onFieldChange(id, val) {
        dados[id] = val;
        ctx.update({ dados });
        ctx.setValid(isValid(ctx.state));
    }

    // Obrigatórios
    const reqGroup = renderGroup(body, 'Obrigatórios');
    (businessType.campos_obrigatorios || []).forEach((id) => {
        const def = standardFields[id] || { label: id, tipo: 'texto' };
        reqGroup.appendChild(buildField(def, id, dados[id], (v) => onFieldChange(id, v)));
    });

    // Perguntas específicas do setor
    const specific = Array.isArray(businessType.perguntas_especificas) ? businessType.perguntas_especificas : [];
    if (specific.length) {
        const specGroup = renderGroup(body, `Sobre o negócio · ${businessType.nome}`);
        specific.forEach((q) => {
            specGroup.appendChild(buildField(q, q.id, dados[q.id], (v) => onFieldChange(q.id, v)));
        });
    }

    // Opcionais (collapsible)
    const optIds = businessType.campos_opcionais || [];
    if (optIds.length) {
        const details = document.createElement('details');
        details.className = 'field-optional';
        const summary = document.createElement('summary');
        summary.textContent = 'Opcionais (recomendado preencher o que souber)';
        details.appendChild(summary);
        const optGroup = document.createElement('div');
        optGroup.className = 'field-group';
        optIds.forEach((id) => {
            const def = standardFields[id] || { label: id, tipo: 'texto' };
            optGroup.appendChild(buildField(def, id, dados[id], (v) => onFieldChange(id, v)));
        });
        details.appendChild(optGroup);
        body.appendChild(details);
    }

    ctx.setValid(isValid(ctx.state));
}

export const dataStep = {
    name: 'Dados do estabelecimento',
    title: 'Dados do estabelecimento',
    subtitle: 'Preencha o essencial. Não saia da visita sem o conteúdo — é o que garante o prazo.',
    isValid,
    render
};
