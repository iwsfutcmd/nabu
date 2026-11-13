/**
 * A first look at new words (P1): the card of a lesson that first presents a word the lesson
 * introduces says so, with the word and what it means, where that gives nothing away.
 *
 * - Above the instruction, from the start: "New word" (or "New words"); with the word itself where
 *   the card shows it anyway (a sentence to translate or say, the pairs' words), and its meaning
 *   where the card shows the meaning anyway (a sentence to say, its translation under it). This
 *   part never changes as the card is answered, so nothing on the card moves.
 * - Under the feedback, once answered: each new word and its meaning, where the top did not show
 *   both. Match-the-pairs shows only the tag: its pairs are the words and their meanings.
 *
 * Which card first presents a word is worked out from the session as it stands (`newOnCard`), so a
 * card put off or dropped hands the first look on to the next card with the word.
 */
import type { CourseView, Exercise, TemplateId } from "@nabu/core/lesson";
import { allKcs } from "@nabu/core/lesson";
import type { BundleKc, SchemeId, TaggedText } from "@nabu/schema";
import { useMemo, type JSX } from "react";
import { useTranslator } from "../context.tsx";
import type { Marks } from "../marks.tsx";
import { T } from "../T.tsx";
import styles from "./Player.module.css";

/** Cards whose prompt already shows the target words: the new word may be named from the start. */
const WORD_SHOWN: ReadonlySet<TemplateId> = new Set(["choose-translation", "translate-tap.l2-l1", "speak.tier-0", "speak"]);
/** Cards that show the meaning from the start (a sentence to say, with its translation). */
const MEANING_SHOWN: ReadonlySet<TemplateId> = new Set(["speak.tier-0", "speak"]);
/** Cards that are themselves the words and their meanings: the tag is enough. */
const TAG_ONLY: ReadonlySet<TemplateId> = new Set(["match-pairs", "letter-pairs"]);

/**
 * The words a card presents for the first time in its lesson: the lesson's new words (`introduces`)
 * among the card's KCs that no card shown before it (`earlier`) had. Letters (a script track's
 * graphemes) are no words.
 */
export const newOnCard = (ex: Exercise, earlier: readonly Exercise[], introduces: ReadonlySet<string>, kinds: ReadonlyMap<string, BundleKc["kind"]>): readonly string[] => {
  const seen = new Set(earlier.flatMap((e) => e.kcs as readonly string[]));
  return [...new Set(ex.kcs as readonly string[])].filter((kc) => introduces.has(kc) && !seen.has(kc) && kinds.get(kc) !== "grapheme");
};

interface Word {
  readonly kc: string;
  readonly form: TaggedText;
  readonly gloss: TaggedText | undefined;
}

const useWords = (course: CourseView, kcs: readonly string[]): readonly Word[] => {
  const byId = useMemo(() => new Map(allKcs(course).map((k) => [k.id as string, k])), [course]);
  return kcs.flatMap((kc) => {
    const k = byId.get(kc);
    const form = k?.forms?.[course.orthography]?.[0];
    return form === undefined ? [] : [{ kc, form, gloss: k?.gloss?.[course.supportKey] }];
  });
};

interface NewWordsProps {
  readonly course: CourseView;
  readonly template: TemplateId;
  /** The card's new words (newOnCard). */
  readonly kcs: readonly string[];
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
}

const WordList = ({ words, meanings, ruby, marks }: { readonly words: readonly Word[]; readonly meanings: boolean; readonly ruby: SchemeId | false; readonly marks: Marks }): JSX.Element => (
  <ul className={styles.newWordList}>
    {words.map((w) => (
      <li key={w.kc} className={styles.newWord} data-new-word={w.kc}>
        <T text={w.form} ruby={ruby} marks={marks} />
        {meanings && w.gloss !== undefined && <T text={w.gloss} className={styles.newWordGloss} />}
      </li>
    ))}
  </ul>
);

/** Above the instruction: the tag, with the words and meanings the card shows anyway. */
export const NewWordsTag = ({ course, template, kcs, ruby, marks }: NewWordsProps): JSX.Element | null => {
  const t = useTranslator();
  const words = useWords(course, kcs);
  if (words.length === 0) return null;
  const named = WORD_SHOWN.has(template) && !TAG_ONLY.has(template);
  return (
    <div className={styles.newWords} data-new-words={words.map((w) => w.kc).join(" ")}>
      <p className={styles.reviewTag} data-new-word-tag="">
        {t.format("player.new-word.tag", { count: words.length })}
      </p>
      {named && <WordList words={words} meanings={MEANING_SHOWN.has(template)} ruby={ruby} marks={marks} />}
    </div>
  );
};

/** Under the feedback, once answered: the new words and their meanings, where the tag did not show both. */
export const NewWordsAnswered = ({ course, template, kcs, ruby, marks }: NewWordsProps): JSX.Element | null => {
  const t = useTranslator();
  const words = useWords(course, kcs);
  if (words.length === 0 || TAG_ONLY.has(template) || MEANING_SHOWN.has(template)) return null;
  const label = t.format("player.new-word.tag", { count: words.length });
  return (
    <div className={styles.newWordsAnswered} role="group" aria-label={label} data-new-words-answered="">
      <p className={styles.reviewTag} aria-hidden="true">
        {label}
      </p>
      <WordList words={words} meanings ruby={ruby} marks={marks} />
    </div>
  );
};
