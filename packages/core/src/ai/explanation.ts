/**
 * Explain My Answer (gameplan §13.3): the model's segments become language-tagged segments,
 * never free markdown. Support-language prose and quoted target-language material are each
 * TaggedText in their own language, and `ref` segments point at words of the learner's answer,
 * so an English explanation quoting Cantonese renders with the right lang, fonts and bidi
 * isolation in any UI (an Arabic-UI learner included).
 */
import type { Explanation, ExplanationOutput, ExplanationSegment, TaggedText, Token } from "@nabu/schema";
import { err, ok, type Result } from "../result.ts";
import { autoTokens, wordTokenIndexes, type TextBase } from "./tokens.ts";

export interface ExplanationContext {
  readonly support: TextBase;
  readonly target: TextBase;
  /** The learner's answer, as typed or built. */
  readonly answer: string;
  /** The language the answer is in (target for L1→L2, support for L2→L1). */
  readonly answerIn: TextBase;
}

export type ExplanationError = "empty" | "bad-segment" | "bad-ref";

/** The learner's answer as TaggedText, and its words (what `ref` indexes count). */
export const answerText = (ctx: ExplanationContext): { readonly text: TaggedText; readonly words: readonly number[] } => {
  const text = autoTokens(ctx.answer, ctx.answerIn);
  return { text, words: wordTokenIndexes(text) };
};

/** Lines the model can point at: "0: word" per word of the answer. */
export const answerUnitsPrompt = (ctx: ExplanationContext): string => {
  const { text, words } = answerText(ctx);
  return words.map((t, i) => `${i}: ${text.tokens[t]?.surface ?? ""}`).join("\n");
};

/** Validates and converts a model's segments. `ref` indexes words of the answer; they become token indexes. */
export const explanationOf = (output: ExplanationOutput, ctx: ExplanationContext, provenance: Explanation["provenance"]): Result<Explanation, ExplanationError> => {
  const { text: answer, words } = answerText(ctx);
  const segments: ExplanationSegment[] = [];
  for (const s of output.segments) {
    if (s.kind === "ref") {
      const refs = s.answerTokens ?? [];
      if (refs.length === 0 || refs.some((i) => i >= words.length)) return err("bad-ref");
      segments.push({ kind: "ref", answerTokens: refs.map((i) => words[i] as number) });
    } else {
      const text = s.text?.trim();
      if (text === undefined || text === "") return err("bad-segment");
      segments.push({ kind: s.kind, text: autoTokens(text, s.kind === "support" ? ctx.support : ctx.target) });
    }
  }
  if (!segments.some((s) => s.kind === "support")) return err("empty");
  return ok({ segments, answer, provenance });
};

const SPACE: Token = { surface: " ", kind: "space" };

/** The tokens at `indexes`, in order, as TaggedText: what a `ref` segment quotes. A gap between them becomes a space. */
export const excerpt = (text: TaggedText, indexes: readonly number[]): TaggedText => {
  const tokens: Token[] = [];
  let last: number | undefined;
  for (const i of [...new Set(indexes)].sort((a, b) => a - b)) {
    const token = text.tokens[i];
    if (token === undefined) continue;
    if (last !== undefined && i !== last + 1) tokens.push(SPACE);
    tokens.push(token);
    last = i;
  }
  return { ...text, tokens };
};
