/**
 * The lesson player as a pure state machine (gameplan §11.5). `step` never
 * performs effects: grading, events and sounds are returned as data for the
 * shell to execute, so the whole lesson is testable without a DOM.
 *
 * IME safety (§6.7): while `composing` is true, `submit` is ignored and the
 * draft is stored exactly as typed. Only `compositionend` settles text.
 */
import type { TaggedText } from "@nabu/schema";
import type { Verdict } from "../match/grade.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { runTest, type AdaptiveTest } from "./adaptive.ts";
import type { SpeechResult } from "../speech/score.ts";
import { isCorrect, type Exercise, type Outcome, type Response, type SelfRating, type SkipReason, type TemplateId } from "./exercise.ts";
import { seededRng, type Rng } from "./rng.ts";
import { solutionOf, TEMPLATES } from "./templates.ts";

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
  /** A self-rating (no verdict) or a card put off: neither counts in the score. */
  readonly selfRated?: true | undefined;
  readonly skipped?: SkipReason | undefined;
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
   * An adaptive test (ADR 0077): after each answer, the exercises still to come are the test's
   * next ones for the first-try answers so far. Its exercises are asked once (no retries).
   */
  readonly adaptive?: AdaptiveTest;
  /** Adaptive tests: at most this many exercises after the queue, for the progress bar. */
  readonly later?: number;
}

