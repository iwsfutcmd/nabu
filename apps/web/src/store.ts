/**
 * The on-device event log (gameplan §1 decision 5, §12.4 local-first): an
 * append-only IndexedDB store of learner events, keyed by event id, so writing
 * an event twice changes nothing. Projections (memory, XP, the path) are
 * replayed from it by @nabu/core; nothing else is stored. Phase 4b uploads the
 * same events to the server.
 *
 * Where IndexedDB is unavailable (some private windows) the log lives in
 * memory for the page's lifetime and `persistent` is false, so the app can say
 * that progress will not be kept.
 */
import type { LearnerEvent } from "@nabu/schema";
import { uuidv7 } from "./clock.ts";

export interface EventStore {
  /** Random id of this installation, sent with every event. */
  readonly device: string;
  readonly persistent: boolean;
  readonly append: (events: readonly LearnerEvent[]) => Promise<void>;
  readonly eventsOf: (course: string) => Promise<readonly LearnerEvent[]>;
}

const DB_NAME = "nabu";
const DB_VERSION = 1;
const EVENTS = "events";
const META = "meta";

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
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { keyPath: "id" }).createIndex("course", "course");
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
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
    append: async (events) => {
      const tx = db.transaction(EVENTS, "readwrite");
      const store = tx.objectStore(EVENTS);
      for (const e of events) store.put(e);
      await done(tx);
    },
    eventsOf: async (course) => promised(db.transaction(EVENTS).objectStore(EVENTS).index("course").getAll(course)) as Promise<LearnerEvent[]>,
  };
};

const memoryStore = (): EventStore => {
  const log = new Map<string, LearnerEvent>();
  return {
    device: uuidv7(),
    persistent: false,
    append: (events) => {
      for (const e of events) log.set(e.id, e);
      return Promise.resolve();
    },
    eventsOf: (course) => Promise.resolve([...log.values()].filter((e) => e.course === course)),
  };
};

export const openStore = async (): Promise<EventStore> => {
  try {
    return await indexedStore();
  } catch {
    return memoryStore();
  }
};
