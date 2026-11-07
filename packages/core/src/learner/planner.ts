/**
 * The session planner (gameplan §9.4). Pure and seeded: the same request,
 * state, bundle and seed give the same plan.
 *
 * 1. Targets: the node's new KCs, plus due facets (R below desired retention).
 * 2. Candidates: every (template, item) the templates can make, where every
 *    KC that is not a target has been seen before (the i+1 rule at runtime).
 * 3. Score: expected memory gain, plus closeness of the session's mean p̂ to
 *    the target success rate, minus repetition of the same template or item.
 * 4. Greedy selection with hard constraints: excluded templates, at most three
 *    of a template (two speaking turns), a new KC is recognized before it is
 *    produced or read, and every new KC of a lesson is presented in it.
 * 5. Order: selection order (new words first), ending on a likely success.
 */
import type { BundleKc, BundleSentence, KcId } from "@nabu/schema";
import { facetExclusions, lessonNodes, sentencesOf, speechExclusions, type SpeechSupport } from "../lesson/build.ts";
import { allKcs, allSentences, type CourseView } from "../lesson/course.ts";
import type { Exercise, Facet, TemplateId } from "../lesson/exercise.ts";
import { seededRng } from "../lesson/rng.ts";
import { KC_LISTENING, KC_TEMPLATES, makeMatchPairs, makeSelectImage, SENTENCE_TEMPLATES, type MakeContext } from "../lesson/templates.ts";
import { facetOf } from "./credit.ts";
import { PERFORMANCE_MODEL, predict } from "./performance.ts";
import { runTest } from "../lesson/adaptive.ts";
import { placementTest, type PlacementTest } from "./placement.ts";
import { cardKey, DESIRED_RETENTION, meanRetrievability, parseCardKey, retrievability, type LearnerState } from "./state.ts";

export const PLANNER = `planner@1+${PERFORMANCE_MODEL}`;

export type SessionRequest =
  | { readonly mode: "lesson"; readonly node: string }
  | { readonly mode: "review" }
  | { readonly mode: "mistakes" }
  | { readonly mode: "placement" };

export interface PlanOptions {
  /** The device clock, ISO 8601: retrievability is computed at this time. */
  readonly now: string;
  readonly seed: number;
  /** Target success rate (§9.4): 0.85 by default, a tunable heuristic. */
  readonly targetSuccess?: number;
  readonly size?: number;
  readonly exclude?: ReadonlySet<TemplateId>;
  readonly desiredRetention?: number;
  /** What the app can do with speech (scored speaking, tone exercises); without it, tier 0 only. */
  readonly speech?: SpeechSupport | undefined;
}

export interface SessionPlan {
  readonly request: SessionRequest;
  readonly exercises: readonly Exercise[];
  /** p̂ for each exercise, logged in shadow mode (§9.3). */
  readonly predictions: readonly number[];
  readonly planner: string;
  /**
   * Placement only (ADR 0077): the adaptive test. `exercises` are what it asks first; the player
   * asks the rest as the answers decide, and `predictions` covers every exercise it may ask.
   */
  readonly placement?: PlacementTest & { readonly predictions: Readonly<Record<string, number>> };
}

interface Candidate {
  readonly ex: Exercise;
  readonly p: number;
  readonly order: number;
}

/**
 * How strongly the session's mean p̂ is pulled toward the target (tuned on test/simulation.test.ts).
 * 90 since uz speaks with Navoiy (ADR 0059): far more uz clips pass the round trip, so its lessons
 * carry more listening exercises, which are hard for a weak learner. The weakest uz-Latn learner
 * still sets the weight (79.6% at 70, 81.5% at 80, 82.0% at 90; every other run 83.7–86.6%).
 */
const CALIBRATION_WEIGHT = 90;

/** Variety (§9.4): no template more than three times a session, and at most two speaking turns. */
const MAX_PER_TEMPLATE_DEFAULT = 3;
const MAX_PER_TEMPLATE: Readonly<Partial<Record<TemplateId, number>>> = {
  "speak.tier-0": 2,
  speak: 2,
  "listen-speak": 2,
  "match-pairs": 1,
  "select-image": 2,
  "listen-tap": 2,
  "listen-type": 2,
  "listen-select": 2,
  "minimal-pair": 1,
};

