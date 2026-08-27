const CACHE = 'digitalizept-v118';
const SHELL = [
    '/digitalizept/',
    '/digitalizept/index.html',
    '/digitalizept/admin.html',
    '/digitalizept/admin.css',
    '/digitalizept/digitalizept.css',
    '/digitalizept/js/app.js',
    '/digitalizept/js/admin.js',
    '/digitalizept/js/admin-lead.js',
    '/digitalizept/js/admin-lead-process.js',
    '/digitalizept/js/admin-lead-demo.js',
    '/digitalizept/js/admin-quick-lead.js',
    '/digitalizept/js/social-assist.js',
    '/digitalizept/js/admin-coverage.js',
    '/digitalizept/js/admin-redirects.js',
    '/digitalizept/js/coverage-filters.js',
    '/digitalizept/js/admin-maps.js',
    '/digitalizept/js/api.js',
    '/digitalizept/js/auth.js',
    '/digitalizept/js/catalog.js',
    '/digitalizept/js/config.js',
    '/digitalizept/js/format.js',
    '/digitalizept/js/vcard.js',
    '/digitalizept/js/proposal-calc.js',
    '/digitalizept/js/pwa.js',
    '/digitalizept/js/settings.js',
    '/digitalizept/js/provider-editor.js',
    '/digitalizept/js/wizard.js',
    '/digitalizept/js/demo/identity-editor.js',
    '/digitalizept/js/demo/publish-demo.js',
    '/digitalizept/js/steps/google.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

function isShellAsset(pathname) {
    return pathname.endsWith('.html')
        || pathname.endsWith('.css')
        || pathname.endsWith('.js')
        || pathname === '/digitalizept'
        || pathname === '/digitalizept/';
}

function networkFirst(req) {
    return fetch(req).then((res) => {
        if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
    }).catch(() => caches.match(req));
}

function cacheFirst(req) {
    return caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
    }));
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== 'GET') return;

    if (url.pathname.startsWith('/api/digitalizept/business-types')
        || url.pathname.startsWith('/api/digitalizept/catalog')) {
        event.respondWith(networkFirst(req));
        return;
    }

    if (url.pathname.startsWith('/digitalizept/')) {
        // HTML/CSS/JS must stay fresh so a deploy is visible after refresh.
        event.respondWith(isShellAsset(url.pathname) ? networkFirst(req) : cacheFirst(req));
    }
});
