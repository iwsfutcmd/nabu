/**
 * The lesson player as a pure state machine (gameplan §11.5). `step` never
 * performs effects: grading, events and sounds are returned as data for the
 * shell to execute, so the whole lesson is testable without a DOM.
 *
 * IME safety (§6.7): while `composing` is true, `submit` is ignored and the
 * draft is stored exactly as typed. Only `compositionend` settles text.
 */
import type { Verdict } from "../match/grade.ts";
import { runTest, type AdaptiveTest } from "./adaptive.ts";
import type { SpeechResult } from "../speech/score.ts";
import { isCorrect, type Exercise, type Outcome, type Response, type SelfRating, type SkipReason, type TemplateId } from "./exercise.ts";
import { solutionOf, TEMPLATES } from "./templates.ts";
import { surfaceOf } from "../text/tagged-text.ts";

export type Draft =
  | { readonly tag: "choice"; readonly index: number | null }
  | { readonly tag: "tiles"; readonly order: readonly number[] }
  | { readonly tag: "text"; readonly text: string }
  | { readonly tag: "pairs"; readonly matched: readonly number[]; readonly mistakes: number }
  | { readonly tag: "self-rating"; readonly rating: SelfRating | null }
  /** Scored speaking: what was heard, once the recording is scored. */
  | { readonly tag: "speech"; readonly result: SpeechResult | null };

export interface SessionResult {
  readonly exercise: string;
  readonly template: TemplateId;
  readonly verdict: Verdict;
  readonly retry: boolean;
}

export interface Session {
  readonly lesson: string;
  readonly queue: readonly Exercise[];
  /** Index of the current exercise in `queue`. */
  readonly position: number;
  /** How many exercises the lesson started with; retries are added to `queue`. */
  readonly planned: number;
  readonly results: readonly SessionResult[];
  readonly excluded: readonly TemplateId[];
  /** Missed exercises come back at the end (default). A placement test asks each question once. */
  readonly retries?: boolean;
  /**
   * An adaptive test (ADR 0076): after each answer, the exercises still to come are the test's
   * next ones for the first-try answers so far. Its exercises are asked once (no retries).
   */
  readonly adaptive?: AdaptiveTest;
  /** Adaptive tests: at most this many exercises after the queue, for the progress bar. */
  readonly later?: number;
}

export interface StartOptions {
  readonly retries?: boolean;
  /** Ask this adaptive test (ADR 0076); `exercises` should be what it asks first. */
  readonly adaptive?: AdaptiveTest;
}

export interface SessionSummary {
  readonly completed: boolean;
  readonly exercises: number;
  readonly correctFirstTry: number;
  readonly retries: number;
  readonly skipped: number;
}

export type InterruptReason = "quit-confirm";

type Active =
  | { readonly tag: "presenting"; readonly session: Session; readonly ex: Exercise }
  | { readonly tag: "answering"; readonly session: Session; readonly ex: Exercise; readonly draft: Draft; readonly composing: boolean }
  | { readonly tag: "checking"; readonly session: Session; readonly ex: Exercise; readonly response: Response }
  | { readonly tag: "feedback"; readonly session: Session; readonly ex: Exercise; readonly response: Response | null; readonly outcome: Outcome };

export type PlayerState =
  | Active
  | { readonly tag: "interrupted"; readonly session: Session; readonly reason: InterruptReason; readonly resume: Active }
  | { readonly tag: "finished"; readonly session: Session; readonly summary: SessionSummary };

export type PlayerEvent =
  | { readonly tag: "ready" }
  | { readonly tag: "input"; readonly draft: Draft }
  | { readonly tag: "compositionstart" }
  | { readonly tag: "compositionend"; readonly text: string }
  | { readonly tag: "submit" }
  | { readonly tag: "graded"; readonly outcome: Outcome }
  | { readonly tag: "continue" }
  | { readonly tag: "skip"; readonly reason: SkipReason }
  | { readonly tag: "interrupt"; readonly reason: InterruptReason }
  | { readonly tag: "resume" }
  | { readonly tag: "quit" };

