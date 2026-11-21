/**
 * The deploy's job that rewrites the stored events of before the lexical model (schema 1) in the
 * new shape (docs/migration-design.md, "Old events"). It runs when the server starts, before it
 * serves: once every row is of schema 2 it finds nothing and does nothing. Each row is rewritten
 * by core's `upgrade`, the same function a device rewrites its own log with, with the alias table
 * of the row's course (from its bundle); a revision takes the answer it revises, wherever that is
 * in its user's log.
 *
 * A row it cannot rewrite stays as it is (and out of every projection, which read schema 2): one
 * that is no valid event of the old shape, or whose rewriting does not fit the new one. It says
 * how many and which, never what they hold.
 */
import { existsSync, readFileSync } from "node:fs";
import { upgrade, type RevisedAnswer } from "@nabu/core/learner";
import type { AliasTable, BundleManifest } from "@nabu/schema";
import { and, asc, eq, gt } from "drizzle-orm";
import { DEFAULT_BUNDLES } from "./ai/courses.ts";
import type { Db } from "./db/index.ts";
import { events } from "./db/schema.ts";
import { SCHEMA, validEvent, validOldEvent } from "./log.ts";

/** What each KC id of a course became: its bundle's alias table, or undefined for a course the deployment has no bundle of. */
export type AliasesOf = (course: string) => AliasTable | undefined;

const SAFE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

/** The alias tables of the deployment's bundles (NABU_BUNDLES, default the web app's), read as they are asked for. */
export const createAliases = (dir: URL = DEFAULT_BUNDLES): AliasesOf => {
  const tables = new Map<string, AliasTable | undefined>();
  return (course) => {
    if (!tables.has(course)) {
      const manifest = new URL(`${course}/manifest.json`, dir);
      let table: AliasTable | undefined;
      if (SAFE_ID.test(course) && existsSync(manifest)) {
        const file = (JSON.parse(readFileSync(manifest, "utf8")) as BundleManifest).files.find((f) => f.role === "aliases");
        table = file === undefined ? undefined : (JSON.parse(readFileSync(new URL(`${course}/${file.path}`, dir), "utf8")) as AliasTable);
      }
      tables.set(course, table);
    }
    return tables.get(course);
  };
};

export interface Upgraded {
  /** Rows rewritten in the new shape. */
  readonly upgraded: number;
  /** Rows left as they were, each by its event id and why. */
  readonly left: readonly { readonly id: string; readonly why: "not-an-old-event" | "does-not-fit" }[];
  /** Courses whose rows were rewritten without an alias table (the deployment has no bundle of them): their ids keep their own names. */
  readonly withoutTable: readonly string[];
}

const BATCH = 500;

/** Rewrites every stored event of schema 1 in the new shape. Safe to run again: it reads only rows still of schema 1. */
export const upgradeStored = async (db: Db, aliasesOf: AliasesOf): Promise<Upgraded> => {
  let upgraded = 0;
  const left: { id: string; why: "not-an-old-event" | "does-not-fit" }[] = [];
  const withoutTable = new Set<string>();
  let after = 0;
  for (;;) {
    const rows = await db
      .select({ seq: events.seq, id: events.id, userId: events.userId, payload: events.payload })
      .from(events)
      .where(and(eq(events.schema, 1), gt(events.seq, after)))
      .orderBy(asc(events.seq))
      .limit(BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.seq;
      const old = row.payload;
      if (!validOldEvent(old)) {
        left.push({ id: row.id, why: "not-an-old-event" });
        continue;
      }
      const table = old.type === "goal_set" ? undefined : aliasesOf(old.course);
      if (old.type !== "goal_set" && table === undefined) withoutTable.add(old.course);
      let answer: RevisedAnswer | undefined;
      if (old.type === "outcome_revised") {
        const [found] = await db.select({ payload: events.payload }).from(events).where(and(eq(events.userId, row.userId), eq(events.id, old.answer)));
        const revised = found?.payload;
        if (validOldEvent(revised) ? revised.type === "answer_submitted" : validEvent(revised) && revised.type === "answer_submitted") answer = revised as RevisedAnswer;
      }
      const now = upgrade(old, table, answer);
      if (!validEvent(now)) {
        left.push({ id: row.id, why: "does-not-fit" });
        continue;
      }
      await db.update(events).set({ payload: now, schema: SCHEMA }).where(eq(events.id, row.id));
      upgraded += 1;
    }
  }
  return { upgraded, left, withoutTable: [...withoutTable].sort() };
};
