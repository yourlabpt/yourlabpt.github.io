import { apiRequest } from './api.js';
import { getToken } from './auth.js';

// Business types, the field dictionary and the app config all arrive from one
// endpoint and none of them change during a session — fetch once, share it.
let cache = null;

// Mirrors the server default so client and server agree when the response
// predates the config block. Never hardcode a rate at a call site.
const FALLBACK_CONFIG = {
    ivaRate: 0.23,
    provider: {
        nome: 'YourLab',
        responsavel: '',
        nif: '',
        morada: '',
        email: '',
        site: '',
        iban: '',
        mbway: ''
    }
};

export async function fetchSettings(ctx) {
    if (cache) return cache;

    const { response, data } = await apiRequest('/api/digitalizept/business-types', {
        token: getToken()
    });

    if (response.status === 401) {
        if (ctx && typeof ctx.onUnauthorized === 'function') ctx.onUnauthorized();
        return null;
    }
    if (!response.ok) {
        throw new Error((data && data.error) || 'Failed to load settings.');
    }

    const config = (data && data.config) || {};
    cache = {
        businessTypes: Array.isArray(data.businessTypes) ? data.businessTypes : [],
        standardFields: (data && data.standardFields) || {},
        config: {
            ivaRate: typeof config.ivaRate === 'number' ? config.ivaRate : FALLBACK_CONFIG.ivaRate,
            provider: { ...FALLBACK_CONFIG.provider, ...(config.provider || {}) }
        }
    };
    return cache;
}

// The wizard reads the rate on every money screen; a failed fetch must not
// silently price a deal at zero IVA, so the fallback matches the server.
export async function fetchConfig(ctx) {
    const settings = await fetchSettings(ctx);
    return settings ? settings.config : null;
}

export function clearSettingsCache() {
    cache = null;
}
