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
   * Continue offers practice before the next lesson once this share of the words met is due (and
   * at least REVIEW_FIRST_MIN words): the more words a learner knows, the more are due at any time.
   */
  readonly reviewFirst: number;
}

export const PACE: Readonly<Record<PaceBand, PaceSettings>> = {
  consolidate: { retention: 0.93, reviewShare: 0.35, reviewFirst: 0.1 },
  steady: { retention: DESIRED_RETENTION, reviewShare: 0.25, reviewFirst: 0.2 },
  accelerate: { retention: 0.87, reviewShare: 0.1, reviewFirst: 0.35 },
};

const REVIEW_FIRST_MIN = 5;
/** Too few graded first tries to judge from: the pace stays steady. */
const PACE_MIN_TRIES = 30;
/** Recent first-try success under this: consolidate. The planner aims every session at 85%. */
const PACE_STRUGGLING = 0.78;
/** At or over this, with at most PACE_CLEAR of the words met due: accelerate. */
const PACE_BREEZING = 0.92;
const PACE_CLEAR = 0.15;
/** This share of the words met due (at the steady target), and at least PACE_BACKLOG_MIN: consolidate. */
const PACE_BACKLOG = 0.4;
const PACE_BACKLOG_MIN = 15;

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
  /** The words met (practised) so far: what the due share is of. */
  readonly met: number;
  readonly settings: PaceSettings;
}

const bandOf = (success: number | undefined, backlog: number, met: number): { band: PaceBand; reason: Pace["reason"] } => {
  if (backlog >= Math.max(PACE_BACKLOG_MIN, PACE_BACKLOG * met)) return { band: "consolidate", reason: "backlog" };
  if (success === undefined) return { band: "steady", reason: "steady" };
  if (success < PACE_STRUGGLING) return { band: "consolidate", reason: "struggling" };
  if (success >= PACE_BREEZING && backlog <= PACE_CLEAR * met) return { band: "accelerate", reason: "breezing" };
  return { band: "steady", reason: "steady" };
};

/** The learner's pace in this course now, read from the log, unless they chose one. */
export const paceOf = (course: CourseView, state: LearnerState, now: string, choice: PaceChoice = "auto"): Pace => {
  const recent = state.recent.slice(-RECENT_WINDOW);
  const success = recent.length >= PACE_MIN_TRIES ? recent.filter(Boolean).length / recent.length : undefined;
  const dueAt = (retention: number): { due: number; met: number } => {
    const words = learnedWords(course, state, now, retention);
    return { due: words.filter((w) => w.due).length, met: words.length };
  };
  const steady = dueAt(DESIRED_RETENTION);
  const read = choice === "auto" ? bandOf(success, steady.due, steady.met) : { band: choice, reason: "chosen" as const };
  const settings = PACE[read.band];
  return { ...read, success, ...(settings.retention === DESIRED_RETENTION ? steady : dueAt(settings.retention)), settings };
};

/** Whether Continue offers practice before a new lesson: enough of the words met are due at this pace. */
export const practiceFirst = (pace: Pace): boolean => pace.due > 0 && pace.due >= Math.max(REVIEW_FIRST_MIN, pace.settings.reviewFirst * pace.met);

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
