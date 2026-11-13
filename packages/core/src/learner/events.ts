/**
 * From the player's events to the learner event log (gameplan §9.6). The shell
 * supplies what core may not compute itself: ids, the clock, the time zone,
 * the device, the measured latency. Credit is assigned here (§8.5), once, at
 * answer time; projections fold the result.
 */
import type { AnswerSubmitted, KcId, LearnerEvent, OrthographyId, Prediction, ProgressReset } from "@nabu/schema";
import { lessonNodes } from "../lesson/build.ts";
import type { CourseView } from "../lesson/course.ts";
import type { Exercise } from "../lesson/exercise.ts";
import type { LessonEvent } from "../lesson/player.ts";
import { TEMPLATES } from "../lesson/templates.ts";
import { creditOf } from "./credit.ts";

export interface EventMeta {
  readonly id: string;
  /** Device clock, ISO 8601 with offset. */
  readonly clientTime: string;
  readonly localDate: string;
  readonly tz: string;
  readonly device: string;
  readonly user?: string | undefined;
  readonly session: string;
  readonly bundle: string;
}

export interface SessionMeta {
  readonly mode: "lesson" | "review" | "mistakes" | "placement" | "story";
  readonly node?: string | undefined;
  readonly seed: number;
  readonly planner: string;
}


/** The KCs the placed nodes introduce (ADR 0111), once each, in path order. */
export const placedKcs = (course: CourseView, placed: readonly string[]): KcId[] => {
  const nodes = new Set(placed);
  return [...new Set(lessonNodes(course).flatMap((n) => (nodes.has(n.node.id) ? n.node.introduces : [])))];
};

/**
 * "Start this course over": a progress_reset event for the course, stamped by the shell like any
 * other. Replay forgets what came before it in this course; XP and the game state stay.
 */
export const progressResetOf = (course: CourseView, meta: EventMeta): ProgressReset => ({
  id: meta.id,
  type: "progress_reset",
  schema: 1,
  device: meta.device,
  ...(meta.user === undefined ? {} : { user: meta.user }),
  course: course.id,
  orthography: course.orthography as OrthographyId,
  support: course.supportKey,
  bundle: meta.bundle,
  session: meta.session,
  clientTime: meta.clientTime,
  localDate: meta.localDate,
  tz: meta.tz,
});

/** 1 for a first try, n for the n-th time an exercise comes back after a mistake. */
export const attemptOf = (exerciseId: string): number => {
  const at = exerciseId.lastIndexOf("#");
  return at < 0 ? 1 : Number(exerciseId.slice(at + 1));
};

const METHOD: Readonly<Record<string, AnswerSubmitted["input"]["method"]>> = { choice: "choice", tiles: "tiles", text: "text", pairs: "pairs", voice: "voice" };

const refOf = (ex: Exercise) => ({ id: ex.id, template: ex.template, item: ex.item, kcs: [...ex.kcs] });

/**
 * The learner event for a player event, or undefined for none. `latencyMs` and
 * `prediction` belong to answers, `placed` to a finished placement test;
 * `session` describes the session for its start and end events.
 */
export const learnerEventOf = (
  e: LessonEvent,
  course: CourseView,
  meta: EventMeta,
  session: SessionMeta,
  extra: { readonly latencyMs?: number; readonly prediction?: Prediction; readonly placed?: readonly string[] } = {},
): LearnerEvent | undefined => {
  const base = {
    id: meta.id,
    schema: 1 as const,
    device: meta.device,
    ...(meta.user === undefined ? {} : { user: meta.user }),
    course: course.id,
    orthography: course.orthography as OrthographyId,
    support: course.supportKey,
    bundle: meta.bundle,
    session: meta.session,
    clientTime: meta.clientTime,
    localDate: meta.localDate,
    tz: meta.tz,
  };
  const node = session.node === undefined ? {} : { node: session.node };
  switch (e.type) {
    case "session_started":
      return { ...base, type: "session_started", mode: session.mode, ...node, seed: session.seed, exercises: e.exercises, planner: session.planner };
    case "exercise_presented":
      return { ...base, type: "exercise_presented", exercise: refOf(e.ex), ...(extra.prediction === undefined ? {} : { prediction: extra.prediction }) };
    case "answer_submitted": {
      const response = e.response;
      return {
        ...base,
        type: "answer_submitted",
        exercise: refOf(e.ex),
        attempt: attemptOf(e.ex.id),
        input: {
          method: METHOD[TEMPLATES[e.ex.template].modality.input] ?? "choice",
          latencyMs: Math.max(0, Math.round(extra.latencyMs ?? 0)),
          ...(response.tag === "text" ? { raw: response.text } : {}),
          ...(response.tag === "self-rating" ? { selfRating: response.rating } : {}),
          // A word looked up on the card before answering (D16): the fold rates the answer Hard at best.
          ...(e.hinted === true ? { hinted: true as const } : {}),
        },
        outcome: { kind: e.graded.verdict, notes: [...e.graded.notes], kcs: [...creditOf(e.ex, e.graded, course.profiles)] },
        ...(extra.prediction === undefined ? {} : { prediction: extra.prediction }),
      };
    }
    case "exercise_skipped":
      return { ...base, type: "exercise_skipped", exercise: refOf(e.ex), attempt: attemptOf(e.ex.id), reason: e.reason };
    // The claim or the judge's revision behind it is the learner event (ADR 0052, 0113).
    case "answer_revised":
      return undefined;
    case "session_completed":
      return {
        ...base,
        type: "session_completed",
        mode: session.mode,
        ...node,
        summary: { ...e.summary },
        // A placement test's nodes, and the KCs they introduce for the fold to seed (ADR 0111).
        ...(extra.placed === undefined ? {} : { placed: [...extra.placed], seeded: placedKcs(course, extra.placed) }),
      };
  }
};
