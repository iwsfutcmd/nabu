/**
 * Events of before the lexical model (schema 1) on the server: an upload of one is refused like
 * any event that does not fit, and the rows a server stored before the switch are rewritten once
 * by the deploy's job (src/upgrade.ts) with core's `upgrade`, so every projection reads the log a
 * device would have upgraded. A row the job cannot read stays as it was: out of every projection,
 * still in the learner's export.
 */
import { readdirSync, readFileSync } from "node:fs";
import { replay, upgradeLog } from "@nabu/core/learner";
import type {
  AnswerSubmitted,
  AnswerSubmittedV1,
  KcId,
  LearnerEvent,
  LearnerEventV1,
  OrthographyId,
  OutcomeRevisedV1,
  PartCredit,
  SessionCompletedV1,
  SessionStartedV1,
} from "@nabu/schema";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccounts } from "../src/accounts.ts";
import { createApp, type App } from "../src/app.ts";
import type { Database } from "../src/db/index.ts";
import { events } from "../src/db/schema.ts";
import { since, stateOf, validEvent, validOldEvent } from "../src/log.ts";
import { createAliases, upgradeStored } from "../src/upgrade.ts";
import { testDatabase } from "./database.ts";

let database: Database;
let app: App;

// Each test gets its own database: the job reads every user's rows, so counts stay the test's own.
beforeEach(async () => {
  database = await testDatabase();
  app = createApp({ db: database.db, accounts: createAccounts(database.db) });
});
afterEach(async () => database.close());

const json = (body: unknown, token: string): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});
const auth = (token: string): RequestInit => ({ headers: { Authorization: `Bearer ${token}` } });

