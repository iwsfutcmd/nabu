/**
 * A session picked up again (S3 in the 2026-11 review): a reload, or a phone that dropped the tab,
 * reopens the session where it was, not from its first exercise. The shell keeps the session's
 * plan; its log holds what the learner did. This folds those answers through the player's own
 * state machine (`step`), so the session goes on exactly as it would have: a missed exercise is
 * queued again, a card put off drops its kind, an adaptive test asks what its answers so far call
 * for. Nothing is graded again: each answer keeps the verdict it was logged with.
 */
import type { AnswerSubmitted, ExerciseSkipped, LearnerEvent } from "@nabu/schema";
import type { Verdict } from "../match/grade.ts";
import { isCorrect, type Exercise, type Response, type SkipReason } from "./exercise.ts";
import { start, step, type Effect, type PlayerState, type StartOptions } from "./player.ts";

/** One exercise as the log tells it. */
export type Done =
  /** answer_submitted: its exercise id ("…#2" for a retry), verdict, and whether it was a self-rating. */
  | { readonly tag: "answer"; readonly exercise: string; readonly verdict: Verdict; readonly selfRated?: boolean | undefined }
  /** exercise_skipped. */
  | { readonly tag: "skip"; readonly exercise: string; readonly reason: SkipReason };

/** The response a resumed answer stands for: never shown (the session moves past it) nor graded. */
const LOGGED: Response = { tag: "choice", index: -1 };

/** The events that open the state a step reached: its exercise presented, or the session's end. */
const opening = (effects: readonly Effect[]): readonly Effect[] =>
  effects.filter((e) => e.tag === "emit" && (e.event.type === "exercise_presented" || e.event.type === "session_completed"));

/**
 * The player's state once the exercises in `done` are behind it, and the events that reopen it:
 * the next exercise presented, or the session completed when the log answered its last exercise
 * but not its end. `exercises` and `options` are the session's plan as it started.
 *
 * The session asks its exercises in its own order, and an exercise id comes once in a session (a
 * retry is "…#2"), so each is looked up by id as the fold reaches it: the order the events were
 * logged in does not matter (a device clock that stood still, or stepped back, cannot reorder the
 * session). Undefined when `done` does not fit the plan (an answer the session would not have
 * reached): start a new session instead.
 */
export const resume = (lesson: string, exercises: readonly Exercise[], options: StartOptions, done: readonly Done[]): readonly [PlayerState, readonly Effect[]] | undefined => {
  const byExercise = new Map<string, Done>();
  for (const d of done) if (!byExercise.has(d.exercise)) byExercise.set(d.exercise, d);
  const [first, effects] = start(lesson, exercises, options);
  let state: PlayerState = first;
  // The session started before: it reopens with its exercise, not a second start.
  let reopen = opening(effects);
  for (let d = state.tag === "presenting" ? byExercise.get(state.ex.id) : undefined; d !== undefined; d = state.tag === "presenting" ? byExercise.get(state.ex.id) : undefined) {
    byExercise.delete(d.exercise);
    const [answering] = step(state, { tag: "ready" });
    if (answering.tag !== "answering") return undefined;
    let [after, more]: readonly [PlayerState, readonly Effect[]] =
      d.tag === "skip"
        ? step(answering, { tag: "skip", reason: d.reason })
        : step({ tag: "checking", session: answering.session, ex: answering.ex, response: LOGGED }, { tag: "graded", outcome: { verdict: d.verdict, notes: [], ...(d.selfRated === true ? { selfRated: true as const } : {}) } });
    // Feedback was seen (or the page went while it showed): move on, as Continue does.
    if (after.tag === "feedback") [after, more] = step(after, { tag: "continue" });
    state = after;
    reopen = opening(more);
  }
  return byExercise.size === 0 ? [state, reopen] : undefined;
};

/** The first-try answers (exercise id → right) of a session's log, as the player counts them: a skip is a miss. */
export const firstTriesOf = (done: readonly Done[]): ReadonlyMap<string, boolean> =>
  new Map(done.filter((d) => !d.exercise.includes("#")).map((d) => [d.exercise, d.tag === "answer" && isCorrect(d.verdict)]));

/**
 * What a session's log says the learner did: its answers and skips, in log order (device time,
 * then id). Revisions are left out: the session went on from the verdicts it showed.
 */
export const doneOf = (events: readonly LearnerEvent[], session: string): readonly Done[] =>
  events
    .filter((e): e is AnswerSubmitted | ExerciseSkipped => (e.type === "answer_submitted" || e.type === "exercise_skipped") && e.session === session)
    .sort((a, b) => Date.parse(a.clientTime) - Date.parse(b.clientTime) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e) =>
      e.type === "answer_submitted"
        ? { tag: "answer", exercise: e.exercise.id, verdict: e.outcome.kind, selfRated: e.input.selfRating !== undefined }
        : { tag: "skip", exercise: e.exercise.id, reason: e.reason },
    );
