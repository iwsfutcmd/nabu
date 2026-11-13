/**
 * A session picked up again (S3 in the 2026-11 review): a reload, or a phone that dropped the tab,
 * reopens the session where it was, not from its first exercise. The shell keeps the session's
 * plan; its log holds what the learner did. This folds those answers through the player's own
 * state machine (`step`), so the session goes on exactly as it would have: a missed exercise is
 * queued again, a card put off drops its kind, an adaptive test asks what its answers so far call
 * for. Nothing is graded again: each answer keeps the verdict it was logged with, or the one a
 * revision gave it (a claim, the judge: ADR 0052, 0113).
 */
import type { AnswerSubmitted, ExerciseSkipped, LearnerEvent } from "@nabu/schema";
import { revised, revisionsOf } from "../learner/revisions.ts";
import type { Verdict } from "../match/grade.ts";
import { isCorrect, type Exercise, type Response, type SkipReason } from "./exercise.ts";
import { start, step, type Effect, type PlayerState, type SessionResult, type StartOptions } from "./player.ts";

/** One exercise as the log tells it. */
export type Done =
  /** answer_submitted: its exercise id ("…#2" for a retry), verdict, and whether it was a self-rating. */
  | {
      readonly tag: "answer";
      readonly exercise: string;
      readonly verdict: Verdict;
      readonly selfRated?: boolean | undefined;
      /** What the learner answered, where the log has it: typed text, a self-rating. */
      readonly response?: Response | undefined;
      /**
       * The verdict a revision gave the answer (ADR 0052: the learner's claim, the judge's accept),
       * where one did. The session went on from it (ADR 0113): from the answer's feedback, unless the
       * log shows the card was asked again before the revision came (then only its score counts it).
       */
      readonly revised?: Verdict | undefined;
    }
  /** exercise_skipped. */
  | { readonly tag: "skip"; readonly exercise: string; readonly reason: SkipReason };

/**
 * The response an answer stands for where the log does not have it: never shown (the session moves
 * past it) nor graded, and not kept with its result.
 */
const LOGGED: Response = { tag: "choice", index: -1 };

/** The results without the stand-in response on the latest: the session does not know what was answered. */
const unanswered = (results: readonly SessionResult[]): readonly SessionResult[] =>
  results.map((r, i) => {
    if (i !== results.length - 1 || r.response !== LOGGED) return r;
    const { response: _, ...rest } = r;
    return rest;
  });

/** The id an exercise was planned under, and which attempt at it this is ("…#2": the second). */
const plannedId = (id: string): string => id.split("#")[0] as string;
const attemptOf = (id: string): number => {
  const at = id.lastIndexOf("#");
  return at < 0 ? 1 : Number(id.slice(at + 1));
};

/** The events that open the state a step reached: its exercise presented, or the session's end. */
const opening = (effects: readonly Effect[]): readonly Effect[] =>
  effects.filter((e) => e.tag === "emit" && (e.event.type === "exercise_presented" || e.event.type === "session_completed"));

/** The verdict an answer counts: its revision's, if it has one. */
const countedAs = (d: Extract<Done, { tag: "answer" }>): Verdict => d.revised ?? d.verdict;

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
 *
 * A revised answer is revised in its feedback, as a claim is made there, so a card the revision
 * counts right does not come back. Where the log holds a later attempt at the card, the revision
 * came after the session had asked it again (the judge answering late): it is applied as that
 * attempt opens, which changes the score and nothing that was asked.
 */
