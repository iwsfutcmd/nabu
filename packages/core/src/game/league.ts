/**
 * Leagues (gameplan §12.4), the pure parts: a week's league XP under plausibility limits, and the
 * final standings of a cohort. Leagues are opt-in per instance; the server stores memberships
 * and results, and runs the weekly rollover.
 */
import { revised, revisionsOf } from "../learner/revisions.ts";
import type { LearnerEvent } from "@nabu/schema";
import type { GameConfig } from "./config.ts";
import { replaysOf, xpRule, type GameInput } from "./game.ts";

export interface LeagueConfig {
  readonly tiers: number;
  readonly cohortSize: number;
  /** Per tier (index 0 = tier 1): how many rise, how many fall. */
  readonly promote: readonly number[];
  readonly demote: readonly number[];
  /** Hours after Monday 00:00 UTC that a league week starts. */
  readonly weekOffsetHours: number;
  /** Uploads later than this after the week ends are not counted, and the rollover waits for them. */
  readonly graceHours: number;
  /** Plausibility: no XP for answers faster than this, beyond this many a minute, or beyond this much XP an hour. */
  readonly minLatencyMs: number;
  readonly maxAnswersPerMinute: number;
  readonly maxXpPerHour: number;
}

export const DEFAULT_LEAGUE: LeagueConfig = {
  tiers: 10,
  cohortSize: 30,
  // Zones narrow towards the top; nobody falls out of the first tier or rises out of the last.
  promote: [10, 10, 10, 7, 7, 7, 5, 5, 5, 0],
  demote: [0, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  weekOffsetHours: 0,
  graceHours: 6,
  minLatencyMs: 800,
  maxAnswersPerMinute: 30,
  maxXpPerHour: 400,
};

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;
const MONDAY_EPOCH = Date.UTC(2024, 0, 1); // a Monday

/** The league week an instant falls in: [start, end) in ms, and its id (the start's UTC date). */
export const leagueWeek = (at: number, config: LeagueConfig): { readonly id: string; readonly start: number; readonly end: number } => {
  const origin = MONDAY_EPOCH + config.weekOffsetHours * HOUR;
  const start = origin + Math.floor((at - origin) / WEEK) * WEEK;
  return { id: new Date(start).toISOString().slice(0, 10), start, end: start + WEEK };
};

export const weekById = (id: string, config: LeagueConfig): { readonly id: string; readonly start: number; readonly end: number } => leagueWeek(Date.parse(`${id}T00:00:00Z`) + config.weekOffsetHours * HOUR, config);

/**
 * League XP in [start, end): the game's XP rule on events that happened in the week and reached
 * the server in time, with no XP for implausible answers (too fast, too many a minute), none for
 * a session without a single plausible answer, and a cap per hour. Earlier events among the inputs
 * earn nothing here; finished sessions and starts over among them say which of the week's lessons
 * replay one done before (ADR 0107), as the game state counts them.
 */
export const leagueXp = (inputs: readonly GameInput[], start: number, end: number, game: GameConfig, league: LeagueConfig): number => {
  const inTime = ({ receivedAt }: GameInput): boolean => receivedAt === undefined || Date.parse(receivedAt) <= end + league.graceHours * HOUR;
  const byTime = (a: LearnerEvent, b: LearnerEvent): number => Date.parse(a.clientTime) - Date.parse(b.clientTime) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const once = new Map(inputs.map((i) => [i.event.id, i.event] as const));
  const replays = replaysOf([...once.values()].filter((e) => Date.parse(e.clientTime) < end).sort(byTime));
  // A judge's revision counts if it, too, reached the server in time.
  const revisions = revisionsOf(inputs.filter(inTime).map((i) => i.event));
  const inWeek = inputs
    .filter((input) => {
      const at = Date.parse(input.event.clientTime);
      return input.event.type !== "outcome_revised" && at >= start && at < end && inTime(input);
    })
    .map((input) => (input.event.type === "answer_submitted" ? { ...input, event: revised(input.event, revisions) } : input))
    .sort((a, b) => Date.parse(a.event.clientTime) - Date.parse(b.event.clientTime) || (a.event.id < b.event.id ? -1 : 1));
  const seen = new Set<string>();
  // A session earns its XP only if some answer in it was plausible.
  const plausible = new Set<string>();
  const recent: number[] = [];
  const perHour = new Map<number, number>();
  let total = 0;
  for (const input of inWeek) {
    const e: LearnerEvent = input.event;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const at = Date.parse(e.clientTime);
    if (e.type === "answer_submitted") {
      if (e.input.latencyMs < league.minLatencyMs) continue;
      while (recent.length > 0 && at - (recent[0] as number) >= 60_000) recent.shift();
      if (recent.length >= league.maxAnswersPerMinute) continue;
      recent.push(at);
      plausible.add(e.session);
    }
    if (e.type === "session_completed" && !plausible.has(e.session)) continue;
    const xp = xpRule(input, { config: game, mode: undefined, counts: true, replay: replays.has(e.id) }).reduce((n, eff) => n + (eff.tag === "xp" ? eff.amount : 0), 0);
    if (xp === 0) continue;
    const hour = Math.floor(at / HOUR);
    const used = perHour.get(hour) ?? 0;
    const granted = Math.max(0, Math.min(xp, league.maxXpPerHour - used));
    perHour.set(hour, used + granted);
    total += granted;
  }
  return total;
};

export interface Standing {
  readonly user: string;
  readonly xp: number;
  readonly joinedAt: number;
}

export interface Ranked extends Standing {
  readonly rank: number;
  readonly outcome: "promoted" | "stayed" | "demoted";
  readonly nextTier: number;
}

/** A cohort's final order (XP, then who joined first) and who rises and falls from `tier`. */
export const rankCohort = (members: readonly Standing[], tier: number, config: LeagueConfig): readonly Ranked[] => {
  const ordered = [...members].sort((a, b) => b.xp - a.xp || a.joinedAt - b.joinedAt || (a.user < b.user ? -1 : 1));
  const n = ordered.length;
  // Zones never overlap, and nobody rises with no XP.
  const up = Math.min(config.promote[tier - 1] ?? 0, n);
  const down = Math.min(config.demote[tier - 1] ?? 0, Math.max(0, n - up));
  return ordered.map((m, i) => {
    const promoted = i < up && m.xp > 0 && tier < config.tiers;
    const demoted = !promoted && i >= n - down && tier > 1;
    return { ...m, rank: i + 1, outcome: promoted ? "promoted" : demoted ? "demoted" : "stayed", nextTier: promoted ? tier + 1 : demoted ? tier - 1 : tier };
  });
};
