export const TOKEN_KEY = 'yourlab_digitalizept_token';

export function resolveApiBase() {
    const host = window.location.hostname;
    const port = window.location.port;

    if (host === 'localhost' || host === '127.0.0.1') {
        if (port === '3000' || port === '') return '';
        return 'http://localhost:3000';
    }

    return '';
}

export const API_BASE = resolveApiBase().replace(/\/$/, '');
