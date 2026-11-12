/**
 * Gamification as projections of the event log (gameplan §12): XP, streaks with freezes,
 * daily quests, achievements and the session gate, computed by pure rules from
 * (events, config, clock). Like the learner replay, it is order-independent and idempotent:
 * events are deduplicated by id and folded in time order.
 *
 * Streaks (§12.2):
 * - a day counts when a session was completed with that local date;
 * - offline-safe: events count for their own local date, as long as they reach the server within
 *   the grace window (72 hours by default); on the device, `receivedAt` is absent;
 * - anti-gaming: the local date must be the clientTime's date in its time zone, the event may not
 *   come from the future, and time-zone changes are bounded per week;
 * - freezes are earned along a streak and spent automatically on a missed day, so "repair" is
 *   recomputing the projection.
 */
import type { AnswerSubmitted, LearnerEvent, SessionCompleted } from "@nabu/schema";
import { facetOf } from "../learner/credit.ts";
import { revised, revisionsOf } from "../learner/revisions.ts";
import { seededRng } from "../lesson/rng.ts";
import type { AchievementTemplate, GameConfig, GatePolicy, Predicate, QuestTemplate } from "./config.ts";
import { addDays, daysBetween, localDateOf, startOfDay } from "./dates.ts";

/** A logged event, with when the server received it (absent on the device). */
export interface GameInput {
  readonly event: LearnerEvent;
  readonly receivedAt?: string | undefined;
}

export type Mode = SessionCompleted["mode"];

export type GameEffect =
  | { readonly tag: "xp"; readonly date: string; readonly amount: number; readonly reason: "answer" | "session" | "perfect" }
  /** The date counts toward the streak. */
  | { readonly tag: "day"; readonly date: string };

export interface RuleContext {
  readonly config: GameConfig;
  /** The mode of the session an event belongs to. */
  readonly mode: Mode | undefined;
  /** Whether the event may count for its local date (§12.2 anti-gaming and grace). */
  readonly counts: boolean;
}

/** A rule: one event in, effects out. Pure. */
export type Rule = (input: GameInput, ctx: RuleContext) => readonly GameEffect[];

const isRight = (e: AnswerSubmitted): boolean => e.outcome.kind.startsWith("CORRECT");

const perfect = (e: SessionCompleted): boolean => e.summary.exercises > 0 && e.summary.correctFirstTry === e.summary.exercises;

/** XP never depends on gate state (§12.2): a right answer, a completed session, a perfect one. */
export const xpRule: Rule = ({ event: e }, { config }) => {
  if (e.type === "answer_submitted" && isRight(e)) return [{ tag: "xp", date: e.localDate, amount: config.xp.answer, reason: "answer" }];
  if (e.type === "session_completed" && e.summary.completed) {
    const out: GameEffect[] = [{ tag: "xp", date: e.localDate, amount: config.xp.session, reason: "session" }];
    if (perfect(e)) out.push({ tag: "xp", date: e.localDate, amount: config.xp.perfect, reason: "perfect" });
    return out;
  }
  return [];
};

/** A completed session marks its local date as practised, if the event may count for it. */
export const dayRule: Rule = ({ event: e }, { counts }) => (e.type === "session_completed" && e.summary.completed && counts ? [{ tag: "day", date: e.localDate }] : []);

export const DEFAULT_RULES: readonly Rule[] = [xpRule, dayRule];

export interface Clock {
  /** The learner's local date now. */
  readonly today: string;
  /** Now, ISO 8601. */
  readonly now: string;
}

export interface Streak {
  /** Days in a row up to today (today counts once practised; until then the streak stands on yesterday). */
  readonly current: number;
  readonly longest: number;
  readonly practicedToday: boolean;
  /** Freezes held now. */
  readonly freezes: number;
  /** Missed days a freeze covered. */
  readonly frozen: readonly string[];
}

export interface QuestProgress {
  readonly id: string;
  readonly progress: number;
  readonly target: number;
  readonly done: boolean;
}

