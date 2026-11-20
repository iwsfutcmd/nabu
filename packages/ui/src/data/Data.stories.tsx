/**
 * The Data page's browser (debug mode): a fixture course's own data, to read. The toolbar's four
 * courses show suffixes and their carriers (uz), vowel marks and the ezafe (fa), two readings of one
 * script (yue) and clitics (apc).
 */
import { courseData, type CourseView, type DataView } from "@nabu/core/lesson";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "../player/load.ts";
import { DataBrowser } from "./DataBrowser.tsx";

/** Toolbar target → fixture course and orthography (the compiled bundles in apps/web/public/bundles). */
const COURSES: Readonly<Record<NabuGlobals["target"], readonly [string, string]>> = {
  fa: ["fa", "fa-Arab/standard"],
  "yue-Hant-HK": ["yue", "yue-Hant-HK/standard"],
  "uz-Latn": ["uz", "uz-Latn/standard"],
  "apc-Arab": ["apc", "apc-Arab/standard"],
};

const meta = {
  title: "Data",
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

/**
 * What each story is searched for, so it shows a row or two and not a course's first forty: the
 * first word a sentence writes in a form (or the first word), the first form a word carries, and
 * the first sentence, each by its id.
 */
const queryOf = (course: CourseView, view: DataView): string => {
  const data = courseData(course);
  if (view === "words") return (data.words.find((w) => w.written.some((x) => x.carries?.asked === true)) ?? data.words.find((w) => w.written.length > 0))?.kc.id ?? "";
  if (view === "forms") return (data.forms.find((f) => f.carriers.length > 0) ?? data.forms[0])?.kc.id ?? "";
  // A sentence whose id is no part of another's (s.i-am.1 is of s.i-am.10): one row.
  return (data.sentences.find((s) => data.sentences.filter((o) => o.sentence.id.includes(s.sentence.id)).length === 1) ?? data.sentences[0])?.sentence.id ?? "";
};

const story = (view: DataView): Story => ({
  render: (_args, { loaded }) => {
    const { course } = loaded["course"] as LoadedCourse;
    return <DataBrowser key={`${course.id}:${view}`} course={course} view={view} query={queryOf(course, view)} />;
  },
});

/** A word, with the ways its sentences write it and what each carries. */
export const Words: Story = story("words");
/** A form, with the words that carry it. */
export const Forms: Story = story("forms");
/** A sentence, with what it accepts and its words. */
export const Sentences: Story = story("sentences");
