/**
 * The Data page's browser (debug mode): a fixture course's own data, to read. The toolbar's four
 * courses show suffixes and their carriers (uz), vowel marks and the ezafe (fa), two readings of one
 * script (yue) and clitics (apc). The Lexicon and Language views show fixed courses whatever the
 * toolbar's target: uz (an affix with its allomorphs in two scripts), apc (a word with a pinned form
 * and a feature of its own, spelled in Arabic script and in Arabizi) and fa's language file, each
 * with the lexicon's own files as the repository has them (lexicons/<lang>/*.yaml, read at build
 * time: the app gets the same files from lexicon-source/ beside it). Small lexicons on purpose: the
 * stories' smoke pass walks every story, and a course of seven hundred lexemes is slow to lay out.
 */
import { courseData, isLexiconSource, type CourseView, type DataView, type LexiconSource } from "@nabu/core/lesson";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { parse } from "yaml";
import apcLanguage from "../../../../lexicons/apc/language.yaml?raw";
import apcLexemes from "../../../../lexicons/apc/lexemes.yaml?raw";
import faLanguage from "../../../../lexicons/fa/language.yaml?raw";
import faLexemes from "../../../../lexicons/fa/lexemes.yaml?raw";
import uzLanguage from "../../../../lexicons/uz/language.yaml?raw";
import uzLexemes from "../../../../lexicons/uz/lexemes.yaml?raw";
import type { NabuGlobals } from "../../.storybook/toolbar.ts";
import { CourseUiProvider } from "../context.tsx";
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
  if (view === "words") return (data.words.find((w) => w.written.some((x) => x.carries?.asked === true)) ?? data.words.find((w) => w.written.length > 0))?.id.id ?? "";
  if (view === "forms") return (data.forms.find((f) => f.carriers.length > 0) ?? data.forms[0])?.id.id ?? "";
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

/** A lexicon's own files, as lexicon-source.ts serves them: the two YAML files, parsed. */
const sourceOf = (lexemes: string, language: string): LexiconSource => {
  const source: unknown = { lexemes: parse(lexemes) as unknown, language: parse(language) as unknown };
  if (!isLexiconSource(source)) throw new Error("not a lexicon");
  return source;
};

const SOURCES: Readonly<Record<string, readonly [string, string]>> = { uz: [uzLexemes, uzLanguage], apc: [apcLexemes, apcLanguage], fa: [faLexemes, faLanguage] };

/** A fixed course's Lexicon or Language view, `opened` open and searched for. */
const lexiconStory = (id: string, orthography: string, view: DataView, opened?: string): Story => ({
  loaders: [async () => ({ lexiconCourse: await fetchCourse(BUNDLES, id, orthography) })],
  render: (_args, { loaded }) => {
    const { course, imageUrl } = loaded["lexiconCourse"] as LoadedCourse;
    const [lexemes, language] = SOURCES[id] ?? ["", ""];
    return (
      <CourseUiProvider course={course}>
        <DataBrowser key={`${course.id}:${view}`} course={course} view={view} query={opened ?? ""} opened={opened} lexicon={sourceOf(lexemes, language)} url={imageUrl} />
      </CourseUiProvider>
    );
  },
});

/** An affix (uz's dative), open: its entry with its allomorphs in both scripts, its bundle lexeme, the words that carry it. */
export const LexiconAffix: Story = lexiconStory("uz", "uz-Latn/standard", "lexicon", "lexeme:dat");
/** A word with a pinned form and a feature of its own (apc awwal "first"), open: its spellings in both scripts, what the bundle keeps, how its sentences write it. */
export const LexiconForms: Story = lexiconStory("apc", "apc-Arab/standard", "lexicon", "lexeme:awwal");
/** The language file (fa): its dimensions, features and rules, as stored. */
export const Language: Story = lexiconStory("fa", "fa-Arab/standard", "language");
