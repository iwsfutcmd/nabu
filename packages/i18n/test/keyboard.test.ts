/**
 * The languages a text field asks the device keyboard for (ADR 0143), best first: the text's own
 * language, then the profile's keyboard (after a Latin keyboard of no language where that keyboard
 * is another language's and the text is Latin), else the macrolanguage, then any keyboard of the
 * script.
 */
import { describe, expect, it } from "vitest";
import { keyboardLanguages } from "../src/index.ts";

describe("keyboardLanguages", () => {
  it("falls back from the text's own language to the keyboard its profile names", () => {
    expect(keyboardLanguages("chg-Arab", "cldr-kbd:fa")).toEqual(["chg", "fa", "und-Arab"]);
    expect(keyboardLanguages("hbo-Hebr", "cldr-kbd:he")).toEqual(["hbo", "he", "und-Hebr"]);
    expect(keyboardLanguages("apc-Arab", "cldr-kbd:ar")).toEqual(["apc", "ar", "und-Arab"]);
    expect(keyboardLanguages("fa-Arab", "cldr-kbd:fa")).toEqual(["fa", "und-Arab"]);
  });

  it("asks a Latin orthography typed on another language's keyboard for a Latin keyboard of no language first", () => {
    expect(keyboardLanguages("tok-Latn", "cldr-kbd:en")).toEqual(["tok", "und-Latn", "en"]);
    expect(keyboardLanguages("chg-Latn", "cldr-kbd:en")).toEqual(["chg-Latn", "und-Latn", "en"]);
    // A romanization: never the Chinese keyboard its language would give.
    expect(keyboardLanguages("yue-Latn-jyutping", "cldr-kbd:en")).toEqual(["yue-Latn-jyutping", "und-Latn", "en"]);
    // English typed on its own keyboard needs no stand-in.
    expect(keyboardLanguages("en", "cldr-kbd:en")).toEqual(["en", "und-Latn"]);
  });

  it("without one, follows the text's language with its macrolanguage in the same script and region", () => {
    expect(keyboardLanguages("yue-Hant-HK")).toEqual(["yue-HK", "zh-Hant-HK", "und-Hant"]);
    expect(keyboardLanguages("lzh-Hant")).toEqual(["lzh", "zh-Hant", "und-Hant"]);
    expect(keyboardLanguages("apc-Latn")).toEqual(["apc-Latn", "ar-Latn", "und-Latn"]);
    // A script that is not the language's own stays, so a Cyrillic field never asks for Latin Uzbek.
    expect(keyboardLanguages("uz-Cyrl")).toEqual(["uz-Cyrl", "und-Cyrl"]);
    expect(keyboardLanguages("es-Latn")).toEqual(["es", "und-Latn"]);
  });

  it("gives nothing for a tag that is no language", () => {
    expect(keyboardLanguages("")).toEqual([]);
    expect(keyboardLanguages("und")).toEqual([]);
    expect(keyboardLanguages("en--US")).toEqual([]);
  });
});
