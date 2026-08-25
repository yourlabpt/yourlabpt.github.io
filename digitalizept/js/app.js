import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { createWizard, clearWizardState, hasWizardProgress, seedWizardState, getWizardState } from './wizard.js';
import { clearSettingsCache, fetchSettings } from './settings.js';
import { clearCatalogCache, fetchCatalog } from './catalog.js';
import { flushDealQueue, queuedDealCount } from './offline-queue.js';
import { cancelScheduledDraft, saveDraftLead } from './draft.js';
import { confirmAndRefreshApp, registerDigitalizeptSw } from './pwa.js';

registerDigitalizeptSw();

const el = {
    loginOverlay: document.getElementById('login-overlay'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    keyInput: document.getElementById('key-input'),
    app: document.getElementById('app'),
    logoutBtn: document.getElementById('logout-btn'),
    newDealBtn: document.getElementById('newDealBtn')
};

let wizard = null;

function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showLoginOverlay(message = '') {
    el.loginOverlay.classList.remove('hidden');
    el.app.classList.add('hidden');
    el.loginError.textContent = message;
    if (el.keyInput) {
        el.keyInput.value = '';
        el.keyInput.focus();
    }
}

function hideLoginOverlay() {
    el.loginOverlay.classList.add('hidden');
    el.app.classList.remove('hidden');
    el.loginError.textContent = '';
}

function handleUnauthorized(message = 'Sessão expirada. Introduza a chave novamente.') {
    clearToken();
    showLoginOverlay(message);
}

function resumeLeadIdFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        return (params.get('resume') || '').trim();
    } catch (_) {
        return '';
    }
}

function clearResumeParam() {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has('resume')) return;
        url.searchParams.delete('resume');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) { /* ignore */ }
}

function isCustomHtmlValue(html) {
    const text = String(html || '').trim();
    return Boolean(text) && !/data-dp-boilerplate\s*=/i.test(text);
}

function fillBlankFields(base, overlay) {
    const out = { ...(base && typeof base === 'object' ? base : {}) };
    Object.entries(overlay && typeof overlay === 'object' ? overlay : {}).forEach(([key, value]) => {
        if (value == null) return;
        if (typeof value === 'string' && !value.trim()) return;
        out[key] = value;
    });
    return out;
}

function keepRicherDemo(seed, local) {
    if (!local || typeof local !== 'object') return seed;
    if (!isCustomHtmlValue(seed.demoHtml) && !isCustomHtmlValue(seed.demoHtmlCustom)) {
        if (isCustomHtmlValue(local.demoHtmlCustom) || isCustomHtmlValue(local.demoHtml)) {
            seed.demoHtmlCustom = local.demoHtmlCustom || local.demoHtml;
            seed.demoHtml = local.demoHtml || local.demoHtmlCustom;
            seed.demoHtmlSource = local.demoHtmlSource && local.demoHtmlSource !== 'boilerplate'
                ? local.demoHtmlSource
                : 'ai';
            seed.demoVisual = seed.demoVisual || local.demoVisual || 'personalizada';
        }
        if (local.demo && local.demo.hero && !(seed.demo && seed.demo.hero)) seed.demo = local.demo;
        if (local.demoRaw && !seed.demoRaw) seed.demoRaw = local.demoRaw;
    }
    if (!seed.identidade && local.identidade) seed.identidade = local.identidade;
    return seed;
}

async function applyResumeLead(leadId) {
    if (!leadId) return false;
    const previous = getWizardState();
    const prevLeadId = previous && previous.data && previous.data.leadId;
    const sameLead = Boolean(prevLeadId && prevLeadId === leadId);
    if (hasWizardProgress() && !sameLead
        && !window.confirm('Já há uma venda em curso neste telemóvel. Substituir pelos dados deste lead?')) {
        clearResumeParam();
        return false;
    }

    const { response, data } = await apiRequest(
        `/api/digitalizept/leads/${encodeURIComponent(leadId)}/resume`,
        { token: getToken() }
    );
    if (response.status === 401) {
        handleUnauthorized();
        return false;
    }
    if (!response.ok || !data.data) {
        showToast((data && data.error) || 'Não foi possível reabrir este lead.', true);
        clearResumeParam();
        return false;
    }

    cancelScheduledDraft();
    if (wizard && typeof wizard.destroy === 'function') wizard.destroy();
    clearWizardState();
    const seed = { ...data.data };
    // Admin ficha wins; fill any blank keys from this same lead still on the phone.
    if (sameLead && previous.data && previous.data.dados) {
        seed.dados = fillBlankFields(previous.data.dados, seed.dados);
    }
    if (sameLead && previous.data) keepRicherDemo(seed, previous.data);
    seed.leadBoundNome = seed.leadBoundNome
        || (seed.dados && seed.dados.nome_negocio)
        || '';
    // Re-open always needs a fresh signature (new or revised contract).
    delete seed.assinatura;
    delete seed.assinaturaPrestador;
    delete seed.dealResult;
    const step = Number.isFinite(Number(data.suggestedStep))
        ? Math.max(0, Math.floor(Number(data.suggestedStep)))
        : (Number.isFinite(Number(seed._wizardStep)) ? Math.max(0, Math.floor(Number(seed._wizardStep))) : 0);
    const substep = Number.isFinite(Number(data.suggestedSubstep))
        ? Math.max(0, Math.floor(Number(data.suggestedSubstep)))
        : (Number.isFinite(Number(seed._wizardSubstep)) ? Math.max(0, Math.floor(Number(seed._wizardSubstep))) : 0);
    delete seed._wizardStep;
    delete seed._wizardSubstep;
    seedWizardState(seed, { step, substep });
    clearResumeParam();
    wizard = null;
    const nome = (seed.dados && seed.dados.nome_negocio) || 'negócio';
    const versao = seed.contratoVersao || 'v1';
    showToast(data.revisingDeal
        ? `Proposta reaberta (${versao}): ${nome}. Alterações atualizam a mesma proposta.`
        : `Lead reaberto: ${nome}.`);
    return true;
}

