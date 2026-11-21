/**
 * The on-device event log (gameplan §1 decision 5, §14.2 local-first): an
 * append-only IndexedDB store of learner events, keyed by event id, so writing
 * an event twice changes nothing. Projections (memory, XP, the path) are
 * replayed from it by @nabu/core; nothing derived is stored.
 *
 * The outbox holds the ids of events the server has not acknowledged. Every
 * event recorded on this device enters it, account or not, so signing up later
 * uploads the whole history as an ordinary sync, and a queue that could not be
 * sent survives reloads. Events pulled from the server skip it. Events the
 * server rejected leave it and are set aside (`held`), still in the log. A
 * new account takes the whole log: signing up puts every event back in it,
 * what an earlier account acknowledged too (ADR 0123).
 *
 * Where IndexedDB is unavailable (some private windows) everything lives in
 * memory for the page's lifetime and `persistent` is false, so the app can say
 * that progress will not be kept.
 */
import { compareEvents, isStart } from "@nabu/core/learner";
import type { LearnerEvent, LearnerEventV1 } from "@nabu/schema";
import { uuidv7 } from "./clock.ts";
import { BEFORE, done, EVENTS, heldOf, META, openDb, OUTBOX, outboxOf, persist, persisted, promised, RECEIVED, receivedTimes, releaseHeld, requeueLog, type Held } from "./idb.ts";
import type { SetAside } from "./outbox.ts";

export interface EventStore {
  /** Random id of this installation, sent with every event. */
  readonly device: string;
  /** The log outlives the page (IndexedDB); false in memory (some private windows). */
  readonly persistent: boolean;
  /**
   * Whether the browser has promised to keep the log under storage pressure (it was asked when the
   * store opened): without that, a browser may clear it to free space or after weeks unvisited.
   */
  readonly durable: () => Promise<boolean>;
  /**
   * Events recorded here (`synced` false: they enter the outbox) or pulled from the server, with
   * when the server received them (`received`, by id). Returns the ids that were new.
   */
  readonly append: (events: readonly LearnerEvent[], options?: { readonly synced?: boolean; readonly received?: Readonly<Record<string, string>> }) => Promise<readonly string[]>;
  /**
   * A course's events, and the whole log: those of the new shape. An event of before the lexical
   * model is rewritten when the app starts (upgrade-log.ts); one that was not (the rewrite failed)
   * is in the log and in no reader's hands until it is.
   */
  readonly eventsOf: (course: string) => Promise<readonly LearnerEvent[]>;
  readonly allEvents: () => Promise<readonly LearnerEvent[]>;
  /** Every event in the log, whatever its shape: what the rewrite reads. */
  readonly everyEvent: () => Promise<readonly (LearnerEvent | LearnerEventV1)[]>;
  /**
   * Writes events over those of the same ids (the log's one rewrite: upgrade-log.ts), and keeps
   * `before`, the events as they were, aside. Nothing else changes: the outbox, the receipt times
   * and what is set aside go by id.
   */
  readonly rewrite: (events: readonly LearnerEvent[], before: readonly LearnerEventV1[]) => Promise<void>;
  /** The events kept aside by a rewrite, as they were. */
  readonly before: () => Promise<readonly LearnerEventV1[]>;
  /**
   * Each course's latest start (a session begun, or the course started over; @nabu/core `isStart`),
   * for where the learner left off (S1). Each course's events are read back from its newest, so
   * Home never reads the whole log for it: ids are UUIDv7, so key order is the order the events
   * were made in (as the outbox counts on too).
   */
  readonly latestStarts: () => Promise<readonly LearnerEvent[]>;
  /** The ids of every event in the log (keys only: cheaper than reading the events). */
  readonly ids: () => Promise<ReadonlySet<string>>;
  /** The oldest events the server has not acknowledged, up to `limit`. */
  readonly pending: (limit: number) => Promise<readonly LearnerEvent[]>;
  readonly pendingCount: () => Promise<number>;
  /** The ids of the events the server has not acknowledged (keys only). */
  readonly pendingIds: () => Promise<ReadonlySet<string>>;
  /** The server has these events; `received` says when it first got each. */
  readonly acknowledge: (ids: readonly string[], received?: Readonly<Record<string, string>>) => Promise<void>;
  /** The server rejected these events (outbox.ts): they leave the outbox and are set aside, kept in the log. */
  readonly setAside: (events: readonly SetAside[]) => Promise<void>;
  /** The events set aside, by id: why the server rejected each, and when. */
  readonly held: () => Promise<Held>;
  /** Puts the events set aside back into the outbox, to be sent again; returns how many. */
  readonly releaseHeld: () => Promise<number>;
  /**
   * Puts every event of the log into the outbox, none set aside: a new account takes the device's
   * whole history, what another account acknowledged too (ADR 0123). Returns how many.
   */
  readonly requeue: () => Promise<number>;
  /** When the server received each synced event: the game folds it in as the server does (§12.2). */
  readonly receivedTimes: () => Promise<ReadonlyMap<string, string>>;
  readonly getMeta: (key: string) => Promise<unknown>;
  readonly setMeta: (key: string, value: unknown) => Promise<void>;
  readonly deleteMeta: (key: string) => Promise<void>;
}