let accounts = 0;
const signUp = async (): Promise<{ token: string; user: string }> => {
  const res = await app.request("/v1/auth/sign-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `upgrade${++accounts}@example.org`, password: "correct horse battery" }) });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { token: string; user: { id: string } };
  return { token: body.token, user: body.user.id };
};

// ------------------------------------------------------------------------------- the es bundle

const BUNDLES = new URL("../../web/public/bundles/", import.meta.url);
const ES = "es-Latn/standard" as OrthographyId;
const BUNDLE = (JSON.parse(readFileSync(new URL("es/manifest.json", BUNDLES), "utf8")) as { id: string }).id;

/** A sentence of the es bundle as the new format has it: the parts it lists. */
const sentenceParts = (id: string): readonly string[] => {
  const dir = new URL("es/units/", BUNDLES);
  for (const file of readdirSync(dir)) {
    const unit = JSON.parse(readFileSync(new URL(file, dir), "utf8")) as { sentences: { id: string; parts: string[] }[] };
    const found = unit.sentences.find((s) => s.id === id);
    if (found !== undefined) return found.parts;
  }
  throw new Error(`no sentence ${id}`);
};

// ---------------------------------------------------------------------------- old-shape events

let ids = 0;
const id = (): string => `00000000-0000-7000-b000-${(++ids).toString(16).padStart(12, "0")}`;
const SESSION = "00000000-0000-7000-b000-ffffffffffff";

const meta = (seconds: number, course = "es") => {
  const t = new Date(Date.parse("2026-10-01T09:00:00Z") + seconds * 1000).toISOString();
  return { id: id(), schema: 1 as const, device: "d", course, orthography: ES, support: "en", bundle: BUNDLE, session: SESSION, clientTime: t, localDate: t.slice(0, 10), tz: "UTC" };
};

/** An answer as the app before the switch logged it: KCs, each with its status. */
const oldAnswer = (
  seconds: number,
  template: AnswerSubmittedV1["exercise"]["template"],
  item: string,
  credits: readonly (readonly [string, "right" | "wrong" | "given"])[],
  kind: AnswerSubmittedV1["outcome"]["kind"] = "CORRECT",
  course = "es",
): AnswerSubmittedV1 => ({
  ...meta(seconds, course),
  type: "answer_submitted",
  exercise: { id: `${template}:${item}`, template, item, kcs: credits.map(([kc]) => kc as KcId) },
  attempt: 1,
  input: template.startsWith("translate-type") ? { method: "text", raw: "x", latencyMs: 6000 } : { method: "choice", latencyMs: 4000 },
  outcome: { kind, notes: [], kcs: credits.map(([kc, status]) => ({ kc: kc as KcId, status })) },
});

const oldRevision = (seconds: number, answer: AnswerSubmittedV1): OutcomeRevisedV1 => ({
  ...meta(seconds),
  device: "server",
  type: "outcome_revised",
  answer: answer.id,
  outcome: { kind: "CORRECT_PROVISIONAL", notes: ["judge"], kcs: answer.outcome.kcs.map((c) => ({ kc: c.kc, status: "right" as const })) },
  by: "judge",
});

/** A lesson of es's first unit, logged before the switch: "estoy bien" read, "soy Daniel" typed wrong and then accepted by the judge. */
const oldLesson = (): LearnerEventV1[] => {
  const started: SessionStartedV1 = { ...meta(0), type: "session_started", mode: "lesson", node: "es.u01.como-estas", seed: 1, exercises: 2, planner: "t" };
  const read = oldAnswer(10, "choose-translation", "s.u01.15", [["sense:estar", "right"], ["form:pres-1s", "right"], ["sense:bien", "right"]]);
  const typed = oldAnswer(20, "translate-type.l1-l2", "s.u01.21", [["sense:ser", "right"], ["form:pres-1s", "wrong"], ["sense:daniel", "right"]], "WRONG");
  const revised = oldRevision(30, typed);
  const completed: SessionCompletedV1 = { ...meta(40), type: "session_completed", mode: "lesson", node: "es.u01.como-estas", summary: { completed: true, exercises: 2, correctFirstTry: 1, retries: 0, skipped: 0 } };
  return [started, read, typed, revised, completed];
};

/** Rows as a server from before the switch stored them: as `append` does, with the event's own schema 1. */
const storeOld = async (user: string, batch: readonly LearnerEventV1[], payloadOf: (e: LearnerEventV1) => unknown = (e) => e): Promise<void> => {
  await database.db.insert(events).values(
    batch.map((e) => ({
      serverTime: new Date(e.clientTime),
      id: e.id,
      userId: user,
      deviceId: e.device,
      type: e.type,
      schema: e.schema,
      course: e.type === "goal_set" ? "" : e.course,
      bundle: e.type === "goal_set" ? "" : e.bundle,
      clientTime: new Date(e.clientTime),
      localDate: e.localDate,
      tz: e.tz,
      payload: payloadOf(e),
    })),
  );
};

const rows = async () => database.db.select({ id: events.id, schema: events.schema, payload: events.payload }).from(events).orderBy(asc(events.seq));
const stored = async (eventId: string): Promise<{ schema: number; payload: unknown } | undefined> =>
  (await database.db.select({ schema: events.schema, payload: events.payload }).from(events).where(eq(events.id, eventId)))[0];
const creditsOf = (e: unknown): readonly PartCredit[] => (e as { outcome: { parts: PartCredit[] } }).outcome.parts;

// ----------------------------------------------------------------------------------------- tests

describe("an upload of the old shape", () => {
  it("is refused like any event that does not fit, and the rest of the batch is taken", async () => {
    const { token } = await signUp();
    const old = oldAnswer(10, "choose-translation", "s.u01.15", [["sense:estar", "right"], ["form:pres-1s", "right"], ["sense:bien", "right"]]);
    // A valid event of the old shape, so what refuses it is its shape, nothing else.
    expect(validOldEvent(old)).toBe(true);
    const now: AnswerSubmitted = {
      ...old,
      id: id(),
      schema: 2,
      exercise: { id: old.exercise.id, template: old.exercise.template, item: old.exercise.item, parts: ["lexeme:estar", "feature:Tense=Pres", "lexeme:bien"] },
      outcome: {
        kind: "CORRECT",
        notes: [],
        labels: [],
        parts: [
          { part: "lexeme:estar", skill: "recognize", status: "right" },
          { part: "feature:Tense=Pres", skill: "read-off", status: "right" },
          { part: "lexeme:bien", skill: "recognize", status: "right" },
        ],
      },
    };
    expect(validEvent(now)).toBe(true);
    const body = (await (await app.request("/v1/events", json({ events: [old, now] }, token))).json()) as { accepted: number; received: Record<string, string>; rejected: { index: number; id?: string; code: string }[] };
    expect(body).toMatchObject({ accepted: 1, rejected: [{ index: 0, id: old.id, code: "invalid-event" }] });
    expect(body.rejected).toHaveLength(1);
    expect(Object.keys(body.received)).toEqual([now.id]);
    // Nothing of the old one is stored: no row, nothing in the export.
    expect(await stored(old.id)).toBeUndefined();
    expect((await rows()).map((r) => r.id)).toEqual([now.id]);
    const exported = (await (await app.request("/v1/export", auth(token))).json()) as { events: { id: string }[] };
    expect(exported.events.map((e) => e.id)).toEqual([now.id]);
  });
});

describe("the deploy's job (upgradeStored)", () => {
  it("rewrites the rows of schema 1 in the new shape, as a device upgrades its log, and only once", async () => {
    const { token, user } = await signUp();
    const old = oldLesson();
    await storeOld(user, old);
    // Before the job, no projection reads them.
    expect((await stateOf(database.db, user, "es")).events).toBe(0);

    const aliases = createAliases();
    expect(await upgradeStored(database.db, aliases)).toEqual({ upgraded: old.length, left: [], withoutTable: [] });
    const after = await rows();
    expect(after.map((r) => r.id)).toEqual(old.map((e) => e.id));
    for (const row of after) {
      expect(row.schema).toBe(2);
      expect(validEvent(row.payload), row.id).toBe(true);
    }

    // The form KC (form:pres-1s) is the feature value "estoy bien" teaches, read off its form on a
    // card that is read; the senses are the sentence's lexemes. Its parts are the bundle's.
    const read = (await stored(old[1]?.id ?? ""))?.payload as AnswerSubmitted;
    expect(read.exercise.parts).toEqual(sentenceParts("s.u01.15"));
    expect(read.exercise.parts).toContain("feature:Tense=Pres");
    expect(creditsOf(read)).toEqual([
      { part: "lexeme:estar", skill: "recognize", status: "right" },
      { part: "feature:Tense=Pres", skill: "read-off", status: "right" },
      { part: "lexeme:bien", skill: "recognize", status: "right" },
    ]);
    // On a typed card the same value is chosen, and the lexemes produced.
    const typed = (await stored(old[2]?.id ?? ""))?.payload as AnswerSubmitted;
    expect(typed.exercise.parts).toEqual(sentenceParts("s.u01.21"));
    expect(creditsOf(typed)).toEqual([
      { part: "lexeme:ser", skill: "produce", status: "right" },
      { part: "feature:Tense=Pres", skill: "choose", status: "wrong" },
      { part: "lexeme:daniel", skill: "produce", status: "right" },
    ]);
    expect(JSON.stringify(after.map((r) => r.payload))).not.toMatch(/"(?:sense|form|construction):/u);

    // The server's projection is the device's: core's replay of the log core upgrades.
    const expected = replay(upgradeLog(old, aliases));
    const state = await stateOf(database.db, user, "es");
    expect(state.events).toBe(old.length);
    expect(state.state).toEqual(expected);
    expect(state.state.completedNodes).toEqual(["es.u01.como-estas"]);
    const served = (await (await app.request("/v1/state?course=es", auth(token))).json()) as { state: unknown };
    expect(served.state).toEqual(JSON.parse(JSON.stringify(expected)));

    // Run again: there is nothing of schema 1 left, and nothing changes.
    const payloads = JSON.stringify(after);
    expect(await upgradeStored(database.db, aliases)).toEqual({ upgraded: 0, left: [], withoutTable: [] });
    expect(JSON.stringify(await rows())).toBe(payloads);
  });

  it("rewrites a revision with its answer's template and item, wherever in the log the answer is", async () => {
    const { user } = await signUp();
    const typed = oldAnswer(20, "translate-type.l1-l2", "s.u01.21", [["sense:ser", "right"], ["form:pres-1s", "wrong"], ["sense:daniel", "right"]], "WRONG");
    const revision = oldRevision(30, typed);
    // Stored before its answer: the job meets the revision while the answer is still of the old shape.
    await storeOld(user, [revision, typed]);
    expect(await upgradeStored(database.db, createAliases())).toMatchObject({ upgraded: 2, left: [] });
    const now = (await stored(revision.id))?.payload as LearnerEvent;
    expect(now.schema).toBe(2);
    if (now.type !== "outcome_revised") throw new Error("not a revision");
    expect(now.answer).toBe(typed.id);
    // The answer was typed: its credits are produced (lexemes) and chosen (the value), now right.
    expect(creditsOf(now)).toEqual([
      { part: "lexeme:ser", skill: "produce", status: "right" },
      { part: "feature:Tense=Pres", skill: "choose", status: "right" },
      { part: "lexeme:daniel", skill: "produce", status: "right" },
    ]);
    expect(now.outcome.labels).toEqual([]);
    // And the revision counts: the answer is right in the projection.
    const state = await stateOf(database.db, user, "es");
    expect(state.state).toEqual(replay(upgradeLog([revision, typed], createAliases())));
    expect(state.state.xp.total).toBe(1);
  });

  it("leaves a row that is no old event as it was: in no projection, still in the export", async () => {
    const { token, user } = await signUp();
    const good = oldAnswer(10, "choose-translation", "s.u01.15", [["sense:estar", "right"], ["form:pres-1s", "right"], ["sense:bien", "right"]]);
    const broken = oldAnswer(20, "choose-translation", "s.u01.15", [["sense:estar", "right"]]);
    // What an old server might hold that no schema takes: an answer without its outcome.
    const payloadOf = (e: LearnerEventV1): unknown => (e.id === broken.id ? { ...e, outcome: undefined, input: "garbled" } : e);
    await storeOld(user, [good, broken], payloadOf);
    const brokenPayload = JSON.parse(JSON.stringify(payloadOf(broken))) as unknown;
    expect(validOldEvent(brokenPayload)).toBe(false);

    const result = await upgradeStored(database.db, createAliases());
    expect(result).toEqual({ upgraded: 1, left: [{ id: broken.id, why: "not-an-old-event" }], withoutTable: [] });
    expect(await stored(broken.id)).toEqual({ schema: 1, payload: brokenPayload });
    // No projection reads it.
    expect((await stateOf(database.db, user, "es")).events).toBe(1);
    expect((await since(database.db, user, 0)).events.map((e) => e.id)).toEqual([good.id]);
    const pulled = (await (await app.request("/v1/events?since=0", auth(token))).json()) as { events: { id: string }[] };
    expect(pulled.events.map((e) => e.id)).toEqual([good.id]);
    // It is still the learner's: the export holds it, as it is.
    const exported = (await (await app.request("/v1/export", auth(token))).json()) as { events: { id: string }[] };
    expect(exported.events.map((e) => e.id)).toEqual([good.id, broken.id]);
    expect(exported.events[1]).toEqual(brokenPayload);
    // A second run reports it again and changes nothing.
    expect(await upgradeStored(database.db, createAliases())).toEqual({ upgraded: 0, left: [{ id: broken.id, why: "not-an-old-event" }], withoutTable: [] });
  });

  it("rewrites the rows of a course it has no bundle of, ids by their own names, and says which course", async () => {
    const { user } = await signUp();
    // A course this deployment does not serve (no bundle, so no alias table).
    expect(createAliases()("zz")).toBeUndefined();
    const answer = oldAnswer(10, "choose-translation", "s.1", [["sense:x", "right"], ["form:y", "right"], ["construction:z", "wrong"]], "CORRECT", "zz");
    await storeOld(user, [answer]);
    expect(await upgradeStored(database.db, createAliases())).toEqual({ upgraded: 1, left: [], withoutTable: ["zz"] });
    const now = (await stored(answer.id))?.payload as AnswerSubmitted;
    expect(validEvent(now)).toBe(true);
    // A sense is its lexeme and a construction its rule; a form KC's values are not known without the table: it has none.
    expect(now.exercise.parts).toEqual(["lexeme:x", "rule:z"]);
    expect(creditsOf(now)).toEqual([
      { part: "lexeme:x", skill: "recognize", status: "right" },
      { part: "rule:z", skill: "recognize", status: "wrong" },
    ]);
    expect((await stateOf(database.db, user, "zz")).events).toBe(1);
  });
});
