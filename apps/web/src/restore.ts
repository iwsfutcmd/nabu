/**
 * Restoring progress from a file (S6 in the 2026-11 review): the one "Download my learning data"
 * saves (one learner event per line), or the account file the server gives (`{events: [...]}`).
 * Every event is checked against the event schema, as the server checks uploads; the device's log
 * is keyed by event id, so what it has already is left as it is, and restoring the same file twice
 * changes nothing. The events go in as if recorded here: with an account, the next sync sends them.
 */
import type { LearnerEvent } from "@nabu/schema";

export interface EventsFile {
  /** The file's learner events, each once (by id), in file order. */
  readonly events: readonly LearnerEvent[];
  /** Lines (or entries) that are not learner events. */
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

/** Reads a downloaded file's text: its valid learner events, and how many entries were not. */
export const readEventsFile = (text: string, valid: (value: unknown) => value is LearnerEvent): EventsFile => {
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
  let invalid = 0;
  for (const value of values) {
    if (value !== UNREADABLE && valid(value)) {
      if (!events.has(value.id)) events.set(value.id, value);
    } else invalid++;
  }
  return { events: [...events.values()], invalid };
};

/** The schema's validator, loaded when a file is restored (Ajv stays out of the first load). */
export const eventValidator = async (): Promise<(value: unknown) => value is LearnerEvent> => (await import("./event-schema.ts")).validEvent;

/** How many restored events at a time: one transaction each, so a year of practice never holds one open for long. */
const CHUNK = 500;

/** Adds the events to the device's log; returns how many were new to it. */
export const restoreEvents = async (append: (events: readonly LearnerEvent[]) => Promise<readonly string[]>, events: readonly LearnerEvent[]): Promise<number> => {
  let added = 0;
  for (let i = 0; i < events.length; i += CHUNK) added += (await append(events.slice(i, i + CHUNK))).length;
  return added;
};
