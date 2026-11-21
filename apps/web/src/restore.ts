/**
 * Restoring progress from a file (S6 in the 2026-11 review): the one "Download my learning data"
 * saves (one learner event per line), or the account file the server gives (`{events: [...]}`).
 * Every event is checked against the event schema, as the server checks uploads; the device's log
 * is keyed by event id, so what it has already is left as it is, and restoring the same file twice
 * changes nothing. The events go in as if recorded here: with an account, the next sync sends them.
 *
 * A file downloaded before the lexical model holds events of the old shape: they are checked
 * against that shape and rewritten as they are read (`inNewShape`: core's `upgrade`, with each
 * course's alias table), as the device's own log was (docs/migration-design.md, "Old events").
 */
import { upgradeLog } from "@nabu/core/learner";
import type { AliasTable, LearnerEvent, LearnerEventV1 } from "@nabu/schema";

export interface EventsFile {
  /** The file's learner events, each once (by id), in file order. */
  readonly events: readonly LearnerEvent[];
  /** Its events of before the lexical model, each once (by id), in file order: to be rewritten (`inNewShape`). */
  readonly old: readonly LearnerEventV1[];
  /** Lines (or entries) that are not learner events of either shape. */
  readonly invalid: number;
}

/** The values a file holds: one JSON value (a list, an account file, an event), else JSON lines. */
const valuesOf = (text: string): readonly unknown[] | undefined => {
  try {
    const value = JSON.parse(text) as unknown;
    if (Array.isArray(value)) return value as unknown[];
    const events = typeof value === "object" && value !== null ? (value as { events?: unknown }).events : undefined;
    return Array.isArray(events) ? (events as unknown[]) : [value];
  } catch {
    // Not one value: JSON lines, each read on its own (a line that is not JSON counts as invalid).
    return undefined;
  }
};

const UNREADABLE = Symbol("unreadable");

/**
 * Reads a downloaded file's text: its valid learner events, those valid in the shape of before the
 * lexical model (where `validOld` is given), and how many entries were neither.
 */
export const readEventsFile = (text: string, valid: (value: unknown) => value is LearnerEvent, validOld?: (value: unknown) => value is LearnerEventV1): EventsFile => {
  const values =
    valuesOf(text) ??
    text
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== "")
      .map((line): unknown => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return UNREADABLE;
        }
      });
  const events = new Map<string, LearnerEvent>();
  const old = new Map<string, LearnerEventV1>();
  let invalid = 0;
  for (const value of values) {
    if (value !== UNREADABLE && valid(value)) {
      if (!events.has(value.id)) events.set(value.id, value);
    } else if (value !== UNREADABLE && validOld?.(value) === true) {
      if (!old.has(value.id)) old.set(value.id, value);
    } else invalid++;
  }
  // An event the file holds in both shapes is the new one.
  return { events: [...events.values()], old: [...old.values()].filter((e) => !events.has(e.id)), invalid };
};

/**
 * A file's events, all in the new shape: its old ones rewritten with their courses' alias tables
 * (`aliasesOf`; a course whose table cannot be had keeps its ids by their own names), each revision
 * with the answer it revises wherever in the file that is; then the ones it held in the new shape.
 */
export const inNewShape = async (file: EventsFile, aliasesOf: (course: string) => Promise<AliasTable | undefined>): Promise<readonly LearnerEvent[]> => {
  if (file.old.length === 0) return file.events;
  const tables = new Map<string, AliasTable | undefined>();
  for (const e of file.old) if (e.type !== "goal_set" && !tables.has(e.course)) tables.set(e.course, await aliasesOf(e.course));
  const ids = new Set(file.old.map((e) => e.id));
  const rewritten = upgradeLog([...file.old, ...file.events], (course) => tables.get(course)).filter((e) => ids.has(e.id));
  return [...rewritten, ...file.events];
};

/** The schema's validator, loaded when a file is restored (Ajv stays out of the first load). */
export const eventValidator = async (): Promise<(value: unknown) => value is LearnerEvent> => (await import("./event-schema.ts")).validEvent;

/** The validator of the shape before the lexical model, loaded with it. */
export const oldEventValidator = async (): Promise<(value: unknown) => value is LearnerEventV1> => (await import("./event-schema.ts")).validOldEvent;

/** How many restored events at a time: one transaction each, so a year of practice never holds one open for long. */
const CHUNK = 500;

/** Adds the events to the device's log; returns how many were new to it. */
export const restoreEvents = async (append: (events: readonly LearnerEvent[]) => Promise<readonly string[]>, events: readonly LearnerEvent[]): Promise<number> => {
  let added = 0;
  for (let i = 0; i < events.length; i += CHUNK) added += (await append(events.slice(i, i + CHUNK))).length;
  return added;
};
