import type { TaggedText, Token } from "@nabu/schema";

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
