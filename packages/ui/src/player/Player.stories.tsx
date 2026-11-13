import { emptyLearnerState, plan } from "@nabu/core/learner";
import { createGrader, gradeExercise, lessonNodes, sampleExercise, start, step, type CourseView, type Draft, type Exercise, type Grader, type PlayerState, type TemplateId } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { courseName } from "@nabu/i18n";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { useTranslator } from "../context.tsx";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "./load.ts";
import { LessonPlayer } from "./LessonPlayer.tsx";
import type { SessionProgress } from "./SessionEnd.tsx";
import type { WritingMode } from "./shared.ts";

/** Toolbar target → fixture course and orthography (the compiled bundles in apps/web/public/bundles). */
const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

export type PlayerScreen = "tiles" | "typing" | "feedback" | "retry" | "display" | "quit" | "new-words";

const TEMPLATE: Readonly<Record<PlayerScreen, TemplateId>> = {
  tiles: "translate-tap.l1-l2",
  typing: "translate-type.l1-l2",
  feedback: "complete-translation",
  retry: "choose-translation",
  display: "choose-translation",
  quit: "choose-translation",
  "new-words": "choose-translation",
};

const SEED = 7;
/** The clock a story plans its lesson at: fixed, so the story never changes. */
const NOW = "2026-03-01T08:00:00.000Z";

/** Drives the pure state machine to the screen a story shows. */
const stateFor = (screen: PlayerScreen, ex: Exercise, course: CourseView, grader: Grader): PlayerState => {
  const [presenting] = start("story", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  if (screen === "typing" || screen === "display" || screen === "new-words") return answering;
  if (screen === "quit") return step(answering, { tag: "interrupt", reason: "quit-confirm" })[0];
  if (screen === "retry" && ex.template === "choose-translation") {
    // A wrong option, then Continue: the card comes back, its options in a new order (P4).
    const chosen = step(answering, { tag: "input", draft: { tag: "choice", index: (ex.answer + 1) % ex.options.length } })[0];
    const [checking] = step(chosen, { tag: "submit" });
    if (checking.tag !== "checking") return chosen;
    const [feedback] = step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, grader) });
    return step(step(feedback, { tag: "continue" })[0], { tag: "ready" })[0];
  }
  if (screen === "tiles") {
    const first = ex.template === "translate-tap.l1-l2" ? ex.solution.slice(0, 1) : [];
    return step(answering, { tag: "input", draft: { tag: "tiles", order: first } })[0];
  }
  // Feedback for a wrong word in the gap: the answer is marked against the solution.
  const gap = sampleExercise(course, "gap-fill", SEED);
  const other = gap?.template === "gap-fill" ? gap.options[(gap.answer + 1) % gap.options.length] : undefined;
  const wrong = other === undefined ? "?" : surfaceOf(other);
  const typed = step(answering, { tag: "input", draft: { tag: "text", text: wrong } })[0];
  const [checking] = step(typed, { tag: "submit" });
  if (checking.tag !== "checking") return typed;
  return step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, grader) })[0];
};

/** A right answer to a card (a speaking card rated, as without a microphone). */
const rightTo = (ex: Exercise): Draft => {
  switch (ex.template) {
    case "match-pairs":
    case "letter-pairs":
      return { tag: "pairs", matched: ex.left.map((_, i) => i), mistakes: 0 };
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
    case "story-arrange":
    case "word-write":
      return { tag: "tiles", order: ex.solution };
    case "translate-type.l1-l2":
    case "listen-type":
      return { tag: "text", text: surfaceOf(ex.canonical) };
    case "complete-translation":
      return { tag: "text", text: surfaceOf(ex.blank) };
    case "transcribe":
      return { tag: "text", text: surfaceOf(ex.reading) };
    case "speak.tier-0":
    case "speak":
    case "listen-speak":
      return { tag: "self-rating", rating: "good" };
    default:
      return { tag: "choice", index: ex.answer };
  }
};

/**
 * A lesson played to its end (P9): a typed card answered with another sentence of the lesson (else a
 * choice answered wrong), a choice skipped, the rest right; missed cards right when they come back.
 */
const finishedLesson = (lesson: readonly Exercise[], node: string, grader: Grader): PlayerState => {
  const typed = lesson.find((e) => e.template === "translate-type.l1-l2");
  const other = lesson.find((e) => e.template === "choose-translation" && e.item !== typed?.item);
  const instead = other?.template === "choose-translation" ? surfaceOf(other.prompt) : undefined;
  const missed = typed !== undefined && instead !== undefined ? typed : lesson.find((e) => "options" in e);
  const skipped = lesson.find((e) => e !== missed && "options" in e);
  let state = start(node, lesson)[0];
  const send = (event: Parameters<typeof step>[1]): void => {
    const [next, effects] = step(state, event);
    state = next;
    for (const e of effects) if (e.tag === "grade") send({ tag: "graded", outcome: gradeExercise(e.ex, e.response, grader) });
  };
  for (let guard = 0; guard < 200 && state.tag !== "finished"; guard++) {
    if (state.tag !== "presenting") break;
    const ex = state.ex;
    send({ tag: "ready" });
    const right = rightTo(ex);
    const wrong: Draft | undefined =
      ex.id !== missed?.id
        ? undefined
        : "options" in ex && "answer" in ex && typeof ex.answer === "number"
          ? { tag: "choice", index: (ex.answer + 1) % ex.options.length }
          : instead === undefined
            ? undefined
            : { tag: "text", text: instead };
    if (ex.id === skipped?.id) send({ tag: "skip", reason: "skip" });
    else {
      send({ tag: "input", draft: wrong ?? right });
      send({ tag: "submit" });
    }
    // send changes the state behind TypeScript's narrowing.
    if ((state as PlayerState).tag === "feedback") send({ tag: "continue" });
  }
  return state;
};

