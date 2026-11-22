/**
 * A spelling card (ADR 0142, 0148): the sentence with a word left out, what it means, and the word
 * among its other spellings of its sound (fa) or characters the course reads alike (yue). A word
 * with one other spelling is asked against that one alone (ADR 0142 amendment, 2026-11-22: two
 * options); a word with more, against up to three. uz and apc-Arab spell no sound otherwise.
 */
import { createGrader, gradeExercise, sampleExercise, start, step, type Exercise, type Grader, type PlayerState } from "@nabu/core/lesson";
import { courseName } from "@nabu/i18n";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { useTranslator } from "../context.tsx";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "./load.ts";
import { LessonPlayer } from "./LessonPlayer.tsx";
import type { WritingMode } from "./shared.ts";

const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

type Screen = "two" | "two-feedback" | "several";
const SEED = 7;

/** The first spelling card the lessons make with two options (`two`), or with more (`several`). */
const admits = (screen: Screen) => (ex: Exercise): boolean =>
  ex.template === "spelling-choice" && (screen === "several" ? ex.options.length > 2 : ex.options.length === 2);

const stateFor = (screen: Screen, ex: Exercise, grader: Grader): PlayerState => {
  const [presenting] = start("story", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  if (screen !== "two-feedback" || ex.template !== "spelling-choice") return answering;
  // The other spelling chosen: the card says so, and shows the word as it is written.
  const chosen = step(answering, { tag: "input", draft: { tag: "choice", index: (ex.answer + 1) % ex.options.length } })[0];
  const [checking] = step(chosen, { tag: "submit" });
  if (checking.tag !== "checking") return chosen;
  return step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, grader) })[0];
};

const Card = ({ loaded, screen, writingMode }: { loaded: LoadedCourse; screen: Screen; writingMode: WritingMode }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const ex = useMemo(() => sampleExercise(course, "spelling-choice", SEED, admits(screen)), [course, screen]);
  const initialState = useMemo(() => (ex === undefined ? undefined : stateFor(screen, ex, grader)), [screen, ex, grader]);
  if (ex === undefined || initialState === undefined) return <p data-no-spelling="">{t.format("debug.cards.none")}</p>;
  return (
    <LessonPlayer
      key={`${course.id}:${screen}:${writingMode}`}
      course={course}
      lessonId="story"
      exercises={[ex]}
      grader={grader}
      imageUrl={imageUrl}
      language={courseName(t, course)}
      sound={false}
      writingMode={writingMode}
      initialState={initialState}
    />
  );
};

const meta = {
  title: "Player/Spelling",
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

const story = (screen: Screen): Story => ({
  render: (_args, { globals, loaded }) => <Card loaded={loaded["course"] as LoadedCourse} screen={screen} writingMode={(globals as NabuGlobals).writingMode} />,
});

/** A word with one other spelling of its sound: two options, the word and that spelling. */
export const Two: Story = story("two");
/** The two-option card answered with the other spelling: the verdict, and the word as it is written. */
export const TwoFeedback: Story = story("two-feedback");
/** A word with several other spellings: three or four options. */
export const Several: Story = story("several");
