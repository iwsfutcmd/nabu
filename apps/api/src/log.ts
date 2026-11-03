/**
 * The server's event log (gameplan §14.2). Uploads are validated against the
 * same JSON Schema the client's types come from, appended with the event id
 * as the idempotency key, and read back in receipt order by cursor. The
 * learner's state is the same pure replay the device runs, so a device can
 * check that the server agrees with it.
 */
import { readFileSync } from "node:fs";
import { localDateOf, replayGame, type GameConfig, type GameState } from "@nabu/core/game";
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
  /** When the server first received each event of the batch (ISO): devices fold it into the streak's grace window as the server does (§12.2). */
  readonly received: Readonly<Record<string, string>>;
}

/** When the server first received each of these events (ids it does not hold are left out). */
export const receivedOf = async (db: Db, user: string, ids: readonly string[]): Promise<Record<string, string>> => {
  if (ids.length === 0) return {};
  const rows = await db.select({ id: events.id, serverTime: events.serverTime }).from(events).where(and(eq(events.userId, user), inArray(events.id, [...ids])));
  return Object.fromEntries(rows.map((r) => [r.id, r.serverTime.toISOString()]));
};

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
  return { accepted: inserted.length, duplicates: batch.length - inserted.length, cursor: await cursorOf(db, user), received: await receivedOf(db, user, batch.map((e) => e.id)) };
};

export interface Page {
  readonly events: readonly LearnerEvent[];
  readonly cursor: number;
  readonly more: boolean;
  /** When the server received each event (ISO), by id. */
  readonly received: Readonly<Record<string, string>>;
}

/** A user's events after `since`, in receipt order: what another device has not seen yet. */
export const since = async (db: Db, user: string, after: number, limit = MAX_BATCH): Promise<Page> => {
  const rows = await db
    .select({ seq: events.seq, payload: events.payload, serverTime: events.serverTime })
    .from(events)
    .where(and(eq(events.userId, user), gt(events.seq, after)))
    .orderBy(asc(events.seq))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    events: page.map((r) => r.payload as LearnerEvent),
    cursor: page.at(-1)?.seq ?? after,
    more: rows.length > limit,
    received: Object.fromEntries(page.map((r) => [(r.payload as LearnerEvent).id, r.serverTime.toISOString()])),
  };
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

/**
 * The game state (§12) of a user's whole log, every course, as a device computes it, but with
 * each event's arrival time: an event synced after the grace window counts for XP, not for the
 * streak (§12.2). `today` defaults to the date where the learner was last (their latest event's
 * time zone), `now` to the server's clock.
 */
export const gameStateOf = async (db: Db, user: string, config: GameConfig, clock: { readonly now: string; readonly today?: string | undefined }): Promise<GameState> => {
  const rows = await db.select({ payload: events.payload, serverTime: events.serverTime }).from(events).where(eq(events.userId, user));
  const inputs = rows.map((r) => ({ event: r.payload as LearnerEvent, receivedAt: r.serverTime.toISOString() }));
  const latest = inputs.map((i) => i.event).sort((a, b) => Date.parse(a.clientTime) - Date.parse(b.clientTime)).at(-1);
  const today = clock.today ?? localDateOf(clock.now, latest?.tz ?? "UTC") ?? clock.now.slice(0, 10);
  return replayGame(inputs, config, { today, now: clock.now });
};

/** Which of these event ids the user's log already holds. */
export const existing = async (db: Db, user: string, ids: readonly string[]): Promise<ReadonlySet<string>> =>
  ids.length === 0
    ? new Set()
    : new Set((await db.select({ id: events.id }).from(events).where(and(eq(events.userId, user), inArray(events.id, [...ids])))).map((r) => r.id));
