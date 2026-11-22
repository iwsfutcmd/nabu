/**
 * The story reader as a pure state machine (Phase 6). Lines are read one at a time
 * (`continue`); a question nests the lesson player for one exercise with retries, so a wrong
 * answer is asked again until it is right, with the same grading, IME safety and events as a
 * lesson. The story emits one session (mode story, the story's node): its start, the questions'
 * presentations and answers, and its completion.
 */
import type { Exercise } from "../lesson/exercise.ts";
import { isCorrect } from "../lesson/exercise.ts";
import { reviseResults, start as startLesson, step as stepLesson, type Effect, type PlayerEvent, type PlayerState, type SessionResult, type SessionSummary } from "../lesson/player.ts";
import type { StoryScript } from "./story.ts";

interface Common {
  readonly script: StoryScript;
  /** Index of the current step. */
  readonly at: number;
  /** Lines shown so far, in order: the transcript. */
  readonly shown: readonly number[];
  readonly results: readonly SessionResult[];
}

export type StoryState =
  | (Common & { readonly tag: "reading" })
  | (Common & { readonly tag: "asking"; readonly ex: Exercise; readonly player: PlayerState })
  | (Common & { readonly tag: "finished"; readonly summary: SessionSummary });

export type StoryEvent = { readonly tag: "continue" } | { readonly tag: "quit" } | { readonly tag: "player"; readonly event: PlayerEvent };

const questions = (script: StoryScript): number => script.steps.filter((s) => s.tag === "question").length;

export const summarizeStory = (state: Common, completed: boolean): SessionSummary => {
  const first = state.results.filter((r) => !r.retry);
  return {
    completed,
    // A story left before its end counts the questions answered (P8), not those it never asked.
    exercises: completed ? questions(state.script) : first.length,
    correctFirstTry: first.filter((r) => isCorrect(r.verdict)).length,
    retries: state.results.filter((r) => r.retry).length,
    skipped: state.results.filter((r) => r.verdict === "SKIPPED").length,
  };
};

const finish = (state: Common, completed: boolean): readonly [StoryState, readonly Effect[]] => {
  const summary = summarizeStory(state, completed);
  return [{ ...state, tag: "finished", summary }, [{ tag: "emit", event: { type: "session_completed", lesson: state.script.node, summary } }]];
};

/** The nested lesson player's own session boundaries are not the story's. */
const inner = (effects: readonly Effect[]): readonly Effect[] => effects.filter((e) => e.tag !== "emit" || (e.event.type !== "session_started" && e.event.type !== "session_completed"));

/**
 * A line joining the transcript, as a learner event (ADR 0146): once a line, however the story got
 * there (read, or revealed by its question's answer).
 */
const read = (state: Common, index: number): readonly Effect[] => {
  if (state.shown.includes(index)) return [];
  const line = state.script.lines[index];
  if (line === undefined) return [];
  const name = line.speaker?.name;
  return [{ tag: "emit", event: { type: "story_line_read", story: state.script.id, line: line.step, texts: name === undefined ? [line.text] : [name, line.text] } }];
};

const enter = (state: Common, before: readonly Effect[] = []): readonly [StoryState, readonly Effect[]] => {
  const step = state.script.steps[state.at];
  if (step === undefined) {
    const [done, effects] = finish(state, true);
    return [done, [...before, ...effects]];
  }
  if (step.tag === "line") return [{ ...state, tag: "reading", shown: state.shown.includes(step.line) ? state.shown : [...state.shown, step.line] }, [...before, ...read(state, step.line)]];
  const [player, effects] = startLesson(state.script.node, [step.ex]);
  return [{ ...state, tag: "asking", ex: step.ex, player }, [...before, ...inner(effects)]];
};

/** Opens a story: emits the session start, then the first step. */
export const startStory = (script: StoryScript): readonly [StoryState, readonly Effect[]] => {
  const [state, effects] = enter({ script, at: 0, shown: [], results: [] });
  return [state, [{ tag: "emit", event: { type: "session_started", lesson: script.node, exercises: questions(script) } }, ...effects]];
};

export const stepStory = (state: StoryState, event: StoryEvent): readonly [StoryState, readonly Effect[]] => {
  if (state.tag === "finished") return [state, []];
  if (event.tag === "quit") return finish(state, false);
  // An answer revised (ADR 0113): the question being asked takes it in its own player; a question
  // answered before, in the story's results, which its score counts.
  if (event.tag === "player" && event.event.tag === "revise") {
    const { exercise, verdict } = event.event;
    if (state.tag !== "asking" || !state.player.session.results.some((r) => r.exercise === exercise)) {
      const results = reviseResults(state.results, exercise, verdict);
      return results === undefined ? [state, []] : [{ ...state, results }, []];
    }
  }
  if (state.tag === "reading") return event.tag === "continue" ? enter({ ...state, at: state.at + 1 }) : [state, []];
  // asking
  if (event.tag !== "player") return [state, []];
  const [player, effects] = stepLesson(state.player, event.event);
  if (player.tag !== "finished") return [{ ...state, player }, inner(effects)];
  // The question is answered right: its line (if any) joins the transcript, and the story moves on.
  const step = state.script.steps[state.at];
  const reveals = step?.tag === "question" ? step.reveals : undefined;
  const revealed = reveals === undefined ? [] : read(state, reveals);
  const [next, more] = enter(
    {
      script: state.script,
      at: state.at + 1,
      shown: reveals === undefined || state.shown.includes(reveals) ? state.shown : [...state.shown, reveals],
      results: [...state.results, ...player.session.results],
    },
    revealed,
  );
  return [next, [...inner(effects), ...more]];
};

/** Progress for the progress bar: steps done out of the story's steps. */
export const storyProgress = (state: StoryState): { readonly done: number; readonly total: number } => ({
  done: state.tag === "finished" ? state.script.steps.length : state.at,
  total: state.script.steps.length,
});
