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
import { QUEST_WINDOW, type AchievementTemplate, type GameConfig, type GatePolicy, type Predicate, type QuestTemplate } from "./config.ts";
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
  /** A finished lesson or story the course had marked done already (replaysOf): it pays its answers only. */
  readonly replay: boolean;
}

/** A rule: one event in, effects out. Pure. */
export type Rule = (input: GameInput, ctx: RuleContext) => readonly GameEffect[];

const isRight = (e: AnswerSubmitted): boolean => e.outcome.kind.startsWith("CORRECT");

const perfect = (e: SessionCompleted): boolean => e.summary.exercises > 0 && e.summary.correctFirstTry === e.summary.exercises;

/**
 * XP rewards practice (§12.2, ADR 0107), never gate state: a point for a right answer; for a
 * finished session a point a card, up to `xp.session`, and `xp.perfect` more when a session of at
 * least `xp.perfectFrom` cards had every card right the first time; a lesson or story finished
 * before pays its answers only. The learner model's fold (learner/state.ts) pays the same.
 */
export const xpRule: Rule = ({ event: e }, { config, replay }) => {
  if (e.type === "answer_submitted" && isRight(e)) return [{ tag: "xp", date: e.localDate, amount: config.xp.answer, reason: "answer" }];
  if (e.type === "session_completed" && e.summary.completed && !replay) {
    const out: GameEffect[] = [];
    const session = Math.min(config.xp.session, e.summary.exercises);
    if (session > 0) out.push({ tag: "xp", date: e.localDate, amount: session, reason: "session" });
    if (perfect(e) && e.summary.exercises >= config.xp.perfectFrom) out.push({ tag: "xp", date: e.localDate, amount: config.xp.perfect, reason: "perfect" });
    return out;
  }
  return [];
};

/**
 * The finished sessions that replay a lesson or story (ADR 0107), by event id: those of a node the
 * course had marked done already, by an earlier finish or a placement test, since the learner last
 * started the course over (progress_reset). The learner model's path marks nodes done the same way.
 * The log must be in time order.
 */
export const replaysOf = (log: readonly LearnerEvent[]): ReadonlySet<string> => {
  const done = new Map<string, Set<string>>();
  const out = new Set<string>();
  for (const e of log) {
    if (e.type === "progress_reset") done.delete(e.course);
    if (e.type !== "session_completed") continue;
    let nodes = done.get(e.course);
    if (nodes === undefined) {
      nodes = new Set();
      done.set(e.course, nodes);
    }
    // A placement test places finished or stopped part-way (D9), as the learner model's fold does.
    if (e.mode === "placement") for (const node of e.placed ?? []) nodes.add(node);
    if (!e.summary.completed) continue;
    if ((e.mode === "lesson" || e.mode === "story") && e.node !== undefined) {
      if (nodes.has(e.node)) out.add(e.id);
      else nodes.add(e.node);
    }
  }
  return out;
};

/**
 * A completed session marks its local date as practised, if the event may count for it. It reads
 * `counts` only for a completed session: the replay works that out only when it is read.
 */
export const dayRule: Rule = ({ event: e }, ctx) => (e.type === "session_completed" && e.summary.completed && ctx.counts ? [{ tag: "day", date: e.localDate }] : []);

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
  /**
   * When a lesson or story may start again, if one may not now (M5): once enough units have come
   * back with time. Practice that refills the gate opens it sooner.
   */
  readonly opensAt?: string | undefined;
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
  /**
   * The learner's weekly goal (ADR 0107, D12): practice days a week, as the latest goal_set says
   * (by device time, then id), whichever device recorded it; null once cleared; undefined if the
   * log has none.
   */
  readonly goal: number | null | undefined;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;

/** The log as the rules fold it, in time order, with each event's time (`Date.parse` of its clientTime) parsed once. */
interface Ordered {
  readonly inputs: readonly GameInput[];
  readonly times: readonly number[];
  /**
   * The answers the gate counts otherwise than the projections do, by id: whether the gate counts
   * each right. The gate goes by the grading and the server's revisions (the judge, a reviewer),
   * never by the learner's own claim (M5); an answer absent here counts as the projections count it.
   */
  readonly gated: ReadonlyMap<string, boolean>;
}

