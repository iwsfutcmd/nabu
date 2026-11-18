/**
 * The learning pace (ADR 0105; the 2026-11 review's L2, L11, D5, D6): how fast new material should
 * come for this learner, read from the log like everything else. Three bands:
 *
 * - consolidate: recent first tries ran well under the target success, or many words are due;
 * - accelerate: recent first tries ran well over it, and little is due;
 * - steady: otherwise, or too little practice yet to tell.
 *
 * The inputs move slowly (the last RECENT_WINDOW graded first tries, the words due), so the band
 * holds from session to session rather than flipping. A learner may set the pace instead (D5).
 *
 * Each band sets the retention target (so what "due" means, everywhere), a lesson's share of review,
 * and where Continue goes: practice first once enough words are due, else the next lesson on the
 * path. A new lesson is always on offer beside it (D6): nothing is ever blocked.
 *
 * Pure: the state is the replayed log, `now` the caller's clock.
 */
import type { CourseView } from "../lesson/course.ts";
import { drillNodes } from "../lesson/drill.ts";
import type { Facet } from "../lesson/exercise.ts";
import { pathOf, type PathNode } from "./path.ts";
import { DESIRED_RETENTION, RECENT_WINDOW, type LearnerState } from "./state.ts";
import { learnedWords, NONE_OFF } from "./words.ts";

export type PaceBand = "consolidate" | "steady" | "accelerate";

/** What the learner chose: the app's reading of the log, or a band of their own (D5). */
export type PaceChoice = "auto" | PaceBand;

export interface PaceSettings {
  /** Recall below this makes a card due: more review for a learner who consolidates, less for one who speeds up. */
  readonly retention: number;
  /** The share of a lesson's cards that may bring back earlier material (ADR 0097). */
  readonly reviewShare: number;
  /**
   * Continue offers practice before the next lesson once this many words are slipping: recall more
   * than PACE_SLIP under the target. A word just past due is what a lesson's own review takes care
   * of; in a growing vocabulary there are always some (a new word's first intervals are a day or two).
   */
  readonly practiceAt: number;
  /**
   * Continue offers a passage's drills before the next node once this many words of passages read
   * wait to be drilled (ADR 0144): a learner who consolidates drills each passage's words before
   * reading on, one who speeds up reads ahead of their drills.
   */
  readonly drillAt: number;
}

export const PACE: Readonly<Record<PaceBand, PaceSettings>> = {
  consolidate: { retention: 0.93, reviewShare: 0.35, practiceAt: 10, drillAt: 1 },
  steady: { retention: DESIRED_RETENTION, reviewShare: 0.25, practiceAt: 20, drillAt: 10 },
  accelerate: { retention: 0.85, reviewShare: 0.1, practiceAt: 60, drillAt: 30 },
};

/** How far under the target a word's recall has fallen when it is slipping. */
const PACE_SLIP = 0.1;
/** Too few graded first tries to judge from: the pace stays steady. */
const PACE_MIN_TRIES = 30;
/** Recent first-try success under this: consolidate. The planner aims every session at 85%. */
const PACE_STRUGGLING = 0.78;
/** At or over this: accelerate. A learner this sure can take new material and their review both. */
const PACE_BREEZING = 0.9;
/** Otherwise this many words slipping (at the steady target) or more: consolidate. */
const PACE_BACKLOG = 30;

export interface Pace {
  readonly band: PaceBand;
  /**
   * Why (D5): the learner chose it; recent answers ran under or over the target; many words are
   * due; or nothing stands out.
   */
  readonly reason: "chosen" | "struggling" | "backlog" | "breezing" | "steady";
  /** Recent first-try success, where there were enough first tries to judge. */
  readonly success: number | undefined;
  /** The words due now, at this band's retention target (what the course page shows). */
  readonly due: number;
  /** The words slipping now: recall more than PACE_SLIP under this band's target. */
  readonly slipping: number;
  readonly settings: PaceSettings;
}

