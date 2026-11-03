/**
 * Phase 4 acceptance on the server (gameplan §16): duplicate uploads are
 * idempotent, and the server's projection of an uploaded log is identical to
 * the device's. Runs against PGlite, the same SQL as Postgres.
 */
import { emptyLearnerState, plan, replay, applyEvents, type LearnerState } from "@nabu/core/learner";
import type { LearnerEvent } from "@nabu/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventFactory, loadCourse, manifestOf } from "../../../packages/core/test/learner-fixtures.ts";
import { createAccounts, normalizeEmail } from "../src/accounts.ts";
import { createApp, type App } from "../src/app.ts";
import { openDatabase, type Database } from "../src/db/index.ts";

let database: Database;
let app: App;

beforeAll(async () => {
  database = await openDatabase({ pglite: "memory" });
  app = createApp({ db: database.db, accounts: createAccounts(database.db) });
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

  it("rejects events that do not match the schema, naming the first", async () => {
    const token = await signUp("schema@example.com");
    const [first, second] = threeSessions();
    const res = await app.request("/v1/events", json({ events: [first, { ...second, clientTime: "yesterday" }] }, token));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: "invalid-event", index: 1 } });
  });

  it("is idempotent: a duplicate upload changes nothing", async () => {
    const token = await signUp("idempotent@example.com");
    const log = threeSessions();
    const half = Math.floor(log.length / 2);
    const first = (await (await app.request("/v1/events", json({ events: log.slice(0, half) }, token))).json()) as { accepted: number; cursor: number };
    expect(first.accepted).toBe(half);
    const before = await (await app.request("/v1/state?course=fa", auth(token))).json();

    // The device retries after a timeout: the same batch, then an overlapping one.
    expect(await (await app.request("/v1/events", json({ events: log.slice(0, half) }, token))).json()).toEqual({ accepted: 0, duplicates: half, refused: 0, cursor: first.cursor });
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

    expect(await (await app.request("/v1/events?since=0", auth(b))).json()).toEqual({ events: [], cursor: 0, more: false });
    const bState = (await (await app.request("/v1/state?course=fa", auth(b))).json()) as { events: number };
    expect(bState.events).toBe(0);
    // An event stamped with another user is refused.
    const me = (await (await app.request("/v1/auth/me", auth(a))).json()) as { user: { id: string } };
    const stolen = { ...log[0], id: "00000000-0000-7000-8000-00000000dead", user: me.user.id };
    expect(await (await app.request("/v1/events", json({ events: [stolen] }, b))).json()).toMatchObject({ error: { code: "foreign-event", index: 0 } });
  });

  it("answers CORS preflights for any origin", async () => {
    const res = await app.request("/v1/events", { method: "OPTIONS", headers: { Origin: "https://iwsfutcmd.github.io", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
