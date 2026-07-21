/**
 * Baskit service worker (tickets E2-7 + E4-3 groundwork).
 * Deliberately no fetch caching — the app is light and stale caches cost more
 * than they save at this stage. Exists for PWA installability (share sheet)
 * and to receive Web Push moments.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Baskit", body: event.data.text() };
  }
  const title = payload.title || "Baskit";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/apple-touch-icon.png",
      badge: "/apple-touch-icon.png",
      data: { deeplink: payload.deeplink || "/" },
      tag: payload.tag || undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.deeplink) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) client.navigate(target);
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
