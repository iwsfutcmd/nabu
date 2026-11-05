import { createGrader, gradeExercise, sampleExercise, start, step, type CourseView, type Exercise, type Grader, type PlayerState, type TemplateId } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { useTranslator } from "../context.tsx";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "./load.ts";
import { LessonPlayer } from "./LessonPlayer.tsx";
import type { WritingMode } from "./shared.ts";

/** Toolbar target → fixture course and orthography (the compiled bundles in apps/web/public/bundles). */
const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

export type PlayerScreen = "tiles" | "typing" | "feedback";

const TEMPLATE: Readonly<Record<PlayerScreen, TemplateId>> = {
  tiles: "translate-tap.l1-l2",
  typing: "translate-type.l1-l2",
  feedback: "complete-translation",
};

const SEED = 7;

/** Drives the pure state machine to the screen a story shows. */
const stateFor = (screen: PlayerScreen, ex: Exercise, course: CourseView, grader: Grader): PlayerState => {
  const [presenting] = start("story", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  if (screen === "typing") return answering;
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

const Screen = ({ loaded, screen, writingMode }: { loaded: LoadedCourse; screen: PlayerScreen; writingMode: WritingMode }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const ex = useMemo(() => sampleExercise(course, TEMPLATE[screen], SEED), [course, screen]);
  if (ex === undefined) throw new Error(`${course.id} has no ${TEMPLATE[screen]} exercise`);
  const initialState = useMemo(() => stateFor(screen, ex, course, grader), [screen, ex, course, grader]);
  const name = `course.name.${course.id}`;
  return (
    <LessonPlayer
      key={`${course.id}:${screen}:${writingMode}`}
      course={course}
      lessonId="story"
      exercises={[ex]}
      grader={grader}
      imageUrl={imageUrl}
      language={t.has(name) ? t.format(name) : course.id}
      sound={false}
      writingMode={writingMode}
      initialState={initialState}
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
