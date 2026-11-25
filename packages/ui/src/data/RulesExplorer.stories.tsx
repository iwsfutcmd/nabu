/**
 * The rules explorer (debug mode), on fixed courses whatever the toolbar's target, with the lexicon's
 * own files and the course's profiles as the repository has them (read at build time: the app gets the
 * same files from lexicon-source/ beside it): apc's shereb in the 2fs present with the 1sg object
 * suffix written after it (its rules, branches, three spellings with Arabizi's free alternatives, how
 * the course writes it, its paradigm); a word with a pinned form (apc a7mar's feminine); nothing picked
 * yet; and tok, whose sitelen pona states no spelling. Each story keeps its own request, as the page
 * keeps it in its address.
 */
import { isLexiconSource, type ExploreRequest, type LexiconSource } from "@nabu/core/lesson";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type JSX } from "react";
import { parse } from "yaml";
import apcLanguage from "../../../../lexicons/apc/language.yaml?raw";
import apcLexemes from "../../../../lexicons/apc/lexemes.yaml?raw";
import tokLanguage from "../../../../lexicons/tok/language.yaml?raw";
import tokLexemes from "../../../../lexicons/tok/lexemes.yaml?raw";
import apcArab from "../../../../profiles/apc-Arab.standard.yaml?raw";
import apcLatn from "../../../../profiles/apc-Latn.arabizi.yaml?raw";
import tokLatn from "../../../../profiles/tok-Latn.standard.yaml?raw";
import tokQaap from "../../../../profiles/tok-Qaap.sitelen-pona.yaml?raw";
import { CourseUiProvider } from "../context.tsx";
import { BUNDLES } from "../demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "../player/load.ts";
import { RulesExplorer } from "./RulesExplorer.tsx";

const meta = {
  title: "Data/Rules explorer",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A course's lexicon source, as lexicon-source.ts serves it: its two files and its profiles, parsed. */
const sourceOf = (lexemes: string, language: string, profiles: Readonly<Record<string, string>>): LexiconSource => {
  const source: unknown = { lexemes: parse(lexemes) as unknown, language: parse(language) as unknown, profiles: Object.fromEntries(Object.entries(profiles).map(([id, text]) => [id, parse(text) as unknown])) };
  if (!isLexiconSource(source)) throw new Error("not a lexicon");
  return source;
};

const SOURCES: Readonly<Record<string, () => LexiconSource>> = {
  apc: () => sourceOf(apcLexemes, apcLanguage, { "apc-Arab/standard": apcArab, "apc-Latn/arabizi": apcLatn }),
  tok: () => sourceOf(tokLexemes, tokLanguage, { "tok-Latn/standard": tokLatn, "tok-Qaap/sitelen-pona": tokQaap }),
};

const Explorer = ({ loaded, source, start }: { loaded: LoadedCourse; source: LexiconSource; start: ExploreRequest | undefined }): JSX.Element => {
  const [request, setRequest] = useState(start);
  return (
    <CourseUiProvider course={loaded.course}>
      <RulesExplorer course={loaded.course} source={source} request={request} onRequest={setRequest} />
    </CourseUiProvider>
  );
};

const explorerStory = (id: string, orthography: string, start: ExploreRequest | undefined): Story => ({
  loaders: [async () => ({ rulesCourse: await fetchCourse(BUNDLES, id, orthography) })],
  render: (_args, { loaded }) => <Explorer loaded={loaded["rulesCourse"] as LoadedCourse} source={(SOURCES[id] ?? (() => ({ lexemes: { lexemes: [] } })))()} start={start} />,
});

const DEFAULTS = { blocking: true, pinned: true, spellings: false } as const;

/** apc's shereb, 2fs present, with -ni written after it: the rules and branches taken, three spellings, Arabizi's free alternatives. */
export const Realised: Story = explorerStory("apc", "apc-Arab/standard", {
  base: "lexeme:shereb",
  feats: { Aspect: "Imp", Mood: "Ind", Person: "2", Gender: "Fem", Number: "Sing" },
  before: [],
  after: ["lexeme:obj-1sg"],
  ...DEFAULTS,
});

/** apc's a7mar "red" in the feminine: a pinned form (rule debt), not what a rule gives. */
export const Pinned: Story = explorerStory("apc", "apc-Arab/standard", { base: "lexeme:a7mar", feats: { Gender: "Fem", Number: "Sing" }, before: [], after: [], ...DEFAULTS });

/** Nothing picked yet: the search for a base. */
export const Empty: Story = explorerStory("apc", "apc-Arab/standard", undefined);

/** tok's moku: no rules, a form given as it is; sitelen pona states no spelling (a logograph is lexical). */
export const Unspelled: Story = explorerStory("tok", "tok-Latn/standard", { base: "lexeme:moku", feats: {}, before: [], after: [], ...DEFAULTS });
