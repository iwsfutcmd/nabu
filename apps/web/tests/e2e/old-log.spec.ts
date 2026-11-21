/**
 * A device that last ran the app before the lexical model (docs/migration-design.md, "Old events"):
 * its database is at version 3 and every event in it is of schema 1. Opened by the app as it is
 * now, its log is rewritten once, before anything reads it. Every event is then of schema 2, and is
 * what core's `upgradeLog` makes of the old one with the course's alias table; the old events are
 * kept aside, whole; what was waiting to be uploaded still is; the words the learner had met are
 * in the word list, as the core says of the rewritten log; and a second start changes nothing.
 *
 * The log is a real one of the old shape: lessons of Cuban Spanish logged by the tree of before the
 * switch (packages/core/test/golden/es-old-log.jsonl, the fixture core's own upgrade tests read).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { learnedWords, replay, upgradeLog, wordCounts } from "@nabu/core/learner";
import type { AliasTable, BundleManifest, LearnerEvent, LearnerEventV1 } from "@nabu/schema";
import { expect, test, type Page } from "@playwright/test";
import { loadCourse } from "./solver.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const NOW = new Date("2026-02-01T09:00:00Z");

const OLD_LOG = readFileSync(join(ROOT, "packages/core/test/golden/es-old-log.jsonl"), "utf8")
  .split("\n")
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line) as LearnerEventV1);

/** A course's alias table, from the bundle the app is served with (the file its manifest lists with role aliases). */
const aliasesOf = (course: string): AliasTable | undefined => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, course, "manifest.json"), "utf8")) as BundleManifest;
  const file = manifest.files.find((f) => f.role === "aliases");
  return file === undefined ? undefined : (JSON.parse(readFileSync(join(BUNDLES, course, file.path), "utf8")) as AliasTable);
};

const byId = <E extends { readonly id: string }>(events: readonly E[]): E[] => [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * The database as the app of before the switch left it: version 3 (events, meta, received, outbox),
 * the log in it, and every event still waiting in the outbox (a learner who never signed up).
 * Made on the app's own origin without starting the app: a file of the bundles is a page of it.
 */
const seedOldDatabase = async (page: Page, events: readonly LearnerEventV1[]): Promise<void> => {
  await page.goto("/bundles/index.json");
  await page.evaluate(
    (log) =>
      new Promise<void>((done, fail) => {
        const request = indexedDB.open("nabu", 3);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore("events", { keyPath: "id" }).createIndex("course", "course");
          db.createObjectStore("meta");
          db.createObjectStore("received");
          db.createObjectStore("outbox");
        };
        request.onerror = () => fail(request.error ?? new Error("the old database did not open"));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(["events", "outbox"], "readwrite");
          for (const event of log) {
            tx.objectStore("events").put(event);
            tx.objectStore("outbox").put(event.id, event.id);
          }
          tx.onerror = () => fail(tx.error ?? new Error("the old log was not written"));
          tx.oncomplete = () => {
            db.close();
            done();
          };
        };
      }),
    events as LearnerEventV1[],
  );
};

/** What the device holds: its log, the events kept aside, how many wait in the outbox, the database's version. */
const deviceOf = (page: Page) =>
  page.evaluate(async () => {
    const store = window.nabu;
    if (store === undefined) throw new Error("the app has no store");
    const waiting = await new Promise<{ count: number; version: number }>((done, fail) => {
      const request = indexedDB.open("nabu");
      request.onerror = () => fail(request.error ?? new Error("the database did not open"));
      request.onsuccess = () => {
        const db = request.result;
        const count = db.transaction("outbox").objectStore("outbox").count();
        count.onerror = () => fail(count.error ?? new Error("the outbox was not read"));
        count.onsuccess = () => {
          const found = { count: count.result, version: db.version };
          db.close();
          done(found);
        };
      };
    });
    return { log: [...(await store.everyEvent())], readable: [...(await store.allEvents())], before: [...(await store.before())], ...waiting };
  });

test("a log of before the lexical model is rewritten on the first start, and nothing learned is lost", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  expect(OLD_LOG.length).toBeGreaterThan(50);
  expect(OLD_LOG.every((e) => e.schema === 1)).toBe(true);

  // What the rewrite must make of it, and what the core says the learner knows then.
  const expected = upgradeLog(OLD_LOG, aliasesOf);
  const course = loadCourse("es", "es-Latn/standard");
  const words = learnedWords(course, replay(expected), NOW.toISOString());
  expect(words.length).toBeGreaterThan(5);

  await seedOldDatabase(page, OLD_LOG);
  await page.clock.setFixedTime(NOW);
  await page.goto("/?sound=off#/es/es-Latn.standard");
  await page.waitForFunction(() => window.nabu !== undefined);

  const device = await deviceOf(page);
  expect(device.version).toBeGreaterThan(3);
  // Every event in the new shape, as core's upgrade makes it; nothing of the old shape left to read.
  expect(byId(device.log as LearnerEvent[])).toEqual(byId(expected));
  expect(device.readable).toHaveLength(OLD_LOG.length);
  // The old events kept aside, whole; the outbox as it was.
  expect(byId(device.before)).toEqual(byId(OLD_LOG));
  expect(device.count).toBe(OLD_LOG.length);

  // The course page and the word list say what the learner had learned.
  const counts = wordCounts(words);
  const link = page.locator("[data-words-link]");
  await expect(link).toHaveAttribute("data-count", String(counts.known));
  await link.click();
  const list = page.locator("[data-word-list=es]");
  await expect(list.locator("[data-words-count]")).toHaveAttribute("data-words-count", String(words.length));
  expect(await list.locator("[data-word]").evaluateAll((els) => els.map((e) => e.getAttribute("data-word")))).toEqual(words.map((w) => w.lexeme));

  // A second start finds nothing to do: the log and what was kept aside are as they were.
  await page.reload();
  await page.waitForFunction(() => window.nabu !== undefined);
  const again = await deviceOf(page);
  expect(byId(again.log as LearnerEvent[])).toEqual(byId(expected));
  expect(byId(again.before)).toEqual(byId(OLD_LOG));
  expect(again.count).toBe(OLD_LOG.length);
  expect(errors).toEqual([]);
});
