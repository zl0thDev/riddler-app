// Service worker: the whole app is one HTML file plus manifest and icons, so caching
// those makes it work offline. Pages are served from the cache at once and refreshed in
// the background; when the refreshed app differs, open pages are told so they can offer
// a reload.

const CACHE = 'riddler-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Whether the last app refresh brought a new version; pages ask for it once they run.
let pendingUpdate = Promise.resolve(false);

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'check-update') return;
  event.waitUntil(
    pendingUpdate.then((changed) => {
      if (changed) event.source?.postMessage({ type: 'update-available' });
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const navigate = request.mode === 'navigate';
  // Puzzle links differ only in their query; they all open the same app page.
  const key = navigate ? './index.html' : request;
  const result = caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(key, { ignoreSearch: navigate });
    // Copy before the cached answer is handed out, whose body is then read by the page.
    const previous = navigate ? cached?.clone() : undefined;
    // "no-cache" revalidates with the server instead of taking the browser's HTTP cache.
    const refreshed = fetch(request, { cache: 'no-cache' }).then(async (response) => {
      if (!response.ok) return { response, changed: false };
      await cache.put(key, response.clone());
      const changed = previous !== undefined && (await previous.text()) !== (await response.clone().text());
      return { response, changed };
    });
    if (navigate) pendingUpdate = refreshed.then((r) => r.changed).catch(() => false);
    event.waitUntil(refreshed.catch(() => undefined));
    return cached ?? refreshed.then((r) => r.response);
  });
  event.respondWith(result);
});
