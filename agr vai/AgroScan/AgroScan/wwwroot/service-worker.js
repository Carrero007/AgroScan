// AgroScan Service Worker — cache de shell estático para abrir rápido
// mesmo com conexão ruim no campo. A análise por IA sempre exige rede
// (não dá pra rodar Gemini offline), então não é cacheada.
const CACHE_NAME = 'agroscan-shell-v1';
const SHELL_FILES = [
    '/dashboard.html',
    '/diagnosticar.html',
    '/identificar.html',
    '/historico.html',
    '/hortalicas.html',
    '/login.html',
    '/css/dashboard.css',
    '/css/diagnosticar.css',
    '/css/identificar.css',
    '/css/historico.css',
    '/css/hortalicas.css',
    '/css/tokens.css',
    '/css/logout-modal.css',
    '/js/Auth.js',
    '/js/theme.js',
    '/js/notifications.js',
    '/js/perfil.js',
    '/js/logout-modal.js',
    '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).catch(() => { })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Nunca cacheia chamadas de API — precisam sempre de dado fresco/rede.
    if (url.pathname.startsWith('/api/')) return;

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).catch(() => cached);
        })
    );
});