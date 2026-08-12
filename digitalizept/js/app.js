import { apiRequest } from './api.js';
import { getToken, setToken, clearToken } from './auth.js';
import { createWizard } from './wizard.js';

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
    try {
        await apiRequest('/api/digitalizept/logout', {
            method: 'POST',
            token: getToken()
        });
    } catch (_) {
        // Ignore logout network errors.
    }

    clearToken();
    showLoginOverlay();
}

function bindEvents() {
    el.loginForm.addEventListener('submit', handleLoginSubmit);
    el.logoutBtn.addEventListener('click', logout);
}

function boot() {
    bindEvents();

    if (getToken()) {
        startApp();
    } else {
        showLoginOverlay();
    }
}

boot();
