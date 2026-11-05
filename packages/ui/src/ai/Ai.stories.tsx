/**
 * AI surfaces with hand-written fixture data (provenance provider "fixture"; no model involved).
 * The acceptance case of Phase 8 lives here: an Arabic-UI learner (ar, ar-XB) reading an English
 * explanation that quotes Cantonese, each segment isolated in its own language and direction.
 */
import { autoTokens, explanationOf } from "@nabu/core/ai";
import { allSentences } from "@nabu/core/lesson";
import { directionOf } from "@nabu/i18n";
import type { AiProvenance, Explanation, ExplanationOutput, TaggedText } from "@nabu/schema";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "../player/load.ts";
import { ExplanationView, type Rating } from "./Explanation.tsx";
import { RoleplayChat, type ChatTurn, type ScenarioCard } from "./Roleplay.tsx";

type Target = NabuGlobals["target"];
type Base = Pick<TaggedText, "lang" | "orthography">;

const EN: Base = { lang: "en-Latn", orthography: "en-Latn/standard" } as Base;
const COURSES: Readonly<Record<Target, readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

/** The target's language and orthography as the course's own sentences tag them. */
const baseOf = ({ course }: LoadedCourse): Base => {
  const text = allSentences(course)[0]?.forms[course.orthography]?.text;
  if (text === undefined) throw new Error(`${course.id} has no sentence`);
  return { lang: text.lang, orthography: text.orthography };
};

const FIXTURE: AiProvenance = { provider: "fixture", model: "fixture", prompt: "explain", promptHash: "000000000000", createdAt: "2026-06-01T00:00:00Z" };

/** What a model might return for a wrong answer, per target: the learner's answer and the segments. */
const EXPLAINED: Readonly<Record<Target, { readonly answer: string; readonly output: ExplanationOutput }>> = {
  "yue-Hant-HK": {
    answer: "我唔係學生",
    output: {
      segments: [
        { kind: "support", text: "You added" },
        { kind: "ref", answerTokens: [1] },
        { kind: "support", text: "(not), which makes the sentence negative. The sentence says" },
        { kind: "target", text: "我係學生" },
        { kind: "support", text: ": I am a student." },
      ],
    },
  },
  fa: {
    answer: "من مریم نیستم",
    output: {
      segments: [
        { kind: "support", text: "You wrote" },
        { kind: "ref", answerTokens: [2] },
        { kind: "support", text: "(am not). To say I am, use" },
        { kind: "target", text: "هستم" },
        { kind: "support", text: "." },
      ],
    },
  },
  "uz-Latn": {
    answer: "Men talaba emasman",
    output: {
      segments: [
        { kind: "support", text: "You wrote" },
        { kind: "ref", answerTokens: [2] },
        { kind: "support", text: "(am not). The sentence is positive:" },
        { kind: "target", text: "Men talabaman" },
        { kind: "support", text: "." },
      ],
    },
  },
  "apc-Arab": {
    answer: "أنا مش منيح",
    output: {
      segments: [
        { kind: "support", text: "You added" },
        { kind: "ref", answerTokens: [1] },
        { kind: "support", text: "(not). I'm fine is just" },
        { kind: "target", text: "أنا منيح" },
        { kind: "support", text: "." },
      ],
    },
  },
};

const fixtureExplanation = (target: Target, base: Base): Explanation => {
  const { answer, output } = EXPLAINED[target];
  const made = explanationOf(output, { support: EN, target: base, answer, answerIn: base }, FIXTURE);
  if (!made.ok) throw new Error(made.error);
  return made.value;
};

const Explained = ({ loaded, target }: { loaded: LoadedCourse; target: Target }): JSX.Element => {
  const [rating, setRating] = useState<Rating | undefined>("up");
  return <ExplanationView explanation={fixtureExplanation(target, baseOf(loaded))} rating={rating} onRate={setRating} />;
};

/** A few turns of each course's scenario, as checked turns would arrive. */
const TURNS: Readonly<Record<Target, readonly (readonly [ChatTurn["role"], string, string?])[]>> = {
  "yue-Hant-HK": [
    ["character", "早晨呀！去飲茶啦！", "Morning! Let's go for yum cha!"],
    ["learner", "好呀！"],
    ["character", "你好嗎？", "How are you?"],
  ],
  fa: [
    ["character", "سلام! من مریم هستم.", "Hello! I'm Maryam."],
    ["learner", "سلام مریم! من علی هستم."],
    ["character", "کتابِ من خیلی خوب است.", "My book is very good."],
  ],
  "uz-Latn": [
    ["character", "Salom! Men oʻqituvchiman.", "Hello! I'm a teacher."],
    ["learner", "Salom! Men talabaman."],
    ["character", "Ismingiz nima?", "What is your name?"],
  ],
  "apc-Arab": [
    ["character", "مرحبا! كيفك؟", "Hello! How are you?"],
    ["learner", "منيح، الحمدلله. وإنت؟"],
    ["character", "منيح! شو بدّك؟", "Fine! What do you want?"],
  ],
};

const Conversation = ({ loaded, target }: { loaded: LoadedCourse; target: Target }): JSX.Element => {
  const base = baseOf(loaded);
  const card = loaded.course.units.flatMap((u) => u.scenarios ?? [])[0];
  const key = loaded.course.supportKey;
  if (card === undefined) throw new Error(`${loaded.course.id} has no scenario`);
  const scenario: ScenarioCard = { title: card.title[key] as TaggedText, setting: card.setting[key] as TaggedText, character: card.character[key] as TaggedText, goal: card.goal[key] as TaggedText };
  const [turns, setTurns] = useState<readonly ChatTurn[]>(() =>
    TURNS[target].map(([role, text, translation]) => ({ role, text: autoTokens(text, base), ...(translation === undefined ? {} : { translation: autoTokens(translation, EN) }) })),
  );
  return <RoleplayChat scenario={scenario} turns={turns} base={base} dir={directionOf(base.lang)} status="idle" initialTranslations={[0]} onSend={(text) => setTurns((ts) => [...ts, { role: "learner", text }])} />;
};

const meta = {
  title: "AI/Explain and roleplay",
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

/** An English explanation quoting the target and pointing into the learner's answer. */
export const ExplainMyAnswer: Story = {
  render: (_args, { globals, loaded }) => <Explained loaded={loaded["course"] as LoadedCourse} target={(globals as NabuGlobals).target} />,
};

/** The course's scenario, three turns in, the first translation open. */
export const Roleplay: Story = {
  render: (_args, { globals, loaded }) => <Conversation loaded={loaded["course"] as LoadedCourse} target={(globals as NabuGlobals).target} />,
};
