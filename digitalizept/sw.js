const CACHE = 'digitalizept-v1';
const SHELL = [
    '/digitalizept/',
    '/digitalizept/index.html',
    '/digitalizept/digitalizept.css',
    '/digitalizept/js/app.js',
    '/digitalizept/js/api.js',
    '/digitalizept/js/auth.js',
    '/digitalizept/js/catalog.js',
    '/digitalizept/js/config.js',
    '/digitalizept/js/format.js',
    '/digitalizept/js/proposal-calc.js',
    '/digitalizept/js/settings.js',
    '/digitalizept/js/wizard.js'
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

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== 'GET') return;

    if (url.pathname.startsWith('/api/digitalizept/business-types')
        || url.pathname.startsWith('/api/digitalizept/catalog')) {
        event.respondWith(
            fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put(req, copy));
                return res;
            }).catch(() => caches.match(req))
        );
        return;
    }

    if (url.pathname.startsWith('/digitalizept/')) {
        event.respondWith(
            caches.match(req).then((cached) => cached || fetch(req).then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put(req, copy));
                return res;
            }))
        );
    }
});
