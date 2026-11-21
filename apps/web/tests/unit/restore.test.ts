/**
 * Restoring a downloaded file (S6 in the 2026-11 review): every event checked against the event
 * schema, as the server checks uploads; what the device has already left as it is; a second restore
 * of the same file changes nothing.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { upgradeLog } from "@nabu/core/learner";
import type { AliasTable, AnswerSubmittedV1, BundleManifest, KcId, LearnerEvent, LearnerEventV1, OrthographyId, OutcomeRevisedV1 } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { validEvent, validOldEvent } from "../../src/event-schema.ts";
import { eventValidator, inNewShape, oldEventValidator, readEventsFile, restoreEvents } from "../../src/restore.ts";
import { openStore } from "../../src/store.ts";

const event = (n: number): LearnerEvent => ({
  id: `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  type: "answer_submitted",
  schema: 2,
  device: "phone",
  course: n % 2 === 0 ? "fa" : "yue",
  orthography: (n % 2 === 0 ? "fa-Arab/standard" : "yue-Hant-HK/standard") as OrthographyId,
  support: "en",
  bundle: "0".repeat(64),
  session: "00000000-0000-7000-a000-000000000001",
  clientTime: `2026-11-12T09:00:${String(n).padStart(2, "0")}.000+01:00`,
  localDate: "2026-11-12",
  tz: "Europe/Paris",
  exercise: { id: `choose-translation:s${n}`, template: "choose-translation", item: `s${n}`, parts: [] },
  attempt: 1,
  input: { method: "choice", latencyMs: 2100 },
  outcome: { kind: "CORRECT", notes: [], labels: [], parts: [] },
});

/** As "Download my learning data" writes it: one event per line. */
const lines = (events: readonly unknown[]): string => events.map((e) => `${JSON.stringify(e)}\n`).join("");

