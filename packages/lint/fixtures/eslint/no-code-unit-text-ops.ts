// Fixture: language data is never measured or indexed by UTF-16 code unit / code point.
import type { RubySegment, TaggedText, Token } from "@nabu/schema";

declare const text: TaggedText;
declare const token: Token;
declare const segment: RubySegment;
declare function surfaceOf(t: TaggedText): string;
declare function graphemeCount(s: string): number;

export const bad = () => [
  token.surface.length, // expect: nabu/no-code-unit-text-ops
  token.surface.charAt(0), // expect: nabu/no-code-unit-text-ops
  token.surface.split(""), // expect: nabu/no-code-unit-text-ops
  [...token.surface], // expect: nabu/no-code-unit-text-ops
  Array.from(segment.base), // expect: nabu/no-code-unit-text-ops
  token.surface[0], // expect: nabu/no-code-unit-text-ops
  surfaceOf(text).slice(0, 3), // expect: nabu/no-code-unit-text-ops
  text.tokens[0]?.surface.codePointAt(0), // expect: nabu/no-code-unit-text-ops
  token.surface.normalize("NFC").length, // expect: nabu/no-code-unit-text-ops
];

export const aliased = () => {
  const s = token.surface;
  const { surface } = token;
  return [s.length, surface.at(-1)]; // expect: nabu/no-code-unit-text-ops, nabu/no-code-unit-text-ops
};

export const good = (id: string) => [
  graphemeCount(token.surface),
  text.tokens.length, // an array of tokens, not text
  id.length, // not language data
  "abc".split(""),
  token.surface.split(" "),
  token.surface.normalize("NFC"),
];
