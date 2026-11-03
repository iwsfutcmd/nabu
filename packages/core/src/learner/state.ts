/**
 * Learner state as a projection of the event log (gameplan §1 decision 5):
 * FSRS cards per (KC, facet), the performance model, XP, path progress and
 * open mistakes. `replay` is a pure fold: the same events, in any order and
 * with any duplicates, give the same state.
 */
import type { AnswerSubmitted, ExerciseSkipped, LearnerEvent, SessionCompleted } from "@nabu/schema";
import { createEmptyCard, fsrs, generatorParameters, Rating as FsrsRating, type Card, type FSRS, type Grade } from "ts-fsrs";
import type { Facet, TemplateId } from "../lesson/exercise.ts";
import { facetOf, ratingOf, type Rating } from "./credit.ts";
import { initialPerformance, update, type Performance } from "./performance.ts";

/** An FSRS card as plain JSON: dates as ISO strings. */
export interface StoredCard {
  readonly due: string;
  readonly stability: number;
  readonly difficulty: number;
  readonly elapsed_days: number;
  readonly scheduled_days: number;
  readonly learning_steps: number;
  readonly reps: number;
  readonly lapses: number;
  readonly state: number;
  readonly last_review?: string | undefined;
}

export interface Mistake {
  readonly item: string;
  readonly template: TemplateId;
  readonly at: string;
}

export interface LearnerState {
  /** Ids of applied events: replaying a duplicate changes nothing. */
  readonly seen: Readonly<Record<string, true>>;
  readonly cards: Readonly<Record<string, StoredCard>>;
  readonly performance: Performance;
  readonly xp: { readonly total: number; readonly byDate: Readonly<Record<string, number>> };
  readonly completedNodes: readonly string[];
  readonly mistakes: readonly Mistake[];
  /** Recent answer latencies per template (ms), for "slow" in the rating map (§9.2). */
  readonly latencies: Readonly<Partial<Record<TemplateId, readonly number[]>>>;
  /** Facets already rated in the current session: each at most once per session (§9.2). */
  readonly rated: { readonly session: string; readonly keys: readonly string[] };
}

export const DESIRED_RETENTION = 0.9;
export const XP = { answer: 1, session: 10, perfect: 5 } as const;
const LATENCY_WINDOW = 25;
const STORY_TEMPLATES: ReadonlySet<TemplateId> = new Set(["story-choose", "story-complete", "story-arrange"]);
const MISTAKES_KEPT = 50;

export const emptyLearnerState = (): LearnerState => ({
  seen: {},
  cards: {},
  performance: initialPerformance(),
  xp: { total: 0, byDate: {} },
  completedNodes: [],
  mistakes: [],
  latencies: {},
  rated: { session: "", keys: [] },
});

/**
 * Facets keyed to the language are shared by every orthography of a course;
 * read-script and write-script are tracked per orthography (§6.3), so switching
 * scripts keeps what was learned about the language.
 */
export const SCRIPT_FACETS: ReadonlySet<Facet> = new Set<Facet>(["read-script", "write-script"]);

/** The card of a (KC, facet): "kc|facet", or "kc|facet|orthography" for a script facet. */
export const cardKey = (kc: string, facet: Facet, orthography: string): string => (SCRIPT_FACETS.has(facet) ? `${kc}|${facet}|${orthography}` : `${kc}|${facet}`);

export interface CardRef {
  readonly kc: string;
  readonly facet: Facet;
  readonly orthography?: string | undefined;
}

export const parseCardKey = (key: string): CardRef => {
  const [kc = "", facet = "", orthography] = key.split("|");
  return { kc, facet: facet as Facet, orthography };
};

const scheduler: FSRS = fsrs(generatorParameters({ request_retention: DESIRED_RETENTION, enable_fuzz: false }));

const toCard = (c: StoredCard): Card => {
  const { last_review, ...rest } = c;
  return last_review === undefined ? { ...rest, due: new Date(c.due) } : { ...rest, due: new Date(c.due), last_review: new Date(last_review) };
};

