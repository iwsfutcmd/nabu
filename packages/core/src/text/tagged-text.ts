import type { SchemeId, TaggedText, Token } from "@nabu/schema";
import { graphemes } from "./graphemes.ts";

/** The surface text: token surfaces concatenated in logical order. */
export const surfaceOf = (text: TaggedText): string => text.tokens.map((t) => t.surface).join("");

/**
 * Splits a TaggedText into word-bank tiles (gameplan §6.1, §11.6): one
 * TaggedText per `tileGroup`, in order of first appearance. Tokens without a
 * group (spaces, punctuation) are not tiles.
 */
export const tileGroups = (text: TaggedText): readonly TaggedText[] => {
  const groups = new Map<number, Token[]>();
  for (const token of text.tokens) {
    if (token.tileGroup === undefined) continue;
    const group = groups.get(token.tileGroup);
    if (group === undefined) groups.set(token.tileGroup, [token]);
    else group.push(token);
  }
  return [...groups.values()].map((tokens) => ({ ...text, tokens }));
};

export type TextIssue =
  | { readonly code: "not-nfc"; readonly token: number }
  | { readonly code: "splits-grapheme"; readonly token: number }
  | { readonly code: "ruby-mismatch"; readonly token: number; readonly scheme: string }
  | { readonly code: "lexemes-mismatch"; readonly token: number }
  | { readonly code: "variant-not-nfc"; readonly token: number }
  | { readonly code: "lang-outside-orthography" };

const subtags = (tag: string): string[] => tag.split("-");

/**
 * Invariants a JSON Schema cannot express (schemas/tagged-text.schema.json
 * $comment): NFC everywhere, token boundaries on grapheme-cluster boundaries,
 * ruby bases and lexemes' letters that concatenate to their token, and a
 * language tag within the orthography's language. Empty means valid.
 */
export const checkTaggedText = (text: TaggedText): readonly TextIssue[] => {
  const issues: TextIssue[] = [];
  const orthLang = subtags(text.orthography.split("/")[0] ?? "");
  const lang = subtags(text.lang);
  if (orthLang.some((s, i) => lang[i] !== s)) issues.push({ code: "lang-outside-orthography" });

  text.tokens.forEach((token, i) => {
    if (token.surface.normalize("NFC") !== token.surface) issues.push({ code: "not-nfc", token: i });
    for (const [scheme, segments] of Object.entries(token.ruby ?? {})) {
      if (segments.map((s) => s.base).join("") !== token.surface) issues.push({ code: "ruby-mismatch", token: i, scheme });
    }
    // A token that writes several lexemes says which letters are each one's: together, the token.
    // Its only lexeme needs none (the whole token), and a base is marked on one at most.
    const lexemes = token.lexemes ?? [];
    const lettered = lexemes.filter((l) => l.surface !== undefined);
    const several = lexemes.length > 1 || lettered.length > 0;
    if (several && (lettered.length !== lexemes.length || lettered.map((l) => l.surface).join("") !== token.surface)) {
      issues.push({ code: "lexemes-mismatch", token: i });
    } else if (lexemes.filter((l) => l.base === true).length > 1) {
      issues.push({ code: "lexemes-mismatch", token: i });
    }
    if (token.variants?.some((v) => v.normalize("NFC") !== v)) issues.push({ code: "variant-not-nfc", token: i });
  });

  // Every token must end on a grapheme-cluster boundary: each token prefix of the
  // text must also be a cluster prefix. Compared as strings, never by code-unit offsets.
  const clusterPrefixes = new Set<string>();
  let prefix = "";
  for (const cluster of graphemes(surfaceOf(text))) clusterPrefixes.add((prefix += cluster));
  let tokenPrefix = "";
  text.tokens.forEach((token, i) => {
    tokenPrefix += token.surface;
    if (!clusterPrefixes.has(tokenPrefix)) issues.push({ code: "splits-grapheme", token: i });
  });
  return issues;
};

/**
 * A one-token TaggedText for a short surface such as a keyboard key or a
 * special character: `lexical` for letters and marks, `punct` otherwise.
 */
export const textOfSurface = (base: Pick<TaggedText, "lang" | "orthography">, surface: string): TaggedText => ({
  lang: base.lang,
  orthography: base.orthography,
  tokens: [{ surface, kind: /[\p{L}\p{M}\p{N}]/u.test(surface) ? "lexical" : "punct" }],
});

/** Indexes of the lexical and number tokens, in order: what tap-for-gloss and shortcuts address. */
export const wordIndexes = (text: TaggedText): readonly number[] =>
  text.tokens.flatMap((t, i) => (t.kind === "lexical" || t.kind === "number" ? [i] : []));

/** The word or number at a token index as a text of its own (a tapped word), with its readings; none for spaces and punctuation. */
export const wordAt = (text: TaggedText, index: number): TaggedText | undefined => {
  const token = text.tokens[index];
  return token === undefined || (token.kind !== "lexical" && token.kind !== "number") ? undefined : { ...text, tokens: [token] };
};

/** Whether any token of a text carries a reading in a scheme, as ruby (ADR 0071). */
export const hasReading = (text: TaggedText, scheme: SchemeId): boolean => text.tokens.some((t) => (t.ruby?.[scheme]?.length ?? 0) > 0);
