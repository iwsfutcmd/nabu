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

/** A stand-in for the API: the user's log in receipt order, and every request the device made. */
const server = () => {
  const log: { seq: number; event: LearnerEvent; received: string }[] = [];
  const requests: string[] = [];
  let seq = 100;
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const take = (events: readonly LearnerEvent[]): void => {
    for (const e of events) if (!log.some((r) => r.event.id === e.id)) log.push({ seq: ++seq, event: e, received: new Date().toISOString() });
  };
  vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method ?? "GET";
    requests.push(`${method} ${pathname}`);
    const body = typeof init.body === "string" ? (JSON.parse(init.body) as { events?: LearnerEvent[]; since?: number }) : {};
    const received = (ids: readonly string[]): Record<string, string> => Object.fromEntries(log.filter((r) => ids.includes(r.event.id)).map((r) => [r.event.id, r.received]));
    if (pathname === "/v1/auth/sign-up") return Promise.resolve(json({ user: { id: USER, email: "a@example.org" }, token: "token" }));
    if (pathname === "/v1/events" && method === "POST") {
      const events = body.events ?? [];
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