export interface GateState {
  readonly policy: GatePolicy["policy"];
  readonly value: number;
  readonly max: number;
  /** When the next unit comes back (hearts, energy), if below max. */
  readonly nextAt?: string | undefined;
}

export interface GameState {
  readonly xp: { readonly total: number; readonly byDate: Readonly<Record<string, number>> };
  /** Dates that count toward the streak, in order. */
  readonly days: readonly string[];
  readonly streak: Streak;
  /** Today's quests. */
  readonly quests: readonly QuestProgress[];
  /** Unlocked achievement ids, in template order. */
  readonly achievements: readonly string[];
  readonly gate: GateState;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

const sortInputs = (inputs: readonly GameInput[]): readonly GameInput[] => {
  const byId = new Map<string, GameInput>();
  // Revised answers count as revised (§8.3); the revisions themselves are not practice.
  const revisions = revisionsOf(inputs.map((i) => i.event));
  for (const input of inputs) {
    const e = input.event;
    if (e.type === "outcome_revised" || byId.has(e.id)) continue;
    byId.set(e.id, e.type === "answer_submitted" ? { ...input, event: revised(e, revisions) } : input);
  }
  return [...byId.values()].sort((a, b) => {
    const t = Date.parse(a.event.clientTime) - Date.parse(b.event.clientTime);
    return t !== 0 ? t : a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0;
  });
};

/** Which events may count for their local date: consistency, no future, grace window, bounded time-zone changes. */
export const countable = (inputs: readonly GameInput[], config: GameConfig, now: string): ReadonlyMap<string, boolean> => {
  const out = new Map<string, boolean>();
  const changes: number[] = [];
  let tz: string | undefined;
  for (const { event: e, receivedAt } of sortInputs(inputs)) {
    const at = Date.parse(e.clientTime);
    const seen = Date.parse(receivedAt ?? now);
    let ok = localDateOf(e.clientTime, e.tz) === e.localDate && at <= seen + 5 * MINUTE;
    if (ok && receivedAt !== undefined) ok = seen - at <= config.streak.graceHours * HOUR;
    if (ok && tz !== undefined && e.tz !== tz) {
      const recent = changes.filter((c) => at - c < WEEK).length;
      if (recent >= config.streak.maxTzChangesPerWeek) ok = false;
      else changes.push(at);
    }
    if (ok) tz = e.tz;
    out.set(e.id, ok);
  }
  return out;
};

/**
 * Dates a learner never lived through because they crossed the date line between two practices
 * (from UTC−11 to UTC+14, Tuesday never happens). A date d between practice 1 (t1, zone 1) and
 * practice 2 (t2, zone 2) is skipped when, at some moment s between them, zone 1 had not reached d
 * yet while zone 2 had already left it: the traveller switching zones then jumps over d.
 */
export const skippedDates = (practices: readonly { readonly at: number; readonly tz: string; readonly date: string }[]): ReadonlySet<string> => {
  const out = new Set<string>();
  for (let i = 1; i < practices.length; i += 1) {
    const a = practices[i - 1];
    const b = practices[i];
    if (a === undefined || b === undefined || a.tz === b.tz) continue;
    for (let d = addDays(a.date, 1); daysBetween(d, b.date) > 0; d = addDays(d, 1)) {
      const begins = startOfDay(d, a.tz); // zone 1 reaches d
      const ended = startOfDay(addDays(d, 1), b.tz); // zone 2 has left d
      if (begins === undefined || ended === undefined) continue;
      // At equality the date lasts no time at all for them (zones exactly 24 hours apart): still skipped.
      const from = Math.max(a.at, ended);
      if (from <= begins && from <= b.at) out.add(d);
    }
  }
  return out;
};

/**
 * The streak as of `today` from the dates that count. Freezes come every `every` days and cover
 * missed days; a date skipped by crossing the date line is neither practised nor missed.
 */
export const streakOf = (days: readonly string[], today: string, freeze: GameConfig["streak"]["freeze"], skipped: ReadonlySet<string> = new Set()): Streak => {
  const active = new Set(days);
  const practicedToday = active.has(today);
  const first = days.find((d) => d <= today);
  let streak = 0;
  let longest = 0;
  let freezes = 0;
  const frozen: string[] = [];
  const earn = (): void => {
    if (streak > 0 && streak % freeze.every === 0 && freezes < freeze.max) freezes += 1;
  };
  if (first !== undefined) {
    const yesterday = addDays(today, -1);
    for (let d = first; daysBetween(d, yesterday) >= 0; d = addDays(d, 1)) {
      if (active.has(d)) {
        streak += 1;
        longest = Math.max(longest, streak);
        earn();
      } else if (skipped.has(d)) {
        continue;
      } else if (streak > 0 && freezes > 0) {
        freezes -= 1;
        frozen.push(d);
      } else {
        streak = 0;
      }
    }
  }
  if (practicedToday) {
    streak += 1;
    longest = Math.max(longest, streak);
    earn();
  }
  return { current: streak, longest, practicedToday, freezes, frozen };
};

const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

/** The day's quests: the same for every learner on a date, rotating through the pool. */
export const questsFor = (date: string, config: GameConfig): readonly QuestTemplate[] =>
  seededRng(fnv1a(date))
    .shuffle(config.quests.pool)
    .slice(0, config.quests.daily);

const matches = (p: Predicate, e: LearnerEvent): number => {
  switch (p.type) {
    case "answer": {
      if (e.type !== "answer_submitted") return 0;
      if (p.correct === true && !isRight(e)) return 0;
      if (p.facet !== undefined && facetOf(e.exercise.template) !== p.facet) return 0;
      if (p.templates !== undefined && !p.templates.includes(e.exercise.template)) return 0;
      return 1;
    }
    case "session":
      if (e.type !== "session_completed" || !e.summary.completed) return 0;
      if (p.modes !== undefined && !p.modes.includes(e.mode)) return 0;
      if (p.perfect === true && !perfect(e)) return 0;
      return 1;
    case "xp":
      return 0; // counted from XP effects
  }
};

const progressOf = (p: Predicate, events: readonly GameInput[], xp: number): number => (p.type === "xp" ? xp : events.reduce((n, { event: e }) => n + matches(p, e), 0));

const gateOf = (sorted: readonly GameInput[], modes: ReadonlyMap<string, Mode>, policy: GatePolicy, now: string): GateState => {
  if (policy.policy === "none") return { policy: "none", value: 0, max: 0 };
  const tick = policy.policy === "hearts" ? policy.regenMinutes * MINUTE : (policy.fullRechargeHours * HOUR) / policy.max;
  let value = policy.max;
  let from: number | undefined; // since when units are coming back
  let run = 0;
  const regen = (t: number): void => {
    if (from === undefined) return;
    const gained = Math.max(0, Math.floor((t - from) / tick));
    value = Math.min(policy.max, value + gained);
    from = value >= policy.max ? undefined : from + gained * tick;
  };
  const spend = (amount: number, t: number): void => {
    value = Math.max(0, value - amount);
    if (value < policy.max && from === undefined) from = t;
  };
  for (const { event: e } of sorted) {
    const t = Date.parse(e.clientTime);
    regen(t);
    const mode = e.type === "session_completed" ? e.mode : modes.get(e.session);
    const practice = mode === "review" || mode === "mistakes";
    if (e.type === "session_completed" && e.summary.completed && practice && (policy.policy === "energy" || policy.refillByPractice)) {
      // Practising always restores the gate (§12.3).
      value = policy.max;
      from = undefined;
    }
    if (e.type !== "answer_submitted" || practice) continue;
    // A self-rated speaking card is no verdict (P5): it never costs a heart, nor breaks or extends a run.
    const selfRated = e.input.selfRating !== undefined;
    if (policy.policy === "hearts") {
      if (!isRight(e) && !selfRated) spend(1, t);
    } else {
      spend(policy.costPerExercise, t);
      if (!selfRated) run = isRight(e) ? run + 1 : 0;
      if (run > 0 && run % policy.runLength === 0) {
        value = Math.min(policy.max, value + policy.earnOnCorrectRun);
        if (value >= policy.max) from = undefined;
      }
    }
  }
  regen(Date.parse(now));
  return { policy: policy.policy, value, max: policy.max, ...(from === undefined ? {} : { nextAt: new Date(from + tick).toISOString() }) };
};

/** Whether a session of this mode may start now. Practice is always open; with the gate off, everything is. */
export const canStart = (gate: GateState, mode: Mode, policy: GatePolicy): boolean => {
  if (policy.policy === "none" || mode === "review" || mode === "mistakes") return true;
  return policy.policy === "hearts" ? gate.value > 0 : gate.value >= policy.costPerExercise;
};

const achieved = (a: AchievementTemplate, longest: number, all: readonly GameInput[], xpTotal: number): boolean =>
  a.kind === "streak" ? longest >= a.days : progressOf(a.count, all, xpTotal) >= a.target;

/** The game state the log projects to, as of `clock`. */
export const replayGame = (inputs: readonly GameInput[], config: GameConfig, clock: Clock, rules: readonly Rule[] = DEFAULT_RULES): GameState => {
  const sorted = sortInputs(inputs);
  const modes = new Map<string, Mode>();
  for (const { event: e } of sorted) if (e.type === "session_started" || e.type === "session_completed") modes.set(e.session, e.mode);
  const counts = countable(sorted, config, clock.now);
  const byDate: Record<string, number> = {};
  const earned: Record<string, number> = {}; // XP from answers and sessions, per date (what xp quests count)
  const days = new Set<string>();
  for (const input of sorted) {
    const ctx: RuleContext = { config, mode: modes.get(input.event.session), counts: counts.get(input.event.id) === true };
    for (const effect of rules.flatMap((rule) => rule(input, ctx))) {
      if (effect.tag === "xp") {
        byDate[effect.date] = (byDate[effect.date] ?? 0) + effect.amount;
        earned[effect.date] = (earned[effect.date] ?? 0) + effect.amount;
      } else days.add(effect.date);
    }
  }
  // Quests, day by day: a completed quest earns its XP on its date.
  const byDay = new Map<string, GameInput[]>();
  for (const input of sorted) byDay.set(input.event.localDate, [...(byDay.get(input.event.localDate) ?? []), input]);
  const questsOn = (date: string): readonly QuestProgress[] =>
    questsFor(date, config).map((q) => {
      const progress = progressOf(q.count, byDay.get(date) ?? [], earned[date] ?? 0);
      return { id: q.id, progress: Math.min(progress, q.target), target: q.target, done: progress >= q.target };
    });
  for (const date of byDay.keys()) {
    const done = questsOn(date).filter((q) => q.done).length;
    if (done > 0) byDate[date] = (byDate[date] ?? 0) + done * config.xp.quest;
  }
  const total = Object.values(byDate).reduce((a, b) => a + b, 0);
  const ordered = [...days].sort();
  const practices = sorted.flatMap(({ event: e }) =>
    e.type === "session_completed" && e.summary.completed && counts.get(e.id) === true ? [{ at: Date.parse(e.clientTime), tz: e.tz, date: e.localDate }] : [],
  );
  const streak = streakOf(ordered, clock.today, config.streak.freeze, skippedDates(practices));
  const xpTotal = Object.values(earned).reduce((a, b) => a + b, 0);
  return {
    xp: { total, byDate },
    days: ordered,
    streak,
    quests: questsOn(clock.today),
    achievements: config.achievements.filter((a) => achieved(a, streak.longest, sorted, xpTotal)).map((a) => a.id),
    gate: gateOf(sorted, modes, config.gate, clock.now),
  };
};
