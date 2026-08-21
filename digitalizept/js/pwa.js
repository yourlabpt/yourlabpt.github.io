const SW_URL = '/digitalizept/sw.js';
const SW_SCOPE = '/digitalizept/';
const NOCACHE_PARAM = '_nocache';

function stripNocacheParam() {
    try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(NOCACHE_PARAM)) return;
        url.searchParams.delete(NOCACHE_PARAM);
        const next = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState(null, '', next);
    } catch (_) { /* ignore */ }
}

export function registerDigitalizeptSw() {
    stripNocacheParam();
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

async function bustHttpCache() {
    const here = window.location.pathname + window.location.search;
    const assets = [here, SW_URL, '/digitalizept/digitalizept.css', '/digitalizept/js/app.js', '/digitalizept/js/pwa.js'];
    await Promise.all(assets.map((href) => fetch(href, {
        cache: 'reload',
        credentials: 'same-origin'
    }).catch(() => {})));
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
        await bustHttpCache();
    } catch (_) { /* still reload */ }

    const url = new URL(window.location.href);
    url.searchParams.set(NOCACHE_PARAM, String(Date.now()));
    window.location.replace(`${url.pathname}${url.search}${url.hash}`);
}

export function confirmAndRefreshApp() {
    return hardRefreshApp();
}
