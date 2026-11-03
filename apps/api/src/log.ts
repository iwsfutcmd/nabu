/**
 * The server's event log (gameplan §14.2). Uploads are validated against the
 * same JSON Schema the client's types come from, appended with the event id
 * as the idempotency key, and read back in receipt order by cursor. The
 * learner's state is the same pure replay the device runs, so a device can
 * check that the server agrees with it.
 */
import { readFileSync } from "node:fs";
import { replay, type LearnerState } from "@nabu/core/learner";
import type { LearnerEvent } from "@nabu/schema";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { and, asc, eq, gt, inArray, max } from "drizzle-orm";
import type { Db } from "./db/index.ts";
import { events } from "./db/schema.ts";

export const MAX_BATCH = 500;

/** The repository's schemas/ directory: the source of truth the client's types are generated from. */
const SCHEMAS = new URL("../../../schemas/", import.meta.url);
const schema = (file: string): object => JSON.parse(readFileSync(new URL(file, SCHEMAS), "utf8")) as object;

const ajv = new Ajv2020({ strict: true, allErrors: false });
// Annotation read by json-schema-to-typescript; meaningless to validators.
ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
ajv.addSchema(schema("common.schema.json"));
const validate = ajv.compile<LearnerEvent>(schema("learner-event.schema.json"));

/** Whether a value is a valid learner event (schemas/learner-event.schema.json). */
export const validEvent = (value: unknown): value is LearnerEvent => validate(value);

export type UploadError =
  | { readonly code: "invalid-batch" }
  | { readonly code: "batch-too-large"; readonly max: number }
  | { readonly code: "invalid-event"; readonly index: number; readonly errors: readonly ErrorObject[] }
  | { readonly code: "foreign-event"; readonly index: number };

export interface UploadResult {
  readonly accepted: number;
  readonly duplicates: number;
  readonly cursor: number;
}

/** The newest receipt position of a user's log (0 for an empty log). */
const cursorOf = async (db: Db, user: string): Promise<number> => {
  const [row] = await db.select({ seq: max(events.seq) }).from(events).where(eq(events.userId, user));
  return Number(row?.seq ?? 0);
};

export const checkBatch = (body: unknown, user: string): { ok: true; events: readonly LearnerEvent[] } | { ok: false; error: UploadError } => {
  const batch = typeof body === "object" && body !== null ? (body as { events?: unknown }).events : undefined;
  if (!Array.isArray(batch)) return { ok: false, error: { code: "invalid-batch" } };
  if (batch.length > MAX_BATCH) return { ok: false, error: { code: "batch-too-large", max: MAX_BATCH } };
  for (const [index, e] of batch.entries()) {
    if (!validate(e)) return { ok: false, error: { code: "invalid-event", index, errors: validate.errors ?? [] } };
    // Events recorded before sign-up carry no user; any that do must be this user's.
    if (e.user !== undefined && e.user !== user) return { ok: false, error: { code: "foreign-event", index } };
  }
  return { ok: true, events: batch as LearnerEvent[] };
};

/** Appends events, stamped with when the server received them; an id already in the log is a duplicate and changes nothing. */
export const append = async (db: Db, user: string, batch: readonly LearnerEvent[], receivedAt: Date = new Date()): Promise<UploadResult> => {
  const rows = batch.map((e) => ({
    serverTime: receivedAt,
    id: e.id,
    userId: user,
    deviceId: e.device,
    type: e.type,
    schema: e.schema,
    course: e.course,
    bundle: e.bundle,
    clientTime: new Date(e.clientTime),
    localDate: e.localDate,
    tz: e.tz,
    payload: e,
  }));
  const inserted = rows.length === 0 ? [] : await db.insert(events).values(rows).onConflictDoNothing({ target: events.id }).returning({ id: events.id });
  return { accepted: inserted.length, duplicates: batch.length - inserted.length, cursor: await cursorOf(db, user) };
};

export interface Page {
  readonly events: readonly LearnerEvent[];
  readonly cursor: number;
  readonly more: boolean;
}

/** A user's events after `since`, in receipt order: what another device has not seen yet. */
export const since = async (db: Db, user: string, after: number, limit = MAX_BATCH): Promise<Page> => {
  const rows = await db
    .select({ seq: events.seq, payload: events.payload })
    .from(events)
    .where(and(eq(events.userId, user), gt(events.seq, after)))
    .orderBy(asc(events.seq))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return { events: page.map((r) => r.payload as LearnerEvent), cursor: page.at(-1)?.seq ?? after, more: rows.length > limit };
};

/** A user's events for one course, in no particular order. */
export const eventsOf = async (db: Db, user: string, course: string): Promise<LearnerEvent[]> =>
  (await db.select({ payload: events.payload }).from(events).where(and(eq(events.userId, user), eq(events.course, course)))).map((r) => r.payload as LearnerEvent);

/** The state a user's log for one course projects to: core's replay, as on the device. */
export const stateOf = async (db: Db, user: string, course: string): Promise<{ readonly events: number; readonly state: Omit<LearnerState, "seen"> }> => {
  const log = await eventsOf(db, user, course);
  const { seen: _seen, ...state } = replay(log);
  return { events: log.length, state };
};

/** Which of these event ids the user's log already holds. */
export const existing = async (db: Db, user: string, ids: readonly string[]): Promise<ReadonlySet<string>> =>
  ids.length === 0
    ? new Set()
    : new Set((await db.select({ id: events.id }).from(events).where(and(eq(events.userId, user), inArray(events.id, [...ids])))).map((r) => r.id));