const RECOGNITION = new Set<TemplateId>(["select-image", "match-pairs", "choose-translation", "translate-tap.l2-l1", "translate-tap.l1-l2"]);

/** p̂ for an exercise in this state, in the course's orthography, at `now`. */
export const predictExercise = (state: LearnerState, ex: Exercise, orthography: string, now: string): number => {
  const facet = facetOf(ex.template);
  return predict(state.performance, { template: ex.template, facet, item: ex.item, kcs: ex.kcs, r: meanRetrievability(state, ex.kcs, facet, orthography, now) });
};

/** A KC is seen once any of its facets has a card. */
const seenKcs = (state: LearnerState): ReadonlySet<string> => new Set(Object.keys(state.cards).map((k) => parseCardKey(k).kc));

/**
 * Due facets (R < desired retention) of seen KCs, most forgotten first. Script
 * facets count only in the orthography being learned.
 */
export const dueFacets = (state: LearnerState, orthography: string, now: string, desired = DESIRED_RETENTION): readonly { readonly key: string; readonly r: number }[] =>
  Object.keys(state.cards)
    .flatMap((key) => {
      const ref = parseCardKey(key);
      if (ref.orthography !== undefined && ref.orthography !== orthography) return [];
      return [{ key, r: retrievability(state, ref.kc, ref.facet, orthography, now) }];
    })
    .filter((f) => f.r < desired)
    .sort((a, b) => a.r - b.r || (a.key < b.key ? -1 : 1));

/** What plans leave out: the caller's exclusions, the speech support's, and the course's facets'. */
const exclusionsOf = (course: CourseView, options: { readonly exclude?: ReadonlySet<TemplateId> | undefined; readonly speech?: SpeechSupport | undefined }): ReadonlySet<TemplateId> =>
  new Set([...(options.exclude ?? []), ...speechExclusions(options.speech), ...facetExclusions(course)]);

/**
 * The open mistakes rebuilt as their exercises, most recent first: those whose template is not
 * excluded, whose item the course still makes that exercise from, and whose KCs are all seen.
 */
const mistakeExercises = (ctx: MakeContext, state: LearnerState, exclude: ReadonlySet<TemplateId>, seen: ReadonlySet<string>): Exercise[] => {
  const byId = new Map(allSentences(ctx.course).map((s) => [s.id, s]));
  const kcById = new Map(allKcs(ctx.course).map((k) => [k.id as string, k]));
  const out: Exercise[] = [];
  for (const m of [...state.mistakes].reverse()) {
    if (exclude.has(m.template)) continue;
    const s = byId.get(m.item);
    const kc = kcById.get(m.item);
    const ex = s !== undefined ? SENTENCE_TEMPLATES[m.template]?.(ctx, s) : kc !== undefined ? KC_TEMPLATES[m.template]?.(ctx, kc) : undefined;
    if (ex !== undefined && ex.kcs.every((k) => seen.has(k)) && !out.some((e) => e.id === ex.id)) out.push(ex);
  }
  return out;
};

/**
 * The open mistakes a mistakes session can practise now, most recent first. A mistake is left
 * out while its template is (a listening or speaking break, speech the app cannot score, a facet
 * the course does not practise), once the course no longer makes it (its item was removed or
 * changed), or while it needs a word this learner has not seen. Count these, not
 * `state.mistakes`: a session plans from exactly these (at most ten at a time).
 */
export const practicableMistakes = (
  course: CourseView,
  state: LearnerState,
  options: { readonly exclude?: ReadonlySet<TemplateId> | undefined; readonly speech?: SpeechSupport | undefined } = {},
): readonly Exercise[] => mistakeExercises({ course, rng: seededRng(1), introduced: [] }, state, exclusionsOf(course, options), seenKcs(state));

