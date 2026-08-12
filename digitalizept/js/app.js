import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { createWizard, clearWizardState, hasWizardProgress } from './wizard.js';
import { clearSettingsCache, fetchSettings } from './settings.js';
import { clearCatalogCache } from './catalog.js';

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
    } catch (_) {
        // Unreachable server (no signal in a shop). Trust the stored token and
        // let the app run from cache rather than locking the vendedor out.
    }

    startApp();
}

boot();
