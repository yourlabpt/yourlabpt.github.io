'use strict';

const CACHE = 'diario-tcc-v9';
const BASE = '/diario-tcc-secure/';
const INDEX_URL = `${BASE}index.html`;
const ASSETS = [
  BASE,
  INDEX_URL,
  `${BASE}styles.css`,
  `${BASE}app.js`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icon.svg`,
  `${BASE}icon-192.png`,
  `${BASE}icon-512.png`,
];

const NETWORK_FIRST_FILES = ['index.html', 'app.js', 'styles.css'];

function isNetworkFirst(request) {
  try {
    const path = new URL(request.url).pathname;
    return NETWORK_FIRST_FILES.some((name) => path.endsWith(name));
  } catch {
    return false;
  }
}

function cacheResponse(request, response) {
  if (!response?.ok || response.type !== 'basic') return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(INDEX_URL, copy));
          return response;
        })
        .catch(() => caches.match(INDEX_URL))
    );
    return;
  }

  if (isNetworkFirst(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          cacheResponse(event.request, response);
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          cacheResponse(event.request, response);
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
