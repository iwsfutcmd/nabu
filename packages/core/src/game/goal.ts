/**
 * The learner's weekly goal (ADR 0107, D12): a number of practice days a week. It is the
 * account's: setting it records a goal_set event, which syncs like any other, so every device
 * shares it, offline too; the game state reads the latest (replayGame's `goal`).
 */
import type { GoalSet } from "@nabu/schema";

/** The goals the app offers, in practice days a week. */
export const GOAL_DAYS = [3, 4, 5, 6, 7] as const;

export const isGoalDays = (n: number): boolean => (GOAL_DAYS as readonly number[]).includes(n);

/** What stamps an event on the device: its id, the device, its time, local date and zone. */
export interface GoalMeta {
  readonly id: string;
  readonly device: string;
  readonly clientTime: string;
  readonly localDate: string;
  readonly tz: string;
}

/** The goal_set event for a goal (null clears it). It names no course: the goal is the account's. */
export const goalSetOf = (days: number | null, meta: GoalMeta): GoalSet => ({
  id: meta.id,
  type: "goal_set",
  schema: 1,
  device: meta.device,
  clientTime: meta.clientTime,
  localDate: meta.localDate,
  tz: meta.tz,
  days,
});
