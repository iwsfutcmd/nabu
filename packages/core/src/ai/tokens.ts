/**
 * Text from a model, as TaggedText (gameplan §13): split into word, number, space, punctuation
 * and symbol tokens by grapheme cluster, so a token never splits a cluster (§6.1) and Persian
 * ZWNJ or Uzbek ʻ stay inside their words. Model text arrives as plain strings; nothing renders
 * language data but <T>, so it is tokenized before it leaves the server. An orthography written
 * without spaces (its profile's units are graphemes: Cantonese, Classical Chinese) has no word
 * boundaries to find here: each of its letter clusters is a word token, as its grader counts them.
 */
import type { TaggedText, Token } from "@nabu/schema";
import type { UnitKind } from "../profile/compile.ts";
import { graphemes } from "../text/graphemes.ts";

type Kind = Token["kind"];

/**
 * What text is tokenized as: its language and orthography, and how that orthography divides text
 * (its compiled profile's `unitKind`; "token", words between spaces, when not given).
 */
export interface TextBase extends Pick<TaggedText, "lang" | "orthography"> {
  readonly unitKind?: UnitKind | undefined;
}

const WORDISH = /^(?:[\p{L}\p{M}\u02BB\u02BC]|\u200C|\u200D)+$/u;
const NUMBER = /^\p{Nd}+$/u;
const SPACE = /^\s+$/u;
const PUNCT = /^\p{P}+$/u;

const kindOf = (cluster: string): Kind =>
  WORDISH.test(cluster) ? "word" : NUMBER.test(cluster) ? "number" : SPACE.test(cluster) ? "space" : PUNCT.test(cluster) ? "punct" : "symbol";

/**
 * Splits text into tokens: runs of number or space clusters, and of word clusters where the
 * orthography's units are words; each punctuation or symbol cluster alone, and each word cluster
 * alone where its units are graphemes.
 */
export const autoTokens = (text: string, base: TextBase): TaggedText => {
  const tokens: Token[] = [];
  const unspaced = base.unitKind === "grapheme";
  for (const cluster of graphemes(text.normalize("NFC"))) {
    const kind = kindOf(cluster);
    const last = tokens.at(-1);
    const joins = kind === "word" ? !unspaced : kind === "number" || kind === "space";
    if (last !== undefined && last.kind === kind && joins) {
      tokens[tokens.length - 1] = { ...last, surface: last.surface + cluster };
    } else {
      tokens.push({ surface: cluster, kind });
    }
  }
  return { lang: base.lang, orthography: base.orthography, tokens };
};

/** Text of an orthography of a course as autoTokens divides it: by its profile's units. */
export const textBase = (profiles: ReadonlyMap<string, { readonly unitKind: UnitKind }>, text: Pick<TaggedText, "lang" | "orthography">): TextBase => ({
  lang: text.lang,
  orthography: text.orthography,
  unitKind: profiles.get(text.orthography)?.unitKind,
});

/** Indexes of the word and number tokens: what `ref` segments and turn checks count. */
export const wordTokenIndexes = (text: TaggedText): readonly number[] => text.tokens.flatMap((t, i) => (t.kind === "word" || t.kind === "number" ? [i] : []));
