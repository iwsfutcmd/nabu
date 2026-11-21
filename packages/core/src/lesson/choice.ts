/**
 * A choice's words, judged as one (ADR 0132: nothing but what a card asks may mark its answer). The
 * player shows a word's reading (ADR 0131, 0141) and its vowel marks (P12) by what the learner knows of
 * that word, and marks a homograph (ADR 0140). Among a choice's options, a gap's fill or word-bank tiles
 * that would set one word apart: the new word, often the answer, keeps the reading the others lose. So
 * the options are judged together: any word new makes all new, and their readings fade only where every
 * reading among them has been shown.
 */
import type { LexemeId, TaggedText, Token } from "@nabu/schema";
import { lexemeIdsOf } from "./lexemes.ts";

/** What the player knows of one word: by the lexemes its token writes and its surface. */
export type WordTest = (lexemes: readonly LexemeId[], surface: string) => boolean;

export interface ChoiceWords {
  /** Whether any word of the options in this orthography is new to the learner. */
  readonly anyNew: boolean;
  /** Whether the learner has shown the reading of every word of the options in this orthography that has one. */
  readonly allReadingsShown: boolean;
}

const hasRuby = (token: Token): boolean => Object.values(token.ruby ?? {}).some((segments) => segments.length > 0);

/** The options' words in one orthography (a choice may mix the support language's text with the target's), judged as one. */
export const choiceWords = (texts: readonly TaggedText[], orthography: string, isNew: WordTest, readingShown: WordTest): ChoiceWords => {
  const words = texts.filter((text) => text.orthography === orthography).flatMap((text) => text.tokens.filter((token) => token.kind === "lexical"));
  return {
    anyNew: words.some((token) => isNew(lexemeIdsOf(token), token.surface)),
    allReadingsShown: words.filter(hasRuby).every((token) => readingShown(lexemeIdsOf(token), token.surface)),
  };
};
