/**
 * The lesson player as a pure state machine (gameplan §11.5). `step` never
 * performs effects: grading, events and sounds are returned as data for the
 * shell to execute, so the whole lesson is testable without a DOM.
 *
 * IME safety (§6.7): while `composing` is true, nothing is submitted and the
 * draft is stored exactly as typed. Only `compositionend` settles text. A
 * `submit` that comes mid-composition (Check tapped while a phone keyboard
 * still composes the last word, ADR 0118) is held and goes ahead once
 * `compositionend` has settled the text; a commit alone submits nothing.
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
  /** The answer's verdict: the grader's, or a revision's (a claim, the judge: ADR 0052, 0113). */
  readonly verdict: Verdict;
  readonly retry: boolean;
  /** A self-rating (no verdict) or a card put off: neither counts in the score. */
  readonly selfRated?: true | undefined;
  readonly skipped?: SkipReason | undefined;
  /**
   * What the learner answered, for the end of the session to show (P9): none for a skip, nor for an
   * answer a session picked up again knows only by its verdict (the log keeps typed text alone).
   */
  readonly response?: Response | undefined;
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
  | {
      readonly tag: "answering";
      readonly session: Session;
      readonly ex: Exercise;
      readonly draft: Draft;
      readonly composing: boolean;
      /** Check was pressed mid-composition (ADR 0118): the submit waits for compositionend. */
      readonly queued: boolean;
    }
  | { readonly tag: "checking"; readonly session: Session; readonly ex: Exercise; readonly response: Response }
  | {
      readonly tag: "feedback";
      readonly session: Session;
      readonly ex: Exercise;
      readonly response: Response | null;
      /** The grader's outcome, as the feedback shows it. */
      readonly outcome: Outcome;
      /** The verdict a claim or the judge gave the answer while its feedback showed (ADR 0113): what it counts as. */
      readonly revised?: Verdict | undefined;
    };

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
  /**
   * An answer of the session revised after it was graded (ADR 0052, 0113): the learner's claim ("My
   * answer should have been accepted", "This should have been wrong") or the judge's accept. The
   * session goes on as if it had been graded so: what it counts in the score, and whether it comes
   * back. `exercise` is the answer's exercise id ("…#2" for a retry).
   */
  | { readonly tag: "revise"; readonly exercise: string; readonly verdict: Verdict }
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
      /**
       * The learner looked up a word's meaning on the card before this answer was checked (D16): a
       * hint. The shell that shows the lookups marks it; the state machine never does.
       */
      readonly hinted?: true | undefined;
    }
  | { readonly type: "exercise_skipped"; readonly exercise: ExerciseRef; readonly reason: SkipReason; readonly ex: Exercise }
  /**
   * An answer of the session counts otherwise now (a `revise`, ADR 0113), for the shell's own count of
   * first tries (where a placement test places). No learner event of its own: the claim or the
   * judge's revision that caused it is one already.
   */
  | { readonly type: "answer_revised"; readonly exercise: ExerciseRef; readonly verdict: Verdict }
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

/** First tries the score counts: a self-rating checks nothing, and a card put off was never asked. */
const gradedFirstTries = (results: readonly SessionResult[]): readonly SessionResult[] =>
  results.filter((r) => !r.retry && r.selfRated !== true && r.skipped !== "cant-speak" && r.skipped !== "cant-listen");

/** A card the learner missed the first time (or skipped), as the end of the session lists it (P9). */
export interface Missed {
  readonly ex: Exercise;
  /** Its first try's verdict, as revised (ADR 0113): SKIPPED for a card skipped. */
  readonly verdict: Verdict;
  /** What the learner answered, where the session has it. */
  readonly response?: Response | undefined;
}

/**
 * The cards the score counts wrong, in the order they were asked: each first try the session graded
 * and found wrong, or that the learner skipped (P9). A card claimed right is not among them. A story
 * passes its results and its questions.
 */
export const missedOf = (session: Pick<Session, "results" | "queue">): readonly Missed[] =>
  gradedFirstTries(session.results).flatMap((r) => {
    const ex = session.queue.find((e) => e.id === r.exercise);
    if (ex === undefined || isCorrect(r.verdict)) return [];
    return [{ ex, verdict: r.verdict, ...(r.response === undefined ? {} : { response: r.response }) }];
  });

