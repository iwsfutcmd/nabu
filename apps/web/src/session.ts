/**
 * Turns the player's events into learner events (gameplan §9.6): the shell
 * stamps ids, the clock, the time zone and the device; it measures latency
 * from presentation to answer; and it logs the planner's p̂ for first tries in
 * shadow mode (§9.3). Core builds the event and assigns credit.
 */
import { learnerEventOf, PERFORMANCE_MODEL, type SessionPlan } from "@nabu/core/learner";
import type { CourseView, LessonEvent } from "@nabu/core/lesson";
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
}

export const recorder = ({ course, bundle, device, plan, seed, record }: RecorderOptions): ((event: LessonEvent) => void) => {
  const session = uuidv7();
  const { request } = plan;
  const meta = { mode: request.mode, node: request.mode === "lesson" ? request.node : undefined, seed, planner: plan.planner };
  // Retries ("…#2") were not planned: they carry no prediction.
  const predictions = new Map(plan.exercises.map((ex, i) => [ex.id, plan.predictions[i]]));
  let presentedAt = performance.now();
  return (e) => {
    const now = new Date();
    if (e.type === "exercise_presented") presentedAt = performance.now();
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
      },
    );
    if (event !== undefined) record(event);
  };
};
