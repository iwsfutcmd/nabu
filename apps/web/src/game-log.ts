/**
 * The game state (gameplan §12) of events from the device's log, for the game layer (game.tsx) and
 * for sync's check against the server's (sync.ts). Nothing here imports React, so sync can be
 * tested from Node.
 */
import { replayGame, type GameConfig, type GameState } from "@nabu/core/game";
import type { LearnerEvent } from "@nabu/schema";
import { localDate } from "./clock.ts";

/**
 * The game state of these events (every course's) as of `now`. Synced events carry when the server
 * received them, so a late sync counts as the server counts it (§12.2) and the two agree.
 */
export const gameOfLog = (events: readonly LearnerEvent[], received: ReadonlyMap<string, string>, config: GameConfig, now = new Date()): GameState =>
  replayGame(
    events.map((event) => ({ event, receivedAt: received.get(event.id) })),
    config,
    { today: localDate(now), now: now.toISOString() },
  );