/**
 * The score counts graded first tries (P5 in the 2026-11 review): a self-rating checks nothing, and a
 * card put off ("can't speak now", "can't listen now") or dropped with it was never asked. So two
 * right answers out of two shown is 2 of 2, whatever speaking cards the lesson also had.
 */
export const summarize = (session: Session, completed: boolean): SessionSummary => {
  const graded = gradedFirstTries(session.results);
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
const comesBack = (session: Session, ex: Exercise, verdict: Verdict, skipped: SkipReason | undefined): boolean =>
  session.adaptive === undefined && session.retries !== false && !isCorrect(verdict) && skipped !== "cant-speak" && skipped !== "cant-listen" && retryable(ex);

/**
 * What an answer in feedback counts as (ADR 0113): the grader's verdict, unless a claim or the judge
 * revised it while the feedback showed (ADR 0052). Continue's colour, the retry and the score follow
 * it; the feedback itself still shows the grading, solution and all.
 */
export const countsAs = (feedback: { readonly outcome: Outcome; readonly revised?: Verdict | undefined }): Verdict => feedback.revised ?? feedback.outcome.verdict;

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

/** The attempt a card's next retry is: one more than the times the session has it queued. */
const nextAttempt = (session: Session, ex: Exercise): number => session.queue.filter((e) => e.item === ex.item && e.template === ex.template).length + 1;

const advance = (state: Extract<Active, { tag: "feedback" }>): readonly [PlayerState, readonly Effect[]] => {
  const { session, ex, outcome } = state;
  if (session.adaptive !== undefined) {
    const run = runTest(session.adaptive, firstTries(session));
    return present({ ...session, queue: [...session.queue.slice(0, session.position + 1), ...run.next], position: session.position + 1, later: run.later });
  }
  const queue = comesBack(session, ex, countsAs(state), outcome.skipped) ? [...session.queue, retryOf(ex, nextAttempt(session, ex))] : session.queue;
  return present({ ...session, queue, position: session.position + 1 });
};

/**
 * The results with the latest answer to `exercise` counting `verdict` (ADR 0113); undefined where
 * that changes nothing: no answer to it, a skip or a self-rating (neither has a verdict to revise),
 * or the verdict it has already.
 */
export const reviseResults = (results: readonly SessionResult[], exercise: string, verdict: Verdict): readonly SessionResult[] | undefined => {
  const at = results.findLastIndex((r) => r.exercise === exercise);
  const result = results[at];
  if (result === undefined || result.skipped !== undefined || result.selfRated === true || result.verdict === verdict) return undefined;
  return results.map((r, i) => (i === at ? { ...r, verdict } : r));
};

/**
 * A revision that comes once the session has moved on (the judge can answer after Continue): the
 * card comes back, or no longer does, as it would have had it been graded so. Only its latest
 * answer decides, and only a retry not shown yet is taken away: a card on screen stays. An adaptive
 * test asks on as it was asking; its first tries, and so where it places, take the revision.
 */
const requeued = (session: Session, exercise: string, verdict: Verdict): Session => {
  if (session.adaptive !== undefined || session.retries === false) return session;
  const planned = plannedId(exercise);
  const ex = session.queue.find((e) => e.id === exercise);
  const latest = session.results.findLast((r) => plannedId(r.exercise) === planned);
  if (ex === undefined || latest?.exercise !== exercise) return session;
  const answered = new Set(session.results.map((r) => r.exercise));
  // An attempt still to come: queued after the card on screen, or on screen and not answered yet.
  const toCome = (e: Exercise, i: number): boolean => i >= session.position && plannedId(e.id) === planned && !answered.has(e.id);
  const unseen = (e: Exercise, i: number): boolean => i > session.position && toCome(e, i);
  const back = comesBack(session, ex, verdict, undefined);
  if (back && !session.queue.some(toCome)) return { ...session, queue: [...session.queue, retryOf(ex, nextAttempt(session, ex))] };
  if (!back && session.queue.some(unseen)) return { ...session, queue: session.queue.filter((e, i) => !unseen(e, i)) };
  return session;
};

/** Revises an answer of the session (ADR 0113): in its feedback, what it counts as; later, its result and its retry. */
const revise = (state: Active, exercise: string, verdict: Verdict): readonly [Active, readonly Effect[]] => {
  const results = reviseResults(state.session.results, exercise, verdict);
  const ex = state.session.queue.find((e) => e.id === exercise);
  if (results === undefined || ex === undefined) return [state, []];
  const revised: Session = { ...state.session, results };
  const emit: Effect = { tag: "emit", event: { type: "answer_revised", exercise: ref(ex), verdict } };
  if (state.tag === "feedback" && state.ex.id === exercise) return [{ ...state, session: revised, revised: verdict }, [emit]];
  return [{ ...state, session: requeued(revised, exercise, verdict) }, [emit]];
};

const record = (
  session: Session,
  ex: Exercise,
  verdict: Verdict,
  how: { readonly selfRated?: true | undefined; readonly skipped?: SkipReason | undefined; readonly response?: Response | undefined } = {},
): Session => ({
  ...session,
  results: [
    ...session.results,
    {
      exercise: ex.id,
      template: ex.template,
      verdict,
      retry: ex.id.includes("#"),
      ...(how.selfRated === true ? { selfRated: true as const } : {}),
      ...(how.skipped === undefined ? {} : { skipped: how.skipped }),
      ...(how.response === undefined ? {} : { response: how.response }),
    },
  ],
});

const answering = (state: Extract<Active, { tag: "presenting" }>): Extract<Active, { tag: "answering" }> => ({
  tag: "answering",
  session: state.session,
  ex: state.ex,
  draft: emptyDraft(state.ex),
  composing: false,
  queued: false,
});

/** Checks the draft, if it makes an answer: the state is checking until the grade comes back. */
const submit = (state: Extract<Active, { tag: "answering" }>): readonly [PlayerState, readonly Effect[]] => {
  const response = responseOf(state.ex, state.draft);
  if (response === undefined) return [state, []];
  return [{ tag: "checking", session: state.session, ex: state.ex, response }, [{ tag: "grade", ex: state.ex, response }]];
};

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
    if (event.tag === "revise") {
      const [resume, effects] = revise(state.resume, event.exercise, event.verdict);
      return resume === state.resume ? none : [{ ...state, session: resume.session, resume }, effects];
    }
    if (event.tag === "quit") {
      const summary = summarize(state.session, false);
      return [{ tag: "finished", session: state.session, summary }, [{ tag: "emit", event: { type: "session_completed", lesson: state.session.lesson, summary } }]];
    }
    return none;
  }
  if (event.tag === "interrupt") return [{ tag: "interrupted", session: state.session, reason: event.reason, resume: state }, []];
  if (event.tag === "revise") return revise(state, event.exercise, event.verdict);

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
          // A new composition: the learner went back to typing, so a held Check no longer stands.
          return [{ ...state, composing: true, queued: false }, []];
        case "compositionend": {
          const settled = { ...state, composing: false, queued: false, draft: state.draft.tag === "text" ? ({ tag: "text", text: event.text } as const) : state.draft };
          // A Check pressed mid-composition goes ahead now the text is settled; a commit alone (an IME's
          // Enter or a tapped candidate) submits nothing (ADR 0118).
          return state.queued ? submit(settled) : [settled, []];
        }
        case "submit":
          // Never mid-composition (§6.7): it waits for compositionend (ADR 0118).
          return state.composing ? [{ ...state, queued: true }, []] : submit(state);
        case "skip":
          return state.composing ? none : skip(state, event.reason);
        default:
          return none;
      }

    case "checking":
      if (event.tag !== "graded") return none;
      return [
        { tag: "feedback", session: record(state.session, state.ex, event.outcome.verdict, { selfRated: event.outcome.selfRated, response: state.response }), ex: state.ex, response: state.response, outcome: event.outcome },
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
  const settled = active.tag === "feedback" && !comesBack(session, active.ex, countsAs(active), active.outcome.skipped);
  if (!settled) open.add(plannedId(active.ex.id));
  return { done: cards.size - open.size, total: cards.size + (session.later ?? 0) };
};
