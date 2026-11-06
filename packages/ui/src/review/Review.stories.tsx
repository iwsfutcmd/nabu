import { correctablesByUnit } from "@nabu/core/corrections";
import type { CourseView } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { AnswerReport, SentenceCorrection } from "@nabu/schema";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useMemo, useState, type JSX } from "react";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { SentenceList } from "../corrections/SentenceList.tsx";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "../player/load.ts";
import { ItemDetails } from "./ItemDetails.tsx";
import { Queue, type Decision } from "./Queue.tsx";

/** Toolbar target → fixture course and orthography (the compiled bundles in apps/web/public/bundles). */
const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

/** The first unit's sentences that have a target-language accept set. */
const withAnswers = (course: CourseView) => course.units.flatMap((u) => u.sentences).filter((s) => s.forms[course.orthography]?.reverse !== undefined);

/** The sentence list as the review workspace shows it: each item with its clip, accept sets and answer field. */
const Workspace = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const { course } = loaded;
  const [unit, setUnit] = useState<string | undefined>(undefined);
  // The first item signed off already, so both states of the toggle show.
  const signed = useMemo(() => {
    const [first] = correctablesByUnit(course);
    const item = first?.sentences[0]?.item;
    return new Set(item === undefined ? [] : [`sentence:${item}`]);
  }, [course]);
  return (
    <SentenceList
      course={course}
      corrections={new Map()}
      unit={unit}
      onUnit={setUnit}
      onCorrect={() => undefined}
      review={{ signed, onSignOff: () => undefined, onSignOffUnit: () => undefined }}
      details={(target) => <ItemDetails course={course} target={target} url={loaded.imageUrl} onAccept={target.kind === "sentence" ? () => Promise.resolve("added") : undefined} />}
    />
  );
};

const at = "2026-11-06T10:00:00.000Z";

/** What learners filed: an answer that should count, a translation that should not, and a correction. */
const sampleQueue = (course: CourseView): { reports: AnswerReport[]; corrections: SentenceCorrection[] } => {
  const [a, b] = withAnswers(course);
  if (a === undefined || b === undefined) return { reports: [], corrections: [] };
  const own = a.forms[course.orthography]?.text;
  const translation = b.translations[course.supportKey]?.text;
  const reports: AnswerReport[] = [
    {
      id: "00000000-0000-7000-8000-00000000000a",
      course: course.id,
      orthography: course.orthography as AnswerReport["orthography"],
      template: "translate-type.l1-l2",
      item: a.id,
      answer: own === undefined ? "" : surfaceOf(own),
      claim: "accept",
      notes: ["We say it this way at home."],
      status: "pending",
      reports: 3,
      createdAt: at,
    },
    {
      id: "00000000-0000-7000-8000-00000000000b",
      course: course.id,
      orthography: course.orthography as AnswerReport["orthography"],
      template: "translate-type.l2-l1",
      item: b.id,
      answer: translation === undefined ? "" : `${surfaceOf(translation)} indeed`,
      claim: "reject",
      notes: [],
      status: "approved",
      reports: 1,
      createdAt: at,
    },
  ];
  const corrections: SentenceCorrection[] = [
    {
      id: "00000000-0000-7000-8000-00000000000c",
      course: course.id,
      orthography: course.orthography as SentenceCorrection["orthography"],
      support: course.supportKey,
      item: a.id,
      shown: { translation: translation === undefined ? "" : surfaceOf(translation) },
      correction: { translation: "Hello there!" },
      notes: [],
      status: "pending",
      reports: 2,
      createdAt: at,
    },
  ];
  return { reports, corrections };
};

const QueueDemo = ({ loaded }: { loaded: LoadedCourse }): JSX.Element => {
  const { course } = loaded;
  const initial = useMemo(() => sampleQueue(course), [course]);
  const [reports, setReports] = useState(initial.reports);
  const [corrections, setCorrections] = useState(initial.corrections);
  const decide = (kind: "report" | "correction", id: string, status: Decision): void => {
    if (kind === "report") setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    else setCorrections((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
  };
  return <Queue course={course} reports={reports} corrections={corrections} onDecide={decide} />;
};

const meta = {
  title: "Review",
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

/** The review workspace's sentence list: sign-off toggles, clips, accept sets, a field for one more answer. */
export const WorkspaceStory: Story = {
  name: "Workspace",
  render: (_args, { loaded }) => <Workspace loaded={loaded["course"] as LoadedCourse} />,
};

/** The queue: an answer that should count (with a note), a translation that should not, a correction. */
export const QueueStory: Story = {
  name: "Queue",
  render: (_args, { loaded }) => <QueueDemo loaded={loaded["course"] as LoadedCourse} />,
};