export const resume = (lesson: string, exercises: readonly Exercise[], options: StartOptions, done: readonly Done[]): readonly [PlayerState, readonly Effect[]] | undefined => {
  const byExercise = new Map<string, Done>();
  for (const d of done) if (!byExercise.has(d.exercise)) byExercise.set(d.exercise, d);
  /** Whether the log asked the card again after this attempt. */
  const askedAgain = (exercise: string): boolean => done.some((d) => plannedId(d.exercise) === plannedId(exercise) && attemptOf(d.exercise) > attemptOf(exercise));
  // Revisions that came once their card was asked again: applied when a later attempt opens.
  const late = new Map<string, { readonly exercise: string; readonly verdict: Verdict }[]>();
  const [first, effects] = start(lesson, exercises, options);
  let state: PlayerState = first;
  // The session started before: it reopens with its exercise, not a second start.
  let reopen = opening(effects);
  for (let d = state.tag === "presenting" ? byExercise.get(state.ex.id) : undefined; d !== undefined; d = state.tag === "presenting" ? byExercise.get(state.ex.id) : undefined) {
    byExercise.delete(d.exercise);
    let [answering] = step(state, { tag: "ready" });
    if (answering.tag !== "answering") return undefined;
    for (const r of late.get(plannedId(d.exercise)) ?? []) [answering] = step(answering, { tag: "revise", ...r });
    late.delete(plannedId(d.exercise));
    if (answering.tag !== "answering") return undefined;
    let [after, more]: readonly [PlayerState, readonly Effect[]] =
      d.tag === "skip"
        ? step(answering, { tag: "skip", reason: d.reason })
        : step({ tag: "checking", session: answering.session, ex: answering.ex, response: d.response ?? LOGGED }, { tag: "graded", outcome: { verdict: d.verdict, notes: [], ...(d.selfRated === true ? { selfRated: true as const } : {}) } });
    if (after.tag === "feedback" && d.tag === "answer" && d.response === undefined) after = { ...after, session: { ...after.session, results: unanswered(after.session.results) } };
    if (d.tag === "answer" && d.revised !== undefined) {
      const revision = { exercise: d.exercise, verdict: d.revised };
      if (askedAgain(d.exercise)) late.set(plannedId(d.exercise), [...(late.get(plannedId(d.exercise)) ?? []), revision]);
      else if (after.tag === "feedback") [after] = step(after, { tag: "revise", ...revision });
    }
    // Feedback was seen (or the page went while it showed): move on, as Continue does.
    if (after.tag === "feedback") [after, more] = step(after, { tag: "continue" });
    state = after;
    reopen = opening(more);
  }
  return byExercise.size === 0 ? [state, reopen] : undefined;
};

/** The first-try answers (exercise id → right) of a session's log, as the player counts them: a skip is a miss, a revision counts. */
export const firstTriesOf = (done: readonly Done[]): ReadonlyMap<string, boolean> =>
  new Map(done.filter((d) => !d.exercise.includes("#")).map((d) => [d.exercise, d.tag === "answer" && isCorrect(countedAs(d))]));

/**
 * What a session's log says the learner did: its answers and skips, in log order (device time,
 * then id), each answer with the verdict a revision of it gave (the latest, as every projection
 * takes it: ADR 0052).
 */
export const doneOf = (events: readonly LearnerEvent[], session: string): readonly Done[] => {
  const revisions = revisionsOf(events);
  return events
    .filter((e): e is AnswerSubmitted | ExerciseSkipped => (e.type === "answer_submitted" || e.type === "exercise_skipped") && e.session === session)
    .sort((a, b) => Date.parse(a.clientTime) - Date.parse(b.clientTime) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((e): Done => {
      if (e.type === "exercise_skipped") return { tag: "skip", exercise: e.exercise.id, reason: e.reason };
      const after = revised(e, revisions);
      // The log keeps what was typed, and a self-rating; a choice or a tile order only as its verdict.
      const response: Response | undefined = e.input.raw !== undefined ? { tag: "text", text: e.input.raw } : e.input.selfRating !== undefined ? { tag: "self-rating", rating: e.input.selfRating } : undefined;
      return {
        tag: "answer",
        exercise: e.exercise.id,
        verdict: e.outcome.kind,
        selfRated: e.input.selfRating !== undefined,
        ...(response === undefined ? {} : { response }),
        ...(after === e ? {} : { revised: after.outcome.kind }),
      };
    });
};
