import { createGrader, gradeExercise, seededRng, type CourseView, type Effect, type Grader } from "@nabu/core/lesson";
import { allStories, startStory, stepStory, storyScript, type StoryEvent, type StoryScript, type StoryState } from "@nabu/core/story";
import { wordIndexes } from "@nabu/core/text";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { useTranslator } from "../context.tsx";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "../player/load.ts";
import type { WritingMode } from "../player/shared.ts";
import { StoryReader } from "./StoryReader.tsx";

/** Toolbar target → fixture course and orthography (the compiled bundles in apps/web/public/bundles). */
const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

export type StoryScreen = "reading" | "question";

const SEED = 7;

/** Drives the pure story machine with right answers until `stop` holds. */
const advance = (script: StoryScript, grader: Grader, stop: (s: StoryState) => boolean): StoryState => {
  let state = startStory(script)[0];
  const send = (event: StoryEvent): void => {
    const [next, effects] = stepStory(state, event);
    state = next;
    run(effects);
  };
  const run = (effects: readonly Effect[]): void => {
    for (const e of effects) if (e.tag === "grade") send({ tag: "player", event: { tag: "graded", outcome: gradeExercise(e.ex, e.response, grader) } });
  };
  for (let guard = 0; guard < 100 && !stop(state) && state.tag !== "finished"; guard += 1) {
    if (state.tag === "reading") send({ tag: "continue" });
    else if (state.player.tag === "presenting") send({ tag: "player", event: { tag: "ready" } });
    else if (state.player.tag === "feedback") send({ tag: "player", event: { tag: "continue" } });
    else if (state.player.tag === "answering") {
      const ex = state.player.ex;
      const draft =
        ex.template === "story-arrange" ? { tag: "tiles" as const, order: ex.solution } : { tag: "choice" as const, index: ex.template === "story-choose" || ex.template === "story-complete" ? ex.answer : 0 };
      send({ tag: "player", event: { tag: "input", draft } });
      send({ tag: "player", event: { tag: "submit" } });
    }
  }
  return state;
};

const stateFor = (screen: StoryScreen, script: StoryScript, grader: Grader): StoryState => {
  if (screen === "reading") return advance(script, grader, (s) => s.tag === "reading" && s.shown.length >= 4);
  // The arrange question, one tile placed.
  const asking = advance(script, grader, (s) => s.tag === "asking" && s.ex.template === "story-arrange" && s.player.tag === "answering");
  if (asking.tag !== "asking" || asking.ex.template !== "story-arrange") return asking;
  return stepStory(asking, { tag: "player", event: { tag: "input", draft: { tag: "tiles", order: asking.ex.solution.slice(0, 1) } } })[0];
};

const Screen = ({ loaded, screen, writingMode }: { loaded: LoadedCourse; screen: StoryScreen; writingMode: WritingMode }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const script = useMemo(() => scriptOf(course), [course]);
  const initialState = useMemo(() => stateFor(screen, script, grader), [screen, script, grader]);
  const name = `course.name.${course.id}`;
  // Reading: the second line's translation open, and the gloss of the newest line's first word.
  const newest = initialState.shown.at(-1) ?? 0;
  const line = script.lines[newest];
  const firstWord = line === undefined ? 0 : (wordIndexes(line.text)[0] ?? 0);
  return (
    <StoryReader
      key={`${course.id}:${screen}:${writingMode}`}
      course={course}
      script={script}
      grader={grader}
      imageUrl={imageUrl}
      language={t.has(name) ? t.format(name) : course.id}
      sound={false}
      writingMode={writingMode}
      initialState={initialState}
      initial={screen === "reading" ? { translations: [1], gloss: { line: newest, token: firstWord } } : {}}
    />
  );
};

const scriptOf = (course: CourseView): StoryScript => {
  const [story] = allStories(course);
  if (story === undefined) throw new Error(`${course.id} has no story`);
  return storyScript(course, story, seededRng(SEED));
};

const meta = {
  title: "Reading/Story reader",
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

const story = (screen: StoryScreen): Story => ({
  render: (_args, { globals, loaded }) => <Screen loaded={loaded["course"] as LoadedCourse} screen={screen} writingMode={(globals as NabuGlobals).writingMode} />,
});

/** Four lines in, one translation open and the newest line's first word glossed; vertical where allowed. */
export const Reading: Story = story("reading");
/** Building a line from its tiles, one placed. */
export const Question: Story = story("question");