/**
 * Deduplicates by id (the first copy wins), applies revisions to answers (§8.3; the revisions
 * themselves are not practice) and orders by time, then id. A log already in that order (the
 * usual case) is not sorted again: the check is the sort's own first step (one ascending run), so
 * the order is the same either way.
 */
const orderedLog = (inputs: readonly GameInput[]): Ordered => {
  const byId = new Map<string, GameInput>();
  const events = inputs.map((i) => i.event);
  const revisions = revisionsOf(events);
  // The revisions the server issued, without the learner's claims: what the gate goes by (M5).
  const issued = revisionsOf(events.filter((e) => e.type === "outcome_revised"));
  const gated = new Map<string, boolean>();
  for (const input of inputs) {
    const e = input.event;
    if (e.type === "outcome_revised" || byId.has(e.id)) continue;
    if (e.type !== "answer_submitted") {
      byId.set(e.id, input);
      continue;
    }
    const r = revised(e, revisions);
    byId.set(e.id, r === e ? input : { ...input, event: r });
    if (r === e) continue;
    const right = isRight(revised(e, issued));
    if (right !== isRight(r)) gated.set(e.id, right);
  }
  const list = [...byId.values()];
  const times = list.map((i) => Date.parse(i.event.clientTime));
  const compare = (i: number, j: number): number => {
    const t = (times[i] as number) - (times[j] as number);
    if (t !== 0) return t;
    const a = (list[i] as GameInput).event.id;
    const b = (list[j] as GameInput).event.id;
    return a < b ? -1 : a > b ? 1 : 0;
  };
  let inOrder = true;
  for (let i = 1; i < list.length && inOrder; i += 1) inOrder = !(compare(i, i - 1) < 0);
  if (inOrder) return { inputs: list, times, gated };
  const order = list.map((_, i) => i).sort(compare);
  return { inputs: order.map((i) => list[i] as GameInput), times: order.map((i) => times[i] as number), gated };
};

/**
 * Which events of an ordered log may count for their local date (§12.2): the local date must be
 * the clientTime's date in its zone, the event may not come from the future, it must reach the
 * server within the grace window, and time-zone changes are bounded. Returns a lookup by position.
 *
 * The date check (an Intl format, by far the costliest part) runs at once only where it decides
 * whether the zone changes: for an event outside the current zone. In the current zone nothing
 * that follows depends on it, so it waits until asked (the replay asks for completed sessions).
 */
const countsOf = (list: readonly GameInput[], times: readonly number[], config: GameConfig, now: string): ((i: number) => boolean) => {
  const dated = (e: LearnerEvent): boolean => localDateOf(e.clientTime, e.tz) === e.localDate;
  // true or false once settled; undefined while the date check waits (the other checks passed).
  const settled: (boolean | undefined)[] = Array.from({ length: list.length }, () => undefined);
  const nowAt = Date.parse(now);
  const changes: number[] = [];
  let tz: string | undefined;
  for (let i = 0; i < list.length; i += 1) {
    const { event: e, receivedAt } = list[i] as GameInput;
    const at = times[i] as number;
    const seen = receivedAt === undefined ? nowAt : Date.parse(receivedAt);
    let ok = at <= seen + 5 * MINUTE && (receivedAt === undefined || seen - at <= config.streak.graceHours * HOUR);
    if (ok && tz !== undefined && e.tz === tz) continue;
    ok &&= dated(e);
    if (ok && tz !== undefined) {
      const recent = changes.filter((c) => at - c < WEEK).length;
      if (recent >= config.streak.maxTzChangesPerWeek) ok = false;
      else changes.push(at);
    }
    if (ok) tz = e.tz;
    settled[i] = ok;
  }
  return (i) => (settled[i] ??= dated((list[i] as GameInput).event));
};

