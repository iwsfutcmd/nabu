/**
 * The device's log of before the lexical model, rewritten once as the app starts (upgrade-log.ts,
 * docs/migration-design.md "Old events"): every event in the new shape by core's `upgradeLog`, the
 * old ones kept aside, the outbox left as it was, a kept session plan dropped; a course whose alias
 * table cannot be had is rewritten without it and done again once it can. Runs on the in-memory
 * store (Node has no IndexedDB), over a real old log (six sessions of es, as the app before the
 * switch logged them) and the es bundle's alias table.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { upgrade, upgradeLog } from "@nabu/core/learner";
import type { AliasTable, BundleManifest, LearnerEvent, LearnerEventV1 } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { openStore, type EventStore } from "../../src/store.ts";
import { bundleAliases, LOG_SHAPE, upgradeDeviceLog, WITHOUT_TABLE, type AliasesOf } from "../../src/upgrade-log.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const manifest = JSON.parse(readFileSync(join(BUNDLES, "es", "manifest.json"), "utf8")) as BundleManifest;
const aliasesFile = manifest.files.find((f) => f.role === "aliases");
if (aliasesFile === undefined) throw new Error("the es bundle lists no alias table");
const ALIASES = JSON.parse(readFileSync(join(BUNDLES, "es", aliasesFile.path), "utf8")) as AliasTable;

const OLD: readonly LearnerEventV1[] = readFileSync(join(ROOT, "packages/core/test/golden/es-old-log.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line !== "")
  .map((line) => JSON.parse(line) as LearnerEventV1);

const withTable: AliasesOf = (course) => Promise.resolve(course === "es" ? ALIASES : undefined);
const noTable: AliasesOf = () => Promise.resolve(undefined);

/** A device whose log holds these old events, recorded here (all in the outbox), as the app before the switch left it. */
const deviceWith = async (events: readonly LearnerEventV1[]): Promise<EventStore> => {
  const store = await openStore();
  expect(store.persistent).toBe(false); // the in-memory store
  // The store's own type is the new shape: an old log only ever got there through an app of before.
  await store.append(events as unknown as readonly LearnerEvent[]);
  return store;
};

const ids = (events: readonly { readonly id: string }[]): string[] => events.map((e) => e.id).sort();
const byId = <E extends { readonly id: string }>(events: readonly E[]): Map<string, E> => new Map(events.map((e) => [e.id, e]));

/** An old answer that credited a form KC whose sentence the table says teaches feature values. */
const formAnswer = ((): { readonly event: LearnerEventV1; readonly kc: string; readonly values: readonly string[] } => {
  for (const e of OLD) {
    if (e.type !== "answer_submitted") continue;
    for (const credit of e.outcome.kcs) {
      const values = ALIASES.aliases[credit.kc]?.byItem?.[e.exercise.item];
      if (credit.kc.startsWith("form:") && values !== undefined && values.some((v) => v.startsWith("feature:"))) return { event: e, kc: credit.kc, values };
    }
  }
  throw new Error("the old log credits no form a sentence teaches");
})();

const partsOf = (e: LearnerEvent | undefined): readonly string[] => (e?.type === "answer_submitted" ? e.outcome.parts.map((c) => c.part) : []);

