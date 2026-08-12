import { businessTypeStep } from './steps/business-type.js';
import { dataStep } from './steps/data.js';
import { identityStep } from './steps/identity.js';
import { demoStep } from './steps/demo.js';
import { servicesStep } from './steps/services.js';
import { proposalStep } from './steps/proposal.js';
import { acceptanceStep } from './steps/acceptance.js';
import { signatureStep } from './steps/signature.js';
import { conclusionStep } from './steps/conclusion.js';

// localStorage, not sessionStorage: a locked phone or a tab the browser evicts
// mid-visit must not cost a deal that is halfway to a signature.
const STORAGE_KEY = 'yourlab_digitalizept_wizard';

export function clearWizardState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* ignore */ }
}

// Used to decide whether discarding needs a confirmation.
export function hasWizardProgress() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Boolean(parsed && parsed.data && Object.keys(parsed.data).length > 0);
    } catch (_) {
        return false;
    }
}

// The 9 guided steps.
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
        const raw = localStorage.getItem(STORAGE_KEY);
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

        const ctx = { state, update, setValid, onUnauthorized, showToast, reset };
        Promise.resolve(step.render(body, ctx)).catch(() => {
            showToast('Ocorreu um erro neste passo.', true);
        });
    }

    // Start a fresh deal. Without this the next shop inherits the previous
    // client's answers, because the stored state outlives the sale.
    function reset() {
        clearWizardState();
        state.step = 0;
        state.data = {};
        currentValid = false;
        render();
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

    return { render, reset };
}
