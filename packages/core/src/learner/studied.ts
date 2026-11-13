/**
 * Where the learner left off (S1 in the 2026-11 review): the courses they have studied, the latest
 * first, each in the writing system they last studied it in. Home leads with the first and lists
 * these courses before the others.
 *
 * A course counts from its latest start: a session of it began (a lesson, a story, practice or the
 * placement test), or it was started over. Starts are ordered as the log is (`compareEvents`: device
 * time, then id), so a session begun on another device and synced here counts where it happened.
 *
 * Pure: it reads the events it is given, the whole log or only each course's latest start.
 */
import type { LearnerEvent, ProgressReset, SessionStarted } from "@nabu/schema";
import { compareEvents } from "./state.ts";

export interface Studied {
  readonly course: string;
  /** The writing system of its latest start. */
  readonly orthography: SessionStarted["orthography"];
  /** When that was, as the device that recorded it said (ISO 8601 with offset). */
  readonly at: string;
}

type Start = SessionStarted | ProgressReset;

/** Whether an event starts something in its course: a session, or the course over. */
export const isStart = (event: LearnerEvent): event is Start => event.type === "session_started" || event.type === "progress_reset";

export const studiedCourses = (events: readonly LearnerEvent[]): readonly Studied[] => {
  const latest = new Map<string, Start>();
  for (const event of events) {
    if (!isStart(event)) continue;
    const seen = latest.get(event.course);
    if (seen === undefined || compareEvents(seen, event) < 0) latest.set(event.course, event);
  }
  return [...latest.values()].sort((a, b) => compareEvents(b, a)).map((e) => ({ course: e.course, orthography: e.orthography, at: e.clientTime }));
};