const candidatesFor = (ctx: MakeContext, sentences: readonly BundleSentence[], kcs: readonly BundleKc[], exclude: ReadonlySet<TemplateId>): Exercise[] => {
  const out: Exercise[] = [];
  const add = (ex: Exercise | undefined): void => {
    if (ex !== undefined && !exclude.has(ex.template) && !out.some((e) => e.id === ex.id)) out.push(ex);
  };
  if (!exclude.has("select-image")) for (const kc of kcs) add(makeSelectImage(ctx, kc));
  for (const kc of kcs) for (const make of KC_LISTENING) add(make(ctx, kc));
  if (!exclude.has("match-pairs") && kcs.length >= 3) add(makeMatchPairs(ctx, kcs));
  for (const s of sentences) {
    for (const [template, make] of Object.entries(SENTENCE_TEMPLATES)) {
      if (!exclude.has(template as TemplateId)) add(make(ctx, s));
    }
  }
  return out;
};

export const plan = (course: CourseView, state: LearnerState, request: SessionRequest, options: PlanOptions): SessionPlan => {
  const rng = seededRng(options.seed);
  const target = options.targetSuccess ?? 0.85;
  const desired = options.desiredRetention ?? DESIRED_RETENTION;
  const exclude = exclusionsOf(course, options);
  const { now } = options;
  const orthography = course.orthography;
  if (request.mode === "placement") {
    const placement = placementTest(course, options.seed, exclude);
    const all = placement.test.blocks.flatMap((b) => [...b.exercises, ...b.steps.map((s) => s.exercise)]);
    const predictions: Record<string, number> = Object.fromEntries(all.map((ex) => [ex.id, predictExercise(state, ex, orthography, now)]));
    const exercises = runTest(placement.test, new Map()).next;
    return { request, exercises, predictions: exercises.map((ex) => predictions[ex.id] as number), planner: PLANNER, placement: { ...placement, predictions } };
  }
  const key = (kc: string, facet: Facet): string => cardKey(kc, facet, orthography);
  const seen = seenKcs(state);
  const due = new Map(dueFacets(state, orthography, now, desired).map((f) => [f.key, f.r]));

  // ---- 1–2. targets and candidates
  let introduced: readonly KcId[] = [];
  let pool: Exercise[];
  let size: number;
  if (request.mode === "lesson") {
    const found = lessonNodes(course).find((n) => n.node.id === request.node);
    if (found === undefined) throw new Error(`no lesson node ${request.node} in ${course.id}`);
    const { unit, node } = found;
    introduced = node.introduces;
    const ctx: MakeContext = { course, rng, introduced };
    const fresh = node.introduces.flatMap<BundleKc>((id) => allKcs(course).find((k) => k.id === id) ?? []);
    const pairsPool = fresh.length >= 3 ? fresh : [...fresh, ...unit.kcs.filter((k) => !fresh.includes(k) && seen.has(k.id))];
    const own = sentencesOf(course, unit, node);
    // Interleave: earlier sentences whose facets are due.
    const earlier = allSentences(course).filter((s) => !own.includes(s) && s.forms[course.orthography] !== undefined && s.kcs.some((kc) => due.has(key(kc, "recognize")) || due.has(key(kc, "produce"))));
    pool = [...candidatesFor(ctx, own, pairsPool, exclude), ...candidatesFor(ctx, earlier.slice(0, 6), [], exclude)];
    size = options.size ?? Math.min(14, Math.max(10, own.length * 2));
  } else if (request.mode === "review") {
    const ctx: MakeContext = { course, rng, introduced: [] };
    const studied = allSentences(course).filter((s) => s.forms[course.orthography] !== undefined && s.kcs.length > 0 && s.kcs.every((kc) => seen.has(kc)));
    const all = candidatesFor(ctx, studied, allKcs(course).filter((k) => seen.has(k.id)), exclude);
    // Review exercises due facets first (their gain is high); the rest stay as fillers the
    // calibration term can pick to keep the session near the target success rate.
    pool = all;
    // As long as there is something due to review, up to 10.
    size = options.size ?? Math.max(5, Math.min(10, due.size));
  } else {
    pool = mistakeExercises({ course, rng, introduced: [] }, state, exclude, seen);
    size = Math.min(options.size ?? 10, pool.length);
  }

  // i+1 at runtime: every KC that is not new in this lesson has been seen.
  const targets = new Set(introduced);
  const admissible = pool.filter((ex) => ex.kcs.every((kc) => targets.has(kc) || seen.has(kc)));
  const candidates: Candidate[] = admissible.map((ex, order) => ({ ex, p: predictExercise(state, ex, orthography, now), order }));

  // ---- 3–4. greedy selection
  const chosen: Candidate[] = [];
  const covered = new Set<string>(); // (KC, facet) exercised so far in this plan
  const recognized = new Set<string>(); // new KCs recognized so far in this plan
  const gain = (c: Candidate): number => {
    const facet = facetOf(c.ex.template);
    const parts = c.ex.kcs.map((kc) => {
      const k = key(kc, facet);
      const base = state.cards[k] === undefined ? (targets.has(kc) ? 1 : 0.5) : due.has(k) ? 0.6 + (desired - (due.get(k) ?? 0)) : 0.15;
      return covered.has(k) ? base * 0.3 : base;
    });
    return parts.length === 0 ? 0 : parts.reduce((a, b) => a + b, 0) / parts.length;
  };
  const allowed = (c: Candidate): boolean => {
    const same = chosen.filter((x) => x.ex.template === c.ex.template).length;
    if (same >= (MAX_PER_TEMPLATE[c.ex.template] ?? MAX_PER_TEMPLATE_DEFAULT)) return false;
    if (RECOGNITION.has(c.ex.template)) return true;
    // A new KC is recognized before it is produced or read.
    return c.ex.kcs.every((kc) => !targets.has(kc) || recognized.has(kc) || state.cards[key(kc, "recognize")] !== undefined);
  };
  // Aim the session's mean p̂ at the target (§9.4): easy and hard items can balance each other.
  const score = (c: Candidate): number => {
    const sumP = chosen.reduce((a, x) => a + x.p, 0);
    const meanP = (sumP + c.p) / (chosen.length + 1);
    const calibration = -CALIBRATION_WEIGHT * Math.abs(meanP - target) - 2 * Math.abs(c.p - target);
    const sameTemplate = chosen.filter((x) => x.ex.template === c.ex.template).length;
    const sameItem = chosen.filter((x) => x.ex.item === c.ex.item).length;
    const newCoverage = c.ex.kcs.some((kc) => targets.has(kc) && !recognized.has(kc)) && RECOGNITION.has(c.ex.template) ? 0.4 : 0;
    return gain(c) + newCoverage + calibration - 0.15 * sameTemplate - 0.5 * sameItem;
  };
  // Every new KC is presented in its lesson (a hard constraint): while a new KC an allowed exercise
  // can present is not yet in the plan, only such exercises qualify (new words first, as ordered
  // below); the scores choose among them, and then fill the session.
  const presentable = new Set(candidates.flatMap((c) => c.ex.kcs.filter((kc) => targets.has(kc))));
  const presented = new Set<string>();
  const remaining = [...candidates];
  while (chosen.length < size && remaining.length > 0) {
    const missing = [...presentable].filter((kc) => !presented.has(kc));
    const mustPresent = missing.length > 0 && remaining.some((c) => allowed(c) && c.ex.kcs.some((kc) => missing.includes(kc)));
    let best = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const [i, c] of remaining.entries()) {
      if (!allowed(c)) continue;
      if (mustPresent && !c.ex.kcs.some((kc) => missing.includes(kc))) continue;
      const s = score(c);
      if (s > bestScore + 1e-12) {
        best = i;
        bestScore = s;
      }
    }
    if (best < 0) break;
    const [pick] = remaining.splice(best, 1);
    if (pick === undefined) break;
    chosen.push(pick);
    const facet = facetOf(pick.ex.template);
    for (const kc of pick.ex.kcs) {
      presented.add(kc);
      covered.add(key(kc, facet));
      if (RECOGNITION.has(pick.ex.template) && targets.has(kc)) recognized.add(kc);
    }
  }

  // ---- 5. end on a likely success
  if (chosen.length > 2) {
    const tail = chosen.slice(-3);
    const easiest = tail.reduce((a, b) => (b.p > a.p ? b : a));
    chosen.splice(chosen.indexOf(easiest), 1);
    chosen.push(easiest);
  }
  return { request, exercises: chosen.map((c) => c.ex), predictions: chosen.map((c) => c.p), planner: PLANNER };
};
