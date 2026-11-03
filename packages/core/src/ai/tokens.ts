/**
 * Text from a model, as TaggedText (gameplan §13): split into word, number, space, punctuation
 * and symbol tokens by grapheme cluster, so a token never splits a cluster (§6.1) and Persian
 * ZWNJ or Uzbek ʻ stay inside their words. Model text arrives as plain strings; nothing renders
 * language data but <T>, so it is tokenized before it leaves the server. Scripts written without
 * spaces (Han, kana) have no word boundaries to find here: each of their clusters is a token.
 */
import type { TaggedText, Token } from "@nabu/schema";
import { graphemes } from "../text/graphemes.ts";

type Kind = Token["kind"];

const WORDISH = /^(?:[\p{L}\p{M}\u02BB\u02BC]|\u200C|\u200D)+$/u;
const NUMBER = /^\p{Nd}+$/u;
const SPACE = /^\s+$/u;
const PUNCT = /^\p{P}+$/u;
const UNSPACED = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

const kindOf = (cluster: string): Kind =>
  WORDISH.test(cluster) ? "word" : NUMBER.test(cluster) ? "number" : SPACE.test(cluster) ? "space" : PUNCT.test(cluster) ? "punct" : "symbol";

/** Splits text into tokens: runs of word (or number, or space) clusters; each punctuation, symbol, Han or kana cluster alone. */
export const autoTokens = (text: string, base: Pick<TaggedText, "lang" | "orthography">): TaggedText => {
  const tokens: Token[] = [];
  for (const cluster of graphemes(text.normalize("NFC"))) {
    const kind = kindOf(cluster);
    const last = tokens.at(-1);
    const joins = kind === "word" ? !UNSPACED.test(cluster) && last !== undefined && !UNSPACED.test(last.surface) : kind === "number" || kind === "space";
    if (last !== undefined && last.kind === kind && joins) {
      tokens[tokens.length - 1] = { ...last, surface: last.surface + cluster };
    } else {
      tokens.push({ surface: cluster, kind });
    }
  }
  return { ...base, tokens };
};

/** Indexes of the word and number tokens: what `ref` segments and turn checks count. */
export const wordTokenIndexes = (text: TaggedText): readonly number[] => text.tokens.flatMap((t, i) => (t.kind === "word" || t.kind === "number" ? [i] : []));