/**
 * The end of the course's second lesson, as plan() plans it for a new learner, with what the app would
 * say of the learner's progress and the next step.
 */
const FinishedScreen = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const nodes = lessonNodes(course);
  const node = nodes[1]?.node.id ?? "story";
  const lesson = useMemo(() => plan(course, emptyLearnerState(), { mode: "lesson", node }, { now: NOW, seed: SEED }).exercises, [course, node]);
  const state = useMemo(() => finishedLesson(lesson, node, grader), [lesson, node, grader]);
  const progress: SessionProgress = {
    known: { words: nodes[0]?.node.introduces.slice(0, 2) ?? [], total: 14 },
    streak: 4,
    week: { done: 3, goal: 5, met: false },
    quests: [{ id: "right-20", label: t.format("quest.right-20", { target: 20 }) }],
  };
  return (
    <LessonPlayer
      key={course.id}
      course={course}
      lessonId={node}
      exercises={lesson}
      grader={grader}
      imageUrl={imageUrl}
      language={courseName(t, course)}
      sound={false}
      initialState={state}
      xpEarned={17}
      progress={progress}
      next={{ to: { kind: "lesson", number: 3 }, go: () => undefined }}
      onExit={() => undefined}
    />
  );
};

const Screen = ({ loaded, screen, writingMode }: { loaded: LoadedCourse; screen: PlayerScreen; writingMode: WritingMode }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const ex = useMemo(() => sampleExercise(course, TEMPLATE[screen], SEED), [course, screen]);
  if (ex === undefined) throw new Error(`${course.id} has no ${TEMPLATE[screen]} exercise`);
  const initialState = useMemo(() => stateFor(screen, ex, course, grader), [screen, ex, course, grader]);
  // New words (P1): played as the lesson that introduces one of the card's words.
  const lessonId = screen === "new-words" ? (lessonNodes(course).find((n) => n.node.introduces.some((kc) => ex.kcs.includes(kc)))?.node.id ?? "story") : "story";
  return (
    <LessonPlayer
      key={`${course.id}:${screen}:${writingMode}`}
      course={course}
      lessonId={lessonId}
      exercises={[ex]}
      grader={grader}
      imageUrl={imageUrl}
      language={courseName(t, course)}
      sound={false}
      writingMode={writingMode}
      initialState={initialState}
      displayOpen={screen === "display"}
    />
  );
};

const meta = {
  title: "Player/Lesson player",
  loaders: [
    async ({ globals }) => {
      const [id, orthography] = COURSES[(globals as NabuGlobals).target];
      return { course: await fetchCourse(BUNDLES, id, orthography) };
    },
  ],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const story = (screen: PlayerScreen): Story => ({
  render: (_args, { globals, loaded }) => (
    <Screen loaded={loaded["course"] as LoadedCourse} screen={screen} writingMode={(globals as NabuGlobals).writingMode} />
  ),
});

/** Word bank, one tile placed: the target region in the target direction (vertical where allowed). */
export const Tiles: Story = story("tiles");
/** Typing into the IME-safe field, with the special-character bar where the orthography has one. */
export const Typing: Story = story("typing");
/** Feedback after a wrong word: verdict, solution, and the answer with the differing word marked. */
export const Feedback: Story = story("feedback");
/** A missed card back at the end: "Earlier mistake", its options in a new order, the cards left unchanged (P4). */
export const Retry: Story = story("retry");
/** The display menu open: readings, vowel marks (every word, new words, none) and vertical text, as the course offers (P12). */
export const Display: Story = story("display");
/** Quitting: what it keeps, in the chrome's face (the dialog is portalled out of the root, P8). */
export const Quit: Story = story("quit");
/** The card that first shows a word the lesson teaches: "New word", and the word, since the prompt shows it (P1). */
export const NewWords: Story = story("new-words");
/**
 * The end of a lesson (P9): the score, the new words with their meanings and play buttons, the cards
 * missed the first time with the right answer and the learner's, progress, then the next step.
 */
export const Finished: Story = {
  render: (_args, { loaded }) => <FinishedScreen loaded={loaded["course"] as LoadedCourse} />,
};
