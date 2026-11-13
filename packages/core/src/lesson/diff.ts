/**
 * The learner's answer as a TaggedText with the units that differ from the
 * closest accepted answer marked (gameplan §11.6). Units are whole tokens in
 * spaced scripts and grapheme clusters in Han, so a highlight never splits a
 * cursive or conjunct-forming run (§6.8).
 *
 * What differs (P3, ADR 0121): a unit left out (a gap where it goes), added, replaced or
 * mistyped, or matched only through a fold that raised a note: a missing accent (cancion), a
 * variant character, an IME homophone, marks that make another word (esta for está). Case and
 * the profile's silent folds are no difference.
 */
import type { TaggedText, Token } from "@nabu/schema";
import { compareUnits } from "../match/compare.ts";
import type { AlignOp } from "../match/grade.ts";
import type { CompiledProfile } from "../profile/compile.ts";

export interface AnswerDiff {
  readonly text: TaggedText;
  /** Token indexes (into text.tokens) that differ from the accepted answer. */
  readonly marked: readonly number[];
  /** Units of the accepted answer the learner left out. */
  readonly missing: number;
  /**
   * Where the learner left units out (P3): the token indexes of `text` a gap goes before, one for
   * each run of units left out (text.tokens.length: after the last). In a spaced script a space
   * stands on either side of a gap.
   */
  readonly gaps: readonly number[];
}

/** A part of a diff as a view shows it: a run of its text (its marked tokens counted from the run's start), or a gap. */
export type DiffPart = { readonly tag: "text"; readonly text: TaggedText; readonly marked: readonly number[] } | { readonly tag: "gap" };

/** Whether a unit of the alignment differs from the accepted answer, as feedback marks it. */
const differs = (op: AlignOp): boolean => op.op !== "match" || op.kind === "typo" || op.note !== undefined;

export const answerDiff = (alignment: readonly AlignOp[], base: Pick<TaggedText, "lang" | "orthography">, joiner: string): AnswerDiff => {
  const tokens: Token[] = [];
  const marked: number[] = [];
  const gaps: number[] = [];
  let missing = 0;
  // A gap stands between the words around it: one for a run of units left out.
  let afterGap = false;
  for (const op of alignment) {
    if (op.op === "delete") {
      missing++;
      if (!afterGap) {
        if (tokens.length > 0 && joiner !== "") tokens.push({ surface: joiner, kind: "space" });
        gaps.push(tokens.length);
        afterGap = true;
      }
      continue;
    }
    if ((tokens.length > 0 || afterGap) && joiner !== "") tokens.push({ surface: joiner, kind: "space" });
    afterGap = false;
    if (differs(op)) marked.push(tokens.length);
    tokens.push({ surface: op.actual, kind: "word" });
  }
  return { text: { lang: base.lang, orthography: base.orthography, tokens }, marked, missing, gaps };
};

/** A diff's text cut at its gaps, in order: what a view shows, each run of text and each gap. */
export const diffParts = (diff: AnswerDiff): readonly DiffPart[] => {
  const bounds = [0, ...diff.gaps, diff.text.tokens.length];
  return bounds.slice(1).flatMap((end, i): DiffPart[] => {
    const start = bounds[i] as number;
    const gap: DiffPart[] = i === 0 ? [] : [{ tag: "gap" }];
    if (end === start) return gap;
    const marked = diff.marked.filter((m) => m >= start && m < end).map((m) => m - start);
    return [...gap, { tag: "text", text: { ...diff.text, tokens: diff.text.tokens.slice(start, end) }, marked }];
  });
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
    if (differs(op)) marked.push(tokens.length);
    tokens.push({ surface: op.expected, kind: "word" });
    words += 1;
  }
  tokens.push(...all.slice(end).map(punct));
  return { text: { lang: solution.lang, orthography: solution.orthography, tokens }, marked, missing: 0, gaps: [] };
};

/** The same unit of a text, as grading compares two without a slip: case, and the folds (a vocalization's marks). */
const sameUnit = (profile: CompiledProfile, expected: string, unit: string): boolean => {
  const kind = compareUnits(profile, expected, unit).kind;
  return kind === "exact" || kind === "case" || kind === "fold";
};

/**
 * The words of the solution an answer left out or got wrong, as token indexes of the solution (P3):
 * marked where it shows, so a word left out is seen where it goes (tienes in ¿Tú tienes hambre? for
 * "Tú hambre"). For an answer that lines up with the solution's own wording (`closestIsSolution`).
 * Each word's units, as the profile splits them, must be the alignment's, in order; where they are
 * not (an accept set that spells the wording otherwise), nothing is marked.
 */
export const solutionMarks = (alignment: readonly AlignOp[], solution: TaggedText, profile: CompiledProfile): readonly number[] => {
  const ops = alignment.filter((op) => op.op !== "insert");
  const marked: number[] = [];
  let at = 0;
  for (const [i, token] of solution.tokens.entries()) {
    if (token.kind !== "word" && token.kind !== "number") continue;
    let wrong = false;
    for (const unit of profile.units(profile.normalize(token.surface))) {
      const op = ops[at];
      if (op === undefined || !sameUnit(profile, op.expected, unit)) return [];
      wrong ||= differs(op);
      at += 1;
    }
    if (wrong) marked.push(i);
  }
  return at === ops.length ? marked : [];
};

/** At most this many of an answer's words are explained. */
const MAX_OTHER_WORDS = 3;

/**
 * The units of an answer that stand where the accepted answer has another word, each once, in order,
 * at most three (P3): what feedback says the meaning of, where the course knows them as words.
 * - A slip feedback marks: a typo, or a fold or an IME homophone that raised a note (habla for hablo,
 *   esta for está, a typo that lands on a word). One that makes no word of the course finds none.
 * - In a near miss, a word put in place of another (hablas for hablo, Yo for Tú). An answer far from
 *   every wording is explained by none of its words.
 */
export const otherWordsOf = (alignment: readonly AlignOp[]): readonly string[] => {
  const near = nearMiss(alignment);
  const words = alignment.flatMap((op) => ((op.op === "match" && op.actual !== op.expected && differs(op)) || (near && op.op === "substitute") ? [op.actual] : []));
  return [...new Set(words)].slice(0, MAX_OTHER_WORDS);
};
