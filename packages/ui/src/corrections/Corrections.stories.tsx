import { correctablesByUnit, correctionKey, correctionOf, draftFrom, sentenceReportedOf, shownOf, type Correctable } from "@nabu/core/corrections";
import type { CourseView } from "@nabu/core/lesson";
import { wordIndexes } from "@nabu/core/text";
import type { SentenceReported } from "@nabu/schema";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { fetchCourse, type LoadedCourse } from "../player/load.ts";
import { CorrectionForm } from "./CorrectionForm.tsx";
import { SentenceList } from "./SentenceList.tsx";

/** Toolbar target → fixture course and orthography (the compiled bundles in apps/web/public/bundles). */
const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

/** A sentence with something to show: several words, and readings where the course pins them. */
const sampleTarget = (course: CourseView): Correctable => {
  const [first] = correctablesByUnit(course);
  const sentences = first?.sentences ?? [];
  const words = (c: Correctable): number => {
    const text = c.forms[course.orthography];
    return text === undefined ? 0 : wordIndexes(text).length;
  };
  const target = sentences.find((c) => words(c) >= 2) ?? sentences[0];
  if (target === undefined) throw new Error(`${course.id} has no sentences`);
  return target;
};

/** The learner corrected one sentence of the first unit (its translation): the list marks it. */
const sampleCorrections = (course: CourseView): ReadonlyMap<string, SentenceReported> => {
  const target = sampleTarget(course);
  const shown = shownOf(target);
  const made = correctionOf(shown, { ...draftFrom(shown), note: "…" });
  if (!made.ok) return new Map();
  const meta = {
    id: "00000000-0000-7000-8000-000000000001",
    clientTime: "2026-06-03T10:00:00.000Z",
    localDate: "2026-06-03",
    tz: "UTC",
    device: "storybook",
    session: "00000000-0000-7000-8000-000000000002",
    bundle: "0".repeat(64),
  };
  return new Map([[correctionKey(target.item, target.step), sentenceReportedOf(course, target, shown, made.value, meta)]]);
};

const Form = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const { course } = loaded;
  const target = useMemo(() => sampleTarget(course), [course]);
  return <CorrectionForm key={course.id} course={course} target={target} onSubmit={() => undefined} onCancel={() => undefined} />;
};

const List = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const { course } = loaded;
  const corrections = useMemo(() => sampleCorrections(course), [course]);
  const [unit, setUnit] = useState<string | undefined>(undefined);
  return <SentenceList course={course} corrections={corrections} unit={unit} onUnit={setUnit} onCorrect={() => undefined} />;
};

const meta = {
  title: "Corrections",
  loaders: [
    async ({ globals }) => {
      const [id, orthography] = COURSES[(globals as NabuGlobals).target];
      return { course: await fetchCourse("bundles/", id, orthography) };
    },
  ],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The form, starting from what the course has: every orthography, each word's reading, the translation. */
export const CorrectionFormStory: Story = {
  name: "Correction form",
  render: (_args, { loaded }) => <Form loaded={loaded["course"] as LoadedCourse} />,
};

/** Every sentence and story line of the first unit; one already corrected on this device. */
export const SentenceListStory: Story = {
  name: "Sentence list",
  render: (_args, { loaded }) => <List loaded={loaded["course"] as LoadedCourse} />,
};
