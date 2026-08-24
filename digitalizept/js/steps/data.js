import { fetchSettings } from '../settings.js';
import { PUBLIC_REQUIRED, PUBLIC_EXTRA, isDataStepValid } from './data-valid.js';
import { currentSubstep, renderAsk, askText, askToggle, askChoices } from '../substep.js';
import { renderHoursPicker } from '../horario.js';
import { buildDadosCopyPrompt, plainAiText, renderOptionalAi } from '../optional-ai.js';
import { isCustomDemo } from '../demo/seed.js';

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

const CORE_PAGES = [
    {
        id: 'nome_negocio',
        title: 'Qual é o nome do negócio?',
        hint: 'O nome na montra ou no Google.',
        required: true
    },
    {
        id: 'morada',
        title: 'Qual é a morada?',
        hint: 'Rua e número, como o cliente diria a um cliente.',
        required: true
    },
    {
        id: 'cidade',
        title: 'Em que cidade?',
        required: true
    },
    {
        id: 'telefone',
        title: 'Qual é o telefone do negócio?',
        hint: 'O número público, não o telemóvel pessoal.',
        required: true
    },
    {
        id: 'horario',
        title: 'Quando está aberto?',
        hint: 'Toque nos dias, a hora de abrir e de fechar. Se fecha ao almoço, preencha a pausa.',
        required: false
    },
    {
        id: 'whatsapp',
        title: 'Tem WhatsApp do negócio?',
        hint: 'Opcional. Se for o mesmo que o telefone, pode saltar.',
        required: false
    }
];

function extraPages(state, standardFields) {
    const businessType = getBusinessType(state) || {};
    const used = new Set([...PUBLIC_REQUIRED, ...PUBLIC_EXTRA]);
    const pages = [];

    function addId(id, extra = {}) {
        if (!id || used.has(id)) return;
        used.add(id);
        const def = (standardFields && standardFields[id]) || { label: id, tipo: 'texto' };
        pages.push({
            id,
            title: extra.title || def.label || id,
            hint: extra.hint || 'Opcional — Continuar sem preencher está bem.',
            required: false,
            def: { ...def, ...extra.def }
        });
    }

    (Array.isArray(businessType.perguntas_especificas) ? businessType.perguntas_especificas : []).forEach((q) => {
        if (!q || !q.id || used.has(q.id)) return;
        used.add(q.id);
        pages.push({
            id: q.id,
            title: q.title || q.label || q.id,
            hint: q.hint || 'Opcional — se não souber agora, avance.',
            required: false,
            def: q
        });
    });
    (businessType.campos_obrigatorios || []).forEach((id) => addId(id));
    (businessType.campos_opcionais || []).forEach((id) => addId(id));
    return pages;
}

function pagesFor(state, standardFields) {
    const core = CORE_PAGES.map((p) => ({
        ...p,
        def: (standardFields && standardFields[p.id]) || {
            label: p.id,
            tipo: p.id === 'telefone' || p.id === 'whatsapp' ? 'telefone' : p.id === 'horario' ? 'horario' : 'texto'
        }
    }));
    const gate = {
        id: '_more',
        title: (getBusinessType(state) && getBusinessType(state).gate_mais)
            || 'Quer acrescentar mais agora?',
        hint: 'Perguntas deste tipo de negócio (pratos, marcas, marcações…). Pode ficar para depois.',
        kind: 'gate'
    };
    if (!state.data.dadosMore) return [...core, gate];
    return [...core, gate, ...extraPages(state, standardFields)];
}

function substepCount(state) {
    return pagesFor(state, state.data._standardFields || null).length;
}

function isSubstepValid(state) {
    const pages = pagesFor(state, state.data._standardFields || null);
    const page = pages[currentSubstep(state)];
    if (!page) return isDataStepValid(state);
    if (page.kind === 'gate') return true;
    if (!page.required) return true;
    const dados = (state.data && state.data.dados) || {};
    return String(dados[page.id] || '').trim().length > 0;
}

const DEMO_DRIVER_FIELDS = new Set([
    'nome_negocio',
    'cidade',
    'o_que_faz',
    'principais_servicos',
    'diferencial'
]);

function clearDemoState(state) {
    delete state.data.demo;
    state.data.demoRaw = '';
    state.data.demoHtml = '';
    state.data.demoHtmlSource = '';
    state.data.demoHtmlCustom = '';
    state.data.demoVisual = '';
    state.data.demoSeeded = false;
    state.data.demoUrl = '';
    state.data.demoIdentityStamp = '';
}

