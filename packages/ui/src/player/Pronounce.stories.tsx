/**
 * Writing in a word's pronunciation (ADR 0054): vowel marks for the abjads (fa, apc-Arab), a
 * Jyutping reading for Cantonese. uz writes its vowels and has no such card.
 */
import { createGrader, gradeExercise, sampleExercise, start, step, type Exercise, type Grader, type PlayerState } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { useTranslator } from "../context.tsx";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "./load.ts";
import { LessonPlayer } from "./LessonPlayer.tsx";

const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

type Screen = "typing" | "feedback";
const SEED = 7;

/** A wrong answer: the letters with no marks, or the reading with its last tone changed. */
const wrongAnswer = (ex: Exercise): string => {
  if (ex.template === "vocalize") return surfaceOf(ex.prompt);
  if (ex.template === "transcribe") return surfaceOf(ex.reading).replace(/([1-6])$/u, (d) => String((Number(d) % 6) + 1));
  return "?";
};

const stateFor = (screen: Screen, ex: Exercise, grader: Grader): PlayerState => {
  const [presenting] = start("story", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  if (screen === "typing") return answering;
  const typed = step(answering, { tag: "input", draft: { tag: "text", text: wrongAnswer(ex) } })[0];
  const [checking] = step(typed, { tag: "submit" });
  if (checking.tag !== "checking") return typed;
  return step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, grader) })[0];
};

const Card = ({ loaded, screen }: { loaded: LoadedCourse; screen: Screen }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const ex = useMemo(() => sampleExercise(course, "vocalize", SEED) ?? sampleExercise(course, "transcribe", SEED), [course]);
  const initialState = useMemo(() => (ex === undefined ? undefined : stateFor(screen, ex, grader)), [screen, ex, grader]);
  if (ex === undefined || initialState === undefined) return <p data-no-pronunciation="">{t.format("debug.cards.none")}</p>;
  const name = `course.name.${course.id}`;
  return (
    <LessonPlayer
      key={`${course.id}:${screen}`}
      course={course}
      lessonId="story"
      exercises={[ex]}
      grader={grader}
      imageUrl={imageUrl}
      language={t.has(name) ? t.format(name) : course.id}
      sound={false}
      initialState={initialState}
    />
  );
};

const meta = {
  title: "Player/Pronunciation",
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
  render: (_args, { loaded }) => <Card loaded={loaded["course"] as LoadedCourse} screen={screen} />,
});

/** The word's letters in the field, the vowel-mark keys under it (or a Jyutping field). */
export const Typing: Story = story("typing");
/** A wrong answer: no marks, or a wrong tone; the note says which, and the solution shows. */
export const Feedback: Story = story("feedback");
