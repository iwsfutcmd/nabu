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
import { pathOf, type PathNode } from "./path.ts";
import { DESIRED_RETENTION, RECENT_WINDOW, type LearnerState } from "./state.ts";
import { learnedWords } from "./words.ts";

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
}

export const PACE: Readonly<Record<PaceBand, PaceSettings>> = {
  consolidate: { retention: 0.93, reviewShare: 0.35, practiceAt: 10 },
  steady: { retention: DESIRED_RETENTION, reviewShare: 0.25, practiceAt: 20 },
  accelerate: { retention: 0.85, reviewShare: 0.1, practiceAt: 60 },
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

/** The learner's pace in this course now, read from the log, unless they chose one. */
export const paceOf = (course: CourseView, state: LearnerState, now: string, choice: PaceChoice = "auto"): Pace => {
  const recent = state.recent.slice(-RECENT_WINDOW);
  const success = recent.length >= PACE_MIN_TRIES ? recent.filter(Boolean).length / recent.length : undefined;
  const dueAt = (retention: number): number => learnedWords(course, state, now, retention).filter((w) => w.due).length;
  const read = choice === "auto" ? bandOf(success, dueAt(DESIRED_RETENTION - PACE_SLIP)) : { band: choice, reason: "chosen" as const };
  const settings = PACE[read.band];
  return { ...read, success, due: dueAt(settings.retention), slipping: dueAt(settings.retention - PACE_SLIP), settings };
};

/** Whether Continue offers practice before a new lesson: enough words are slipping at this pace. */
export const practiceFirst = (pace: Pace): boolean => pace.slipping >= pace.settings.practiceAt;

/**
 * Where Continue goes (D6): practice first once enough words are due for this pace (or when the
 * path is finished and anything is due), else the next node on the path. `next` is that node either
 * way, for "New lesson anyway"; undefined once the path is done.
 */
export type ContinueTo =
  | { readonly kind: "practice"; readonly next: PathNode | undefined }
  | { readonly kind: "path"; readonly next: PathNode }
  | { readonly kind: "done" };

export const continueOf = (course: CourseView, state: LearnerState, pace: Pace): ContinueTo => {
  const next = pathOf(course, state).find((n) => n.status === "available");
  if (practiceFirst(pace) || (next === undefined && pace.due > 0)) return { kind: "practice", next };
  return next === undefined ? { kind: "done" } : { kind: "path", next };
};
