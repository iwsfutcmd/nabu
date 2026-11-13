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
 * Whether an answer is a near miss of the accepted wording it lines up with: some of that wording's
 * units are in it, and they make up at least half of the wording and of the answer. Only then does
 * the wording explain the answer (我嘅書邊度呀 for 我嘅書喺邊度呀). Any answer, even a nonsense one, lines
 * up with some wording, which then says nothing about it.
 */
export const nearMiss = (alignment: readonly AlignOp[]): boolean => {
  const matched = alignment.filter((op) => op.op === "match").length;
  const expected = alignment.filter((op) => op.op !== "insert").length;
  const answered = alignment.filter((op) => op.op !== "delete").length;
  return matched > 0 && 2 * matched >= Math.max(expected, answered);
};

/**
 * The accepted answer the learner's lines up with, the units they left out or got wrong marked:
 * what to show beside the solution when it is another wording (they wrote 我嘅書邊度呀 and
 * 我嘅書喺邊度呀 is the nearest, 喺 marked). The alignment has no punctuation: the wording takes the
 * solution's at either end (¿Tienes hambre? beside ¿Tú tienes hambre?), and keeps its own casing.
 */
export const closestAnswer = (alignment: readonly AlignOp[], solution: TaggedText, joiner: string): AnswerDiff => {
  const all = solution.tokens;
  let start = 0;
  while (start < all.length && all[start]?.kind === "punct") start += 1;
  let end = all.length;
  while (end > start && all[end - 1]?.kind === "punct") end -= 1;
  const punct = (t: Token): Token => ({ surface: t.surface, kind: "punct" });
  const tokens: Token[] = all.slice(0, start).map(punct);
  const marked: number[] = [];
  let words = 0;
  for (const op of alignment) {
    if (op.op === "insert") continue;
    if (words > 0 && joiner !== "") tokens.push({ surface: joiner, kind: "space" });
    if (op.op !== "match" || op.kind === "typo") marked.push(tokens.length);
    tokens.push({ surface: op.expected, kind: "word" });
    words += 1;
  }
  tokens.push(...all.slice(end).map(punct));
  return { text: { lang: solution.lang, orthography: solution.orthography, tokens }, marked, missing: 0 };
};
