/**
 * Nabu's service worker (gameplan §12.6, §16 Phase 10), built from this file by vite-sw.ts:
 *
 * - **The app offline.** The shell (HTML, script, styles) of this build is cached when the worker
 *   installs; navigations fall back to it with no network. Fonts are kept as they are fetched.
 * - **Courses offline.** Course files are content-addressed, so a stored copy is always right:
 *   they are served from the cache first. Manifests and the course index change, so the network
 *   comes first and the stored copy stands in offline. The app stores whole units on request.
 *   Audio asks for byte ranges; stored clips answer them.
 * - **Background sync.** When the app could not upload its outbox, it asks for a sync; the
 *   browser wakes this worker when the network is back, even with the app closed, and it
 *   uploads the outbox with the account the app saved.
 * - **Reminders.** Web Push (RFC 8291): the server sends {title, body, lang, dir, tag, url},
 *   already in the learner's UI locale, and the notification keeps its language and direction.
 */
import { BUNDLE_CACHE, OUTBOX_SYNC, RUNTIME_CACHE, SHELL_PREFIX, type SyncedMessage } from "../src/caches.ts";
import { openDb, outboxOf, readMeta } from "../src/idb.ts";
import { uploadOutbox, type Destination } from "../src/outbox.ts";

declare const self: ServiceWorkerGlobalScope;
/** Set by vite-sw.ts: the shell's files (relative to the scope), a version for them, and dev mode. */
declare const __NABU_PRECACHE__: readonly string[];
declare const __NABU_VERSION__: string;
declare const __NABU_DEV__: boolean;

/** Background Sync (not in TypeScript's libraries). */
interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
  readonly lastChance: boolean;
}

const SHELL = `${SHELL_PREFIX}${__NABU_VERSION__}`;
const scope = (): string => self.registration.scope;
const at = (path: string): string => new URL(path, scope()).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Past the HTTP cache: the shell must be this build's.
      await cache.addAll(__NABU_PRECACHE__.map((p) => new Request(at(p), { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith(SHELL_PREFIX) && name !== SHELL) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

/** The part of a URL after the worker's scope, without query ("bundles/fa/manifest.json"). */
const pathOf = (url: URL): string | undefined => {
  const base = new URL(scope());
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return undefined;
  return url.pathname.slice(base.pathname.length);
};

/** A 206 for a byte range of a stored response (media elements ask for ranges). */
const ranged = async (request: Request, response: Response): Promise<Response> => {
  const range = request.headers.get("range");
  if (range === null) return response;
  const blob = await response.blob();
  const size = blob.size;
  const m = /^bytes=(\d*)-(\d*)$/u.exec(range.trim());
  let start = 0;
  let end = size - 1;
  if (m !== null && m[1] === "" && m[2] !== "") start = Math.max(0, size - Number(m[2]));
  else if (m !== null && m[1] !== "") {
    start = Number(m[1]);
    if (m[2] !== "") end = Math.min(Number(m[2]), size - 1);
  }
  if (m === null || start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
};

/** Stored first; else the network, keeping a whole (non-range) answer. */
const cacheFirst = async (request: Request, cacheName: string): Promise<Response> => {
  const key = request.url.split("?")[0] ?? request.url;
  const stored = await caches.match(key, { cacheName });
  if (stored !== undefined) return ranged(request, stored);
  const response = await fetch(request);
  if (response.status === 200 && !request.headers.has("range")) await (await caches.open(cacheName)).put(key, response.clone());
  return response;
};

/** The network first, keeping its answer; the stored copy with no network. */
const networkFirst = async (request: Request, cacheName: string): Promise<Response> => {
  const key = request.url.split("?")[0] ?? request.url;
  try {
    const response = await fetch(request);
    if (response.ok) await (await caches.open(cacheName)).put(key, response.clone());
    return response;
  } catch (e) {
    const stored = await caches.match(key, { cacheName });
    if (stored !== undefined) return stored;
    throw e;
  }
};

const navigate = async (request: Request): Promise<Response> => {
  try {
    return await fetch(request);
  } catch (e) {
    const shell = await caches.match(at("index.html"), { cacheName: SHELL });
    if (shell !== undefined) return shell;
    throw e;
  }
};

/** Course files: content-addressed (a hash in the name) never change; the rest may. */
const MUTABLE = /(?:^bundles\/index\.json|\/manifest\.json)$/u;

self.addEventListener("fetch", (event) => {
  if (__NABU_DEV__) return; // the dev server's modules go straight to the network
  const request = event.request;
  if (request.method !== "GET") return;
  const path = pathOf(new URL(request.url));
  if (path === undefined || path === "sw.js") return;
  if (request.mode === "navigate") event.respondWith(navigate(request));
  else if (path.startsWith("bundles/")) event.respondWith(MUTABLE.test(path) ? networkFirst(request, BUNDLE_CACHE) : cacheFirst(request, BUNDLE_CACHE));
  else if (path === "game.json") event.respondWith(networkFirst(request, RUNTIME_CACHE));
  else if (__NABU_PRECACHE__.includes(path)) event.respondWith(caches.match(request.url, { cacheName: SHELL }).then((r) => r ?? fetch(request)));
  else if (path.startsWith("assets/")) event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});

/** Uploads the outbox with the saved account, then tells open windows. Throws to be retried. */
const backgroundUpload = async (): Promise<void> => {
  const db = await openDb();
  try {
    const account = (await readMeta(db, "account")) as Destination | undefined;
    if (account === undefined) return;
    const courses = await uploadOutbox(outboxOf(db), account);
    const message: SyncedMessage = { type: "nabu-synced", courses: [...courses] };
    for (const client of await self.clients.matchAll({ type: "window" })) client.postMessage(message);
  } finally {
    db.close();
  }
};

self.addEventListener("sync", (event) => {
  const sync = event as SyncEvent;
  if (sync.tag === OUTBOX_SYNC) sync.waitUntil(backgroundUpload());
});

interface Reminder {
  readonly title?: string;
  readonly body?: string;
  readonly lang?: string;
  readonly dir?: NotificationDirection;
  readonly tag?: string;
  readonly url?: string;
}

self.addEventListener("push", (event) => {
  const parse = (): Reminder => {
    try {
      return (event.data?.json() ?? {}) as Reminder;
    } catch {
      return {};
    }
  };
  const { title = "Nabu", body = "", lang, dir = "auto", tag = "nabu-reminder", url = "./" } = parse();
  event.waitUntil(self.registration.showNotification(title, { body, ...(lang === undefined ? {} : { lang }), dir, tag, data: { url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | null;
  const url = new URL(data?.url ?? "./", scope()).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => w.url.startsWith(scope()));
      if (open !== undefined) await open.focus();
      else await self.clients.openWindow(url);
    })(),
  );
});
