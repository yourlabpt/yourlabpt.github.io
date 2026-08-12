import { businessTypeStep } from './steps/business-type.js';
import { dataStep } from './steps/data.js';
import { identityStep } from './steps/identity.js';
import { demoStep } from './steps/demo.js';
import { servicesStep } from './steps/services.js';
import { proposalStep } from './steps/proposal.js';
import { acceptanceStep } from './steps/acceptance.js';
import { signatureStep } from './steps/signature.js';
import { conclusionStep } from './steps/conclusion.js';

const STORAGE_KEY = 'yourlab_digitalizept_wizard';

function placeholderStep(name) {
    return {
        name,
        title: name,
        subtitle: 'Este passo é construído nas próximas fases.',
        isValid() { return true; },
        render(body) {
            const div = document.createElement('div');
            div.className = 'placeholder';
            div.textContent = `Em construção — ${name}`;
            body.appendChild(div);
        }
    };
}

// The 9 guided steps. Only Etapa 1 is live; the rest are placeholders for now.
const STEPS = [
    businessTypeStep,
    dataStep,
    identityStep,
    demoStep,
    servicesStep,
    proposalStep,
    acceptanceStep,
    signatureStep,
    conclusionStep
];

function loadState() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return { step: 0, data: {} };
}

export function createWizard({ onUnauthorized, showToast }) {
    const els = {
        container: document.getElementById('stepContainer'),
        progressFill: document.getElementById('progressFill'),
        stepNum: document.getElementById('stepNum'),
        stepName: document.getElementById('stepName'),
        backBtn: document.getElementById('backBtn'),
        nextBtn: document.getElementById('nextBtn')
    };

    const state = loadState();
    if (state.step < 0 || state.step >= STEPS.length) state.step = 0;
    let currentValid = false;

    function persist() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) { /* ignore */ }
    }

    function update(patch) {
        Object.assign(state.data, patch);
        persist();
    }

    function setValid(valid) {
        currentValid = Boolean(valid);
        syncNav();
    }

    function syncNav() {
        const isFirst = state.step === 0;
        const isLast = state.step === STEPS.length - 1;
        els.backBtn.disabled = isFirst;
        els.nextBtn.disabled = isLast || !currentValid;
        els.nextBtn.textContent = isLast ? 'Concluir' : 'Continuar';
    }

    function render() {
        const step = STEPS[state.step];

        els.progressFill.style.width = `${((state.step + 1) / STEPS.length) * 100}%`;
        els.stepNum.textContent = `Passo ${state.step + 1} de ${STEPS.length}`;
        els.stepName.textContent = step.name;

        els.container.innerHTML = '';
        els.container.scrollTop = 0;

        const title = document.createElement('h2');
        title.className = 'step-title';
        title.textContent = step.title;

        const subtitle = document.createElement('p');
        subtitle.className = 'step-subtitle';
        subtitle.textContent = step.subtitle;

        const body = document.createElement('div');
        body.className = 'step-body';

        els.container.append(title, subtitle, body);

        currentValid = typeof step.isValid === 'function' ? step.isValid(state) : true;
        syncNav();

        const ctx = { state, update, setValid, onUnauthorized, showToast };
        Promise.resolve(step.render(body, ctx)).catch(() => {
            showToast('Ocorreu um erro neste passo.', true);
        });
    }

    function goNext() {
        if (state.step >= STEPS.length - 1 || !currentValid) return;
        state.step += 1;
        persist();
        render();
    }

    function goBack() {
        if (state.step === 0) return;
        state.step -= 1;
        persist();
        render();
    }

    els.backBtn.addEventListener('click', goBack);
    els.nextBtn.addEventListener('click', goNext);

    return { render };
}
