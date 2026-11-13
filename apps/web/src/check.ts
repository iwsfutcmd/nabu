/**
 * The check of the server's projections against the device's (§14.2, ADR 0112). The server is
 * authoritative; the device checks that it agrees: each course's state and the game state,
 * replayed on both sides from what the server took. That replays the whole log, seconds of work
 * with a year of history on a phone, so the app runs it in a worker of its own (check-worker.ts)
 * where it can. Nothing here touches the window.
 */
import type { GameConfig } from "@nabu/core/game";
import { replay } from "@nabu/core/learner";
import type { LearnerEvent } from "@nabu/schema";
import { localDate } from "./clock.ts";
import { difference } from "./compare.ts";
import { gameOfLog } from "./game-log.ts";
import { httpError, isHttpError, request } from "./http.ts";
import type { EventStore } from "./store.ts";

/** What to check, and against which server. */
export interface CheckOrder {
  readonly server: string;
  readonly token: string;
  readonly courses: readonly string[];
  /** The deployment's game rules; without them the game state is not checked. */
  readonly gameConfig: GameConfig | undefined;
  /** The device's clock (ISO): the game state depends on the date. */
  readonly now: string;
}

/** How a check failed, in a form a worker can send: the HTTP status and code, the network, or else. */
export type CheckFailure = { readonly status: number; readonly code: string | undefined } | { readonly network: true } | { readonly other: string };

/** A worker's answer: the verdict, how it failed, or that it cannot read this device's log. */
export type CheckAnswer = { readonly verified: boolean } | { readonly failed: CheckFailure } | { readonly unavailable: true };

export const failureOf = (e: unknown): CheckFailure => (isHttpError(e) ? { status: e.status, code: e.code } : e instanceof TypeError ? { network: true } : { other: String(e) });

/** The error a failure stands for, as the request that failed threw it. */
export const errorFrom = (f: CheckFailure): Error => ("status" in f ? httpError(f.status, f.code) : "network" in f ? new TypeError("Failed to fetch") : new Error(f.other));

/**
 * Whether every projection matched. Events set aside are not in the server's log, nor are those
 * recorded since the upload: the outbox is read after the events, so an event recorded meanwhile
 * is left out of both.
 */
export const checkProjections = async (store: EventStore, order: CheckOrder): Promise<boolean> => {
  const { server, token } = order;
  const now = new Date(order.now);
  const events = await store.allEvents();
  const received = await store.receivedTimes();
  const held = await store.held();
  const pending = await store.pendingIds();
  const sent = (e: LearnerEvent): boolean => held[e.id] === undefined && !pending.has(e.id);
  let verified = true;
  for (const course of order.courses) {
    const remote = await request<{ state: unknown }>(server, `/v1/state?course=${encodeURIComponent(course)}`, { token });
    const local = replay(events.filter((e) => e.type !== "goal_set" && e.course === course && sent(e)));
    const differs = difference(remote.state, JSON.parse(JSON.stringify(local)));
    if (differs !== undefined) {
      verified = false;
      console.warn(`nabu sync: the server's projection of ${course} differs from this device's at ${differs}`);
    }
  }
  // And the game state (§12): streak dates, XP, quests, by the device's clock (Phase 10).
  if (order.gameConfig !== undefined) {
    const local = gameOfLog(events.filter(sent), received, order.gameConfig, now);
    const remote = await request<{ game: unknown }>(server, `/v1/game?today=${localDate(now)}&now=${encodeURIComponent(now.toISOString())}`, { token }).catch((e: unknown) => {
      if (isHttpError(e) && e.status === 404) return undefined; // a server without it
      throw e;
    });
    const differs = remote === undefined ? undefined : difference(remote.game, JSON.parse(JSON.stringify(local)));
    if (differs !== undefined) {
      verified = false;
      console.warn(`nabu sync: the server's game state differs from this device's at ${differs}`);
    }
  }
  return verified;
};
