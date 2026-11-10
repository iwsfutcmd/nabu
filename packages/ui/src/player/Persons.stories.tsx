/**
 * Who speaks and who is spoken to (a sentence's persons): tags under a support-language prompt
 * when the learner writes the sentence in the target language, where the target marks gender or
 * number and the prompt cannot ("you" to a woman, to several people).
 */
import { createGrader, sampleExercise, start, step, type Exercise } from "@nabu/core/lesson";
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

const Card = ({ loaded, template }: { loaded: LoadedCourse; template: "translate-type.l1-l2" | "gap-fill" }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const ex = useMemo((): Exercise | undefined => {
    const found = sampleExercise(course, template, 7);
    return found?.template === "translate-type.l1-l2" || found?.template === "gap-fill" ? { ...found, persons: { speaker: "f", addressee: "pl" } } : undefined;
  }, [course, template]);
  const initialState = useMemo(() => (ex === undefined ? undefined : step(start("story", [ex])[0], { tag: "ready" })[0]), [ex]);
  if (ex === undefined || initialState === undefined) return <p>{t.format("debug.cards.none")}</p>;
  const name = `course.name.${course.id}`;
  return (
    <LessonPlayer
      key={course.id}
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
  title: "Player/Persons",
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

/** Writing into the target: "a woman speaking", "to several people" under the prompt. */
export const Tagged: Story = {
  render: (_args, { loaded }) => <Card loaded={loaded["course"] as LoadedCourse} template="translate-type.l1-l2" />,
};

/** Choosing the missing word: the options are often the word in other persons (بدّك, بدكن), so the hint says whose. */
export const GapFill: Story = {
  render: (_args, { loaded }) => <Card loaded={loaded["course"] as LoadedCourse} template="gap-fill" />,
};