/** Learner events (§9.6), without the ids, clocks and device fields the shell adds. */
export type LessonEvent =
  | { readonly type: "session_started"; readonly lesson: string; readonly exercises: number }
  | { readonly type: "exercise_presented"; readonly exercise: ExerciseRef; readonly ex: Exercise }
  | {
      readonly type: "answer_submitted";
      readonly exercise: ExerciseRef;
      readonly response: Response;
      readonly outcome: { readonly kind: Verdict; readonly notes: readonly string[] };
      /** The exercise and the full outcome (alignment included), for credit assignment. */
      readonly ex: Exercise;
      readonly graded: Outcome;
    }
  | { readonly type: "exercise_skipped"; readonly exercise: ExerciseRef; readonly reason: SkipReason; readonly ex: Exercise }
  | { readonly type: "session_completed"; readonly lesson: string; readonly summary: SessionSummary };

export interface ExerciseRef {
  readonly id: string;
  readonly template: TemplateId;
  readonly item: string;
}

export type Effect =
  | { readonly tag: "grade"; readonly ex: Exercise; readonly response: Response }
  | { readonly tag: "emit"; readonly event: LessonEvent }
  | { readonly tag: "sound"; readonly sound: "correct" | "wrong" };

const ref = (ex: Exercise): ExerciseRef => ({ id: ex.id, template: ex.template, item: ex.item });

export const emptyDraft = (ex: Exercise): Draft => {
  switch (TEMPLATES[ex.template].modality.input) {
    case "choice":
      return { tag: "choice", index: null };
    case "tiles":
      return { tag: "tiles", order: [] };
    case "text":
      // Vowel marks are written into the word's letters (ADR 0054).
      return { tag: "text", text: ex.template === "vocalize" ? surfaceOf(ex.prompt) : "" };
    case "pairs":
      return { tag: "pairs", matched: [], mistakes: 0 };
    case "voice":
      return ex.template === "speak.tier-0" ? { tag: "self-rating", rating: null } : { tag: "speech", result: null };
  }
};

/** The draft a submitted response came from: what the views show while checking and in feedback. */
export const draftOf = (state: PlayerState): Draft | undefined => {
  const active = state.tag === "interrupted" ? state.resume : state;
  switch (active.tag) {
    case "finished":
      return undefined;
    case "presenting":
      return emptyDraft(active.ex);
    case "answering":
      return active.draft;
    case "checking":
    case "feedback": {
      const response = active.tag === "checking" ? active.response : active.response;
      if (response === null) return emptyDraft(active.ex);
      switch (response.tag) {
        case "choice":
          return { tag: "choice", index: response.index };
        case "tiles":
          return { tag: "tiles", order: response.order };
        case "text":
          return { tag: "text", text: response.text };
        case "pairs":
          return { tag: "pairs", matched: active.ex.template === "match-pairs" ? active.ex.left.map((_, i) => i) : [], mistakes: response.mistakes };
        case "self-rating":
          return { tag: "self-rating", rating: response.rating };
        case "speech":
          return { tag: "speech", result: response.result };
      }
    }
  }
};

/** The response a draft submits, or undefined while it is incomplete. */
export const responseOf = (ex: Exercise, draft: Draft): Response | undefined => {
  switch (draft.tag) {
    case "choice":
      return draft.index === null ? undefined : { tag: "choice", index: draft.index };
    case "tiles":
      return draft.order.length === 0 ? undefined : { tag: "tiles", order: draft.order };
    case "text":
      return draft.text.trim() === "" ? undefined : { tag: "text", text: draft.text };
    case "pairs":
      return ex.template === "match-pairs" && draft.matched.length === ex.left.length ? { tag: "pairs", mistakes: draft.mistakes } : undefined;
    case "self-rating":
      return draft.rating === null ? undefined : { tag: "self-rating", rating: draft.rating };
    case "speech":
      return draft.result === null ? undefined : { tag: "speech", result: draft.result };
  }
};

