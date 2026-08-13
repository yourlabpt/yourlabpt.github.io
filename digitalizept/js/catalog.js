import { apiRequest } from './api.js';
import { getToken } from './auth.js';

// The servico catalog is static during a session — fetch once, reuse.
let cache = null;

export async function fetchCatalog(ctx) {
    if (cache) return cache;
    const { response, data } = await apiRequest('/api/digitalizept/catalog', {
        token: getToken()
    });
    if (response.status === 401) {
        if (ctx && typeof ctx.onUnauthorized === 'function') ctx.onUnauthorized();
        return null;
    }
    if (!response.ok) {
        throw new Error((data && data.error) || 'Failed to load catalog.');
    }
    cache = Array.isArray(data.servicos) ? data.servicos : [];
    return cache;
}

export function clearCatalogCache() {
    cache = null;
}

export function catalogByCode(catalog) {
    const map = {};
    (catalog || []).forEach((servico) => { map[servico.codigo] = servico; });
    return map;
}