/** Which events may count for their local date: consistency, no future, grace window, bounded time-zone changes. */
export const countable = (inputs: readonly GameInput[], config: GameConfig, now: string): ReadonlyMap<string, boolean> => {
  const { inputs: list, times } = orderedLog(inputs);
  const counts = countsOf(list, times, config, now);
  return new Map(list.map((input, i) => [input.event.id, counts(i)]));
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

/**
 * The day's quests (ADR 0107): the date's shuffle of the pool, the same for every learner on a
 * date, keeping the first `daily` this learner can do. A quest that `requires` some practice is
 * kept only if it is among `able`, the quests whose practice the learner's log shows lately
 * (ableOn): listening is no quest for a course without it, nor for a learner who never listens.
 */
export const questsFor = (date: string, config: GameConfig, able: ReadonlySet<string> = new Set()): readonly QuestTemplate[] =>
  seededRng(fnv1a(date))
    .shuffle(config.quests.pool)
    .filter((q) => q.requires === undefined || able.has(q.id))
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

/** Sessions whose answers cost under the gate (ADR 0044): lessons and stories; never practice, nor a placement test (M5). */
const GATED: ReadonlySet<Mode> = new Set<Mode>(["lesson", "story"]);

/** What the gate needs before a lesson or story may start: a heart, or one exercise's energy. */
const neededToStart = (policy: Exclude<GatePolicy, { readonly policy: "none" }>): number => (policy.policy === "hearts" ? 1 : policy.costPerExercise);

/**
 * The gate (§12.3, ADR 0044) as of `now`. Only a lesson's or a story's answers cost: practice and a
 * placement test never do (M5), nor does an answer whose session the log does not name. An answer
 * counts as graded, or as the server revised it (the judge, a reviewer), never as the learner
 * claimed (`gated`, M5): a claim neither gives a heart back nor takes one.
 */
const gateOf = (sorted: readonly GameInput[], modes: ReadonlyMap<string, Mode>, gated: ReadonlyMap<string, boolean>, policy: GatePolicy, now: string): GateState => {
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
    const mode = e.type === "session_completed" ? e.mode : e.type === "goal_set" ? undefined : modes.get(e.session);
    const practice = mode === "review" || mode === "mistakes";
    if (e.type === "session_completed" && e.summary.completed && practice && (policy.policy === "energy" || policy.refillByPractice)) {
      // Practising always restores the gate (§12.3).
      value = policy.max;
      from = undefined;
    }
    if (e.type !== "answer_submitted" || mode === undefined || !GATED.has(mode)) continue;
    // A self-rated speaking card is no verdict (P5): it never costs a heart, nor breaks or extends a run.
    const selfRated = e.input.selfRating !== undefined;
    const right = gated.get(e.id) ?? isRight(e);
    if (policy.policy === "hearts") {
      if (!right && !selfRated) spend(1, t);
    } else {
      spend(policy.costPerExercise, t);
      if (!selfRated) run = right ? run + 1 : 0;
      if (run > 0 && run % policy.runLength === 0) {
        value = Math.min(policy.max, value + policy.earnOnCorrectRun);
        if (value >= policy.max) from = undefined;
      }
    }
  }
  regen(Date.parse(now));
  // Units come back one a tick from `from`: a lesson may start once there are enough (M5).
  const needed = neededToStart(policy);
  const opensAt = from === undefined || value >= needed || needed > policy.max ? undefined : from + (needed - value) * tick;
  return {
    policy: policy.policy,
    value,
    max: policy.max,
    ...(from === undefined ? {} : { nextAt: new Date(from + tick).toISOString() }),
    ...(opensAt === undefined ? {} : { opensAt: new Date(opensAt).toISOString() }),
  };
};

/** The latest goal_set of a log in time order (ADR 0107, D12): its days, null if cleared; undefined if none. */
const goalOf = (sorted: readonly GameInput[]): number | null | undefined => {
  let goal: number | null | undefined;
  for (const { event: e } of sorted) if (e.type === "goal_set") goal = e.days;
  return goal;
};

/**
 * Whether a session of this mode may start. Practice is always open, and so is a placement test,
 * which costs nothing (M5); with the gate off, everything is. `now`, where given, lets a gate state
 * worked out a while ago open on time (its `opensAt`).
 */
export const canStart = (gate: GateState, mode: Mode, policy: GatePolicy, now?: string): boolean => {
  if (policy.policy === "none" || !GATED.has(mode)) return true;
  if (gate.value >= neededToStart(policy)) return true;
  return now !== undefined && gate.opensAt !== undefined && Date.parse(now) >= Date.parse(gate.opensAt);
};

