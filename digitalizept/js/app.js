import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { createWizard, clearWizardState, hasWizardProgress, seedWizardState } from './wizard.js';
import { clearSettingsCache, fetchSettings } from './settings.js';
import { clearCatalogCache, fetchCatalog } from './catalog.js';
import { flushDealQueue, queuedDealCount } from './offline-queue.js';

const el = {
    loginOverlay: document.getElementById('login-overlay'),
    loginForm: document.getElementById('login-form'),
    loginError: document.getElementById('login-error'),
    keyInput: document.getElementById('key-input'),
    app: document.getElementById('app'),
    logoutBtn: document.getElementById('logout-btn')
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

async function applyResumeLead(leadId) {
    if (!leadId) return false;
    if (hasWizardProgress()
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

    clearWizardState();
    const seed = { ...data.data };
    // Re-open always needs a fresh signature (new or revised contract).
    delete seed.assinatura;
    delete seed.assinaturaPrestador;
    delete seed.dealResult;
    seedWizardState(seed, { step: data.suggestedStep || 0, substep: 0 });
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
    clearWizardState();
    clearSettingsCache();
    clearCatalogCache();
    wizard = null;
    showLoginOverlay();
}

function bindEvents() {
    el.loginForm.addEventListener('submit', handleLoginSubmit);
    el.logoutBtn.addEventListener('click', logout);
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
