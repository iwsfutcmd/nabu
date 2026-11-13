/**
 * Sync passes (ADR 0112): a pull never brings back what the device itself uploaded, and the check of
 * the server's projections against the device's runs after signing in, then once a local day with
 * something new, not after every answer. Runs on the in-memory store (Node has no IndexedDB), with a
 * stand-in server at fetch that keeps a log by receipt order and projects it with core, as the API
 * does.
 */
import { DEFAULT_GAME, replayGame } from "@nabu/core/game";
import { replay } from "@nabu/core/learner";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckAnswer, CheckOrder } from "../../src/check.ts";
import { openStore, type EventStore } from "../../src/store.ts";
import { createSync } from "../../src/sync.ts";

const SERVER = "https://nabu.invalid";
const USER = "00000000-0000-7000-8000-00000000a11c";
const DAY = 86_400_000;

const event = (n: number, at: string, course = "fa"): LearnerEvent => ({
  id: `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  type: "session_started",
  schema: 1,
  device: "unit",
  course,
  orthography: "fa-Arab/standard" as OrthographyId,
  support: "en",
  bundle: "0".repeat(64),
  session: "00000000-0000-7000-9000-000000000001",
  clientTime: at,
  localDate: at.slice(0, 10),
  tz: "UTC",
  mode: "review",
  seed: 1,
  exercises: 5,
  planner: "unit",
});

/**
 * A stand-in for the API: the user's log in receipt order, and every request the device made. One
 * account at a time: deleting it empties the log, and a session the server `end`s answers 401.
 */
const server = () => {
  const log: { seq: number; event: LearnerEvent; received: string }[] = [];
  const requests: string[] = [];
  /** How many events each upload carried. */
  const uploads: number[] = [];
  let seq = 100;
  let session = true;
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const take = (events: readonly LearnerEvent[]): void => {
    for (const e of events) if (!log.some((r) => r.event.id === e.id)) log.push({ seq: ++seq, event: e, received: new Date().toISOString() });
  };
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? "GET";
    requests.push(`${method} ${pathname}`);
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as { events?: LearnerEvent[]; since?: number; password?: string }) : {};
    const received = (ids: readonly string[]): Record<string, string> => Object.fromEntries(log.filter((r) => ids.includes(r.event.id)).map((r) => [r.event.id, r.received]));
    if (pathname === "/v1/auth/sign-up" || pathname === "/v1/auth/sign-in") {
      session = true;
      return Promise.resolve(json({ user: { id: USER, email: "a@example.org" }, token: "token" }, pathname === "/v1/auth/sign-up" ? 201 : 200));
    }
    if (!session) return Promise.resolve(json({ error: "unauthorized" }, 401));
    if (pathname === "/v1/auth/sign-out") {
      session = false;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (pathname === "/v1/account" && method === "DELETE") {
      log.length = 0;
      session = false;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (pathname === "/v1/events" && method === "POST") {
      const events = body.events ?? [];
      uploads.push(events.length);
      take(events);
      const ids = events.map((e) => e.id);
      const cursor = log.at(-1)?.seq ?? 0;
      const others = body.since === undefined || log.some((r) => r.seq > (body.since ?? 0) && !ids.includes(r.event.id));
      return Promise.resolve(json({ accepted: events.length, duplicates: 0, cursor, received: received(ids), refused: 0, rejected: [], ...(others ? {} : { caughtUp: cursor }) }));
    }
    if (pathname === "/v1/events") {
      const since = Number(searchParams.get("since"));
      const page = log.filter((r) => r.seq > since);
      return Promise.resolve(json({ events: page.map((r) => r.event), cursor: page.at(-1)?.seq ?? since, more: false, received: received(page.map((r) => r.event.id)) }));
    }
    if (pathname === "/v1/state") {
      const course = searchParams.get("course");
      return Promise.resolve(json({ state: replay(log.map((r) => r.event).filter((e) => e.type !== "goal_set" && e.course === course)) }));
    }
    if (pathname === "/v1/game") {
      const clock = { today: searchParams.get("today") ?? "", now: searchParams.get("now") ?? "" };
      return Promise.resolve(json({ game: replayGame(log.map((r) => ({ event: r.event, receivedAt: r.received })), DEFAULT_GAME, clock) }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  return {
    requests,
    uploads,
    /** The ids of the account's log, in receipt order. */
    ids: () => log.map((r) => r.event.id),
    /** The server ends the device's session (it expired, or the account was deleted elsewhere). */
    end: () => {
      session = false;
    },
    /** Another device's upload. */
    take,
    /** The requests made since the last call. */
    since: (() => {
      let read = 0;
      return () => {
        const out = requests.slice(read);
        read = requests.length;
        return out;
      };
    })(),
  };
};

const options = { gameConfig: () => Promise.resolve(DEFAULT_GAME) };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00.000Z"));
  vi.stubGlobal("window", { addEventListener: () => undefined });
  vi.stubGlobal("document", { addEventListener: () => undefined, visibilityState: "visible" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const deviceWith = async (events: readonly LearnerEvent[]): Promise<EventStore> => {
  const store = await openStore();
  expect(store.persistent).toBe(false); // the in-memory store
  await store.append(events);
  return store;
};

describe("sync passes (ADR 0112)", () => {
  it("signing up uploads the history once: nothing comes back, and the check runs", async () => {
    const remote = server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z"), event(2, "2026-11-11T09:01:00.000Z", "es")]);
    const sync = await createSync(store, SERVER, options);
    expect(await sync.signUp("a@example.org", "a long password")).toBeUndefined();
    const passes = remote.since();
    expect(passes).toEqual(["POST /v1/auth/sign-up", "GET /v1/events", "POST /v1/events", "GET /v1/state", "GET /v1/state", "GET /v1/game"]);
    expect(sync.get()).toMatchObject({ pending: 0, verified: true, pulled: 0 });
  });

  it("a pass after an answer uploads it and pulls nothing back; the day's check has run", async () => {
    const remote = server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    remote.since();
    await store.append([event(3, "2026-11-12T11:59:00.000Z"), event(4, "2026-11-12T11:59:30.000Z")]);
    await sync.syncNow();
    expect(remote.since()).toEqual(["GET /v1/events", "POST /v1/events"]);
    // The pull after it starts past the device's own events: the server sends nothing back.
    await sync.syncNow();
    expect(remote.since()).toEqual(["GET /v1/events"]);
    expect(sync.get()).toMatchObject({ pending: 0, verified: true, pulled: 0 });
  });

  it("another device's events come down; the next day's first pass checks what changed", async () => {
    const remote = server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    remote.since();
    // Another device uploads: the next pass pulls it down, and checks nothing yet (checked today).
    remote.take([event(5, "2026-11-12T11:00:00.000Z", "es")]);
    await sync.syncNow();
    expect(remote.since()).toEqual(["GET /v1/events"]);
    expect((await store.eventsOf("es")).map((e) => e.id)).toEqual([event(5, "").id]);
    expect(sync.get().pulled).toBe(1);
    // The next day, the first pass checks the course that changed, and the game state.
    vi.setSystemTime(Date.now() + DAY);
    await sync.syncNow();
    expect(remote.since()).toEqual(["GET /v1/events", "GET /v1/state", "GET /v1/game"]);
    expect(sync.get().verified).toBe(true);
    // Nothing new since: later passes that day, and the day after, check nothing.
    await sync.syncNow();
    vi.setSystemTime(Date.now() + DAY);
    await sync.syncNow();
    expect(remote.since()).toEqual(["GET /v1/events", "GET /v1/events"]);
  });

  it("keeps the verdict for the account across a reload, and forgets it on sign-out", async () => {
    server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    expect(sync.get().verified).toBe(true);
    const again = await createSync(store, SERVER, options);
    expect(again.get().verified).toBe(true);
    await again.signOut();
    expect(again.get().verified).toBeUndefined();
    expect((await createSync(store, SERVER, options)).get().verified).toBeUndefined();
  });
});

describe("signed out by the server (ADR 0123)", () => {
  const who = { server: SERVER, email: "a@example.org" };

  it("forgets the session, says who across a reload, and keeps what is recorded meanwhile for the next sign-in", async () => {
    const remote = server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    // The session expires (or the account is deleted on another device); the learner keeps going.
    remote.end();
    const meanwhile = event(2, "2026-11-12T11:00:00.000Z");
    await store.append([meanwhile]);
    await sync.syncNow();
    expect(sync.get()).toMatchObject({ account: undefined, phase: "idle", error: undefined, verified: undefined, signedOut: who });
    expect(await store.pendingCount()).toBe(1);
    const reloaded = await createSync(store, SERVER, options);
    expect(reloaded.get()).toMatchObject({ account: undefined, signedOut: who });
    // Signing in again forgets it, and sends what was recorded meanwhile.
    expect(await reloaded.signIn("a@example.org", "a long password")).toBeUndefined();
    expect(reloaded.get()).toMatchObject({ signedOut: undefined, pending: 0, verified: true });
    expect(remote.ids()).toContain(meanwhile.id);
    expect((await createSync(store, SERVER, options)).get().signedOut).toBeUndefined();
  });

  it("staying signed out forgets who it was; signing out by choice remembers no one", async () => {
    const remote = server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    remote.end();
    await sync.syncNow();
    expect(sync.get().signedOut).toEqual(who);
    await sync.staySignedOut();
    expect(sync.get().signedOut).toBeUndefined();
    expect((await createSync(store, SERVER, options)).get().signedOut).toBeUndefined();
    await sync.signIn("a@example.org", "a long password");
    await sync.signOut();
    expect(sync.get()).toMatchObject({ account: undefined, signedOut: undefined });
  });

  it("an ended session found by the account's download or deletion signs out the same way", async () => {
    const remote = server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    remote.end();
    expect(await sync.exportAccount()).toEqual({ ok: false, error: "signed-out" });
    expect(sync.get()).toMatchObject({ account: undefined, signedOut: who });
    await sync.signIn("a@example.org", "a long password");
    remote.end();
    expect(await sync.deleteAccount("a long password")).toBe("signed-out");
    expect(sync.get()).toMatchObject({ account: undefined, signedOut: who });
  });

  it("says nothing of a sign-out by another server than this build's", async () => {
    const remote = server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    remote.end();
    await sync.syncNow();
    expect((await createSync(store, "https://elsewhere.invalid", options)).get()).toMatchObject({ server: "https://elsewhere.invalid", signedOut: undefined });
  });
});

describe("no network is not a server that does not answer (ADR 0123)", () => {
  /** A request that gets no answer, as a browser's fetch fails: with a TypeError. */
  const noAnswer = (): void => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
  };
  const online = (onLine: boolean): void => {
    vi.stubGlobal("navigator", { onLine });
  };

  it("signing in says which: offline, or a server that does not answer (a proxy's 502 to 504 too)", async () => {
    const sync = await createSync(await deviceWith([]), SERVER, options);
    noAnswer();
    online(false);
    expect(await sync.signIn("a@example.org", "a long password")).toBe("offline");
    online(true);
    expect(await sync.signIn("a@example.org", "a long password")).toBe("unreachable");
    for (const status of [502, 503, 504]) {
      vi.stubGlobal("fetch", () => Promise.resolve(new Response("<html>Bad gateway</html>", { status })));
      expect(await sync.signIn("a@example.org", "a long password")).toBe("unreachable");
    }
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 500 })));
    expect(await sync.signIn("a@example.org", "a long password")).toBe("unknown");
  });

  it("a pass says which, and the outbox waits either way", async () => {
    server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    await store.append([event(2, "2026-11-12T11:00:00.000Z")]);
    noAnswer();
    online(false);
    await sync.syncNow();
    expect(sync.get()).toMatchObject({ phase: "offline", error: "offline", pending: 1 });
    online(true);
    await sync.syncNow();
    expect(sync.get()).toMatchObject({ phase: "unreachable", error: "unreachable", pending: 1 });
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 503 })));
    await sync.syncNow();
    expect(sync.get()).toMatchObject({ phase: "unreachable", pending: 1 });
    expect(sync.get().account?.user.email).toBe("a@example.org");
  });
});

describe("the account the device enters (ADR 0123)", () => {
  it("a new account after a deletion takes the device's whole log, not only what was recorded since", async () => {
    const remote = server();
    const history = [event(1, "2026-11-11T09:00:00.000Z"), event(2, "2026-11-11T09:01:00.000Z", "es")];
    const store = await deviceWith(history);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    expect(remote.ids()).toEqual(history.map((e) => e.id));
    expect(await sync.deleteAccount("a long password")).toBeUndefined();
    expect(remote.ids()).toEqual([]);
    // The device keeps its log, all of it acknowledged by the account that went.
    expect(await store.pendingCount()).toBe(0);
    const since = event(3, "2026-11-12T11:00:00.000Z");
    await store.append([since]);
    remote.since();
    expect(await sync.signUp("a@example.org", "a long password")).toBeUndefined();
    expect(remote.ids()).toEqual([...history, since].map((e) => e.id));
    expect(sync.get()).toMatchObject({ pending: 0, held: 0, verified: true });
  });

  it("signing in sends the outbox only: what the account already has stays acknowledged", async () => {
    const remote = server();
    const store = await deviceWith([event(1, "2026-11-11T09:00:00.000Z"), event(2, "2026-11-11T09:01:00.000Z")]);
    const sync = await createSync(store, SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    await sync.signOut();
    await store.append([event(3, "2026-11-12T11:00:00.000Z")]);
    remote.uploads.length = 0;
    expect(await sync.signIn("a@example.org", "a long password")).toBeUndefined();
    expect(remote.uploads).toEqual([1]);
    expect(sync.get()).toMatchObject({ pending: 0, verified: true });
  });

  it("signing up sends what the last account set aside again, with the rest", async () => {
    const remote = server();
    const history = [event(1, "2026-11-11T09:00:00.000Z"), event(2, "2026-11-11T09:01:00.000Z")];
    const store = await deviceWith(history);
    const sync = await createSync(store, SERVER, options);
    await store.setAside([{ id: event(2, "").id, code: "invalid-event" }]);
    await sync.signUp("a@example.org", "a long password");
    expect(remote.ids()).toEqual(history.map((e) => e.id));
    expect(sync.get()).toMatchObject({ pending: 0, held: 0 });
    expect(await store.held()).toEqual({});
  });
});

describe("the check in a worker (ADR 0112)", () => {
  /** A stand-in for the browser's Worker: answers each order with `answer`, as check-worker.ts does. */
  const workerAnswering = (answer: CheckAnswer | "fails to start") => {
    const orders: CheckOrder[] = [];
    vi.stubGlobal(
      "Worker",
      class {
        onmessage: ((e: { data: CheckAnswer }) => void) | null = null;
        onerror: ((e: { message: string }) => void) | null = null;
        postMessage(order: CheckOrder): void {
          orders.push(order);
          queueMicrotask(() => (answer === "fails to start" ? this.onerror?.({ message: "no worker here" }) : this.onmessage?.({ data: answer })));
        }
        terminate(): void {}
      },
    );
    return orders;
  };
  /** The in-memory log, as IndexedDB would hold it: where the app hands the check to a worker. */
  const persistent = async (): Promise<EventStore> => ({ ...(await deviceWith([event(1, "2026-11-11T09:00:00.000Z")])), persistent: true });

  it("takes the worker's verdict; the page replays nothing", async () => {
    const remote = server();
    const orders = workerAnswering({ verified: false });
    const sync = await createSync(await persistent(), SERVER, options);
    await sync.signUp("a@example.org", "a long password");
    expect(sync.get().verified).toBe(false);
    expect(orders).toMatchObject([{ server: SERVER, token: "token", courses: ["fa"], gameConfig: DEFAULT_GAME }]);
    expect(remote.since()).not.toContain("GET /v1/state");
  });

  it("checks on the page where the worker cannot read the log or cannot start", async () => {
    for (const answer of [{ unavailable: true } as const, "fails to start" as const]) {
      const remote = server();
      workerAnswering(answer);
      const sync = await createSync(await persistent(), SERVER, options);
      await sync.signUp("a@example.org", "a long password");
      expect(sync.get().verified).toBe(true);
      expect(remote.since()).toContain("GET /v1/state");
    }
  });

  it("a check that failed in the worker fails the pass as it would on the page", async () => {
    server();
    workerAnswering({ failed: { network: true } });
    // The page is online (Node's navigator says nothing of a network): the server did not answer.
    const unreachable = await createSync(await persistent(), SERVER, options);
    await unreachable.signUp("a@example.org", "a long password");
    expect(unreachable.get()).toMatchObject({ phase: "unreachable", error: "unreachable", verified: undefined });
    workerAnswering({ failed: { status: 401, code: "unauthorized" } });
    const signedOut = await createSync(await persistent(), SERVER, options);
    await signedOut.signUp("a@example.org", "a long password");
    expect(signedOut.get()).toMatchObject({ account: undefined, signedOut: { server: SERVER, email: "a@example.org" } });
  });
});
