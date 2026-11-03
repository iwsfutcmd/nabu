/**
 * The learner's answer as a TaggedText with the units that differ from the
 * closest accepted answer marked (gameplan §11.6). Units are whole tokens in
 * spaced scripts and grapheme clusters in Han, so a highlight never splits a
 * cursive or conjunct-forming run (§6.8).
 */
import type { TaggedText, Token } from "@nabu/schema";
import type { AlignOp } from "../match/grade.ts";

export interface AnswerDiff {
  readonly text: TaggedText;
  /** Token indexes (into text.tokens) that differ from the accepted answer. */
  readonly marked: readonly number[];
  /** Units of the accepted answer the learner left out. */
  readonly missing: number;
}

export const answerDiff = (alignment: readonly AlignOp[], base: Pick<TaggedText, "lang" | "orthography">, joiner: string): AnswerDiff => {
  const tokens: Token[] = [];
  const marked: number[] = [];
  let missing = 0;
  for (const op of alignment) {
    if (op.op === "delete") {
      missing++;
      continue;
    }
    if (tokens.length > 0 && joiner !== "") tokens.push({ surface: joiner, kind: "space" });
    if (op.op !== "match" || op.kind === "typo") marked.push(tokens.length);
    tokens.push({ surface: op.actual, kind: "word" });
  }
  return { text: { lang: base.lang, orthography: base.orthography, tokens }, marked, missing };
};
