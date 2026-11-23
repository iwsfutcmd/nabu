/**
 * A verb shown as itself, with its principal parts after its lemma (docs/rules-design.md, stage 4;
 * the owner's answer 1: an apc verb is its he-past, its he-present beside it). The new words a lesson
 * card presents, and the word list's entries, in both of apc's orthographies, whatever the toolbar's
 * target: the parts come from the committed bundle's paradigms (core `principalParts`).
 */
import type { LearnedWord } from "@nabu/core/learner";
import { lexemesById, type CourseView } from "@nabu/core/lesson";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { JSX } from "react";
import { CourseUiProvider } from "./context.tsx";
import { BUNDLES } from "./demo/bundles.ts";
import { fetchCourse, type LoadedCourse } from "./player/load.ts";
import { NewWordsAnswered } from "./player/NewWords.tsx";
import styles from "./player/Player.module.css";
import { WordList } from "./words/WordList.tsx";

/** Verbs of the first units: a sound verb, a hollow one, and one whose first radical is a hamza. */
const VERBS = ["lexeme:shereb", "lexeme:ra7", "lexeme:akal"] as const;

const wordsOf = (course: CourseView): LearnedWord[] => {
  const byId = lexemesById(course);
  return VERBS.flatMap((id, i): LearnedWord[] => {
    const lexeme = byId.get(id);
    const form = lexeme?.forms?.[course.orthography]?.[0];
    if (lexeme === undefined || form === undefined) return [];
    return [{ lexeme: id, unit: course.units[0]?.id ?? "", form, gloss: lexeme.gloss?.[course.supportKey], strength: 0.9 - i * 0.2, due: false, reviews: 3, known: false, skills: [{ skill: "recognize", shown: true }] }];
  });
};

const Card = ({ loaded }: { readonly loaded: LoadedCourse }): JSX.Element => (
  <CourseUiProvider course={loaded.course}>
    <section className={styles.card}>
      <NewWordsAnswered course={loaded.course} template="translate-type.l1-l2" lexemes={[...VERBS]} ruby={false} marks="show" />
    </section>
  </CourseUiProvider>
);

const List = ({ loaded }: { readonly loaded: LoadedCourse }): JSX.Element => (
  <CourseUiProvider course={loaded.course}>
    <WordList course={loaded.course} words={wordsOf(loaded.course)} url={loaded.imageUrl} />
  </CourseUiProvider>
);

const meta = {
  title: "Principal parts",
  loaders: [
    async () => ({
      arab: await fetchCourse(BUNDLES, "apc", "apc-Arab/standard"),
      latn: await fetchCourse(BUNDLES, "apc", "apc-Latn/arabizi"),
    }),
  ],
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** A lesson card's new verbs once answered, in Arabic script: each lemma, then its he-present. */
export const NewVerbsArabic: Story = {
  name: "New verbs, Arabic script",
  render: (_args, { loaded }) => <Card loaded={loaded["arab"] as LoadedCourse} />,
};

/** The same in Arabizi. */
export const NewVerbsArabizi: Story = {
  name: "New verbs, Arabizi",
  render: (_args, { loaded }) => <Card loaded={loaded["latn"] as LoadedCourse} />,
};

/** The word list's entries for three verbs, in Arabic script. */
export const WordListArabic: Story = {
  name: "Word list verbs, Arabic script",
  render: (_args, { loaded }) => <List loaded={loaded["arab"] as LoadedCourse} />,
};

/** The same in Arabizi. */
export const WordListArabizi: Story = {
  name: "Word list verbs, Arabizi",
  render: (_args, { loaded }) => <List loaded={loaded["latn"] as LoadedCourse} />,
};
