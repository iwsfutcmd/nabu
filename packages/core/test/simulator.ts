/**
 * A simulated learner with a hidden truth the planner never sees: their own
 * ability, per-template and per-KC difficulties that differ from the model's
 * priors, and a forgetting curve per (KC, facet). The planner only sees the
 * events it causes, exactly as in the app. Used by the 30-day acceptance test
 * (simulation.test.ts) and by `pnpm simulate`, which writes the log as JSONL
 * for the calibration notebook (pipeline/notebooks/calibration.py).
 */
import type { LearnerEvent } from "@nabu/schema";
import { creditedKcs } from "../src/learner/credit.ts";
import { applyEvents, dueFacets, emptyLearnerState, facetOf, paceOf, PERFORMANCE_MODEL, plan, practiceFirst, type LearnerState } from "../src/learner/index.ts";
import { lessonNodes, seededRng, type Exercise, type Rng, type TemplateId } from "../src/lesson/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const DAY = 86_400_000;

/** The simulated learner's hidden truth. */
interface Truth {
  readonly theta: number;
  /** How fast memories grow with practice: 1 as the planner's tuning assumed, more or less for others. */
  readonly learning: number;
  readonly template: Readonly<Record<TemplateId, number>>;
  readonly kc: Map<string, number>;
  /** Memory per (KC, facet): stability in days and last practice. */
  readonly memory: Map<string, { s: number; last: number }>;
}

const TRUE_TEMPLATE: Readonly<Record<TemplateId, number>> = {
  "select-image": -1.2,
  "match-pairs": -1.0,
  "choose-translation": -0.6,
  "translate-tap.l2-l1": 0.0,
  "translate-tap.l1-l2": 0.4,
  "gap-fill": 0.2,
  "char-read": 0.0,
  "reading-disambiguation": 0.8,
  vocalize: 0.0,
  transcribe: 1.2,
  "complete-translation": 1.0,
  "translate-type.l1-l2": 1.4,
  "speak.tier-0": -1.0,
  speak: 0.6,
  "listen-speak": 0.8,
  "tone-identify": 1.0,
  "listen-select": -0.4,
  "minimal-pair": 0.1,
  "listen-tap": 0.6,
  "listen-type": 1.6,
  "story-choose": -0.6,
  "story-complete": -0.2,
  "story-arrange": 0.2,
  "letter-read": -1.0,
  "letter-pairs": -1.0,
  "word-read": -0.4,
  "word-write": 0.2,
};

const gauss = (rng: Rng): number => Math.sqrt(-2 * Math.log(1 - rng.next())) * Math.cos(2 * Math.PI * rng.next());

const recall = (truth: Truth, key: string, now: number): number => {
  const m = truth.memory.get(key);
  return m === undefined ? 0 : Math.pow(0.9, (now - m.last) / DAY / m.s);
};

/** Recall of what the card asks (a blank's word, a pronunciation card's word); the rest is shown. */
const trueP = (truth: Truth, ex: Exercise, now: number, rng: Rng): number => {
  const facet = facetOf(ex.template);
  const asked = creditedKcs(ex);
  const r = asked.length === 0 ? 0 : asked.reduce((s, kc) => s + recall(truth, `${kc}|${facet}`, now), 0) / asked.length;
  const kcs = ex.kcs.map((kc) => {
    if (!truth.kc.has(kc)) truth.kc.set(kc, 0.4 * gauss(rng));
    return truth.kc.get(kc) as number;
  });
  const b = TRUE_TEMPLATE[ex.template] + (kcs.length === 0 ? 0 : kcs.reduce((a, c) => a + c, 0) / kcs.length);
  return 1 / (1 + Math.exp(-(truth.theta - b + 2.5 * (r - 0.5))));
};

/**
 * How long an answer takes (ADR 0096): a fixed part and a part per KC, slower when recall is weak,
 * with the spread of a real learner, so the rating map's pace is exercised as in the app.
 */
const latencyOf = (ex: Exercise, p: number, rng: Rng): number => Math.round((2000 + 900 * ex.kcs.length) * Math.exp(0.35 * gauss(rng)) * (1 + 0.8 * (1 - p)));

const practise = (truth: Truth, ex: Exercise, correct: boolean, now: number): void => {
  const facet = facetOf(ex.template);
  const grow = (gain: number): number => 1 + gain * truth.learning;
  for (const kc of creditedKcs(ex)) {
    const key = `${kc}|${facet}`;
    const m = truth.memory.get(key);
    const s = m === undefined ? (correct ? truth.learning : 0.3) : correct ? m.s * (recall(truth, key, now) < 0.9 ? grow(1.5) : grow(0.2)) : Math.max(0.3, m.s * 0.4);
    truth.memory.set(key, { s, last: now });
  }
};

