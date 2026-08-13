import { fetchSettings } from '../settings.js';
import { PUBLIC_REQUIRED, PUBLIC_EXTRA, isDataStepValid } from './data-valid.js';

function getBusinessType(state) {
    return state.data.businessType || null;
}

function getDados(state) {
    if (!state.data.dados || typeof state.data.dados !== 'object') {
        state.data.dados = {};
    }
    return state.data.dados;
}

function isValid(state) {
    return isDataStepValid(state);
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

function buildField(def, id, value, onChange, required) {
    const wrap = document.createElement('label');
    wrap.className = 'field';

    const labelRow = document.createElement('span');
    labelRow.className = 'field-label';
    labelRow.textContent = def.label || id;
    if (required) {
        const mark = document.createElement('span');
        mark.className = 'field-req';
        mark.textContent = ' obrigatório';
        labelRow.appendChild(mark);
    }
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
    const used = new Set();

    function take(ids) {
        return (ids || []).filter((id) => {
            if (!id || used.has(id)) return false;
            used.add(id);
            return true;
        });
    }

    function onFieldChange(id, val) {
        dados[id] = val;
        ctx.update({ dados });
        ctx.setValid(isValid(ctx.state));
    }

    function appendFields(group, ids, required) {
        ids.forEach((id) => {
            const def = standardFields[id] || { label: id, tipo: 'texto' };
            group.appendChild(buildField(def, id, dados[id], (v) => onFieldChange(id, v), required));
        });
    }

    // Same fields as before, public shopfront first so Continuar unlocks without
    // the owner's name or a written pitch.
    const publicIds = take([...PUBLIC_REQUIRED, ...PUBLIC_EXTRA]);
    const laterFromRequired = take(businessType.campos_obrigatorios || []);
    const specific = Array.isArray(businessType.perguntas_especificas) ? businessType.perguntas_especificas : [];
    const restOptional = take(businessType.campos_opcionais || []);

    const mainGroup = renderGroup(body, 'Estabelecimento');
    mainGroup.classList.add('field-grid');
    publicIds.forEach((id) => {
        const def = standardFields[id] || { label: id, tipo: 'texto' };
        mainGroup.appendChild(buildField(def, id, dados[id], (v) => onFieldChange(id, v), PUBLIC_REQUIRED.includes(id)));
    });
    appendFields(mainGroup, laterFromRequired, false);

    if (specific.length) {
        const specGroup = renderGroup(body, `Sobre o negócio · ${businessType.nome}`);
        specGroup.classList.add('field-grid');
        specific.forEach((q) => {
            specGroup.appendChild(buildField(q, q.id, dados[q.id], (v) => onFieldChange(q.id, v), false));
        });
    }

    if (restOptional.length) {
        const details = document.createElement('details');
        details.className = 'field-optional';
        const summary = document.createElement('summary');
        summary.textContent = 'Opcionais (recomendado preencher o que souber)';
        details.appendChild(summary);
        const optGroup = document.createElement('div');
        optGroup.className = 'field-group field-grid';
        appendFields(optGroup, restOptional, false);
        details.appendChild(optGroup);
        body.appendChild(details);
    }

    ctx.setValid(isValid(ctx.state));
}

export const dataStep = {
    name: 'Dados do estabelecimento',
    title: 'Dados do estabelecimento',
    subtitle: 'Nome, morada e contacto do negócio chegam para avançar. O resto pode ficar para depois do fecho.',
    isValid,
    render
};
