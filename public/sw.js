// Self-destructing service worker.
//
// A previous version of this app shipped a cache-first service worker that
// held on to stale assets, so new deploys were not reflected until users
// manually ran "Clear site data". This worker exists purely to undo that:
// it caches nothing and, once activated, wipes every cache, unregisters
// itself, and reloads any open tabs so they load the latest deploy.
//
// Browsers re-fetch sw.js on navigation / periodic update checks (bypassing
// the HTTP cache), so even clients still controlled by the old worker will
// pick this up automatically and clean themselves up.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove every cache this origin created.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      // Unregister so no service worker controls the app going forward.
      await self.registration.unregister();

      // Reload open tabs so they fetch fresh, un-intercepted assets.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        if ('navigate' in client) {
          client.navigate(client.url);
        }
      });
    })()
  );
});

// No fetch handler: every request goes straight to the network with no caching.
