/**
 * The learner fold as it was before it updated its draft in place (ADR 0119, R2 in the 2026-11
 * review): every first try copied the performance model's KC and item maps. Kept, unchanged, as
 * the oracle `replay` must equal on long logs (replay-in-place.test.ts, `bench:replay --check`).
 * It shares the fold's pure parts (the rating map, FSRS, revisions, the prediction); what it keeps
 * of its own is the fold itself. A deliberate change to the fold changes this copy too.
 */
import type { AnswerSubmitted, ExerciseSkipped, LearnerEvent, SessionCompleted } from "@nabu/schema";
import { createEmptyCard, fsrs, generatorParameters, Rating as FsrsRating, type Card, type FSRS, type Grade } from "ts-fsrs";
import { facetOf, ratingOf, type Pace, type Rating } from "../src/learner/credit.ts";
import { initialPerformance, predict, type Performance, type PredictionInput } from "../src/learner/performance.ts";
import { withRevisions } from "../src/learner/revisions.ts";
import { cardKey, DESIRED_RETENTION, RECENT_WINDOW, SKILL_FACETS, XP, type LearnerState, type Mistake, type StoredCard } from "../src/learner/state.ts";
import type { Facet, TemplateId } from "../src/lesson/exercise.ts";
import { SPEAKING, TEMPLATES } from "../src/lesson/templates.ts";

const LEARNING_RATE = 0.15;
const L2 = 0.01;

/** The model's step as it was: a new model, its KC and item maps copied whole. */
const update = (m: Performance, x: PredictionInput, correct: boolean): Performance => {
  const error = (correct ? 1 : 0) - predict(m, x);
  const step = (value: number, gradient: number): number => value + LEARNING_RATE * (gradient * error - L2 * value);
  const kc = { ...m.kc };
  for (const k of x.kcs) kc[k] = (kc[k] ?? 0) - (LEARNING_RATE * error) / x.kcs.length - LEARNING_RATE * L2 * (kc[k] ?? 0);
  return {
    theta: m.theta + LEARNING_RATE * error,
    facet: { ...m.facet, [x.facet]: step(m.facet[x.facet] ?? 0, 1) },
    template: { ...m.template, [x.template]: step(m.template[x.template] ?? 0, -1) },
    kc,
    item: { ...m.item, [x.item]: step(m.item[x.item] ?? 0, -1) },
    w: m.w + LEARNING_RATE * (error * (x.r - 0.5) - L2 * (m.w - 2)),
  };
};

const LATENCY_WINDOW = 25;
const PACE_OVERHEAD = 2;
const PACE_SLOW = 2;
const PACE_FAST = 0.5;
const EASY_RECALL = 0.9;
const STORY_TEMPLATES: ReadonlySet<TemplateId> = new Set(["story-choose", "story-complete", "story-arrange"]);
const MISTAKES_KEPT = 50;

const emptyLearnerState = (): LearnerState => ({
  cards: {},
  performance: initialPerformance(),
  xp: { total: 0, byDate: {} },
  completedNodes: [],
  mistakes: [],
  latencies: {},
  rated: { session: "", keys: [] },
  met: {},
  shown: {},
  missed: {},
  recent: [],
});

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

const retrievability = (state: LearnerState, kc: string, facet: Facet, orthography: string, now: string): number => {
  const card = state.cards[cardKey(kc, facet, orthography)];
  return card === undefined ? 0 : scheduler.get_retrievability(toCard(card), new Date(now), false);
};

const meanRetrievability = (state: LearnerState, kcs: readonly string[], facet: Facet, orthography: string, now: string): number =>
  kcs.length === 0 ? 0 : kcs.reduce((sum, kc) => sum + retrievability(state, kc, facet, orthography, now), 0) / kcs.length;

const GRADES: Readonly<Record<Rating, Grade>> = { again: FsrsRating.Again, hard: FsrsRating.Hard, good: FsrsRating.Good, easy: FsrsRating.Easy };

