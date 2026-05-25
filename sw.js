// Dev-friendly service worker: never cache, always go to the network.
// The HTML meta cache-control tags can't reach ES module subresources, and
// iOS Safari caches them aggressively — this guarantees every js/*.js fetch
// is fresh whenever the SW is in control.

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;       // let cross-origin alone
  e.respondWith(fetch(e.request, { cache: 'no-store' }));
});
