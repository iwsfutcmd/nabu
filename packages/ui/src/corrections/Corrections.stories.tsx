import { correctablesByUnit, correctionKey, correctionOf, draftFrom, sentenceReportedOf, shownOf, type Correctable } from "@nabu/core/corrections";
import { allSentences, createGrader, type CourseView } from "@nabu/core/lesson";
import { reportsOf, type ReportEntry } from "@nabu/core/reports";
import { surfaceOf, wordIndexes } from "@nabu/core/text";
import type { AnswerReported, LearnerEvent, OrthographyId, SentenceReported } from "@nabu/schema";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "../player/load.ts";
import { CorrectionForm } from "./CorrectionForm.tsx";
import { ReportList } from "./ReportList.tsx";
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

/** Stamps for the n-th report of the sample (later n, later day). */
const stamp = (n: number) => ({
  id: `00000000-0000-7000-8000-00000000010${String(n)}`,
  clientTime: `2026-06-0${String(n)}T10:00:00.000Z`,
  localDate: `2026-06-0${String(n)}`,
  tz: "UTC",
  device: "storybook",
  session: "00000000-0000-7000-8000-000000000002",
  bundle: "0".repeat(64),
});

/**
 * Four reports, one of each outcome, made against an older version of the course (ADR 0115): a
 * correction it took up, one it changed some other way since, an answer it accepts now, and one it
 * still grades as before. Built from the course's own sentences, so each target shows its own.
 */
const sampleReports = (course: CourseView): readonly ReportEntry[] => {
  const sentences = correctablesByUnit(course).flatMap((u) => u.sentences);
  const target = sampleTarget(course);
  const others = sentences.filter((c) => c.item !== target.item && c.translation !== undefined);
  const translated = (c: Correctable | undefined): string => (c?.translation === undefined ? "…" : surfaceOf(c.translation));
  const [changed, older, suggested] = others;
  const events: LearnerEvent[] = [];
  if (target.translation !== undefined) {
    // Seen with an older translation; suggested as the course has it now.
    events.push(sentenceReportedOf(course, target, { ...shownOf(target), translation: translated(older) }, { correction: { translation: translated(target) } }, stamp(4)));
  }
  if (changed !== undefined) {
    events.push(sentenceReportedOf(course, changed, { ...shownOf(changed), translation: translated(older) }, { correction: { translation: translated(suggested) }, note: "…" }, stamp(3)));
  }
  const producible = allSentences(course).filter((s) => s.production && s.forms[course.orthography]?.reverse !== undefined);
  const claim = (n: number, item: string, text: string): AnswerReported => ({
    ...stamp(n),
    type: "answer_reported",
    schema: 1,
    course: course.id,
    orthography: course.orthography as OrthographyId,
    support: course.supportKey,
    answer: `00000000-0000-7000-8000-00000000020${String(n)}`,
    exercise: { id: `translate-type.l1-l2:${item}`, template: "translate-type.l1-l2", item, kcs: [] },
    text,
  });
  const [accepted, pending, other] = producible;
  const textOf = (s: (typeof producible)[number] | undefined): string => {
    const form = s?.forms[course.orthography];
    return form === undefined ? "…" : surfaceOf(form.text);
  };
  // Its own sentence, which the course accepts; and another sentence's, which it does not.
  if (accepted !== undefined) events.push(claim(2, accepted.id, textOf(accepted)));
  if (pending !== undefined) events.push(claim(1, pending.id, textOf(other)));
  return reportsOf(course, events, createGrader(course));
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

const Reports = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const { course } = loaded;
  const entries = useMemo(() => sampleReports(course), [course]);
  return <ReportList course={course} entries={entries} />;
};

const meta = {
  title: "Corrections",
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

/** Your reports (ADR 0115): newest first, each with what came of it in the course as it is now. */
export const ReportListStory: Story = {
  name: "Your reports",
  render: (_args, { loaded }) => <Reports loaded={loaded["course"] as LoadedCourse} />,
};