const bandOf = (success: number | undefined, slipping: number): { band: PaceBand; reason: Pace["reason"] } => {
  if (success !== undefined && success < PACE_STRUGGLING) return { band: "consolidate", reason: "struggling" };
  if (success !== undefined && success >= PACE_BREEZING) return { band: "accelerate", reason: "breezing" };
  if (slipping >= PACE_BACKLOG) return { band: "consolidate", reason: "backlog" };
  return { band: "steady", reason: "steady" };
};

/**
 * The learner's pace in this course now, read from the log, unless they chose one. A facet the
 * learner turned off for good (`facetsOff`, D41: listening) is never due or slipping, so it neither
 * holds the pace at consolidate nor sends Continue to practice that could never include it.
 */
export const paceOf = (course: CourseView, state: LearnerState, now: string, choice: PaceChoice = "auto", facetsOff: ReadonlySet<Facet> = NONE_OFF): Pace => {
  const recent = state.recent.slice(-RECENT_WINDOW);
  const success = recent.length >= PACE_MIN_TRIES ? recent.filter(Boolean).length / recent.length : undefined;
  const dueAt = (retention: number): number => learnedWords(course, state, now, retention, facetsOff).filter((w) => w.due).length;
  const read = choice === "auto" ? bandOf(success, dueAt(DESIRED_RETENTION - PACE_SLIP)) : { band: choice, reason: "chosen" as const };
  const settings = PACE[read.band];
  return { ...read, success, due: dueAt(settings.retention), slipping: dueAt(settings.retention - PACE_SLIP), settings };
};

/** Whether Continue offers practice before a new lesson: enough words are slipping at this pace. */
export const practiceFirst = (pace: Pace): boolean => pace.slipping >= pace.settings.practiceAt;

/**
 * The words of passages read that wait to be drilled (ADR 0144): those of every open drill session
 * not done yet.
 */
export const undrilledWords = (course: CourseView, state: LearnerState): number => {
  const done = new Set(state.completedNodes);
  return drillNodes(course)
    .filter((d) => done.has(d.node.drill.story))
    .reduce((sum, d) => sum + d.sessions.filter((s) => !done.has(s.id)).reduce((n, s) => n + s.words.length, 0), 0);
};

/**
 * Where Continue goes (D6): practice first once enough words are due for this pace (or when the
 * path is finished and anything is due); then a passage's drills (ADR 0144) once enough of its
 * words wait for this pace (or when nothing else is left on the path); else the next node on the
 * path. `next` is that node either way, for "New lesson anyway"; undefined once the path is done (a
 * drill, when only drills are left). What is due is the pace's, facets turned off for good left out
 * (D41).
 */
export type ContinueTo =
  | { readonly kind: "practice"; readonly next: PathNode | undefined }
  | { readonly kind: "drill"; readonly drill: PathNode; readonly next: PathNode | undefined }
  | { readonly kind: "path"; readonly next: PathNode }
  | { readonly kind: "done" };

/** Whether Continue offers a passage's drills before the next node: enough words wait at this pace. */
export const drillFirst = (course: CourseView, state: LearnerState, pace: Pace): boolean => undrilledWords(course, state) >= pace.settings.drillAt;

export const continueOf = (course: CourseView, state: LearnerState, pace: Pace): ContinueTo => {
  const path = pathOf(course, state);
  const next = path.find((n) => n.status === "available" && n.kind !== "drill");
  const drill = path.find((n) => n.status === "available" && n.kind === "drill");
  if (practiceFirst(pace)) return { kind: "practice", next: next ?? drill };
  if (drill !== undefined && (next === undefined || drillFirst(course, state, pace))) return { kind: "drill", drill, next };
  if (next === undefined) return pace.due > 0 ? { kind: "practice", next } : { kind: "done" };
  return { kind: "path", next };
};
