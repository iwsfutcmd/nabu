/**
 * Phase 4 acceptance on the server (gameplan §16): duplicate uploads are
 * idempotent, and the server's projection of an uploaded log is identical to
 * the device's. Runs on PGlite, and on Postgres in CI (test/database.ts).
 */
import { emptyLearnerState, plan, progressResetOf, replay, applyEvents, type LearnerState } from "@nabu/core/learner";
import { goalSetOf } from "@nabu/core/game";
import type { LearnerEvent } from "@nabu/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventFactory, loadCourse, manifestOf } from "../../../packages/core/test/learner-fixtures.ts";
import { createAccounts, normalizeEmail } from "../src/accounts.ts";
import { createApp, type App } from "../src/app.ts";
import type { Database } from "../src/db/index.ts";
import { testDatabase } from "./database.ts";

let database: Database;
let app: App;
/** What the server logged (D10): kept here rather than printed. */
const logged: Record<string, unknown>[] = [];

beforeAll(async () => {
  database = await testDatabase();
  app = createApp({ db: database.db, accounts: createAccounts(database.db), log: (entry) => logged.push({ ...entry }) });
});
afterAll(async () => database.close());

const json = (body: unknown, token?: string): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
  body: JSON.stringify(body),
});
const auth = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });

const signUp = async (email: string, password = "correct horse battery"): Promise<string> => {
  const res = await app.request("/v1/auth/sign-up", json({ email, password }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { token: string }).token;
};

let learners = 0;

/**
 * Three sessions of a learner on the fa course, one miss each, as the device
 * would log them. Each call is a different learner, with its own event ids.
 */
const threeSessions = (): LearnerEvent[] => {
  const prefix = (++learners).toString(16).padStart(8, "0");
  const fa = loadCourse("fa");
  const factory = eventFactory(fa, manifestOf("fa").id);
  const log: LearnerEvent[] = [];
  let state: LearnerState = emptyLearnerState();
  const add = (event: LearnerEvent): void => {
    const e = { ...event, id: `${prefix}${event.id.slice(8)}` };
    log.push(e);
    state = applyEvents(state, [e]);
  };
  const nodes = ["fa.greetings", "fa.names"];
  const requests = [...nodes.map((node) => ({ mode: "lesson" as const, node })), { mode: "review" as const }];
  for (const [day, request] of requests.entries()) {
    let clock = Date.parse("2026-03-01T09:00:00Z") + day * 86_400_000;
    const at = (): void => {
      clock += 15_000;
      factory.at(new Date(clock).toISOString());
    };
    const p = plan(fa, state, request, { now: new Date(clock).toISOString(), seed: day + 1 });
    factory.session();
    at();
    const node = request.mode === "lesson" ? request.node : undefined;
    add(factory.started(request.mode, node, p.exercises.length));
    for (const [i, ex] of p.exercises.entries()) {
      at();
      add(factory.answer(ex, i !== 2, 1));
    }
    at();
    add(factory.completed(request.mode, node, { exercises: p.exercises.length, correctFirstTry: p.exercises.length - 1, retries: 0 }));
  }
  return log;
};

describe("accounts", () => {
  it("signs up, signs in and out, and rejects bad credentials", async () => {
    const token = await signUp("Maryam@Example.COM");
    const me = await app.request("/v1/auth/me", auth(token));
    expect(await me.json()).toMatchObject({ user: { email: "Maryam@example.com" } });

    expect((await app.request("/v1/auth/sign-up", json({ email: "maryam@EXAMPLE.com", password: "another password" }))).status).toBe(201); // local part keeps its case
    expect((await app.request("/v1/auth/sign-up", json({ email: "Maryam@example.com", password: "another password" }))).status).toBe(409);
    expect(await (await app.request("/v1/auth/sign-up", json({ email: "no-at-sign", password: "long enough" }))).json()).toEqual({ error: "invalid-email" });
    expect(await (await app.request("/v1/auth/sign-up", json({ email: "a@b.example", password: "short" }))).json()).toEqual({ error: "weak-password" });

    expect((await app.request("/v1/auth/sign-in", json({ email: "Maryam@example.com", password: "wrong password" }))).status).toBe(401);
    const again = await app.request("/v1/auth/sign-in", json({ email: "Maryam@EXAMPLE.com", password: "correct horse battery" }));
    expect(again.status).toBe(200);
    const second = ((await again.json()) as { token: string }).token;

    expect((await app.request("/v1/auth/sign-out", { method: "POST", ...auth(second) })).status).toBe(204);
    expect((await app.request("/v1/auth/me", auth(second))).status).toBe(401);
    expect((await app.request("/v1/auth/me", auth(token))).status).toBe(200);
  });

  it("counts password length in graphemes and normalizes addresses", () => {
    expect(normalizeEmail("  ali@BÜCHER.example ")).toBe("ali@xn--bcher-kva.example");
    expect(normalizeEmail("علی@example.com")).toBe("علی@example.com");
    expect(normalizeEmail("ali@localhost")).toBeUndefined();
  });

  it("counts a password's length in graphemes, in any script", async () => {
    // Conjuncts are single graphemes: 16 code points but only 6 user-perceived characters.
    expect(await (await app.request("/v1/auth/sign-up", json({ email: "priya@example.in", password: "क्षत्रियक्षत्रिय" }))).json()).toEqual({ error: "weak-password" });
    // Nine graphemes (seventeen code points): long enough.
    expect((await app.request("/v1/auth/sign-up", json({ email: "priya@example.in", password: "नमस्ते मेरे दोस्त" }))).status).toBe(201);
  });
});

describe("event log", () => {
  it("requires an account", async () => {
    expect((await app.request("/v1/events", json({ events: [] }))).status).toBe(401);
    expect((await app.request("/v1/state?course=fa")).status).toBe(401);
  });

  it("takes the valid events of a batch and names the ones it rejects (S13)", async () => {
    const token = await signUp("schema@example.com");
    const [first, second, third, fourth] = threeSessions();
    if (first === undefined || second === undefined || third === undefined || fourth === undefined) throw new Error("a short log");
    // A device whose app and server have drifted: one event the schema no longer takes, and a value that is not an event.
    const res = await app.request("/v1/events", json({ events: [first, { ...second, clientTime: "yesterday" }, third, 42] }, token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: number; duplicates: number; received: Record<string, string>; rejected: { index: number; id?: string; code: string; errors?: unknown[] }[] };
    expect(body).toMatchObject({ accepted: 2, duplicates: 0, rejected: [{ index: 1, id: second.id, code: "invalid-event" }, { index: 3, code: "invalid-event" }] });
    expect(body.rejected[1]).not.toHaveProperty("id");
    expect(body.rejected[0]?.errors?.length).toBeGreaterThan(0);
    expect(Object.keys(body.received).sort()).toEqual([first.id, third.id].sort());
    // The log holds what was taken, and the next batch goes in as usual.
    const after = (await (await app.request("/v1/events", json({ events: [fourth] }, token))).json()) as { accepted: number; rejected: unknown[] };
    expect(after).toMatchObject({ accepted: 1, rejected: [] });
    expect(((await (await app.request("/v1/state?course=fa", auth(token))).json()) as { events: number }).events).toBe(3);
    // A batch that is not a list of events at all is still refused whole.
    expect(await (await app.request("/v1/events", json({ events: "everything" }, token))).json()).toEqual({ error: { code: "invalid-batch" } });
  });

  it("logs each rejection, with the error that explains it and no learner text (D10)", async () => {
    const token = await signUp("drift-log@example.com");
    const answer = threeSessions().find((e) => e.type === "answer_submitted");
    if (answer?.type !== "answer_submitted") throw new Error("no answer");
    // A newer app's answer: a field this server's schema does not know, around an answer the learner typed.
    const typed = { ...answer, id: "00000000-0000-7000-8000-0000000d0e1a", input: { ...answer.input, raw: "my very own words" }, appVersion: "2" };
    logged.length = 0;
    const res = (await (await app.request("/v1/events", json({ events: [typed, 42] }, token))).json()) as { rejected: { errors?: { instancePath: string; keyword: string }[] }[] };
    // The answer's own kind of event explains it first: the schema is a oneOf over every kind.
    expect(res.rejected[0]?.errors?.[0]).toMatchObject({ instancePath: "", keyword: "additionalProperties" });
    expect(logged).toEqual([
      { event: "upload-rejected", code: "invalid-event", id: typed.id, error: { path: "", keyword: "additionalProperties", message: "must NOT have additional properties", params: { additionalProperty: "appVersion" } } },
      expect.objectContaining({ event: "upload-rejected", code: "invalid-event", id: null }),
    ]);
    expect(JSON.stringify(logged)).not.toContain("my very own words");
  });

  it("is idempotent: a duplicate upload changes nothing", async () => {
    const token = await signUp("idempotent@example.com");
    const log = threeSessions();
    const half = Math.floor(log.length / 2);
    const first = (await (await app.request("/v1/events", json({ events: log.slice(0, half) }, token))).json()) as { accepted: number; cursor: number; received: Record<string, string> };
    expect(first.accepted).toBe(half);
    expect(Object.keys(first.received).sort()).toEqual(log.slice(0, half).map((e) => e.id).sort());
    const before = await (await app.request("/v1/state?course=fa", auth(token))).json();

    // The device retries after a timeout: the same batch, then an overlapping one. A duplicate
    // keeps the time the server first received it (the streak's grace window counts from there).
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await (await app.request("/v1/events", json({ events: log.slice(0, half) }, token))).json()).toMatchObject({ accepted: 0, duplicates: half, refused: 0, cursor: first.cursor, received: first.received });
    expect(await (await app.request("/v1/state?course=fa", auth(token))).json()).toEqual(before);
    const rest = (await (await app.request("/v1/events", json({ events: log.slice(10) }, token))).json()) as { accepted: number; duplicates: number };
    expect(rest).toMatchObject({ accepted: log.length - half, duplicates: half - 10 });
  });

  it("projects the uploaded log exactly as the device does", async () => {
    const token = await signUp("projection@example.com");
    const log = threeSessions();
    // Uploaded out of order, in two batches: the projection does not depend on arrival.
    await app.request("/v1/events", json({ events: log.slice(20) }, token));
    await app.request("/v1/events", json({ events: log.slice(0, 20) }, token));
    const server = (await (await app.request("/v1/state?course=fa", auth(token))).json()) as { events: number; state: unknown };
    const { seen: _seen, ...local } = replay(log);
    expect(server.events).toBe(log.length);
    expect(server.state).toEqual(JSON.parse(JSON.stringify(local)));
    expect(local.completedNodes).toEqual(["fa.greetings", "fa.names"]);
  });

  it("starting a course over: the reset syncs like any event, and the server forgets the same things", async () => {
    const token = await signUp("again@example.com");
    const log = threeSessions();
    await app.request("/v1/events", json({ events: log }, token));
    const fa = loadCourse("fa");
    const last = log.at(-1) as LearnerEvent;
    const at = new Date(Date.parse(last.clientTime) + 60_000).toISOString();
    const reset = progressResetOf(fa, { id: "0000ffff-0000-7000-9000-000000000001", clientTime: at, localDate: at.slice(0, 10), tz: "UTC", device: "phone", session: "0000ffff-0000-7000-a000-000000000001", bundle: manifestOf("fa").id });
    expect((await app.request("/v1/events", json({ events: [reset] }, token))).status).toBe(200);
    const server = (await (await app.request("/v1/state?course=fa", auth(token))).json()) as { events: number; state: { completedNodes: string[]; cards: object; xp: { total: number } } };
    const { seen: _seen, ...local } = replay([...log, reset]);
    expect(server.events).toBe(log.length + 1); // the log keeps everything
    expect(server.state).toEqual(JSON.parse(JSON.stringify(local)));
    expect(server.state.completedNodes).toEqual([]);
    expect(server.state.cards).toEqual({});
    expect(server.state.xp.total).toBe(replay(log).xp.total);
  });

  it("the weekly goal is the account's: a goal_set syncs, the game state holds it, no course's state changes (ADR 0107, D12)", async () => {
    const token = await signUp("goal@example.com");
    const log = threeSessions();
    await app.request("/v1/events", json({ events: log }, token));
    const at = new Date(Date.parse((log.at(-1) as LearnerEvent).clientTime) + 60_000).toISOString();
    const goal = goalSetOf(5, { id: "0000eeee-0000-7000-9000-000000000001", device: "laptop", clientTime: at, localDate: at.slice(0, 10), tz: "UTC" });
    const res = await app.request("/v1/events", json({ events: [goal] }, token));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: 1, rejected: [] });
    // Another device pulls it with the rest of the log.
    const page = (await (await app.request("/v1/events?since=0", auth(token))).json()) as { events: LearnerEvent[] };
    expect(page.events.find((e) => e.id === goal.id)).toEqual(goal);
    // The game state reads it; the course's own state is what it was.
    const game = (await (await app.request("/v1/game", auth(token))).json()) as { game: { goal?: number | null } };
    expect(game.game.goal).toBe(5);
    const server = (await (await app.request("/v1/state?course=fa", auth(token))).json()) as { events: number; state: unknown };
    const { seen: _seen, ...local } = replay(log);
    expect(server.events).toBe(log.length);
    expect(server.state).toEqual(JSON.parse(JSON.stringify(local)));
    // The export holds it, and names no course for it.
    const exported = (await (await app.request("/v1/export", auth(token))).json()) as { events: LearnerEvent[]; courses: { course: string }[]; game: { goal?: number | null } };
    expect(exported.events.some((e) => e.id === goal.id)).toBe(true);
    expect(exported.courses.map((c) => c.course)).toEqual(["fa"]);
    expect(exported.game.goal).toBe(5);
    // A goal of more days than a week has is no goal_set.
    const tooMany = await app.request("/v1/events", json({ events: [{ ...goal, id: "0000eeee-0000-7000-9000-000000000002", days: 8 }] }, token));
    expect(await tooMany.json()).toMatchObject({ accepted: 0, rejected: [{ index: 0, code: "invalid-event" }] });
  });

  it("pages a user's events by cursor, and keeps users apart", async () => {
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    const log = threeSessions();
    for (let i = 0; i < log.length; i += 7) await app.request("/v1/events", json({ events: log.slice(i, i + 7) }, a));

    const pulled: LearnerEvent[] = [];
    let cursor = 0;
    let pages = 0;
    for (;;) {
      pages++;
      const page = (await (await app.request(`/v1/events?since=${cursor}&limit=10`, auth(a))).json()) as { events: LearnerEvent[]; cursor: number; more: boolean };
      pulled.push(...page.events);
      cursor = page.cursor;
      if (!page.more) break;
    }
    expect(pages).toBeGreaterThan(2);
    expect(pulled.map((e) => e.id)).toEqual(log.map((e) => e.id));
    expect(pulled).toEqual(log);

    expect(await (await app.request("/v1/events?since=0", auth(b))).json()).toEqual({ events: [], cursor: 0, more: false, received: {} });
    const bState = (await (await app.request("/v1/state?course=fa", auth(b))).json()) as { events: number };
    expect(bState.events).toBe(0);
    // An event stamped with another user is rejected; the rest of its batch is taken.
    const me = (await (await app.request("/v1/auth/me", auth(a))).json()) as { user: { id: string } };
    const stolen = { ...log[0], id: "00000000-0000-7000-8000-00000000dead", user: me.user.id };
    const own = { ...log[1], id: "00000000-0000-7000-8000-00000000beef" };
    const res = await app.request("/v1/events", json({ events: [stolen, own] }, b));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accepted: 1, rejected: [{ index: 0, id: stolen.id, code: "foreign-event" }] });
    expect(((await (await app.request("/v1/state?course=fa", auth(b))).json()) as { events: number }).events).toBe(1);
  });

  it("answers CORS preflights for any origin", async () => {
    const res = await app.request("/v1/events", { method: "OPTIONS", headers: { Origin: "https://iwsfutcmd.github.io", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
