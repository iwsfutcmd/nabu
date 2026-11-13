/**
 * Game rules are configured per deployment (gameplan §12.1, decision 3): XP, streaks and quests
 * are on by default; the session gate is off (`none`) and leagues are opt-in on the server.
 * Nothing in learning (grading, scheduling, planning) reads this, except the gate, which is off
 * unless a deployment turns it on.
 */
import type { Facet, TemplateId } from "../lesson/exercise.ts";

/** What a quest or achievement counts. */
export type Predicate =
  /** Answers; `correct` counts right ones only, `facet` or `templates` narrow the kind. */
  | { readonly type: "answer"; readonly correct?: boolean; readonly facet?: Facet; readonly templates?: readonly TemplateId[] }
  /** Completed sessions; `perfect`: every exercise right the first time. */
  | { readonly type: "session"; readonly modes?: readonly ("lesson" | "review" | "mistakes" | "placement" | "story")[]; readonly perfect?: boolean }
  /** XP earned (answers and sessions). */
  | { readonly type: "xp" };

export interface QuestTemplate {
  readonly id: string;
  readonly count: Predicate;
  readonly target: number;
  /**
   * The practice the quest needs, where not every learner can do it (ADR 0107): listening (not in
   * every course, nor on a listening break), writing, a story, something to review. The quest is
   * drawn only for a learner whose log shows it in the QUEST_WINDOW days before the date.
   */
  readonly requires?: Predicate;
}

/** How far back a quest's `requires` is looked for: two weeks of the learner's own practice. */
export const QUEST_WINDOW = 14;

export type AchievementTemplate =
  | { readonly id: string; readonly kind: "streak"; readonly days: number }
  | { readonly id: string; readonly kind: "total"; readonly count: Predicate; readonly target: number };

export type GatePolicy =
  | { readonly policy: "none" }
  | { readonly policy: "hearts"; readonly max: number; readonly regenMinutes: number; readonly refillByPractice: boolean }
  | {
      readonly policy: "energy";
      readonly max: number;
      readonly costPerExercise: number;
      /** Energy back for every `runLength` answers right in a row. */
      readonly earnOnCorrectRun: number;
      readonly runLength: number;
      readonly fullRechargeHours: number;
    };

/**
 * XP (ADR 0107): pay for practice, not for the shortest sessions or replays.
 * - `answer` for each right answer;
 * - a finished session pays a point a card, up to `session`;
 * - `perfect` more when every card of a session of at least `perfectFrom` cards was right the
 *   first time;
 * - a lesson or story finished before (since the course was last started over, placement
 *   included) pays for its answers only;
 * - `quest` for each daily quest completed.
 */
export interface XpRules {
  readonly answer: number;
  readonly session: number;
  readonly perfect: number;
  readonly perfectFrom: number;
  readonly quest: number;
}

export interface GameConfig {
  readonly xp: XpRules;
  readonly streak: {
    /** Events that reach the server later than this after they happened do not count for their day. */
    readonly graceHours: number;
    /** More time-zone changes than this within 7 days: days of the further changes do not count. */
    readonly maxTzChangesPerWeek: number;
    /** A freeze for every `every` days of streak, holding at most `max`. */
    readonly freeze: { readonly every: number; readonly max: number };
  };
  readonly quests: { readonly daily: number; readonly pool: readonly QuestTemplate[] };
  readonly achievements: readonly AchievementTemplate[];
  readonly gate: GatePolicy;
}

export const DEFAULT_GAME: GameConfig = {
  xp: { answer: 1, session: 10, perfect: 5, perfectFrom: 5, quest: 10 },
  streak: { graceHours: 72, maxTzChangesPerWeek: 3, freeze: { every: 7, max: 2 } },
  quests: {
    daily: 3,
    pool: [
      { id: "xp-30", count: { type: "xp" }, target: 30 },
      { id: "sessions-2", count: { type: "session" }, target: 2 },
      { id: "right-20", count: { type: "answer", correct: true }, target: 20 },
      { id: "listen-5", count: { type: "answer", correct: true, facet: "listen" }, target: 5, requires: { type: "answer", facet: "listen" } },
      { id: "produce-5", count: { type: "answer", correct: true, facet: "produce" }, target: 5, requires: { type: "answer", facet: "produce" } },
      { id: "perfect-1", count: { type: "session", perfect: true }, target: 1 },
      { id: "story-1", count: { type: "session", modes: ["story"] }, target: 1, requires: { type: "session", modes: ["story"] } },
      // Something to review: any session finished before the day.
      { id: "review-1", count: { type: "session", modes: ["review", "mistakes"] }, target: 1, requires: { type: "session" } },
    ],
  },
  achievements: [
    { id: "streak-7", kind: "streak", days: 7 },
    { id: "streak-30", kind: "streak", days: 30 },
    { id: "streak-100", kind: "streak", days: 100 },
    { id: "sessions-10", kind: "total", count: { type: "session" }, target: 10 },
    { id: "stories-3", kind: "total", count: { type: "session", modes: ["story"] }, target: 3 },
    { id: "right-500", kind: "total", count: { type: "answer", correct: true }, target: 500 },
  ],
  gate: { policy: "none" },
};

export const HEARTS: GatePolicy = { policy: "hearts", max: 5, regenMinutes: 300, refillByPractice: true };
export const ENERGY: GatePolicy = { policy: "energy", max: 25, costPerExercise: 1, earnOnCorrectRun: 3, runLength: 5, fullRechargeHours: 24 };

/** A deployment's game config: its overrides on the defaults (a game.json, or nothing). */
export const gameConfig = (overrides: Partial<Pick<GameConfig, "gate" | "xp">> & { readonly quests?: Partial<GameConfig["quests"]> } = {}): GameConfig => ({
  ...DEFAULT_GAME,
  ...(overrides.xp === undefined ? {} : { xp: { ...DEFAULT_GAME.xp, ...overrides.xp } }),
  ...(overrides.gate === undefined ? {} : { gate: overrides.gate }),
  ...(overrides.quests === undefined ? {} : { quests: { ...DEFAULT_GAME.quests, ...overrides.quests } }),
});
