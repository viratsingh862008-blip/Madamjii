self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "You have a new update." }; }
  const title = typeof payload.title === "string" ? payload.title : "Are You OK?";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "You have a new notification.",
    tag: typeof payload.tag === "string" ? payload.tag : "are-you-ok-notification",
    data: { url: typeof payload.url === "string" ? payload.url : "/" },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