export interface Result {
  readonly firstTries: number;
  readonly correct: number;
  readonly sessions: number;
  readonly lessons: number;
  readonly predicted: number;
  readonly templates: Readonly<Record<string, number>>;
  readonly byMode: Readonly<Record<string, { n: number; ok: number; p: number }>>;
}

export interface SimulationOptions {
  /**
   * How the learner picks sessions: "path" takes the next lesson, else a review when three cards
   * are due (the original acceptance runs); "continue" follows Continue at its pace (ADR 0105):
   * practice first once enough words are due, else the next lesson.
   */
  readonly follow?: "path" | "continue";
  /** How fast the learner's memories grow (1: as the planner was tuned). */
  readonly learning?: number;
  /** How many days the learner keeps at it: 30 for the acceptance runs, a year for `bench:replay`. */
  readonly days?: number;
  /** The hours (UTC) of the day's sessions: two, at 9:00 and 19:00, unless a run asks for more. */
  readonly hours?: readonly number[];
}

/** 30 days (or `days`) of a learner who follows the app; `onEvent` sees every event the device would log. */
export const simulate = (
  courseId: string,
  orthography: string | undefined,
  seed: number,
  ability: number,
  onEvent?: (e: LearnerEvent) => void,
  options: SimulationOptions = {},
): Result => {
  const course = loadCourse(courseId, orthography);
  const events = eventFactory(course, manifestOf(courseId).id);
  const rng = seededRng(seed);
  const truth: Truth = { theta: ability + 0.2 * gauss(rng), learning: options.learning ?? 1, template: TRUE_TEMPLATE, kc: new Map(), memory: new Map() };
  let state: LearnerState = emptyLearnerState();
  const apply = (e: LearnerEvent): void => {
    state = applyEvents(state, [e]);
    onEvent?.(e);
  };
  const nodes = lessonNodes(course).map((n) => n.node.id);
  let firstTries = 0;
  let correct = 0;
  let sessions = 0;
  let lessons = 0;
  let predicted = 0;
  const templates: Record<string, number> = {};
  const byMode: Record<string, { n: number; ok: number; p: number }> = {};
  const start = Date.parse("2026-01-01T00:00:00Z");
  const hours = options.hours ?? [9, 19];
  for (let day = 0; day < (options.days ?? 30); day++) {
    for (const [slot, hour] of hours.entries()) {
      let clock = start + day * DAY + hour * 3_600_000;
      const iso = (): string => new Date(clock).toISOString();
      // A learner who follows the path: the next lesson, else a review when something is due, else a
      // day off. One who follows Continue: practice first once its pace says so (ADR 0105).
      const next = nodes.find((n) => !state.completedNodes.includes(n));
      const pace = options.follow === "continue" ? paceOf(course, state, iso()) : undefined;
      const practice = pace !== undefined && pace.due > 0 && (practiceFirst(pace) || next === undefined);
      if (!practice && next === undefined && dueFacets(state, course.orthography, iso()).length < 3) continue;
      const request = next !== undefined && !practice ? ({ mode: "lesson", node: next } as const) : ({ mode: "review" } as const);
      const p = plan(course, state, request, { now: iso(), today: iso().slice(0, 10), seed: seed * 1000 + day * hours.length + slot, pace: pace?.band });
      if (p.exercises.length === 0) continue;
      sessions++;
      if (request.mode === "lesson") lessons++;
      events.at(iso());
      events.session();
      apply(events.started(request.mode, request.mode === "lesson" ? request.node : undefined, p.exercises.length));
      let firstRight = 0;
      let retries = 0;
      for (const [i, ex] of p.exercises.entries()) {
        predicted += p.predictions[i] ?? 0;
        const m = (byMode[request.mode] ??= { n: 0, ok: 0, p: 0 });
        m.n++;
        m.p += p.predictions[i] ?? 0;
        templates[ex.template] = (templates[ex.template] ?? 0) + 1;
        for (let attempt = 1; attempt <= 3; attempt++) {
          clock += 20_000;
          events.at(iso());
          const chance = trueP(truth, ex, clock, rng);
          const ok = rng.next() < chance;
          if (attempt === 1) {
            firstTries++;
            if (ok) {
              correct++;
              firstRight++;
              (byMode[request.mode] as { ok: number }).ok++;
            }
          } else retries++;
          // First tries carry the planner's p̂, logged in shadow mode (§9.3).
          apply(events.answer(ex, ok, attempt, latencyOf(ex, chance, rng), attempt === 1 ? { p: p.predictions[i] ?? 0.5, model: PERFORMANCE_MODEL } : undefined));
          if (attempt === 1) practise(truth, ex, ok, clock);
          if (ok) break;
        }
      }
      clock += 5_000;
      events.at(iso());
      apply(events.completed(request.mode, request.mode === "lesson" ? request.node : undefined, { exercises: p.exercises.length, correctFirstTry: firstRight, retries }));
    }
  }
  return { firstTries, correct, sessions, lessons, predicted, templates, byMode };
};