const present = (session: Session): readonly [PlayerState, readonly Effect[]] => {
  const ex = session.queue[session.position];
  if (ex === undefined) {
    const summary = summarize(session, true);
    return [{ tag: "finished", session, summary }, [{ tag: "emit", event: { type: "session_completed", lesson: session.lesson, summary } }]];
  }
  return [{ tag: "presenting", session, ex }, [{ tag: "emit", event: { type: "exercise_presented", exercise: ref(ex), ex } }]];
};

export const summarize = (session: Session, completed: boolean): SessionSummary => {
  const first = session.results.filter((r) => !r.retry);
  return {
    completed,
    // An adaptive test plans as it goes: its size is what it asked.
    exercises: session.adaptive === undefined ? session.planned : session.queue.length,
    correctFirstTry: first.filter((r) => isCorrect(r.verdict)).length,
    retries: session.results.filter((r) => r.retry).length,
    skipped: session.results.filter((r) => r.verdict === "SKIPPED").length,
  };
};

/** Starts a lesson. Mistakes come back at the end of the lesson until answered. */
export const start = (lesson: string, exercises: readonly Exercise[], options: StartOptions = {}): readonly [PlayerState, readonly Effect[]] => {
  const adaptive = options.adaptive === undefined ? {} : { adaptive: options.adaptive, retries: false, later: runTest(options.adaptive, new Map()).later };
  const session: Session = { lesson, queue: exercises, position: 0, planned: exercises.length, results: [], excluded: [], ...(options.retries === false ? { retries: false } : {}), ...adaptive };
  const [state, effects] = present(session);
  return [state, [{ tag: "emit", event: { type: "session_started", lesson, exercises: exercises.length } }, ...effects]];
};

/** Exercises that come back after a mistake: not speaking (self-rated) and not pairs (always completed). */
/** Speaking is not brought back (a recording is feedback, not a test), nor are pairs. */
const retryable = (ex: Exercise): boolean => !TEMPLATES[ex.template].modality.mic && ex.template !== "match-pairs";

/** First tries so far: exercise id → right. A skip counts as a miss. */
const firstTries = (session: Session): ReadonlyMap<string, boolean> => new Map(session.results.filter((r) => !r.retry).map((r) => [r.exercise, isCorrect(r.verdict)]));

const advance = (state: Extract<Active, { tag: "feedback" }>): readonly [PlayerState, readonly Effect[]] => {
  const { session, ex, outcome } = state;
  if (session.adaptive !== undefined) {
    const run = runTest(session.adaptive, firstTries(session));
    return present({ ...session, queue: [...session.queue.slice(0, session.position + 1), ...run.next], position: session.position + 1, later: run.later });
  }
  const again = session.retries !== false && !isCorrect(outcome.verdict) && outcome.skipped !== "cant-speak" && outcome.skipped !== "cant-listen" && retryable(ex);
  const attempt = session.queue.filter((e) => e.item === ex.item && e.template === ex.template).length + 1;
  const queue = again ? [...session.queue, { ...ex, id: `${ex.id.split("#")[0] as string}#${attempt}` }] : session.queue;
  return present({ ...session, queue, position: session.position + 1 });
};

const record = (session: Session, ex: Exercise, verdict: Verdict): Session => ({
  ...session,
  results: [...session.results, { exercise: ex.id, template: ex.template, verdict, retry: ex.id.includes("#") }],
});

const answering = (state: Extract<Active, { tag: "presenting" }>): Extract<Active, { tag: "answering" }> => ({
  tag: "answering",
  session: state.session,
  ex: state.ex,
  draft: emptyDraft(state.ex),
  composing: false,
});

