/**
 * `spelling-others` (ADR 0142, 0148): the other spellings a spelling card may offer for a word, as
 * the card finds them (@nabu/core `otherSpellings`); the compiler writes a lexeme's spelling leftover
 * from it.
 */
import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/protocol.ts";

const ask = (args: Record<string, unknown>): unknown => {
  const response = handleRequest({ id: 1, op: "spelling-others", ...args });
  if (!response.ok) throw new Error(response.error);
  return response.result;
};

/** A Han token: its characters, each with its Jyutping as ruby. */
const han = (...segments: readonly (readonly [string, string])[]): { surface: string; ruby: { jyutping: { base: string; text: string }[] } } => ({
  surface: segments.map(([base]) => base).join(""),
  ruby: { jyutping: segments.map(([base, text]) => ({ base, text })) },
});

describe("spelling-others", () => {
  it("es: what the profile's statement gives, one spelling enough (hola, casa); a variant of the word is its own", () => {
    expect(ask({ profile: "es-Latn/standard", words: [{ surface: "hola" }, { surface: "casa" }, { surface: "vaca" }] })).toEqual([["ola"], ["caza"], ["baca"]]);
    expect(ask({ profile: "es-Latn/standard", words: [{ surface: "hola", variants: ["ola"] }] })).toEqual([[]]);
    // NFC in, NFC out.
    expect(ask({ profile: "es-Latn/standard", words: [{ surface: "también".normalize("NFD") }] })).toEqual([["tamvién".normalize("NFC")]]);
  });

  it("yue: a character traded for another the course's tokens read alike, segment by segment", () => {
    const tokens = [han(["衫", "saam1"]), han(["三", "saam1"], ["個", "go3"]), han(["山", "saan1"]), han(["衫", "saam1"], ["褲", "fu3"])];
    const words = [han(["衫", "saam1"]), han(["個", "go3"]), han(["三", "saam1"], ["個", "go3"])];
    expect(ask({ profile: "yue-Hant-HK/standard", tokens, words })).toEqual([["三"], [], ["衫個"]]);
  });

  it("yue needs the course's tokens; Jyutping, with no homophones and no sound, has none", () => {
    expect(() => ask({ profile: "yue-Hant-HK/standard", words: [] })).toThrow(/tokens/);
    expect(ask({ profile: "yue-Latn/jyutping", words: [{ surface: "saam1" }] })).toEqual([[]]);
  });
});