describe("reading a downloaded file", () => {
  it("takes the events, one per line, and counts what is not one", () => {
    const [a, b] = [event(1), event(2)];
    const text = `${lines([a])}not json at all\n\n${JSON.stringify({ ...b, clientTime: "yesterday" })}\n${lines([b, a])}`;
    const file = readEventsFile(text, validEvent);
    expect(file.events.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(file.invalid).toBe(2);
  });

  it("reads the account's download ({events}), a list, and a single event", () => {
    const events = [event(1), event(2), event(3)];
    expect(readEventsFile(JSON.stringify({ user: { email: "a@b.example" }, events, courses: [] }, null, 2), validEvent)).toEqual({ events, old: [], invalid: 0 });
    expect(readEventsFile(JSON.stringify(events), validEvent)).toEqual({ events, old: [], invalid: 0 });
    expect(readEventsFile(JSON.stringify(events[0]), validEvent)).toEqual({ events: [events[0]], old: [], invalid: 0 });
  });

  it("holds an event to the schema the server holds uploads to", async () => {
    const valid = await eventValidator();
    expect(valid(event(1))).toBe(true);
    expect(valid({ ...event(1), appVersion: "2" })).toBe(false); // a field the schema does not know
    expect(valid({ ...event(1), id: "not a uuid" })).toBe(false);
    expect(readEventsFile("a photo, perhaps\n", valid)).toEqual({ events: [], old: [], invalid: 1 });
  });
});

describe("restoring", () => {
  it("adds what the device lacks, keeps what it has, and a second restore changes nothing", async () => {
    const store = await openStore();
    const [a, b, c] = [event(1), event(2), event(3)];
    await store.append([a]);
    const { events } = readEventsFile(lines([a, b, c]), validEvent);
    const have = await store.ids();
    const fresh = events.filter((e) => !have.has(e.id));
    expect(fresh.map((e) => e.id)).toEqual([b.id, c.id]);
    expect(await restoreEvents(store.append, fresh)).toBe(2);
    expect((await store.allEvents()).map((e) => e.id).sort()).toEqual([a.id, b.id, c.id]);
    expect(await restoreEvents(store.append, events)).toBe(0);
    // In the outbox like any event recorded here: an account sends them on the next sync.
    expect(await store.pendingCount()).toBe(3);
  });

  it("goes in chunks, and counts across them", async () => {
    const store = await openStore();
    const many = Array.from({ length: 1234 }, (_, i) => event(i + 1));
    const chunks: number[] = [];
    const added = await restoreEvents(async (events) => {
      chunks.push(events.length);
      return store.append(events);
    }, many);
    expect(added).toBe(1234);
    expect(chunks).toEqual([500, 500, 234]);
  });
});

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const esManifest = JSON.parse(readFileSync(join(BUNDLES, "es", "manifest.json"), "utf8")) as BundleManifest;
const ALIASES = JSON.parse(readFileSync(join(BUNDLES, "es", esManifest.files.find((f) => f.role === "aliases")?.path ?? "aliases.json"), "utf8")) as AliasTable;
const aliasesOf = (course: string): Promise<AliasTable | undefined> => Promise.resolve(course === "es" ? ALIASES : undefined);

/** A real log of before the lexical model: six sessions of es, as the app before the switch logged and downloaded them. */
const OLD_LOG: readonly LearnerEventV1[] = readFileSync(join(ROOT, "packages/core/test/golden/es-old-log.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => JSON.parse(line) as LearnerEventV1);

/** An answer as an app of before the lexical model logged it: KCs, each credited right or wrong. */
const oldAnswer = (n: number, status: "right" | "wrong" = "right"): AnswerSubmittedV1 => ({
  id: `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  type: "answer_submitted",
  schema: 1,
  device: "phone",
  course: "es",
  orthography: "es-Latn/standard" as OrthographyId,
  support: "en",
  bundle: "0".repeat(64),
  session: "00000000-0000-7000-a000-000000000002",
  clientTime: `2026-11-10T09:00:${String(n).padStart(2, "0")}.000+01:00`,
  localDate: "2026-11-10",
  tz: "Europe/Paris",
  exercise: { id: `translate-type.l1-l2:s${n}`, template: "translate-type.l1-l2", item: `s${n}`, kcs: ["sense:hablar" as KcId] },
  attempt: 1,
  input: { method: "text", latencyMs: 5200 },
  outcome: { kind: status === "right" ? "CORRECT" : "WRONG", notes: [], kcs: [{ kc: "sense:hablar" as KcId, status }] },
});

describe("reading a file downloaded before the lexical model", () => {
  it("reads its old events as old where the old shape is checked, and counts them invalid where it is not", () => {
    const [a, b] = [oldAnswer(21), oldAnswer(22)];
    const text = lines([a, event(4), b, a]);
    const file = readEventsFile(text, validEvent, validOldEvent);
    expect(file.events.map((e) => e.id)).toEqual([event(4).id]);
    expect(file.old).toEqual([a, b]);
    expect(file.invalid).toBe(0);
    expect(readEventsFile(text, validEvent)).toEqual({ events: [event(4)], old: [], invalid: 3 });
    // The whole of a real old download.
    const real = readEventsFile(lines(OLD_LOG), validEvent, validOldEvent);
    expect(real).toEqual({ events: [], old: OLD_LOG, invalid: 0 });
  });

  it("gives its old events in the new shape, a revision with the answer it revises in the same file", async () => {
    const answer = oldAnswer(23, "wrong");
    const { exercise: _exercise, attempt: _attempt, input: _input, outcome: _outcome, type: _type, ...meta } = answer;
    const revision: OutcomeRevisedV1 = {
      ...meta,
      id: "00000000-0000-7000-8000-000000000030",
      type: "outcome_revised",
      answer: answer.id,
      outcome: { kind: "CORRECT_PROVISIONAL", notes: ["judge"], kcs: [{ kc: "sense:hablar" as KcId, status: "right" }] },
      by: "judge",
    };
    // The revision first in the file, its answer after it, and an event of the new shape between.
    const file = readEventsFile(lines([revision, event(4), answer]), validEvent, validOldEvent);
    expect(file.old.map((e) => e.id)).toEqual([revision.id, answer.id]);
    const events = await inNewShape(file, aliasesOf);
    expect(events.every((e) => e.schema === 2)).toBe(true);
    expect(events.map((e) => e.id)).toEqual([revision.id, answer.id, event(4).id]);
    expect(events.every((e) => validEvent(e))).toBe(true);
    const revised = events.find((e) => e.id === revision.id);
    if (revised?.type !== "outcome_revised") throw new Error("not a revision");
    // Its answer was typed: the lexeme is credited as produced, which the revision alone could not say.
    expect(revised.outcome.parts).toEqual([{ part: "lexeme:hablar", skill: "produce", status: "right" }]);
    // A file with nothing old comes back as it is.
    const plain = readEventsFile(lines([event(4)]), validEvent, validOldEvent);
    expect(await inNewShape(plain, aliasesOf)).toBe(plain.events);
  });

  it("rewrites a real old download as core rewrites the device's log", async () => {
    const events = await inNewShape(readEventsFile(lines(OLD_LOG), validEvent, validOldEvent), aliasesOf);
    expect(events).toEqual(upgradeLog(OLD_LOG, () => ALIASES));
  });

  it("keeps the new one of an event the file holds in both shapes", () => {
    const old = oldAnswer(24);
    const [now] = upgradeLog([old], () => ALIASES);
    if (now === undefined) throw new Error("nothing rewritten");
    for (const order of [
      [old, now],
      [now, old],
    ]) {
      const file = readEventsFile(lines(order), validEvent, validOldEvent);
      expect(file).toEqual({ events: [now], old: [], invalid: 0 });
    }
  });

  it("holds each shape to its own schema", async () => {
    const [valid, validOld] = [await eventValidator(), await oldEventValidator()];
    const old = OLD_LOG.find((e) => e.type === "answer_submitted");
    if (old === undefined) throw new Error("no old answer");
    const [now] = upgradeLog([old], () => ALIASES);
    expect(validOld(old)).toBe(true);
    expect(valid(now)).toBe(true);
    expect(valid(old)).toBe(false);
    expect(validOld(now)).toBe(false);
    expect(OLD_LOG.every((e) => validOld(e) && !valid(e))).toBe(true);
    expect(upgradeLog(OLD_LOG, () => ALIASES).every((e) => valid(e) && !validOld(e))).toBe(true);
  });
});
