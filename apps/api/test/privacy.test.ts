/**
 * A learner's own data (gameplan §14.4) and the abuse limits (§14.5): the export holds everything
 * the account does, deleting it leaves nothing that names the learner, and sign-up, sign-in and
 * uploads are limited.
 */
import { emptyLearnerState, plan } from "@nabu/core/learner";
import type { LearnerEvent } from "@nabu/schema";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventFactory, loadCourse, manifestOf } from "../../../packages/core/test/learner-fixtures.ts";
import { createAccounts } from "../src/accounts.ts";
import { createApp, type App } from "../src/app.ts";
import { openDatabase, type Database } from "../src/db/index.ts";
import { answerReports, authSessions, correctionVotes, events, llmUsage, reportVotes, sentenceCorrections, users } from "../src/db/schema.ts";
import { DEFAULT_LIMITS, limitsFromEnv } from "../src/limits.ts";
import { deleteAccount } from "../src/privacy.ts";

let database: Database;
let app: App;
const PASSWORD = "correct horse battery";

beforeAll(async () => {
  database = await openDatabase({ pglite: "memory" });
  app = createApp({ db: database.db, accounts: createAccounts(database.db) });
});
afterAll(async () => database.close());

const json = (body: unknown, token?: string, method = "POST", headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", ...headers, ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
  body: JSON.stringify(body),
});
const auth = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });

const signUp = async (a: App, email: string): Promise<{ token: string; id: string }> => {
  const res = await a.request("/v1/auth/sign-up", json({ email, password: PASSWORD }));
  expect(res.status).toBe(201);
  const body = (await res.json()) as { token: string; user: { id: string } };
  return { token: body.token, id: body.user.id };
};

let learners = 0;
/** One fa lesson, logged as the device would, with this learner's own event ids. */
const oneLesson = (): LearnerEvent[] => {
  const prefix = (0xf000 + ++learners).toString(16).padStart(8, "0");
  const fa = loadCourse("fa");
  const factory = eventFactory(fa, manifestOf("fa").id);
  let clock = Date.parse("2026-03-01T09:00:00Z");
  const at = (): void => {
    clock += 15_000;
    factory.at(new Date(clock).toISOString());
  };
  const p = plan(fa, emptyLearnerState(), { mode: "lesson", node: "fa.greetings" }, { now: new Date(clock).toISOString(), seed: 1 });
  factory.session();
  const log: LearnerEvent[] = [];
  at();
  log.push(factory.started("lesson", "fa.greetings", p.exercises.length));
  for (const ex of p.exercises) {
    at();
    log.push(factory.answer(ex, true, 1));
  }
  at();
  log.push(factory.completed("lesson", "fa.greetings", { exercises: p.exercises.length, correctFirstTry: p.exercises.length, retries: 0 }));
  return log.map((e) => ({ ...e, id: `${prefix}${e.id.slice(8)}` }));
};

describe("export", () => {
  it("holds everything the account does", async () => {
    const { token, id } = await signUp(app, "export@example.com");
    const log = oneLesson();
    expect((await app.request("/v1/events", json({ events: log }, token))).status).toBe(200);
    const res = await app.request("/v1/export", auth(token));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="nabu-account-\d{4}-\d{2}-\d{2}\.json"$/u);
    const data = (await res.json()) as { user: { id: string; email: string }; events: LearnerEvent[]; courses: { course: string; events: number }[]; game: unknown; reminders: unknown; reports: unknown[] };
    expect(data.user).toMatchObject({ id, email: "export@example.com" });
    expect(data.events.map((e) => e.id)).toEqual(log.map((e) => e.id));
    expect(data.courses).toEqual([expect.objectContaining({ course: "fa", events: log.length })]);
    expect(data.game).toBeDefined();
    expect(data.reminders).toEqual({ web: 0, android: 0, ios: 0 });
    expect(data.reports).toEqual([]);
  });

  it("needs a session", async () => {
    expect((await app.request("/v1/export")).status).toBe(401);
  });
});

