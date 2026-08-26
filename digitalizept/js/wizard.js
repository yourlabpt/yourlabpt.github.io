import { businessTypeStep } from './steps/business-type.js';
import { dataStep } from './steps/data.js';
import { diagnosticoStep } from './steps/diagnostico.js';
import { identityStep } from './steps/identity.js';
import { demoStep } from './steps/demo.js';
import { servicesStep } from './steps/services.js';
import { googleStep } from './steps/google.js';
import { proposalStep } from './steps/proposal.js';
import { acceptanceStep } from './steps/acceptance.js';
import { signatureStep } from './steps/signature.js';
import { conclusionStep } from './steps/conclusion.js';
import { cancelScheduledDraft, saveDraftLead } from './draft.js';
import { cancelScheduledGoNext, currentSubstep } from './substep.js';
import { scrubDemoState } from './demo/html.js';

// localStorage, not sessionStorage: a locked phone or a tab the browser evicts
// mid-visit must not cost a deal that is halfway to a signature.
const STORAGE_KEY = 'yourlab_digitalizept_wizard';

let pendingResumeState = null;

function slimIdentidade(identidade) {
    if (!identidade || typeof identidade !== 'object') return identidade;
    const logo = identidade.logo && identidade.logo.tipo === 'upload'
        ? { tipo: 'nenhum' }
        : identidade.logo;
    return { ...identidade, fotos: [], logo };
}

function writeWizardStorage(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (_) {
        try {
            const slim = {
                ...state,
                data: {
                    ...state.data,
                    demoHtml: '',
                    demoHtmlCustom: '',
                    identidade: slimIdentidade(state.data && state.data.identidade)
                }
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
            return true;
        } catch (_) {
            return false;
        }
    }
}

export function clearWizardState() {
    pendingResumeState = null;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* ignore */ }
}

export function getWizardState() {
    if (pendingResumeState) return pendingResumeState;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return null;
}

// Used by admin "Continuar venda" to seed the sales wizard from a server lead.
export function seedWizardState(data, { step = 0, substep = 0 } = {}) {
    const state = {
        step: Number.isFinite(Number(step)) ? Math.max(0, Math.floor(Number(step))) : 0,
        substep: Number.isFinite(Number(substep)) ? Math.max(0, Math.floor(Number(substep))) : 0,
        data: data && typeof data === 'object' ? data : {}
    };
    if (!state.data.dados || typeof state.data.dados !== 'object') state.data.dados = {};
    state.data.resumeBound = true;
    scrubDemoState(state);
    pendingResumeState = state;
    writeWizardStorage(state);
    return state;
}

// Used to decide whether discarding needs a confirmation.
export function hasWizardProgress() {
    if (pendingResumeState && pendingResumeState.data && Object.keys(pendingResumeState.data).length > 0) {
        return true;
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return Boolean(parsed && parsed.data && Object.keys(parsed.data).length > 0);
    } catch (_) {
        return false;
    }
}

// Live script: type → loja (min) → demo → identity (optional) → diag → packages → close.
// google.js stays skipped; deep ficha / extras / polish live in Admin.
const STEPS = [
    businessTypeStep,
    dataStep,
    demoStep,
    identityStep,
    diagnosticoStep,
    servicesStep,
    googleStep,
    proposalStep,
    acceptanceStep,
    signatureStep,
    conclusionStep
];

function loadState() {
    if (pendingResumeState) {
        const seeded = pendingResumeState;
        pendingResumeState = null;
        return seeded;
    }
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return scrubDemoState(parsed);
        }
    } catch (_) { /* ignore */ }
    return { step: 0, substep: 0, data: {} };
}

