// StreakBoard service worker: it exists so the app can be installed and can show the evening reminders (S-16), nothing more.
// No page or data caching — PRD Non-Goals; `push` shows a reminder and `notificationclick` opens the app.
// There is deliberately no `fetch` handler: every request goes to the network as if no worker were installed.
/* global self, caches */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument -- a plain worker script with no types */

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

// The reminder's tag: one per Warsaw day, so a repeated push that day replaces the notification instead of stacking.
function reminderTag() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  return `reminders-${day}`;
}

// The payload is JSON `{ title, body, url }`; only a same-origin url is opened, anything else falls back to the dashboard.
function readPayload(event) {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  if (typeof data !== "object" || data === null) data = {};
  const title = typeof data.title === "string" && data.title ? data.title : "StreakBoard";
  const body = typeof data.body === "string" ? data.body : "";
  let url = "/dashboard";
  try {
    const target = new URL(typeof data.url === "string" ? data.url : "/dashboard", self.location.origin);
    if (target.origin === self.location.origin) url = target.href;
  } catch {
    url = "/dashboard";
  }
  return { title, body, url };
}

self.addEventListener("push", (event) => {
  const { title, body, url } = readPayload(event);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: reminderTag(),
      icon: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/dashboard", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Only a window already on that page is reused; any other open page keeps its content and a new window opens.
      const open = windows.find((client) => client.url === url);
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