describe("deleting an account", () => {
  it("asks for the password, then leaves nothing of the learner", async () => {
    const { token, id } = await signUp(app, "leaving@example.com");
    expect((await app.request("/v1/events", json({ events: oneLesson() }, token))).status).toBe(200);

    expect((await app.request("/v1/account", json({ password: "not the password" }, token, "DELETE"))).status).toBe(403);
    expect((await app.request("/v1/account", json({}, token, "DELETE"))).status).toBe(403);
    expect((await app.request("/v1/auth/me", auth(token))).status).toBe(200);

    expect((await app.request("/v1/account", json({ password: PASSWORD }, token, "DELETE"))).status).toBe(204);
    const db = database.db;
    expect(await db.select().from(users).where(eq(users.id, id))).toEqual([]);
    expect(await db.select().from(authSessions).where(eq(authSessions.userId, id))).toEqual([]);
    const [left] = await db.select({ n: count() }).from(events).where(eq(events.userId, id));
    expect(Number(left?.n)).toBe(0);
    expect((await app.request("/v1/auth/me", auth(token))).status).toBe(401);
    expect((await app.request("/v1/auth/sign-in", json({ email: "leaving@example.com", password: PASSWORD }))).status).toBe(401);
    // The address is free again.
    expect((await app.request("/v1/auth/sign-up", json({ email: "leaving@example.com", password: PASSWORD }))).status).toBe(201);
  });

  it("takes the learner's votes, and what only they backed, but not what a reviewer decided", async () => {
    const db = database.db;
    const { id } = await signUp(app, "voter@example.com");
    const report = (rid: string, item: string, status: string) => ({ id: rid, course: "fa", orthography: "fa-Arab/standard", template: "translate", item, answer: "x", normalized: item, status });
    await db.insert(answerReports).values([
      report("00000000-0000-7000-8000-00000000a001", "mine-alone", "pending"),
      report("00000000-0000-7000-8000-00000000a002", "shared", "pending"),
      report("00000000-0000-7000-8000-00000000a003", "decided", "approved"),
    ]);
    await db.insert(reportVotes).values([
      { reportId: "00000000-0000-7000-8000-00000000a001", subject: "me", source: "report" },
      { reportId: "00000000-0000-7000-8000-00000000a002", subject: "me", source: "report" },
      { reportId: "00000000-0000-7000-8000-00000000a002", subject: "someone", source: "report" },
      { reportId: "00000000-0000-7000-8000-00000000a003", subject: "me", source: "report" },
    ]);
    await db.insert(sentenceCorrections).values({ id: "00000000-0000-7000-8000-00000000c001", course: "fa", orthography: "fa-Arab/standard", support: "en", item: "s.1", key: "k1", shown: {}, correction: {}, status: "pending" });
    await db.insert(correctionVotes).values({ correctionId: "00000000-0000-7000-8000-00000000c001", subject: "me" });
    await db.insert(llmUsage).values({ subject: "me", day: "2026-03-01", feature: "judge", calls: 3 });

    expect(await deleteAccount(db, id, "me")).toBe(true);
    const reports = await db.select({ id: answerReports.id, item: answerReports.item }).from(answerReports);
    expect(reports.map((r) => r.item).sort()).toEqual(["decided", "shared"]);
    expect(await db.select().from(reportVotes).where(eq(reportVotes.subject, "me"))).toEqual([]);
    expect(await db.select().from(reportVotes).where(eq(reportVotes.subject, "someone"))).toHaveLength(1);
    expect(await db.select().from(sentenceCorrections)).toEqual([]);
    expect(await db.select().from(llmUsage).where(eq(llmUsage.subject, "me"))).toEqual([]);
  });
});

describe("abuse limits", () => {
  let clock = Date.parse("2026-03-01T09:00:00Z");
  let limited: App;
  beforeAll(() => {
    limited = createApp({
      db: database.db,
      accounts: createAccounts(database.db),
      now: () => clock,
      limits: { signUp: { max: 2, windowMs: 60_000 }, signIn: { max: 3, windowMs: 60_000 }, events: { max: 2, windowMs: 60_000 } },
      clientOf: (c) => c.req.header("x-test-client"),
    });
  });
  const from = (client: string, body: unknown): RequestInit => json(body, undefined, "POST", { "x-test-client": client });

  it("limits sign-ups by address, with a Retry-After", async () => {
    expect((await limited.request("/v1/auth/sign-up", from("a", { email: "a1@example.com", password: PASSWORD }))).status).toBe(201);
    expect((await limited.request("/v1/auth/sign-up", from("a", { email: "a2@example.com", password: PASSWORD }))).status).toBe(201);
    const over = await limited.request("/v1/auth/sign-up", from("a", { email: "a3@example.com", password: PASSWORD }));
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBe("60");
    expect((await limited.request("/v1/auth/sign-up", from("b", { email: "b1@example.com", password: PASSWORD }))).status).toBe(201);
    clock += 60_000;
    expect((await limited.request("/v1/auth/sign-up", from("a", { email: "a3@example.com", password: PASSWORD }))).status).toBe(201);
  });

  it("limits sign-ins by account, whatever the address", async () => {
    const statuses: number[] = [];
    for (const client of ["c", "d", "e"]) statuses.push((await limited.request("/v1/auth/sign-in", from(client, { email: "a1@example.com", password: "guess" }))).status);
    expect(statuses).toEqual([401, 401, 401]);
    expect((await limited.request("/v1/auth/sign-in", from("f", { email: "a1@example.com", password: PASSWORD }))).status).toBe(429);
    clock += 60_000;
    expect((await limited.request("/v1/auth/sign-in", from("f", { email: "a1@example.com", password: PASSWORD }))).status).toBe(200);
  });

  it("limits uploads by user", async () => {
    const res = await limited.request("/v1/auth/sign-up", from("g", { email: "uploader@example.com", password: PASSWORD }));
    const { token } = (await res.json()) as { token: string };
    const upload = () => limited.request("/v1/events", json({ events: [] }, token));
    expect((await upload()).status).not.toBe(429);
    expect((await upload()).status).not.toBe(429);
    expect((await upload()).status).toBe(429);
  });

  it("reads its settings from the environment", () => {
    expect(limitsFromEnv({})).toEqual(DEFAULT_LIMITS);
    expect(limitsFromEnv({ NABU_RATE_LIMITS: "off" })).toEqual({});
    expect(limitsFromEnv({ NABU_RATE_LIMIT_SIGN_UP: "3/10" }).signUp).toEqual({ max: 3, windowMs: 10_000 });
    expect(() => limitsFromEnv({ NABU_RATE_LIMIT_EVENTS: "lots" })).toThrow(/<max>\/<seconds>/u);
  });
});
