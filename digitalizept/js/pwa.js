const SW_URL = '/digitalizept/sw.js';
const SW_SCOPE = '/digitalizept/';

export function registerDigitalizeptSw() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register(SW_URL, {
        scope: SW_SCOPE,
        updateViaCache: 'none'
    }).then((reg) => {
        const ping = () => reg.update().catch(() => {});
        ping();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') ping();
        });
        window.addEventListener('online', ping);
    }).catch(() => {});

    // Reload once a new worker takes over — iOS home-screen apps otherwise
    // keep the previous JS until the webclip is deleted.
    if (navigator.serviceWorker.controller) {
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
}

export async function hardRefreshApp() {
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((reg) => reg.unregister()));
        }
        if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
        }
    } catch (_) { /* still reload */ }
    window.location.reload();
}

export function confirmAndRefreshApp() {
    if (!window.confirm('Atualizar a app? Limpa o cache e carrega a versão nova.')) return;
    return hardRefreshApp();
}
