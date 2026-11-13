/**
 * The session in progress on this device (S3 in the 2026-11 review). A reload, or a phone that
 * dropped the tab, used to plan the lesson again with a new seed and start it from zero. Now the
 * plan a session opened with is kept on the device (the meta store) until the session ends, and a
 * session that opens at the same route, from the same course bundle, within RESUME_WITHIN_MS,
 * picks it up: the log says what the learner did so far (core `doneOf`), and core `resume` folds
 * that through the player.
 *
 * The plan is kept rather than planned again from the log: the planner's inputs include things the
 * log does not hold (the listening and speaking breaks, what the speech server can score, the clock
 * to the millisecond), and the log may have grown since (another device's events), so a new plan
 * could differ. The plan is not learner state: nothing reads it but this, and it goes when the
 * session ends.
 */
import type { SessionPlan } from "@nabu/core/learner";
import type { LearnerEvent } from "@nabu/schema";
import type { EventStore } from "./store.ts";

const KEY = "open-session";

/** A session left longer than this starts afresh: its plan was made for another moment. */
export const RESUME_WITHIN_MS = 12 * 3_600_000;

export interface OpenSession {
  /** The route it plays at (App's href): opening that route again picks it up. */
  readonly route: string;
  readonly course: string;
  /** Its id in the log (every event's `session`). */
  readonly session: string;
  readonly seed: number;
  /** The course bundle it was planned from (the manifest's id): after an update it starts afresh. */
  readonly bundle: string;
  /** When it opened (ms since the epoch). */
  readonly opened: number;
  readonly plan: SessionPlan;
}

/** Keeps a session's plan until it ends (one session at a time: a new one takes its place). */
export const keepOpen = (store: EventStore, open: OpenSession): Promise<void> => store.setMeta(KEY, open);

/** The session ended (completed or quit): its plan goes. */
export const closeOpen = async (store: EventStore, session: string): Promise<void> => {
  const open = (await store.getMeta(KEY)) as OpenSession | undefined;
  if (open?.session === session) await store.deleteMeta(KEY);
};

/**
 * The session to pick up at this route, with its events so far: kept here, from this bundle, opened
 * within RESUME_WITHIN_MS (and not in the future), and not ended in the log.
 */
export const reopen = async (store: EventStore, at: { readonly route: string; readonly course: string; readonly bundle: string; readonly now: number }): Promise<{ readonly open: OpenSession; readonly events: readonly LearnerEvent[] } | undefined> => {
  const open = (await store.getMeta(KEY)) as OpenSession | undefined;
  if (open === undefined || open.route !== at.route || open.course !== at.course || open.bundle !== at.bundle) return undefined;
  if (at.now < open.opened || at.now - open.opened > RESUME_WITHIN_MS) return undefined;
  const events = (await store.eventsOf(open.course)).filter((e) => e.session === open.session);
  if (events.some((e) => e.type === "session_completed")) {
    await store.deleteMeta(KEY);
    return undefined;
  }
  return { open, events };
};