const fromCard = (c: Card): StoredCard => ({
  due: c.due.toISOString(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsed_days: c.elapsed_days,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review?.toISOString(),
});

/** FSRS retrievability of a (KC, facet) in an orthography at `now`: 0 when never practised. */
export const retrievability = (state: LearnerState, kc: string, facet: Facet, orthography: string, now: string): number => {
  const card = state.cards[cardKey(kc, facet, orthography)];
  return card === undefined ? 0 : scheduler.get_retrievability(toCard(card), new Date(now), false);
};

export const meanRetrievability = (state: LearnerState, kcs: readonly string[], facet: Facet, orthography: string, now: string): number =>
  kcs.length === 0 ? 0 : kcs.reduce((sum, kc) => sum + retrievability(state, kc, facet, orthography, now), 0) / kcs.length;

const GRADES: Readonly<Record<Rating, Grade>> = { again: FsrsRating.Again, hard: FsrsRating.Hard, good: FsrsRating.Good };

const median = (xs: readonly number[]): number | undefined => {
  if (xs.length < 5) return undefined;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Mutable working copy used inside one fold; never escapes. */
interface Draft {
  seen: Record<string, true>;
  cards: Record<string, StoredCard>;
  performance: Performance;
  xp: { total: number; byDate: Record<string, number> };
  completedNodes: string[];
  mistakes: Mistake[];
  latencies: Partial<Record<TemplateId, number[]>>;
  rated: { session: string; keys: string[] };
}

const draftOf = (s: LearnerState): Draft => structuredClone(s) as Draft;

const addXp = (d: Draft, date: string, amount: number): void => {
  d.xp.total += amount;
  d.xp.byDate[date] = (d.xp.byDate[date] ?? 0) + amount;
};

const rate = (d: Draft, e: LearnerEvent, kc: string, facet: Facet, rating: Rating): void => {
  const { session, clientTime: at } = e;
  if (d.rated.session !== session) d.rated = { session, keys: [] };
  const key = cardKey(kc, facet, e.orthography);
  if (d.rated.keys.includes(key)) return; // within-session repetitions are learning steps
  d.rated.keys.push(key);
  const now = new Date(at);
  const card = d.cards[key] === undefined ? createEmptyCard(now) : toCard(d.cards[key]);
  d.cards[key] = fromCard(scheduler.next(card, now, GRADES[rating]).card);
};

const noteMistake = (d: Draft, item: string, template: TemplateId, at: string, wrong: boolean): void => {
  d.mistakes = d.mistakes.filter((m) => !(m.item === item && m.template === template));
  if (wrong) d.mistakes = [...d.mistakes, { item, template, at }].slice(-MISTAKES_KEPT);
};

const answered = (d: Draft, e: AnswerSubmitted): void => {
  const { template, item, kcs } = e.exercise;
  const facet = facetOf(template);
  const correct = e.outcome.kind.startsWith("CORRECT");
  // The performance model learns from first tries only; retries are biased.
  if (e.attempt === 1) {
    const r = meanRetrievability(d, kcs, facet, e.orthography, e.clientTime);
    d.performance = update(d.performance, { template, facet, item, kcs, r }, correct);
  }
  const recent = d.latencies[template] ?? [];
  const typical = median(recent);
  const slow = typical !== undefined && e.input.latencyMs > typical;
  d.latencies[template] = [...recent, e.input.latencyMs].slice(-LATENCY_WINDOW);
  for (const credit of e.outcome.kcs) {
    const rating = ratingOf(credit.status, e.outcome.kind, e.outcome.notes, slow, e.input.selfRating);
    if (rating !== undefined) rate(d, e, credit.kc, facet, rating);
  }
  if (correct) addXp(d, e.localDate, XP.answer);
  // A mistake stays open through the lesson's own retry; a later first try that is right closes it.
  // Story questions are not mistakes to practice: they only make sense inside their story.
  if (template !== "speak.tier-0" && template !== "match-pairs" && !STORY_TEMPLATES.has(template) && (!correct || e.attempt === 1)) noteMistake(d, item, template, e.clientTime, !correct);
};

const skipped = (d: Draft, e: ExerciseSkipped): void => {
  if (e.reason !== "skip") return; // can't listen / can't speak: no update
  const facet = facetOf(e.exercise.template);
  for (const kc of e.exercise.kcs) rate(d, e, kc, facet, "again"); // the answer was revealed
  noteMistake(d, e.exercise.item, e.exercise.template, e.clientTime, true);
};

const completed = (d: Draft, e: SessionCompleted): void => {
  if (!e.summary.completed) return;
  addXp(d, e.localDate, XP.session + (e.summary.exercises > 0 && e.summary.correctFirstTry === e.summary.exercises ? XP.perfect : 0));
  if ((e.mode === "lesson" || e.mode === "story") && e.node !== undefined && !d.completedNodes.includes(e.node)) d.completedNodes.push(e.node);
  // A placement test marks the nodes the learner placed out of as done (§9.5).
  if (e.mode === "placement") for (const node of e.placed ?? []) if (!d.completedNodes.includes(node)) d.completedNodes.push(node);
};

const applyOne = (d: Draft, e: LearnerEvent): void => {
  if (d.seen[e.id] === true) return;
  d.seen[e.id] = true;
  switch (e.type) {
    case "answer_submitted":
      answered(d, e);
      return;
    case "exercise_skipped":
      skipped(d, e);
      return;
    case "session_completed":
      completed(d, e);
      return;
    case "session_started":
    case "exercise_presented":
      return;
  }
};

/** Event order: device time, then id (UUIDv7 ids are time-ordered too). */
export const compareEvents = (a: LearnerEvent, b: LearnerEvent): number => {
  const t = Date.parse(a.clientTime) - Date.parse(b.clientTime);
  return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Applies events in order to a state. For a log that may contain late arrivals, use replay. */
export const applyEvents = (state: LearnerState, events: readonly LearnerEvent[]): LearnerState => {
  const d = draftOf(state);
  for (const e of events) applyOne(d, e);
  return d;
};

/** The state a whole event log projects to: order-independent and idempotent. */
export const replay = (events: readonly LearnerEvent[]): LearnerState => applyEvents(emptyLearnerState(), [...events].sort(compareEvents));
