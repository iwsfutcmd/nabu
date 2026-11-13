/**
 * Phase 9 screens with fixture results (no recording, no model): feedback after a scored speaking
 * exercise, and choosing a tone. The speaking result is hand-written as the device and a speech
 * server would report it: for Cantonese one syllable heard with the wrong tone, and everywhere
 * the words the recognizer heard.
 */
import { autoTokens, textBase } from "@nabu/core/ai";
import { allSentences, createGrader, gradeExercise, makeSpeakScored, makeToneIdentify, seededRng, start, step, type CourseView, type Exercise, type Grader, type PlayerState } from "@nabu/core/lesson";
import { expectedSyllables, toneSystemOf, type SpeechResult } from "@nabu/core/speech";
import { surfaceOf, wordIndexes } from "@nabu/core/text";
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

/** A sentence of two or more words with a scored speaking exercise. */
const speakOf = (course: CourseView): Exercise | undefined =>
  allSentences(course)
    .filter((s) => {
      const text = s.forms[course.orthography]?.text;
      return text !== undefined && wordIndexes(text).length >= 2;
    })
    .map((s) => makeSpeakScored({ course, rng: seededRng(7), introduced: [] }, s))
    .find((e) => e !== undefined);

/** What the device and a speech server might have heard (fixture). */
const heardFor = (course: CourseView, ex: Exercise): SpeechResult => {
  if (ex.template !== "speak") return { silent: false };
  const system = toneSystemOf(ex.prompt);
  const words = { verdict: "CORRECT" as const, heard: autoTokens(surfaceOf(ex.prompt), textBase(course.profiles, ex.prompt)) };
  if (system === undefined) return { silent: false, words, phones: { errorRate: 0.3, offTokens: wordIndexes(ex.prompt).slice(0, 1) } };
  const syllables = expectedSyllables(ex.prompt, system).map((s, i) => (i === 1 ? { ...s, heard: { tone: s.tone === "2" ? "5" : "2", shape: "rising" as const, confidence: 0.6 }, ok: false } : { ...s, heard: { tone: s.tone, shape: system.tones[s.tone]?.shape ?? "level", confidence: 0.8 }, ok: true }));
  return { silent: false, words, tone: { syllables, calibrated: true, silent: false } };
};

const answered = (ex: Exercise, grader: Grader, draft: Parameters<typeof step>[1]): PlayerState => {
  const [presenting] = start("story", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  const [checking] = step(step(answering, draft)[0], { tag: "submit" });
  return checking.tag === "checking" ? step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, grader) })[0] : answering;
};

const Player = ({ loaded, ex, state }: { loaded: LoadedCourse; ex: Exercise; state: PlayerState }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  return <LessonPlayer key={ex.id} course={course} lessonId="story" exercises={[ex]} grader={grader} imageUrl={imageUrl} language={courseName(t, course)} sound={false} initialState={state} />;
};

const SpeakFeedback = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const { course } = loaded;
  const ex = useMemo(() => speakOf(course), [course]);
  const grader = useMemo(() => createGrader(course), [course]);
  if (ex === undefined) throw new Error(`${course.id} has no speaking sentence`);
  const state = useMemo(() => answered(ex, grader, { tag: "input", draft: { tag: "speech", result: heardFor(course, ex) } }), [course, ex, grader]);
  return <Player loaded={loaded} ex={ex} state={state} />;
};

/** Tone exercises are Cantonese-only here: the yue course, its one-syllable 係！ given a clip. */
const ToneChoice = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const course: CourseView = useMemo(() => ({ ...loaded.course, audio: { ...loaded.course.audio, "s.8": { normal: { path: "audio/fixture-s8.mp3", durationMs: 420, synthetic: true, license: "CC0-1.0" } } } }), [loaded]);
  const ex = useMemo(() => {
    const s = allSentences(course).find((x) => x.id === "s.8");
    return s === undefined ? undefined : makeToneIdentify({ course, rng: seededRng(7), introduced: [] }, s);
  }, [course]);
  if (ex === undefined) throw new Error("no tone exercise");
  const [presenting] = start("story", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  const state = step(answering, { tag: "input", draft: { tag: "choice", index: 1 } })[0];
  return <Player loaded={{ ...loaded, course }} ex={ex} state={state} />;
};

const meta = {
  title: "Player/Speech",
  loaders: [
    async ({ globals }) => {
      const [id, orthography] = COURSES[(globals as NabuGlobals).target];
      return { course: await fetchCourse(BUNDLES, id, orthography), yue: await fetchCourse(BUNDLES, "yue", "yue-Hant-HK/standard") };
    },
  ],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** After a scored speaking exercise: what was heard, and the syllable said with another tone. */
export const SpeakingFeedback: Story = {
  render: (_args, { loaded }) => <SpeakFeedback loaded={loaded["course"] as LoadedCourse} />,
};

/** Which tone? Six tones of Cantonese, one chosen. */
export const ToneIdentify: Story = {
  render: (_args, { loaded }) => <ToneChoice loaded={loaded["yue"] as LoadedCourse} />,
};
