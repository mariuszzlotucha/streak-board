// StreakBoard service worker: it exists so the app can be installed, and nothing more.
// No page or data caching — PRD Non-Goals; S-16 adds `push` here.
// There is deliberately no `fetch` handler: every request goes to the network as if no worker were installed.
/* global self, caches */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- a plain worker script with no types */

self.addEventListener("install", () => {
  // A new version takes over at once; with nothing cached there is no stale content to protect.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Cleanup against future regressions: no cache may survive an update.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});
