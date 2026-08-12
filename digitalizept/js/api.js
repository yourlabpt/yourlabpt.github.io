import { API_BASE } from './config.js';

export async function apiRequest(path, options = {}) {
    const method = options.method || 'GET';
    const token = options.token || '';
    const body = options.body;

    const headers = {};
    if (token) {
        headers['x-admin-token'] = token;
    }

    const request = {
        method,
        headers
    };

    if (typeof body !== 'undefined') {
        headers['Content-Type'] = 'application/json';
        request.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, request);

    let data = {};
    try {
        data = await response.json();
    } catch (_) {
        data = {};
    }

    return { response, data };
}