describe("rewriting the device's log in the new shape", () => {
  it("rewrites every old event as core's upgradeLog does, keeps the old ones aside and notes the shape", async () => {
    expect(OLD.length).toBeGreaterThan(0);
    expect(OLD.every((e) => e.schema === 1)).toBe(true);
    const store = await deviceWith(OLD);
    // Before the rewrite no reader sees an old event.
    expect(await store.allEvents()).toEqual([]);
    const result = await upgradeDeviceLog(store, withTable);
    expect(result).toEqual({ upgraded: OLD.length, withoutTable: [] });
    const every = await store.everyEvent();
    expect(every.every((e) => e.schema === 2)).toBe(true);
    expect(ids(every)).toEqual(ids(OLD));
    // The old events as they were.
    const kept = byId(await store.before());
    expect(kept.size).toBe(OLD.length);
    for (const e of OLD) expect(kept.get(e.id)).toEqual(e);
    expect(await store.getMeta(LOG_SHAPE)).toBe(2);
    expect(await store.getMeta(WITHOUT_TABLE)).toBeUndefined();
    // What the readers get is core's rewrite, event for event.
    const expected = byId(upgradeLog(OLD, () => ALIASES));
    const all = await store.allEvents();
    expect(ids(all)).toEqual(ids([...expected.values()]));
    for (const e of all) expect(e).toEqual(expected.get(e.id));
    expect(ids(await store.eventsOf("es"))).toEqual(ids(OLD));
  });

  it("does nothing a second time, and on a fresh device only notes the shape", async () => {
    const store = await deviceWith(OLD);
    await upgradeDeviceLog(store, withTable);
    const once = await store.everyEvent();
    let asked = 0;
    const counting: AliasesOf = (course) => {
      asked++;
      return withTable(course);
    };
    await store.setMeta("open-session", { course: "es" });
    expect(await upgradeDeviceLog(store, counting)).toEqual({ upgraded: 0, withoutTable: [] });
    expect(asked).toBe(0);
    expect(await store.everyEvent()).toEqual(once);
    // Nothing rewritten: a session kept part-way stays.
    expect(await store.getMeta("open-session")).toEqual({ course: "es" });

    const fresh = await openStore();
    expect(await fresh.getMeta(LOG_SHAPE)).toBeUndefined();
    expect(await upgradeDeviceLog(fresh, counting)).toEqual({ upgraded: 0, withoutTable: [] });
    expect(asked).toBe(0);
    expect(await fresh.getMeta(LOG_SHAPE)).toBe(2);
    expect(await fresh.everyEvent()).toEqual([]);
    expect(await fresh.before()).toEqual([]);
  });

  it("rewrites a course whose table cannot be had without it, and again from the events kept aside once it can", async () => {
    const store = await deviceWith(OLD);
    expect(await upgradeDeviceLog(store, noTable)).toEqual({ upgraded: OLD.length, withoutTable: ["es"] });
    expect(await store.getMeta(WITHOUT_TABLE)).toEqual(["es"]);
    const without = byId(await store.everyEvent());
    expect([...without.values()].every((e) => e.schema === 2)).toBe(true);
    // Lexemes by their own names; what it learned of forms waits.
    for (const e of OLD) expect(without.get(e.id)).toEqual(upgrade(e, undefined));
    const answer = without.get(formAnswer.event.id) as LearnerEvent;
    expect(partsOf(answer).length).toBeGreaterThan(0);
    expect(partsOf(answer).some((p) => p.startsWith("feature:"))).toBe(false);
    expect(ids(await store.before())).toEqual(ids(OLD));

    // Still out of reach: nothing changes, and the note stays.
    expect(await upgradeDeviceLog(store, noTable)).toEqual({ upgraded: 0, withoutTable: ["es"] });
    expect(byId(await store.everyEvent())).toEqual(without);

    // In reach: done again from the old events, as if the table had been there the first time.
    expect(await upgradeDeviceLog(store, withTable)).toEqual({ upgraded: 0, withoutTable: [] });
    expect(await store.getMeta(WITHOUT_TABLE)).toBeUndefined();
    const expected = byId(upgradeLog(OLD, () => ALIASES));
    const now = await store.allEvents();
    for (const e of now) expect(e).toEqual(expected.get(e.id));
    // The form's credit is now the feature values its sentence teaches.
    for (const value of formAnswer.values) expect(partsOf(now.find((e) => e.id === formAnswer.event.id))).toContain(value);
    expect(ids(await store.before())).toEqual(ids(OLD));
  });

  it("leaves the outbox as it was, and drops a session kept part-way", async () => {
    const store = await deviceWith(OLD);
    await store.acknowledge(OLD.slice(0, 10).map((e) => e.id));
    const pending = await store.pendingIds();
    expect(pending.size).toBe(OLD.length - 10);
    await store.setMeta("open-session", { course: "es", plan: [] });
    await upgradeDeviceLog(store, withTable);
    expect(await store.pendingIds()).toEqual(pending);
    expect(await store.getMeta("open-session")).toBeUndefined();
    // The outbox now gives the events in the new shape.
    expect((await store.pending(500)).every((e) => e.schema === 2)).toBe(true);
  });

  it("leaves what was recorded in the new shape after the rewrite alone when a course is done again", async () => {
    const store = await deviceWith(OLD);
    await upgradeDeviceLog(store, noTable);
    // An answer recorded since, in the new shape: a copy of one rewritten, with its own id.
    const since = byId(upgradeLog(OLD, () => ALIASES)).get(formAnswer.event.id);
    if (since?.type !== "answer_submitted") throw new Error("no rewritten answer");
    const recorded: LearnerEvent = { ...since, id: "00000000-0000-7fff-8000-000000000001", outcome: { ...since.outcome, parts: [] } };
    expect(await store.append([recorded])).toEqual([recorded.id]);
    await upgradeDeviceLog(store, withTable);
    expect((await store.allEvents()).find((e) => e.id === recorded.id)).toEqual(recorded);
    expect(ids(await store.before())).toEqual(ids(OLD));
  });
});

describe("a course's alias table, from its bundle", () => {
  const BASE = "/bundles/";
  const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  const missing = (): Response => new Response("", { status: 404 });

  it("reads the file the manifest lists with role aliases", async () => {
    const asked: string[] = [];
    const get = (url: string): Promise<Response> => {
      asked.push(url);
      if (url === `${BASE}es/manifest.json`) return Promise.resolve(json(manifest));
      if (url === `${BASE}es/${aliasesFile.path}`) return Promise.resolve(json(ALIASES));
      return Promise.resolve(missing());
    };
    expect(await bundleAliases(BASE, get)("es")).toEqual(ALIASES);
    expect(asked).toEqual([`${BASE}es/manifest.json`, `${BASE}es/${aliasesFile.path}`]);
  });

  it("gives undefined where the manifest or the file cannot be had, or the manifest lists none", async () => {
    expect(await bundleAliases(BASE, () => Promise.resolve(missing()))("es")).toBeUndefined();
    expect(await bundleAliases(BASE, () => Promise.reject(new TypeError("offline")))("es")).toBeUndefined();
    const manifestOnly = (url: string): Promise<Response> => Promise.resolve(url.endsWith("manifest.json") ? json(manifest) : missing());
    expect(await bundleAliases(BASE, manifestOnly)("es")).toBeUndefined();
    const noAliases = { ...manifest, files: manifest.files.filter((f) => f.role !== "aliases") };
    let fetched = 0;
    const listsNone = (url: string): Promise<Response> => {
      fetched++;
      return Promise.resolve(url.endsWith("manifest.json") ? json(noAliases) : json(ALIASES));
    };
    expect(await bundleAliases(BASE, listsNone)("es")).toBeUndefined();
    expect(fetched).toBe(1);
  });
});
