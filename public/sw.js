const CACHE = 'mpd-v5';
const SAME_ORIGIN_ASSET = /\.(?:css|js|svg|png|jpg|jpeg|webp|ico|webmanifest)$/;

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request));
    return;
  }

  if (url.origin === self.location.origin && SAME_ORIGIN_ASSET.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const fresh = fetch(e.request).then(response => {
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        });
        return cached || fresh;
      })
    );
  }
});
