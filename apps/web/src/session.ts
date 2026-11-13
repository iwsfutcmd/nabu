/**
 * Turns the player's events into learner events (gameplan §9.6): the shell
 * stamps ids, the clock, the time zone and the device; it measures latency
 * from presentation to answer; and it logs the planner's p̂ for first tries in
 * shadow mode (§9.3). Core builds the event and assigns credit. For a
 * placement test it also notes each first try, and reports where the learner
 * placed when the test ends (§9.5), or when the learner stops it (S5).
 */
import { learnerEventOf, PERFORMANCE_MODEL, placementOf, progressResetOf, type SessionMeta, type SessionPlan } from "@nabu/core/learner";
import { isCorrect, type CourseView, type LessonEvent } from "@nabu/core/lesson";
import type { LearnerEvent, Prediction } from "@nabu/schema";
import { localDate, localIso, timeZone, uuidv7 } from "./clock.ts";

export interface RecorderOptions {
  readonly course: CourseView;
  /** The bundle's manifest id (sha256). */
  readonly bundle: string;
  readonly device: string;
  readonly plan: SessionPlan;
  readonly seed: number;
  readonly record: (event: LearnerEvent) => void;
  /** The session's id, when the shell made it beforehand: a new session's, kept with its plan, or one picked up again (S3). */
  readonly session?: string | undefined;
  /** A session picked up again: the first tries its log already holds (exercise id → right). */
  readonly firstTries?: ReadonlyMap<string, boolean> | undefined;
}

export const recorder = ({ course, bundle, device, plan, seed, record, session, firstTries }: RecorderOptions): ((event: LessonEvent) => void) => {
  const { request } = plan;
  const meta: SessionMeta = { mode: request.mode, node: request.mode === "lesson" ? request.node : undefined, seed, planner: plan.planner };
  return eventRecorder({ course, bundle, device, meta, record, plan, session, firstTries });
};

export interface StoryRecorderOptions {
  readonly course: CourseView;
  readonly bundle: string;
  readonly device: string;
  /** The story's path node. */
  readonly node: string;
  readonly seed: number;
  readonly record: (event: LearnerEvent) => void;
  /** The session's id, where the shell made it beforehand (its end reads the log without it). */
  readonly session?: string | undefined;
}

/** A story is one session (mode story) at its node: its questions are answers like any other. */
export const storyRecorder = ({ course, bundle, device, node, seed, record, session }: StoryRecorderOptions): ((event: LessonEvent) => void) =>
  eventRecorder({ course, bundle, device, meta: { mode: "story", node, seed, planner: "story" }, record, session });

const eventRecorder = ({
  course,
  bundle,
  device,
  meta,
  record,
  plan,
  session = uuidv7(),
  firstTries,
}: {
  readonly course: CourseView;
  readonly bundle: string;
  readonly device: string;
  readonly meta: SessionMeta;
  readonly record: (event: LearnerEvent) => void;
  readonly plan?: SessionPlan;
  readonly session?: string | undefined;
  readonly firstTries?: ReadonlyMap<string, boolean> | undefined;
}): ((event: LessonEvent) => void) => {
  const request = plan?.request;
  // Retries ("…#2") were not planned: they carry no prediction.
  const predictions = new Map<string, number | undefined>([...(plan?.exercises ?? []).map((ex, i) => [ex.id, plan?.predictions[i]] as const), ...Object.entries(plan?.placement?.predictions ?? {})]);
  let presentedAt = performance.now();
  // A session picked up again counts the first tries it had before (placement places by them).
  const firstTry = new Map<string, boolean>(firstTries ?? []);
  return (e) => {
    const now = new Date();
    if (e.type === "exercise_presented") presentedAt = performance.now();
    if (e.type === "answer_submitted" && !e.ex.id.includes("#")) firstTry.set(e.ex.id, isCorrect(e.graded.verdict));
    if (e.type === "exercise_skipped" && !e.ex.id.includes("#")) firstTry.set(e.ex.id, false);
    // A claim or the judge revised an answer (ADR 0113): the test places by what it counts as now.
    if (e.type === "answer_revised" && firstTry.has(e.exercise.id)) firstTry.set(e.exercise.id, isCorrect(e.verdict));
    const test = e.type === "session_completed" && request?.mode === "placement" ? plan?.placement : undefined;
    const reached = test === undefined ? undefined : placementOf(test, firstTry);
    // A placement test stopped part-way still places by the answers so far (S5, D9): it stays a
    // stopped session, which earns no session XP, and says what those answers placed. Where they
    // place nothing, it says nothing.
    const stopped = e.type === "session_completed" && !e.summary.completed;
    const placed = reached !== undefined && (!stopped || reached.length > 0) ? reached : undefined;
    const p = e.type === "exercise_presented" || e.type === "answer_submitted" ? predictions.get(e.ex.id) : undefined;
    const prediction: Prediction | undefined = p === undefined ? undefined : { p, model: PERFORMANCE_MODEL };
    const event = learnerEventOf(
      e,
      course,
      { id: uuidv7(now.getTime()), clientTime: localIso(now), localDate: localDate(now), tz: timeZone(), device, session, bundle },
      meta,
      {
        ...(e.type === "answer_submitted" ? { latencyMs: performance.now() - presentedAt } : {}),
        ...(prediction === undefined ? {} : { prediction }),
        ...(placed === undefined ? {} : { placed }),
      },
    );
    if (event !== undefined) record(event);
  };
};

/** "Start this course over" (progress_reset), stamped like any event this device records. */
export const resetEvent = (course: CourseView, bundle: string, device: string): LearnerEvent => {
  const now = new Date();
  return progressResetOf(course, { id: uuidv7(now.getTime()), clientTime: localIso(now), localDate: localDate(now), tz: timeZone(), device, session: uuidv7(now.getTime()), bundle });
};
