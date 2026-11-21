/**
 * The device's log of before the lexical model, rewritten in the new shape (docs/migration-design.md,
 * "Old events"): once, when the app first opens after the update, before anything reads the log.
 * Core's `upgrade` does the rewriting, the same function the server rewrites its rows with; this
 * module finds each course's alias table (in its bundle), writes the events back and keeps the old
 * ones aside.
 *
 * - Every event is rewritten at once, so nothing on the device reads the old shape after this.
 * - A course whose table cannot be had now (offline, its bundle not here) is rewritten without it:
 *   its lexemes keep everything they had; what it learned of forms waits. It is noted (meta
 *   `upgraded-without-table`) and done again from the events kept aside the next time the app
 *   opens with the table in reach.
 * - A session left part-way was planned in the old shape: its plan goes, and the session starts
 *   again (its answers so far are in the log).
 *
 * No window, no React: the app calls it as it starts.
 */
import { isOld, upgradeLog } from "@nabu/core/learner";
import type { AliasTable, LearnerEvent, LearnerEventV1 } from "@nabu/schema";
import type { EventStore } from "./store.ts";

/** Meta: the shape the log was last brought to. */
export const LOG_SHAPE = "log-shape";
/** Meta: the courses whose events were rewritten without their alias table, to be done again. */
export const WITHOUT_TABLE = "upgraded-without-table";
/** Meta: the session in progress (open-session.ts), dropped when the log is rewritten. */
const OPEN_SESSION = "open-session";

const SHAPE = 2;
const CHUNK = 500;

/** A course's alias table, or undefined where it cannot be had now. */
export type AliasesOf = (course: string) => Promise<AliasTable | undefined>;

/** The alias tables of the app's bundles: each a file its course's manifest lists (role `aliases`). */
export const bundleAliases = (bundles: string, get: (url: string) => Promise<Response> = (url) => fetch(url)): AliasesOf => {
  const json = async (url: string): Promise<unknown> => {
    const response = await get(url);
    if (!response.ok) throw new Error(`no ${url}`);
    return (await response.json()) as unknown;
  };
  return async (course) => {
    try {
      const manifest = (await json(`${bundles}${course}/manifest.json`)) as { readonly files?: readonly { readonly role: string; readonly path: string }[] };
      const file = manifest.files?.find((f) => f.role === "aliases");
      return file === undefined ? undefined : ((await json(`${bundles}${course}/${file.path}`)) as AliasTable);
    } catch {
      return undefined;
    }
  };
};

export interface LogUpgrade {
  /** Events rewritten in the new shape now. */
  readonly upgraded: number;
  /** Courses still rewritten without their table. */
  readonly withoutTable: readonly string[];
}

const courseOf = (e: LearnerEvent | LearnerEventV1): string | undefined => (e.type === "goal_set" ? undefined : e.course);

const tablesFor = async (courses: Iterable<string>, aliasesOf: AliasesOf): Promise<Map<string, AliasTable | undefined>> => {
  const tables = new Map<string, AliasTable | undefined>();
  for (const course of new Set(courses)) tables.set(course, await aliasesOf(course));
  return tables;
};

const write = async (store: EventStore, events: readonly LearnerEvent[], before: readonly LearnerEventV1[]): Promise<void> => {
  // Each chunk keeps its old events aside in the same transaction that writes the new ones.
  const kept = new Map(before.map((e) => [e.id, e]));
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    await store.rewrite(
      chunk,
      chunk.flatMap((e) => kept.get(e.id) ?? []),
    );
  }
};

/**
 * Brings the device's log to the new shape. Safe to call on every start: with nothing old in the
 * log and no course waiting for its table, it reads one setting and returns.
 */
export const upgradeDeviceLog = async (store: EventStore, aliasesOf: AliasesOf): Promise<LogUpgrade> => {
  const waiting = ((await store.getMeta(WITHOUT_TABLE)) ?? []) as readonly string[];
  if ((await store.getMeta(LOG_SHAPE)) === SHAPE && waiting.length === 0) return { upgraded: 0, withoutTable: [] };
  const log = await store.everyEvent();
  const old = log.filter(isOld);
  const without = new Set(waiting);
  let upgraded = 0;
  if (old.length > 0) {
    const tables = await tablesFor(old.flatMap((e) => courseOf(e) ?? []), aliasesOf);
    for (const [course, table] of tables) if (table === undefined) without.add(course);
    // The whole log goes in, so a revision finds the answer it revises whichever shape that is in.
    const now = upgradeLog(log, (course) => tables.get(course));
    const ids = new Set(old.map((e) => e.id));
    await write(
      store,
      now.filter((e) => ids.has(e.id)),
      old,
    );
    upgraded = old.length;
    await store.deleteMeta(OPEN_SESSION);
  }
  // Courses rewritten without their table, before or just now: done again from the events kept
  // aside, once the table is in reach.
  const again = [...without].filter((course) => waiting.includes(course));
  if (again.length > 0) {
    const tables = await tablesFor(again, aliasesOf);
    const found = again.filter((course) => tables.get(course) !== undefined);
    if (found.length > 0) {
      const kept = await store.before();
      const current = await store.everyEvent();
      const redo = kept.filter((e) => found.includes(courseOf(e) ?? ""));
      const ids = new Set(redo.map((e) => e.id));
      // The kept events of these courses in place of their rewritten ones, among the rest of the log.
      const mixed = [...current.filter((e) => !ids.has(e.id)), ...redo];
      const now = upgradeLog(mixed, (course) => tables.get(course));
      await write(
        store,
        now.filter((e) => ids.has(e.id)),
        [],
      );
      for (const course of found) without.delete(course);
    }
  }
  const left = [...without].sort();
  if (left.length > 0) await store.setMeta(WITHOUT_TABLE, left);
  else await store.deleteMeta(WITHOUT_TABLE);
  await store.setMeta(LOG_SHAPE, SHAPE);
  return { upgraded, withoutTable: left };
};