export interface StartOptions {
  readonly retries?: boolean;
  /** Ask this adaptive test (ADR 0077); `exercises` should be what it asks first. */
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
      return { tag: "text", text: "" };
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
      const response = active.response;
      if (response === null) return emptyDraft(active.ex);
      switch (response.tag) {
        case "choice":
          return { tag: "choice", index: response.index };
        case "tiles":
          return { tag: "tiles", order: response.order };
        case "text":
          return { tag: "text", text: response.text };
        case "pairs":
          return {
            tag: "pairs",
            matched: active.ex.template === "match-pairs" || active.ex.template === "letter-pairs" ? active.ex.left.map((_, i) => i) : [],
            mistakes: response.mistakes,
          };
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
      // Every pairs card (word and gloss, letter and sound: ADR 0088) is done once each pair is matched.
      return (ex.template === "match-pairs" || ex.template === "letter-pairs") && draft.matched.length === ex.left.length
        ? { tag: "pairs", mistakes: draft.mistakes }
        : undefined;
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

/**
 * The score counts graded first tries (P5 in the 2026-11 review): a self-rating checks nothing, and a
 * card put off ("can't speak now", "can't listen now") or dropped with it was never asked. So two
 * right answers out of two shown is 2 of 2, whatever speaking cards the lesson also had.
 */
export const summarize = (session: Session, completed: boolean): SessionSummary => {
  const first = session.results.filter((r) => !r.retry);
  const graded = first.filter((r) => r.selfRated !== true && r.skipped !== "cant-speak" && r.skipped !== "cant-listen");
  return {
    completed,
    // An adaptive test plans as it goes: its size is what it asked. Stopped (P8), it is what was
    // answered, as a lesson's is: never the questions it would still have asked.
    exercises: session.adaptive === undefined || !completed ? graded.length : session.queue.length,
    correctFirstTry: graded.filter((r) => isCorrect(r.verdict)).length,
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

/** Exercises that come back after a mistake: not speaking (a recording is feedback, not a test) and not pairs (always completed). */
const retryable = (ex: Exercise): boolean => !TEMPLATES[ex.template].modality.mic && TEMPLATES[ex.template].modality.input !== "pairs";

/** First tries so far: exercise id → right. A skip counts as a miss. */
const firstTries = (session: Session): ReadonlyMap<string, boolean> => new Map(session.results.filter((r) => !r.retry).map((r) => [r.exercise, isCorrect(r.verdict)]));

/** The id an exercise was planned under: a retry's ("…#2") without its attempt. */
const plannedId = (id: string): string => id.split("#")[0] as string;

/** Whether an exercise is a missed or skipped one brought back ("…#2"), not a planned one. */
export const isRetry = (ex: Pick<Exercise, "id">): boolean => ex.id.includes("#");

/** Whether an answered exercise comes back at the end of the lesson: a miss or a skip, where retries are on. */
const comesBack = (session: Session, ex: Exercise, outcome: Outcome): boolean =>
  session.adaptive === undefined && session.retries !== false && !isCorrect(outcome.verdict) && outcome.skipped !== "cant-speak" && outcome.skipped !== "cant-listen" && retryable(ex);

/** A string's 32-bit FNV-1a hash: a retry's id seeds its new order, so a lesson replays the same. */
const hash = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

/**
 * A new order of `n` items (new[j] = old[order[j]]) that `differs` accepts: a few seeded shuffles,
 * then the order turned by one; the old order where nothing else would do (one item).
 */
const reorder = (rng: Rng, n: number, differs: (order: readonly number[]) => boolean): readonly number[] => {
  const identity = Array.from({ length: n }, (_, i) => i);
  for (let tries = 0; tries < 8; tries++) {
    const order = rng.shuffle(identity);
    if (differs(order)) return order;
  }
  const turned = identity.map((i) => (i + 1) % n);
  return n > 1 && differs(turned) ? turned : identity;
};

/** Options in a new order, the answer never where it was. */
const reshuffled = <T>(rng: Rng, options: readonly T[], answer: number): { readonly options: readonly T[]; readonly answer: number } => {
  const order = reorder(rng, options.length, (o) => o[answer] !== answer);
  return { options: order.map((i) => options[i] as T), answer: order.indexOf(answer) };
};

type Tiled = Extract<Exercise, { readonly tiles: readonly TaggedText[] }>;

/** Tiles in a new order that reads differently, the solution following them. */
const retiled = <T extends Tiled>(rng: Rng, ex: T): T => {
  const shown = ex.tiles.map((tile) => surfaceOf(tile));
  const order = reorder(rng, ex.tiles.length, (o) => o.some((from, to) => shown[from] !== shown[to]));
  return { ...ex, tiles: order.map((i) => ex.tiles[i] as TaggedText), solution: ex.solution.map((i) => order.indexOf(i)) };
};

/**
 * A missed exercise as it comes back (P4 in the 2026-11 review): the same question with its options
 * or tiles in a new order, so it is answered by recall, never by where the answer was. Seeded by the
 * retry's id: pure, and the same every time. A tone question keeps its tones in the system's order.
 */
export const retryOf = (ex: Exercise, attempt: number): Exercise => {
  const id = `${plannedId(ex.id)}#${attempt}`;
  const rng = seededRng(hash(id));
  switch (ex.template) {
    case "select-image":
      return { ...ex, id, ...reshuffled(rng, ex.options, ex.answer) };
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "letter-read":
    case "word-read":
    case "reading-disambiguation":
    case "vocalize":
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
      return { ...ex, id, ...reshuffled(rng, ex.options, ex.answer) };
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "word-write":
    case "listen-tap":
    case "story-arrange":
      return retiled(rng, { ...ex, id });
    default:
      return { ...ex, id };
  }
};

/**
 * Why a card is back, for its tag: an earlier mistake, or a skip. Undefined for a card asked the
 * first time.
 */
export const cameBack = (session: Session, ex: Exercise): "missed" | "skipped" | undefined => {
  if (!isRetry(ex)) return undefined;
  const planned = plannedId(ex.id);
  const last = session.results.findLast((r) => plannedId(r.exercise) === planned);
  return last?.verdict === "SKIPPED" ? "skipped" : "missed";
};

const advance = (state: Extract<Active, { tag: "feedback" }>): readonly [PlayerState, readonly Effect[]] => {
  const { session, ex, outcome } = state;
  if (session.adaptive !== undefined) {
    const run = runTest(session.adaptive, firstTries(session));
    return present({ ...session, queue: [...session.queue.slice(0, session.position + 1), ...run.next], position: session.position + 1, later: run.later });
  }
  const attempt = session.queue.filter((e) => e.item === ex.item && e.template === ex.template).length + 1;
  const queue = comesBack(session, ex, outcome) ? [...session.queue, retryOf(ex, attempt)] : session.queue;
  return present({ ...session, queue, position: session.position + 1 });
};

const record = (session: Session, ex: Exercise, verdict: Verdict, how: { readonly selfRated?: true | undefined; readonly skipped?: SkipReason | undefined } = {}): Session => ({
  ...session,
  results: [
    ...session.results,
    { exercise: ex.id, template: ex.template, verdict, retry: ex.id.includes("#"), ...(how.selfRated === true ? { selfRated: true as const } : {}), ...(how.skipped === undefined ? {} : { skipped: how.skipped }) },
  ],
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
  const session = record(state.session, ex, "SKIPPED", { skipped: reason });
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
        { tag: "feedback", session: record(state.session, state.ex, event.outcome.verdict, { selfRated: event.outcome.selfRated }), ex: state.ex, response: state.response, outcome: event.outcome },
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
          // A self-rating is no verdict: no right or wrong sound.
          ...(event.outcome.selfRated === true ? [] : [{ tag: "sound" as const, sound: isCorrect(event.outcome.verdict) ? ("correct" as const) : ("wrong" as const) }]),
        ],
      ];

    case "feedback":
      return event.tag === "continue" ? advance(state) : none;
  }
};

/**
 * Progress for the progress bar: the lesson's cards done for good, out of its cards (P4 in the
 * 2026-11 review). A card is one planned exercise, however often it comes back: a miss leaves the
 * bar where it was, and the card counts once its retry is right. So the bar never moves back, and
 * `total - done` is how many cards remain. An adaptive test adds the most it may still ask.
 */
export const progressOf = (state: PlayerState): { readonly done: number; readonly total: number } => {
  const { session } = state;
  const cards = new Set(session.queue.map((e) => plannedId(e.id)));
  if (state.tag === "finished") return { done: cards.size, total: cards.size };
  const active = state.tag === "interrupted" ? state.resume : state;
  // Still to come: every card after this one, and this one unless it is answered for good.
  const open = new Set(session.queue.slice(session.position + 1).map((e) => plannedId(e.id)));
  const settled = active.tag === "feedback" && !comesBack(session, active.ex, active.outcome);
  if (!settled) open.add(plannedId(active.ex.id));
  return { done: cards.size - open.size, total: cards.size + (session.later ?? 0) };
};