const median = (xs: readonly number[]): number | undefined => {
  if (xs.length < 5) return undefined;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

interface Draft {
  cards: Record<string, StoredCard>;
  performance: Performance;
  xp: { total: number; byDate: Record<string, number> };
  completedNodes: string[];
  mistakes: Mistake[];
  latencies: Partial<Record<TemplateId, number[]>>;
  rated: { session: string; keys: string[] };
  met: Record<string, string>;
  shown: Record<string, string>;
  missed: Record<string, string>;
  recent: boolean[];
}

const draftOf = (s: LearnerState): Draft => structuredClone(s) as Draft;

const addXp = (d: Draft, date: string, amount: number): void => {
  d.xp.total += amount;
  d.xp.byDate[date] = (d.xp.byDate[date] ?? 0) + amount;
};

const rate = (d: Draft, e: AnswerSubmitted | ExerciseSkipped, kc: string, facet: Facet, rating: Rating): void => {
  const { session, clientTime: at } = e;
  if (d.rated.session !== session) d.rated = { session, keys: [] };
  const key = cardKey(kc, facet, e.orthography);
  if (d.rated.keys.includes(key)) return;
  d.rated.keys.push(key);
  const now = new Date(at);
  const card = d.cards[key] === undefined ? createEmptyCard(now) : toCard(d.cards[key]);
  const sure = d.cards[key] !== undefined && scheduler.get_retrievability(card, now, false) >= EASY_RECALL;
  const grade = rating === "easy" && !sure ? "good" : rating;
  d.cards[key] = fromCard(scheduler.next(card, now, GRADES[grade]).card);
};

const witness = (d: Draft, e: AnswerSubmitted | ExerciseSkipped, kc: string, facet: Facet, right: boolean): void => {
  if (!SKILL_FACETS.has(facet)) return;
  const key = cardKey(kc, facet, e.orthography);
  if (!right) {
    delete d.shown[key];
    d.missed[key] = e.localDate;
    return;
  }
  const met = d.met[kc];
  const missed = d.missed[key];
  if (met !== undefined && e.localDate > met && (missed === undefined || e.localDate > missed)) d.shown[key] = e.localDate;
};

const noteMistake = (d: Draft, item: string, template: TemplateId, at: string, wrong: boolean): void => {
  d.mistakes = d.mistakes.filter((m) => !(m.item === item && m.template === template));
  if (wrong) d.mistakes = [...d.mistakes, { item, template, at }].slice(-MISTAKES_KEPT);
};

const answered = (d: Draft, e: AnswerSubmitted): void => {
  const { template, item, kcs } = e.exercise;
  const facet = facetOf(template);
  const correct = e.outcome.kind.startsWith("CORRECT");
  if (e.attempt === 1) {
    const credited = e.outcome.kcs.filter((c) => c.status !== "given").map((c) => c.kc);
    const r = meanRetrievability(d, credited.length > 0 ? credited : kcs, facet, e.orthography, e.clientTime);
    d.performance = update(d.performance, { template, facet, item, kcs, r }, correct);
  }
  const recent = d.latencies[template] ?? [];
  const typical = median(recent);
  const perUnit = e.input.latencyMs / (PACE_OVERHEAD + kcs.length);
  const pace: Pace = typical === undefined ? "usual" : perUnit > PACE_SLOW * typical ? "slow" : perUnit <= PACE_FAST * typical ? "fast" : "usual";
  if (e.attempt === 1) d.latencies[template] = [...recent, perUnit].slice(-LATENCY_WINDOW);
  const typed = TEMPLATES[template].modality.input === "text";
  const hinted = e.input.hinted === true && !SPEAKING.has(template);
  for (const credit of e.outcome.kcs) {
    const rating = ratingOf(credit.status, e.outcome.kind, e.outcome.notes, pace, e.input.selfRating, typed, hinted);
    if (rating !== undefined) rate(d, e, credit.kc, facet, rating);
  }
  if (e.attempt === 1 && e.input.selfRating === undefined) {
    d.recent = [...d.recent, correct].slice(-RECENT_WINDOW);
    const credited = e.outcome.kcs.filter((c) => c.status !== "given");
    const pinned = credited.length === 1 || credited.some((c) => c.status === "right");
    if (!hinted) for (const c of credited) if (c.status === "right" || pinned) witness(d, e, c.kc, facet, c.status === "right");
  }
  for (const credit of e.outcome.kcs) d.met[credit.kc] ??= e.localDate;
  if (correct) addXp(d, e.localDate, XP.answer);
  if (template !== "speak.tier-0" && template !== "match-pairs" && template !== "letter-pairs" && !STORY_TEMPLATES.has(template) && (!correct || e.attempt === 1))
    noteMistake(d, item, template, e.clientTime, !correct);
};

const skipped = (d: Draft, e: ExerciseSkipped): void => {
  if (e.reason !== "skip") return;
  const facet = facetOf(e.exercise.template);
  if (e.attempt === 1) d.recent = [...d.recent, false].slice(-RECENT_WINDOW);
  for (const kc of e.exercise.kcs) {
    rate(d, e, kc, facet, "again");
    if (e.exercise.kcs.length === 1) witness(d, e, kc, facet, false);
    d.met[kc] ??= e.localDate;
  }
  noteMistake(d, e.exercise.item, e.exercise.template, e.clientTime, true);
};

const completed = (d: Draft, e: SessionCompleted): void => {
  if (e.mode === "placement") {
    for (const node of e.placed ?? []) if (!d.completedNodes.includes(node)) d.completedNodes.push(node);
    const at = new Date(e.clientTime);
    for (const kc of e.seeded ?? []) {
      d.met[kc] ??= e.localDate;
      const key = cardKey(kc, "recognize", e.orthography);
      if (d.cards[key] === undefined) d.cards[key] = fromCard(scheduler.next(createEmptyCard(at), at, GRADES.easy).card);
    }
  }
  if (!e.summary.completed) return;
  const { exercises, correctFirstTry } = e.summary;
  const replay = (e.mode === "lesson" || e.mode === "story") && e.node !== undefined && d.completedNodes.includes(e.node);
  if (!replay) addXp(d, e.localDate, Math.min(XP.session, exercises) + (exercises >= XP.perfectFrom && correctFirstTry === exercises ? XP.perfect : 0));
  if ((e.mode === "lesson" || e.mode === "story") && e.node !== undefined && !d.completedNodes.includes(e.node)) d.completedNodes.push(e.node);
};

const startOver = (d: Draft): void => {
  const fresh = draftOf(emptyLearnerState());
  d.cards = fresh.cards;
  d.performance = fresh.performance;
  d.completedNodes = fresh.completedNodes;
  d.mistakes = fresh.mistakes;
  d.latencies = fresh.latencies;
  d.rated = fresh.rated;
  d.met = fresh.met;
  d.shown = fresh.shown;
  d.missed = fresh.missed;
  d.recent = fresh.recent;
};

const applyOne = (d: Draft, e: LearnerEvent): void => {
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
    case "progress_reset":
      startOver(d);
      return;
    case "session_started":
    case "exercise_presented":
    case "answer_reported":
    case "sentence_reported":
    case "outcome_revised":
    case "goal_set":
      return;
  }
};

const compareEvents = (a: LearnerEvent, b: LearnerEvent): number => {
  const t = Date.parse(a.clientTime) - Date.parse(b.clientTime);
  return t !== 0 ? t : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

const FOLDS: Readonly<Record<LearnerEvent["type"], boolean>> = {
  answer_submitted: true,
  exercise_skipped: true,
  session_completed: true,
  progress_reset: true,
  session_started: false,
  exercise_presented: false,
  answer_reported: false,
  sentence_reported: false,
  outcome_revised: false,
  goal_set: false,
};

/** `applyEvents` before ADR 0119. */
export const applyEventsBefore = (state: LearnerState, events: readonly LearnerEvent[]): LearnerState => {
  const folded = events.filter((e) => FOLDS[e.type]);
  if (folded.length === 0) return state;
  const d = draftOf(state);
  const applied = new Set<string>();
  for (const e of folded) {
    if (applied.has(e.id)) continue;
    applied.add(e.id);
    applyOne(d, e);
  }
  return d;
};

/** `replay` before ADR 0119. */
export const replayBefore = (events: readonly LearnerEvent[]): LearnerState => applyEventsBefore(emptyLearnerState(), withRevisions(events).sort(compareEvents));
