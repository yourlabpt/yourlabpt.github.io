const CACHE = 'digitalize-v2';
const SHELL = [
    '/digitalize/',
    '/digitalize/index.html',
    '/digitalize/css/app.css',
    '/digitalize/js/app.js',
    '/digitalize/manifest.webmanifest',
    '/digitalize/icons/icon.svg',
    '/digitalize/icons/icon-192.png',
    '/digitalize/icons/icon-512.png'
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
        || pathname.endsWith('.webmanifest')
        || pathname === '/digitalize'
        || pathname === '/digitalize/';
}

function networkFirst(req) {
    return fetch(req).then((res) => {
        if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
    }).catch(() => caches.match(req).then((cached) => cached || caches.match('/digitalize/index.html')));
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
    if (url.pathname.startsWith('/api/')) return; // never cache session/lead data

    if (url.pathname.startsWith('/digitalize/c/')) {
        // Resumable session links are server-rendered app-shell routes, not
        // static files — fall back to the cached shell when offline.
        event.respondWith(networkFirst(req));
        return;
    }

    if (url.pathname.startsWith('/digitalize/')) {
        // HTML/CSS/JS must stay fresh so a deploy is visible after refresh.
        event.respondWith(isShellAsset(url.pathname) ? networkFirst(req) : cacheFirst(req));
    }
});