const skip = (state: Extract<Active, { tag: "presenting" | "answering" }>, reason: SkipReason): readonly [PlayerState, readonly Effect[]] => {
  const { ex } = state;
  const session = record(state.session, ex, "SKIPPED");
  const emit: Effect = { tag: "emit", event: { type: "exercise_skipped", exercise: ref(ex), reason, ex } };
  if (reason === "cant-speak" || reason === "cant-listen") {
    // "Can't speak now" / "Can't listen now": no speaking, or no listening, for the rest of the lesson.
    const dropped = (t: TemplateId): boolean => (reason === "cant-speak" ? TEMPLATES[t].modality.mic : TEMPLATES[t].modality.audioOut);
    const rest = session.queue.slice(session.position + 1).filter((e) => !dropped(e.template));
    const gone = [...new Set(session.queue.map((e) => e.template).filter(dropped))];
    const next: Session = { ...session, queue: [...session.queue.slice(0, session.position + 1), ...rest], excluded: [...session.excluded, ...gone] };
    const [s, effects] = present({ ...next, position: next.position + 1 });
    return [s, [emit, ...effects]];
  }
  const outcome: Outcome = { verdict: "SKIPPED", notes: [], solution: solutionOf(ex), skipped: reason };
  return [{ tag: "feedback", session, ex, response: null, outcome }, [emit]];
};

export const step = (state: PlayerState, event: PlayerEvent): readonly [PlayerState, readonly Effect[]] => {
  const none: readonly [PlayerState, readonly Effect[]] = [state, []];
  if (state.tag === "finished") return none;
  if (state.tag === "interrupted") {
    if (event.tag === "resume") return [state.resume, []];
    if (event.tag === "quit") {
      const summary = summarize(state.session, false);
      return [{ tag: "finished", session: state.session, summary }, [{ tag: "emit", event: { type: "session_completed", lesson: state.session.lesson, summary } }]];
    }
    return none;
  }
  if (event.tag === "interrupt") return [{ tag: "interrupted", session: state.session, reason: event.reason, resume: state }, []];

  switch (state.tag) {
    case "presenting":
      if (event.tag === "ready") return [answering(state), []];
      if (event.tag === "input" || event.tag === "compositionstart") return step(answering(state), event);
      if (event.tag === "skip") return skip(state, event.reason);
      return none;

    case "answering":
      switch (event.tag) {
        case "input":
          return [{ ...state, draft: event.draft }, []];
        case "compositionstart":
          return [{ ...state, composing: true }, []];
        case "compositionend":
          return [{ ...state, composing: false, draft: state.draft.tag === "text" ? { tag: "text", text: event.text } : state.draft }, []];
        case "submit": {
          if (state.composing) return none; // never submit mid-composition (§6.7)
          const response = responseOf(state.ex, state.draft);
          if (response === undefined) return none;
          return [{ tag: "checking", session: state.session, ex: state.ex, response }, [{ tag: "grade", ex: state.ex, response }]];
        }
        case "skip":
          return state.composing ? none : skip(state, event.reason);
        default:
          return none;
      }

    case "checking":
      if (event.tag !== "graded") return none;
      return [
        { tag: "feedback", session: record(state.session, state.ex, event.outcome.verdict), ex: state.ex, response: state.response, outcome: event.outcome },
        [
          {
            tag: "emit",
            event: {
              type: "answer_submitted",
              exercise: ref(state.ex),
              response: state.response,
              outcome: { kind: event.outcome.verdict, notes: event.outcome.notes },
              ex: state.ex,
              graded: event.outcome,
            },
          },
          { tag: "sound", sound: isCorrect(event.outcome.verdict) ? "correct" : "wrong" },
        ],
      ];

    case "feedback":
      return event.tag === "continue" ? advance(state) : none;
  }
};

/** Progress for the progress bar: exercises done out of the lesson as it now stands. */
export const progressOf = (state: PlayerState): { readonly done: number; readonly total: number } => {
  const { session } = state;
  const done = state.tag === "finished" ? session.queue.length : session.position + (state.tag === "feedback" ? 1 : 0);
  return { done, total: session.queue.length + (state.tag === "finished" ? 0 : (session.later ?? 0)) };
};
