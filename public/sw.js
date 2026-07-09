const CACHE_NAME = 'nutrition-app-v2';
const ASSETS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {});
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => {
          if (k !== CACHE_NAME) return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const reqUrl = new URL(req.url);
  const isHttpRequest = reqUrl.protocol === 'http:' || reqUrl.protocol === 'https:';
  if (!isHttpRequest) {
    return;
  }

  const tryCachePut = async (request, response) => {
    try {
      const resUrl = new URL(response.url || request.url);
      const isHttpResponse = resUrl.protocol === 'http:' || resUrl.protocol === 'https:';
      if (!isHttpResponse) return;
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response);
    } catch (e) {
      // Ignore cache write failures for unsupported schemes (e.g. chrome-extension:)
    }
  };

  // Always prefer network for document requests so updated app shell is loaded quickly.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const respClone = res.clone();
          void tryCachePut(req, respClone);
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (!res || res.status !== 200 || res.type !== 'basic') return res;
          const respClone = res.clone();
          void tryCachePut(req, respClone);
          return res;
        })
        .catch(() => caches.match('/'));
    })
  );
});