/** The events of the new shape (schema 2) among these. */
const newShape = (events: readonly (LearnerEvent | LearnerEventV1)[]): LearnerEvent[] => events.filter((e): e is LearnerEvent => e.schema === 2);

/** Walks a cursor while `step` says to go on; resolves when it stops or runs out. */
const walk = <C extends IDBCursor>(request: IDBRequest<C | null>, step: (cursor: C) => boolean): Promise<void> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor === null || !step(cursor)) resolve();
      else cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("IndexedDB cursor failed"));
  });

/** Each course in the log, then its events from the newest back to its latest start (S1). */
const latestStartsOf = async (db: IDBDatabase): Promise<LearnerEvent[]> => {
  const byCourse = db.transaction(EVENTS).objectStore(EVENTS).index("course");
  const courses: IDBValidKey[] = [];
  await walk(byCourse.openKeyCursor(null, "nextunique"), (c) => {
    courses.push(c.key);
    return true;
  });
  const starts: LearnerEvent[] = [];
  for (const course of courses) {
    await walk(byCourse.openCursor(IDBKeyRange.only(course), "prev"), (c) => {
      const event = c.value as LearnerEvent;
      if (!isStart(event)) return true;
      starts.push(event);
      return false;
    });
  }
  return starts;
};

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
  const outbox = outboxOf(db);
  // Ask the browser not to evict the log under storage pressure; it may say no.
  const asked = persist().then(async (granted) => granted || (await persisted()));
  return {
    device,
    persistent: true,
    durable: () => asked,
    append: async (events, options = {}) => {
      const tx = db.transaction([EVENTS, OUTBOX, RECEIVED], "readwrite");
      const store = tx.objectStore(EVENTS);
      const outbox = tx.objectStore(OUTBOX);
      const fresh: string[] = [];
      for (const e of events) {
        const at = options.received?.[e.id];
        if (at !== undefined) tx.objectStore(RECEIVED).put(at, e.id);
        const key = await promised(store.getKey(e.id));
        if (key !== undefined) continue;
        fresh.push(e.id);
        store.put(e);
        if (options.synced !== true) outbox.put(e.id, e.id);
      }
      await done(tx);
      return fresh;
    },
    eventsOf: async (course) => newShape((await promised(db.transaction(EVENTS).objectStore(EVENTS).index("course").getAll(course))) as (LearnerEvent | LearnerEventV1)[]),
    allEvents: async () => newShape((await promised(db.transaction(EVENTS).objectStore(EVENTS).getAll())) as (LearnerEvent | LearnerEventV1)[]),
    everyEvent: async () => promised(db.transaction(EVENTS).objectStore(EVENTS).getAll()) as Promise<(LearnerEvent | LearnerEventV1)[]>,
    rewrite: async (events, before) => {
      const tx = db.transaction([EVENTS, BEFORE], "readwrite");
      for (const e of before) tx.objectStore(BEFORE).put(e);
      for (const e of events) tx.objectStore(EVENTS).put(e);
      await done(tx);
    },
    before: async () => promised(db.transaction(BEFORE).objectStore(BEFORE).getAll()) as Promise<LearnerEventV1[]>,
    latestStarts: () => latestStartsOf(db),
    ids: async () => new Set((await promised(db.transaction(EVENTS).objectStore(EVENTS).getAllKeys())) as string[]),
    pending: outbox.pending,
    pendingCount: async () => promised(db.transaction(OUTBOX).objectStore(OUTBOX).count()),
    pendingIds: async () => new Set((await promised(db.transaction(OUTBOX).objectStore(OUTBOX).getAllKeys())) as string[]),
    acknowledge: outbox.acknowledge,
    setAside: outbox.setAside,
    held: () => heldOf(db),
    releaseHeld: () => releaseHeld(db),
    requeue: () => requeueLog(db),
    receivedTimes: () => receivedTimes(db),
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
  const log = new Map<string, LearnerEvent | LearnerEventV1>();
  const outbox = new Set<string>();
  const received = new Map<string, string>();
  const meta = new Map<string, unknown>();
  const held = new Map<string, { code: string; at: string }>();
  const before = new Map<string, LearnerEventV1>();
  const receive = (times: Readonly<Record<string, string>> = {}): void => {
    for (const [id, at] of Object.entries(times)) received.set(id, at);
  };
  return {
    device: uuidv7(),
    persistent: false,
    durable: () => Promise.resolve(false),
    append: (events, options = {}) => {
      receive(options.received);
      const fresh = events.filter((e) => !log.has(e.id));
      for (const e of fresh) {
        log.set(e.id, e);
        if (options.synced !== true) outbox.add(e.id);
      }
      return Promise.resolve(fresh.map((e) => e.id));
    },
    // The account's own events (the weekly goal) are no course's, as the browser's course index leaves them out.
    eventsOf: (course) => Promise.resolve(newShape([...log.values()]).filter((e) => e.type !== "goal_set" && e.course === course)),
    allEvents: () => Promise.resolve(newShape([...log.values()])),
    everyEvent: () => Promise.resolve([...log.values()]),
    rewrite: (events, kept) => {
      for (const e of kept) before.set(e.id, e);
      for (const e of events) log.set(e.id, e);
      return Promise.resolve();
    },
    before: () => Promise.resolve([...before.values()]),
    latestStarts: () => {
      const latest = new Map<string, LearnerEvent>();
      for (const e of newShape([...log.values()])) {
        if (!isStart(e)) continue;
        const seen = latest.get(e.course);
        if (seen === undefined || compareEvents(seen, e) < 0) latest.set(e.course, e);
      }
      return Promise.resolve([...latest.values()]);
    },
    ids: () => Promise.resolve(new Set(log.keys())),
    // As in IndexedDB, the outbox gives an event as the log holds it; an upload stops at one of the old shape (outbox.ts).
    pending: (limit) => Promise.resolve([...outbox].sort().slice(0, limit).flatMap((id) => (log.get(id) as LearnerEvent | undefined) ?? [])),
    pendingCount: () => Promise.resolve(outbox.size),
    pendingIds: () => Promise.resolve(new Set(outbox)),
    acknowledge: (ids, times) => {
      for (const id of ids) outbox.delete(id);
      receive(times);
      return Promise.resolve();
    },
    setAside: (events) => {
      const at = new Date().toISOString();
      for (const e of events) {
        outbox.delete(e.id);
        held.set(e.id, { code: e.code, at });
      }
      return Promise.resolve();
    },
    held: () => Promise.resolve(Object.fromEntries(held)),
    releaseHeld: () => {
      const back = [...held.keys()].filter((id) => log.has(id));
      for (const id of back) outbox.add(id);
      held.clear();
      return Promise.resolve(back.length);
    },
    requeue: () => {
      for (const id of log.keys()) outbox.add(id);
      held.clear();
      return Promise.resolve(log.size);
    },
    receivedTimes: () => Promise.resolve(new Map(received)),
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