function substepCount(step, state) {
    if (typeof step.substepCount !== 'function') return 0;
    const n = Number(step.substepCount(state));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function shouldSkip(step, state) {
    return typeof step.shouldSkip === 'function' && step.shouldSkip(state);
}

function advancePastSkips(state, direction) {
    while (state.step >= 0 && state.step < STEPS.length && shouldSkip(STEPS[state.step], state)) {
        state.step += direction;
    }
    if (state.step < 0) state.step = 0;
    if (state.step >= STEPS.length) state.step = STEPS.length - 1;
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
    if (!Number.isFinite(Number(state.substep)) || state.substep < 0) state.substep = 0;
    if (!state.data || typeof state.data !== 'object') state.data = {};
    state.dealEpoch = Number(state.dealEpoch) > 0 ? Number(state.dealEpoch) : 1;
    state.abandoned = false;
    advancePastSkips(state, 1);
    let currentValid = false;
    let persistWarned = false;
    let navLock = false;

    function getDealEpoch() {
        return Number(state.dealEpoch) || 0;
    }

    function bumpDealEpoch() {
        state.dealEpoch = getDealEpoch() + 1;
    }

    function persist() {
        if (state.abandoned) return;
        scrubDemoState(state);
        if (typeof state.data.demoHtml === 'string' && state.data.demoHtml.length > 900000) {
            state.data.demoHtml = state.data.demoHtml.slice(0, 900000);
        }
        if (!writeWizardStorage(state) && !persistWarned) {
            persistWarned = true;
            showToast('Não deu para gravar no telemóvel. A demo fica só nesta sessão.', true);
        }
    }

    function update(patch, fromEpoch) {
        if (state.abandoned) return;
        if (fromEpoch != null && fromEpoch !== getDealEpoch()) return;
        Object.assign(state.data, patch);
        persist();
    }

    function setValid(valid) {
        currentValid = Boolean(valid);
        syncNav();
    }

    function syncNav() {
        const isFirst = state.step === 0 && currentSubstep(state) === 0;
        const isLast = state.step === STEPS.length - 1;
        els.backBtn.disabled = isFirst || navLock;
        els.nextBtn.disabled = isLast || !currentValid || navLock;
        els.nextBtn.textContent = isLast ? 'Concluir' : 'Continuar';
    }

    function pagesReady(step) {
        return typeof step.pagesReady !== 'function' || step.pagesReady(state);
    }

    function render() {
        const step = STEPS[state.step];
        const count = substepCount(step, state);
        const ready = pagesReady(step);
        // While a step is still loading its pages (catalog, fields), do not
        // clamp substep against a short placeholder list — that jumps the
        // vendedor from the last extra into urgência / the next phase.
        if (ready) {
            if (count > 0) {
                state.substep = Math.min(currentSubstep(state), count - 1);
            } else {
                state.substep = 0;
            }
        }

        els.progressFill.style.width = `${((state.step + 1) / STEPS.length) * 100}%`;
        els.stepNum.textContent = `Passo ${state.step + 1} de ${STEPS.length}`;
        els.stepName.textContent = step.name;

        els.container.innerHTML = '';
        els.container.scrollTop = 0;
        els.container.classList.toggle('app-main-ask', count > 0);

        if (count === 0) {
            const title = document.createElement('h2');
            title.className = 'step-title';
            title.textContent = step.title;

            const subtitle = document.createElement('p');
            subtitle.className = 'step-subtitle';
            subtitle.textContent = step.subtitle;

            els.container.append(title, subtitle);
        }

        const body = document.createElement('div');
        body.className = 'step-body';
        els.container.appendChild(body);

        currentValid = typeof step.isValid === 'function' ? step.isValid(state) : true;
        if (typeof step.isSubstepValid === 'function') {
            currentValid = step.isSubstepValid(state);
        }
        syncNav();

        const ctx = {
            state,
            update,
            setValid,
            onUnauthorized,
            showToast,
            reset,
            goNext,
            getDealEpoch,
            goToConclusion() {
                cancelScheduledGoNext();
                state.data._vendaAgoraNao = true;
                state.step = STEPS.length - 1;
                state.substep = 0;
                persist();
                render();
            }
        };
        Promise.resolve(step.render(body, ctx)).catch(() => {
            showToast('Ocorreu um erro neste passo.', true);
        });
    }

    // Start a fresh deal. Without this the next shop inherits the previous
    // client's answers, because the stored state outlives the sale.
    function reset() {
        cancelScheduledGoNext();
        cancelScheduledDraft();
        bumpDealEpoch();
        navLock = false;
        clearWizardState();
        state.step = 0;
        state.substep = 0;
        state.data = {};
        currentValid = false;
        render();
    }

    function destroy() {
        cancelScheduledGoNext();
        cancelScheduledDraft();
        state.abandoned = true;
        bumpDealEpoch();
        els.backBtn.removeEventListener('click', goBack);
        els.nextBtn.removeEventListener('click', goNext);
    }

    async function goNext() {
        cancelScheduledGoNext();
        if (navLock || !currentValid) return;
        navLock = true;
        currentValid = false;
        syncNav();
        let holdFooter = false;
        try {
            const step = STEPS[state.step];
            const count = substepCount(step, state);
            const idx = currentSubstep(state);
            const ready = pagesReady(step);

            if (ready && count > 0 && idx < count - 1) {
                state.substep = idx + 1;
                persist();
                render();
                return;
            }

            if (!ready) return;

            if (state.step >= STEPS.length - 1) return;
            // Persist mid-funnel progress so admin can reopen unfinished leads.
            const leaving = STEPS[state.step];
            if (leaving === businessTypeStep || leaving === dataStep || leaving === diagnosticoStep
                || leaving === identityStep || leaving === demoStep || leaving === servicesStep) {
                try { await saveDraftLead(state, { update, onUnauthorized, showToast, getDealEpoch }); }
                catch (_) { /* a missed draft must not block the visit */ }
            }
            state.step += 1;
            advancePastSkips(state, 1);
            state.substep = 0;
            persist();
            render();
            holdFooter = true;
        } finally {
            if (holdFooter) {
                // Continuar sits in the same footer slot on every step. Hold it
                // disabled until the mobile ghost-click from this tap is gone.
                setTimeout(() => {
                    navLock = false;
                    syncNav();
                }, 350);
            } else {
                navLock = false;
                syncNav();
            }
        }
    }

    function goBack() {
        cancelScheduledGoNext();
        if (navLock) return;
        const step = STEPS[state.step];
        const idx = currentSubstep(state);
        if (substepCount(step, state) > 0 && idx > 0) {
            state.substep = idx - 1;
            persist();
            render();
            return;
        }
        if (state.step === 0) return;
        state.step -= 1;
        advancePastSkips(state, -1);
        const prev = STEPS[state.step];
        const prevCount = substepCount(prev, state);
        state.substep = prevCount > 0 ? prevCount - 1 : 0;
        persist();
        render();
    }

    els.backBtn.addEventListener('click', goBack);
    els.nextBtn.addEventListener('click', goNext);

    return { render, reset, destroy, getDealEpoch, bumpDealEpoch };
}
