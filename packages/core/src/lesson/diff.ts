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

/**
 * The accepted answer the learner's lines up with, the units they left out or got wrong marked:
 * what to show as the answer when it is another wording than the solution (they wrote 我嘅書邊度呀
 * and 我嘅書喺邊度呀 is the nearest, 喺 marked). Its trailing punctuation is the solution's, which the
 * alignment leaves out.
 */
export const closestAnswer = (alignment: readonly AlignOp[], solution: TaggedText, joiner: string): AnswerDiff => {
  const tokens: Token[] = [];
  const marked: number[] = [];
  for (const op of alignment) {
    if (op.op === "insert") continue;
    if (tokens.length > 0 && joiner !== "") tokens.push({ surface: joiner, kind: "space" });
    if (op.op !== "match" || op.kind === "typo") marked.push(tokens.length);
    tokens.push({ surface: op.expected, kind: "word" });
  }
  const last = solution.tokens.at(-1);
  if (last !== undefined && last.kind === "punct") tokens.push({ surface: last.surface, kind: "punct" });
  return { text: { lang: solution.lang, orthography: solution.orthography, tokens }, marked, missing: 0 };
};
