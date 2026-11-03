/*
 * Nabu's service worker: practice reminders (gameplan §12.6). The server sends one encrypted
 * Web Push message (RFC 8291); the browser decrypts it and hands this worker the JSON:
 * {title, body, lang, dir, tag, url}, already in the learner's UI locale. The notification takes
 * the message's language and direction, so an Arabic-UI reminder reads right to left.
 */
self.addEventListener("push", (event) => {
  const parse = () => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  };
  const message = parse();
  const { title = "Nabu", body = "", lang, dir = "auto", tag = "nabu-reminder", url = "./" } = message;
  event.waitUntil(self.registration.showNotification(title, { body, lang, dir, tag, data: { url }, renotify: false }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});
