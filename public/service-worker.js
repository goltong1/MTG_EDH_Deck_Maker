const SHELL_CACHE = 'deck-canvas-shell-pages-v2';
const IMAGE_CACHE = 'deck-canvas-card-images-v3';
const DATA_CACHE = 'deck-canvas-published-db-v2';
const SHELL_FILES = ['./', './index.html', './styles.css', './app.js', './deck-rules.js', './manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => (key.startsWith('commander-canvas-') || key.startsWith('deck-canvas-')) && ![SHELL_CACHE, IMAGE_CACHE, DATA_CACHE].includes(key))
      .map(key => caches.delete(key))))
  );
  self.clients.claim();
});

async function cacheCardImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    if (keys.length > 500) await Promise.all(keys.slice(0, keys.length - 500).map(key => cache.delete(key)));
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || network;
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw new Error('offline');
  }
}

async function cacheDatabase(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  if (url.hostname.endsWith('scryfall.io') && event.request.destination === 'image') {
    event.respondWith(cacheCardImage(event.request));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/data/meta.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (url.pathname.endsWith('/data/cards.json.gz')) {
    event.respondWith(cacheDatabase(event.request));
    return;
  }

  event.respondWith(staleWhileRevalidate(event.request));
});
