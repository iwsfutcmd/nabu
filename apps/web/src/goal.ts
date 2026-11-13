/**
 * The weekly goal in the app (ADR 0107, D12): a number of practice days a week, the account's.
 * Choosing it records a goal_set event, which syncs like any other, so every device shares it, and
 * the game state reads the latest. Before D12 a device kept its goal in localStorage: that goal is
 * recorded once, if the log has none from any device, and then forgotten here.
 */
import { goalSetOf, isGoalDays, type GameState } from "@nabu/core/game";
import type { GoalSet } from "@nabu/schema";
import { localDate, localIso, timeZone, uuidv7 } from "./clock.ts";

/** Where a device kept its goal before it was the account's. The app no longer writes it. */
const DEVICE_GOAL = "nabu.goal";

/** The goal this device kept before it was the account's, if any. */
export const deviceGoal = (): number | undefined => {
  try {
    const n = Number(localStorage.getItem(DEVICE_GOAL));
    return isGoalDays(n) ? n : undefined;
  } catch {
    return undefined;
  }
};

export const forgetDeviceGoal = (): void => {
  try {
    localStorage.removeItem(DEVICE_GOAL);
  } catch {
    // Storage unavailable: nothing was kept.
  }
};

/** The device's old goal to record in the log: only where the log has never had one, on any device. */
export const goalToMigrate = (kept: number | undefined, state: Pick<GameState, "goal">): number | undefined => (state.goal === undefined ? kept : undefined);

/** The goal_set event for a goal chosen now on this device. */
export const goalEvent = (days: number | null, device: string, now: Date = new Date()): GoalSet =>
  goalSetOf(days, { id: uuidv7(now.getTime()), device, clientTime: localIso(now), localDate: localDate(now), tz: timeZone() });
