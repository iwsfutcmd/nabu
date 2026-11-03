/**
 * The on-device database (IndexedDB "nabu"): the event log, the outbox, when the server received
 * each synced event (the streak's grace window counts from there, §12.2) and settings. Shared by the
 * app (store.ts) and its service worker, which reads the outbox and the account to upload in the
 * background (Phase 10), so nothing here touches the window.
 */
import type { LearnerEvent } from "@nabu/schema";
import type { Outbox } from "./outbox.ts";

export const DB_NAME = "nabu";
export const DB_VERSION = 3;
export const EVENTS = "events";
export const META = "meta";
export const OUTBOX = "outbox";
/** Event id → when the server first received it (ISO). */
export const RECEIVED = "received";

export const promised = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

export const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });

export const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { keyPath: "id" }).createIndex("course", "course");
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(RECEIVED)) {
        db.createObjectStore(RECEIVED);
        // Before version 3 receipt times were not kept: pull everything again to learn them.
        if (e.oldVersion >= 2) request.transaction?.objectStore(META).delete("cursor");
      }
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

/** The outbox as the service worker sees it: the oldest unacknowledged events first. */
export const outboxOf = (db: IDBDatabase): Outbox => ({
  pending: async (limit) => {
    const tx = db.transaction([OUTBOX, EVENTS]);
    // Ids are UUIDv7: key order is time order, so the oldest go first.
    const ids = (await promised(tx.objectStore(OUTBOX).getAllKeys(null, limit))) as string[];
    const events = await Promise.all(ids.map((id) => promised(tx.objectStore(EVENTS).get(id)) as Promise<LearnerEvent | undefined>));
    return events.filter((e): e is LearnerEvent => e !== undefined);
  },
  acknowledge: async (ids, received = {}) => {
    const tx = db.transaction([OUTBOX, RECEIVED], "readwrite");
    for (const id of ids) {
      tx.objectStore(OUTBOX).delete(id);
      const at = received[id];
      if (at !== undefined) tx.objectStore(RECEIVED).put(at, id);
    }
    await done(tx);
  },
});

/** When the server received each synced event (ids it has not acknowledged are absent). */
export const receivedTimes = async (db: IDBDatabase): Promise<ReadonlyMap<string, string>> => {
  const tx = db.transaction(RECEIVED);
  const [keys, values] = await Promise.all([promised(tx.objectStore(RECEIVED).getAllKeys()), promised(tx.objectStore(RECEIVED).getAll())]);
  return new Map(keys.map((k, i) => [k as string, values[i] as string]));
};

export const readMeta = async (db: IDBDatabase, key: string): Promise<unknown> => promised(db.transaction(META).objectStore(META).get(key)) as Promise<unknown>;

/** Asks the browser not to evict site data under storage pressure (windows only; it may say no). */
export const persist = async (): Promise<boolean> => {
  const storage = (globalThis.navigator as { storage?: { persist?: () => Promise<boolean> } } | undefined)?.storage;
  return (await storage?.persist?.().catch(() => false)) ?? false;
};
