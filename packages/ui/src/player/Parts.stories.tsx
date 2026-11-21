/**
 * A word and its parts (ADR 0152): a word put together from its parts and typed (parts-whole), and a
 * word's parts picked out (whole-parts). Courses whose words carry forms switch the cards on: of the
 * toolbar's four, Uzbek (suffixes), Persian (verb endings, the ezafe) and Lebanese Arabic (endings
 * and verb prefixes). Cantonese plans neither (one form, nothing to tell it from), and says so here.
 */
import { createGrader, gradeExercise, sampleExercise, start, step, type Draft, type Exercise, type Grader, type PlayerState } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { courseName } from "@nabu/i18n";
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

type Screen = "build" | "build-wrong" | "apart" | "apart-wrong";
const SEED = 7;

/**
 * The draft a screen shows: nothing yet; the word's own word typed for the word (the answer the card
 * must refuse); one of the word's parts picked; or all but one of its parts with one that is not its.
 */
const draftFor = (screen: Screen, ex: Exercise): Draft | undefined => {
  if (ex.template === "parts-whole" && screen === "build-wrong") {
    const own = ex.wordParts.find((p) => p.base === true)?.text;
    return { tag: "text", text: own === undefined ? "?" : surfaceOf(own) };
  }
  if (ex.template !== "whole-parts") return undefined;
  if (screen === "apart") return { tag: "tiles", order: ex.solution.slice(0, 1) };
  const other = ex.options.findIndex((_, i) => !ex.solution.includes(i));
  return { tag: "tiles", order: [...ex.solution.slice(1), other] };
};

const stateFor = (screen: Screen, ex: Exercise, grader: Grader): PlayerState => {
  const [presenting] = start("story", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  const draft = draftFor(screen, ex);
  if (draft === undefined) return answering;
  const [drafted] = step(answering, { tag: "input", draft });
  if (screen === "apart") return drafted;
  const [checking] = step(drafted, { tag: "submit" });
  if (checking.tag !== "checking") return drafted;
  return step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, grader) })[0];
};

const Card = ({ loaded, screen }: { loaded: LoadedCourse; screen: Screen }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const ex = useMemo(() => sampleExercise(course, screen === "build" || screen === "build-wrong" ? "parts-whole" : "whole-parts", SEED), [course, screen]);
  const initialState = useMemo(() => (ex === undefined ? undefined : stateFor(screen, ex, grader)), [screen, ex, grader]);
  if (ex === undefined || initialState === undefined) return <p data-no-parts="">{t.format("debug.cards.none")}</p>;
  return (
    <LessonPlayer
      key={`${course.id}:${screen}`}
      course={course}
      lessonId="story"
      exercises={[ex]}
      grader={grader}
      imageUrl={imageUrl}
      language={courseName(t, course)}
      sound={false}
      initialState={initialState}
    />
  );
};

const meta = {
  title: "Player/Parts",
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

/** Parts to whole: the sentence with a word left out, the word's parts, and the field to type it in. */
export const Build: Story = story("build");
/** The word's own word typed as the card shows it: refused, and the word shown. */
export const BuildWrong: Story = story("build-wrong");
/** Whole to parts: the sentence with a word marked, and one of its parts picked. */
export const Apart: Story = story("apart");
/** A part left out and another picked: the word's parts are marked, and the one that is not its. */
export const ApartWrong: Story = story("apart-wrong");