function startApp() {
    hideLoginOverlay();
    if (!wizard) {
        wizard = createWizard({ onUnauthorized: handleUnauthorized, showToast });
    }
    wizard.render();
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    const key = (el.keyInput.value || '').trim();
    if (!key) return;

    try {
        const { response, data } = await apiRequest('/api/digitalizept/login', {
            method: 'POST',
            body: { password: key }
        });

        if (!response.ok || !data.token) {
            el.loginError.textContent = data.error || 'Chave inválida.';
            return;
        }

        setToken(data.token);
        const resumeId = resumeLeadIdFromUrl();
        if (resumeId) {
            try { await applyResumeLead(resumeId); }
            catch (_) { showToast('Sem rede para reabrir o lead.', true); }
        }
        startApp();
    } catch (_) {
        el.loginError.textContent = 'Não foi possível contactar o servidor.';
    }
}

async function logout() {
    // Signing out drops the deal on screen, which during a visit is unrecoverable.
    if (hasWizardProgress() && !window.confirm('Sair vai apagar os dados deste negócio. Continuar?')) {
        return;
    }

    try {
        await apiRequest('/api/digitalizept/logout', {
            method: 'POST',
            token: getToken()
        });
    } catch (_) {
        // Ignore logout network errors.
    }

    clearToken();
    // Without this the wizard singleton and the stored state survive the logout
    // and the next login resumes the previous client's deal.
    cancelScheduledDraft();
    if (wizard && typeof wizard.destroy === 'function') wizard.destroy();
    clearWizardState();
    clearSettingsCache();
    clearCatalogCache();
    wizard = null;
    showLoginOverlay();
}

async function startNewDeal() {
    if (hasWizardProgress()) {
        const ws = getWizardState();
        const nome = (ws && ws.data && ws.data.dados && ws.data.dados.nome_negocio) || '';
        const label = nome ? `Guardar "${nome}" e começar novo negócio?` : 'Guardar rascunho e começar novo negócio?';
        if (!window.confirm(label)) return;
        if (ws && ws.data && ws.data.dados && ws.data.dados.nome_negocio) {
            try {
                await saveDraftLead(
                    { data: ws.data, step: ws.step, substep: ws.substep },
                    { update: () => {}, onUnauthorized: handleUnauthorized, showToast }
                );
                showToast(nome ? `"${nome}" guardado como lead.` : 'Rascunho guardado.');
            } catch (_) {
                showToast('Não foi possível guardar — a iniciar sem gravar.', true);
            }
        }
    }
    clearResumeParam();
    cancelScheduledDraft();
    clearWizardState();
    if (!wizard) wizard = createWizard({ onUnauthorized: handleUnauthorized, showToast });
    wizard.reset();
}

function bindEvents() {
    el.loginForm.addEventListener('submit', handleLoginSubmit);
    el.logoutBtn.addEventListener('click', logout);
    el.newDealBtn.addEventListener('click', startNewDeal);
    document.getElementById('refreshAppBtn')?.addEventListener('click', confirmAndRefreshApp);
    document.getElementById('refreshAppLoginBtn')?.addEventListener('click', confirmAndRefreshApp);
}

async function boot() {
    bindEvents();

    if (!getToken()) {
        showLoginOverlay();
        return;
    }

    // Tokens live in server memory with a 12h TTL, so a restart invalidates them
    // without the client knowing. Probe once here rather than letting the first
    // step render and fail. This also warms the config cache for offline use.
    try {
        const settings = await fetchSettings({ onUnauthorized: () => {} });
        if (!settings) {
            handleUnauthorized();
            return;
        }
        await fetchCatalog({ onUnauthorized: () => {} });
    } catch (_) {
        // Unreachable server (no signal in a shop). Trust the stored token and
        // let the app run from cache rather than locking the vendedor out.
    }

    const resumeId = resumeLeadIdFromUrl();
    if (resumeId) {
        try { await applyResumeLead(resumeId); }
        catch (_) { showToast('Sem rede para reabrir o lead.', true); }
    }

    startApp();
    window.addEventListener('online', () => {
        flushDealQueue().then((sent) => {
            if (sent.length) showToast(`${sent.length} contrato(s) enviado(s) após recuperar a rede.`);
        }).catch(() => {});
    });
    if (queuedDealCount()) {
        flushDealQueue().catch(() => {});
    }
}

boot();