const achieved = (a: AchievementTemplate, longest: number, all: readonly GameInput[], xpTotal: number): boolean =>
  a.kind === "streak" ? longest >= a.days : progressOf(a.count, all, xpTotal) >= a.target;

/** The game state the log projects to, as of `clock`. */
export const replayGame = (inputs: readonly GameInput[], config: GameConfig, clock: Clock, rules: readonly Rule[] = DEFAULT_RULES): GameState => {
  const { inputs: sorted, times, gated } = orderedLog(inputs);
  const modes = new Map<string, Mode>();
  for (const { event: e } of sorted) if (e.type === "session_started" || e.type === "session_completed") modes.set(e.session, e.mode);
  const counts = countsOf(sorted, times, config, clock.now);
  const replays = replaysOf(sorted.map((i) => i.event));
  const byDate: Record<string, number> = {};
  const earned: Record<string, number> = {}; // XP from answers and sessions, per date (what xp quests count)
  const days = new Set<string>();
  for (let i = 0; i < sorted.length; i += 1) {
    const input = sorted[i] as GameInput;
    // `counts` is worked out only if a rule reads it.
    const ctx: RuleContext = {
      config,
      mode: input.event.type === "goal_set" ? undefined : modes.get(input.event.session),
      get counts() {
        return counts(i);
      },
      replay: replays.has(input.event.id),
    };
    for (const rule of rules) {
      for (const effect of rule(input, ctx)) {
        if (effect.tag === "xp") {
          byDate[effect.date] = (byDate[effect.date] ?? 0) + effect.amount;
          earned[effect.date] = (earned[effect.date] ?? 0) + effect.amount;
        } else days.add(effect.date);
      }
    }
  }
  // Quests, day by day: a completed quest earns its XP on its date.
  const byDay = new Map<string, GameInput[]>();
  for (const input of sorted) {
    const day = byDay.get(input.event.localDate);
    if (day === undefined) byDay.set(input.event.localDate, [input]);
    else day.push(input);
  }
  // Each day's practice that quests may require (ADR 0107), by date: the quests whose `requires` an
  // event of that day met. A day's quests look back QUEST_WINDOW days from the day before, so they
  // stay the same all day, whatever the learner does.
  const required = config.quests.pool.filter((q) => q.requires !== undefined);
  const met = new Map<string, ReadonlySet<string>>();
  for (const [date, inputs] of byDay) {
    met.set(date, new Set(required.filter((q) => inputs.some(({ event }) => matches(q.requires as Predicate, event) > 0)).map((q) => q.id)));
  }
  const ableOn = (date: string): ReadonlySet<string> => {
    const able = new Set<string>();
    for (let back = 1; back <= QUEST_WINDOW; back += 1) for (const id of met.get(addDays(date, -back)) ?? []) able.add(id);
    return able;
  };
  const questsOn = (date: string): readonly QuestProgress[] =>
    questsFor(date, config, ableOn(date)).map((q) => {
      const progress = progressOf(q.count, byDay.get(date) ?? [], earned[date] ?? 0);
      return { id: q.id, progress: Math.min(progress, q.target), target: q.target, done: progress >= q.target };
    });
  for (const date of byDay.keys()) {
    const done = questsOn(date).filter((q) => q.done).length;
    if (done > 0) byDate[date] = (byDate[date] ?? 0) + done * config.xp.quest;
  }
  const total = Object.values(byDate).reduce((a, b) => a + b, 0);
  const ordered = [...days].sort();
  const practices = sorted.flatMap(({ event: e }, i) => (e.type === "session_completed" && e.summary.completed && counts(i) ? [{ at: times[i] as number, tz: e.tz, date: e.localDate }] : []));
  const streak = streakOf(ordered, clock.today, config.streak.freeze, skippedDates(practices));
  const xpTotal = Object.values(earned).reduce((a, b) => a + b, 0);
  return {
    xp: { total, byDate },
    days: ordered,
    streak,
    quests: questsOn(clock.today),
    achievements: config.achievements.filter((a) => achieved(a, streak.longest, sorted, xpTotal)).map((a) => a.id),
    gate: gateOf(sorted, modes, gated, config.gate, clock.now),
    goal: goalOf(sorted),
  };
};
