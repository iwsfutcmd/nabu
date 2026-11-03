/**
 * The on-device event log (gameplan §1 decision 5, §14.2 local-first): an
 * append-only IndexedDB store of learner events, keyed by event id, so writing
 * an event twice changes nothing. Projections (memory, XP, the path) are
 * replayed from it by @nabu/core; nothing derived is stored.
 *
 * The outbox holds the ids of events the server has not acknowledged. Every
 * event recorded on this device enters it, account or not, so signing up later
 * uploads the whole history as an ordinary sync, and a queue that could not be
 * sent survives reloads. Events pulled from the server skip it.
 *
 * Where IndexedDB is unavailable (some private windows) everything lives in
 * memory for the page's lifetime and `persistent` is false, so the app can say
 * that progress will not be kept.
 */
import type { LearnerEvent } from "@nabu/schema";
import { uuidv7 } from "./clock.ts";

export interface EventStore {
  /** Random id of this installation, sent with every event. */
  readonly device: string;
  readonly persistent: boolean;
  /** Events recorded here (`synced` false: they enter the outbox) or pulled from the server. Returns the ids that were new. */
  readonly append: (events: readonly LearnerEvent[], options?: { readonly synced?: boolean }) => Promise<readonly string[]>;
  readonly eventsOf: (course: string) => Promise<readonly LearnerEvent[]>;
  readonly allEvents: () => Promise<readonly LearnerEvent[]>;
  /** The oldest events the server has not acknowledged, up to `limit`. */
  readonly pending: (limit: number) => Promise<readonly LearnerEvent[]>;
  readonly pendingCount: () => Promise<number>;
  readonly acknowledge: (ids: readonly string[]) => Promise<void>;
  readonly getMeta: (key: string) => Promise<unknown>;
  readonly setMeta: (key: string, value: unknown) => Promise<void>;
  readonly deleteMeta: (key: string) => Promise<void>;
}

const DB_NAME = "nabu";
const DB_VERSION = 2;
const EVENTS = "events";
const META = "meta";
const OUTBOX = "outbox";

const promised = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { keyPath: "id" }).createIndex("course", "course");
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(OUTBOX)) {
        const outbox = db.createObjectStore(OUTBOX);
        // Version 1 had no outbox and no accounts: nothing it recorded has been uploaded.
        if (e.oldVersion >= 1) {
          const cursor = request.transaction?.objectStore(EVENTS).openKeyCursor();
          if (cursor !== undefined)
            cursor.onsuccess = () => {
              const c = cursor.result;
              if (c === null) return;
              outbox.put(c.primaryKey, c.primaryKey);
              c.continue();
            };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });

const deviceId = async (db: IDBDatabase): Promise<string> => {
  const tx = db.transaction(META, "readwrite");
  const meta = tx.objectStore(META);
  const existing: unknown = await promised(meta.get("device"));
  if (typeof existing === "string") return existing;
  const id = uuidv7();
  meta.put(id, "device");
  await done(tx);
  return id;
};

const indexedStore = async (): Promise<EventStore> => {
  const db = await openDb();
  const device = await deviceId(db);
  // Ask the browser not to evict the log under storage pressure; it may say no.
  void navigator.storage?.persist?.().catch(() => false);
  return {
    device,
    persistent: true,
    append: async (events, options = {}) => {
      const tx = db.transaction([EVENTS, OUTBOX], "readwrite");
      const store = tx.objectStore(EVENTS);
      const outbox = tx.objectStore(OUTBOX);
      const fresh: string[] = [];
      for (const e of events) {
        const key = await promised(store.getKey(e.id));
        if (key !== undefined) continue;
        fresh.push(e.id);
        store.put(e);
        if (options.synced !== true) outbox.put(e.id, e.id);
      }
      await done(tx);
      return fresh;
    },
    eventsOf: async (course) => promised(db.transaction(EVENTS).objectStore(EVENTS).index("course").getAll(course)) as Promise<LearnerEvent[]>,
    allEvents: async () => promised(db.transaction(EVENTS).objectStore(EVENTS).getAll()) as Promise<LearnerEvent[]>,
    pending: async (limit) => {
      const tx = db.transaction([OUTBOX, EVENTS]);
      // Ids are UUIDv7: key order is time order, so the oldest go first.
      const ids = (await promised(tx.objectStore(OUTBOX).getAllKeys(null, limit))) as string[];
      const events = await Promise.all(ids.map((id) => promised(tx.objectStore(EVENTS).get(id)) as Promise<LearnerEvent | undefined>));
      return events.filter((e): e is LearnerEvent => e !== undefined);
    },
    pendingCount: async () => promised(db.transaction(OUTBOX).objectStore(OUTBOX).count()),
    acknowledge: async (ids) => {
      const tx = db.transaction(OUTBOX, "readwrite");
      for (const id of ids) tx.objectStore(OUTBOX).delete(id);
      await done(tx);
    },
    getMeta: async (key) => promised(db.transaction(META).objectStore(META).get(key)) as Promise<unknown>,
    setMeta: async (key, value) => {
      const tx = db.transaction(META, "readwrite");
      tx.objectStore(META).put(value, key);
      await done(tx);
    },
    deleteMeta: async (key) => {
      const tx = db.transaction(META, "readwrite");
      tx.objectStore(META).delete(key);
      await done(tx);
    },
  };
};

const memoryStore = (): EventStore => {
  const log = new Map<string, LearnerEvent>();
  const outbox = new Set<string>();
  const meta = new Map<string, unknown>();
  return {
    device: uuidv7(),
    persistent: false,
    append: (events, options = {}) => {
      const fresh = events.filter((e) => !log.has(e.id));
      for (const e of fresh) {
        log.set(e.id, e);
        if (options.synced !== true) outbox.add(e.id);
      }
      return Promise.resolve(fresh.map((e) => e.id));
    },
    eventsOf: (course) => Promise.resolve([...log.values()].filter((e) => e.course === course)),
    allEvents: () => Promise.resolve([...log.values()]),
    pending: (limit) => Promise.resolve([...outbox].sort().slice(0, limit).flatMap((id) => log.get(id) ?? [])),
    pendingCount: () => Promise.resolve(outbox.size),
    acknowledge: (ids) => {
      for (const id of ids) outbox.delete(id);
      return Promise.resolve();
    },
    getMeta: (key) => Promise.resolve(meta.get(key)),
    setMeta: (key, value) => {
      meta.set(key, value);
      return Promise.resolve();
    },
    deleteMeta: (key) => {
      meta.delete(key);
      return Promise.resolve();
    },
  };
};

export const openStore = async (): Promise<EventStore> => {
  try {
    return await indexedStore();
  } catch {
    return memoryStore();
  }
};