export function invalidateDemoIfDriverField(state, fieldId) {
    if (!DEMO_DRIVER_FIELDS.has(fieldId)) return false;
    if (isCustomDemo(state)) return false;
    clearDemoState(state);
    return true;
}

function fieldControl(control, def, value, onChange, onEnter, goNext) {
    const tipo = (def && def.tipo) || 'texto';
    if (tipo === 'sim_nao') {
        askToggle(control, { value, onChange, goNext });
        return;
    }
    const isLong = tipo === 'texto_longo';
    const input = askText(control, {
        value,
        type: tipo === 'telefone' ? 'tel' : tipo === 'email' ? 'email' : tipo === 'url' ? 'url' : 'text',
        placeholder: def && def.placeholder,
        rows: isLong ? 4 : 1,
        onChange,
        onEnter,
        showNextButton: !isLong,
        nextLabel: 'Seguinte'
    });
    if (isLong && speechAvailable()) {
        const mic = document.createElement('button');
        mic.type = 'button';
        mic.className = 'mic-btn';
        mic.setAttribute('aria-label', 'Ditar por voz');
        mic.textContent = 'voz';
        attachDictation(input, mic);
        control.appendChild(mic);
    }
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

    let standardFields = ctx.state.data._standardFields;
    if (!standardFields) {
        const loading = document.createElement('div');
        loading.className = 'placeholder';
        loading.textContent = 'A preparar…';
        body.appendChild(loading);
        const settings = await fetchSettings(ctx);
        if (!settings) return;
        standardFields = settings.standardFields || {};
        ctx.update({ _standardFields: standardFields });
        loading.remove();
    }

    const dados = getDados(ctx.state);
    const pages = pagesFor(ctx.state, standardFields);
    const idx = Math.min(currentSubstep(ctx.state), pages.length - 1);
    const page = pages[idx];

    const { control } = renderAsk(body, {
        title: page.title,
        hint: page.hint,
        index: idx,
        total: pages.length
    });

    function persist() {
        ctx.update({ dados, dadosMore: ctx.state.data.dadosMore === true });
        ctx.setValid(isSubstepValid(ctx.state));
    }

    if (page.kind === 'gate') {
        askChoices(control, [
            { id: 'no', name: 'Agora não', desc: 'Seguir para o diagnóstico' },
            { id: 'yes', name: 'Sim', desc: 'Perguntas deste ofício e o resto da ficha' }
        ], {
            selected: ctx.state.data.dadosMore === true ? 'yes' : 'no',
            goNext: ctx.goNext,
            onSelect: (item) => {
                ctx.state.data.dadosMore = item.id === 'yes';
                persist();
            }
        });
        ctx.setValid(true);
        return;
    }

    if (page.id === 'horario') {
        renderHoursPicker(control, {
            text: dados.horario || '',
            onChange: (val) => {
                dados.horario = val;
                persist();
            },
            showNext: true,
            onNext: () => {
                if (ctx.goNext) ctx.goNext();
            }
        });
        ctx.setValid(isSubstepValid(ctx.state));
        return;
    }

    fieldControl(control, page.def, dados[page.id], (val) => {
        dados[page.id] = val;
        invalidateDemoIfDriverField(ctx.state, page.id);
        persist();
    }, () => {
        if (isSubstepValid(ctx.state) && ctx.goNext) ctx.goNext();
    }, ctx.goNext);

    if (['o_que_faz', 'principais_servicos', 'diferencial'].includes(page.id)) {
        const promptKey = `dadosAiPrompt_${page.id}`;
        if (!ctx.state.data[promptKey]) {
            ctx.state.data[promptKey] = buildDadosCopyPrompt(ctx.state, page.id);
        }
        renderOptionalAi(control, {
            title: 'Sugerir com AI (opcional)',
            hint: 'Pode deixar em branco e avançar. O tipo de negócio já sugere o tom.',
            prompt: ctx.state.data[promptKey],
            placeholder: 'Cole o texto…',
            ctx,
            onPromptChange: (value) => {
                ctx.state.data[promptKey] = value;
                ctx.update({ [promptKey]: value });
            },
            onApply: (raw) => {
                const texto = plainAiText(raw);
                dados[page.id] = texto;
                persist();
                const input = control.querySelector('.ask-input');
                if (input) input.value = texto;
                ctx.showToast('Texto aplicado.');
            }
        });
    }

    ctx.setValid(isSubstepValid(ctx.state));
}

export const dataStep = {
    name: 'Dados do estabelecimento',
    title: 'Dados do estabelecimento',
    subtitle: 'Nome, morada e contacto do negócio chegam para avançar. O resto pode ficar para depois do fecho.',
    isValid,
    isSubstepValid,
    substepCount,
    render
};
