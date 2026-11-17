/**
 * The languages a text field asks the device keyboard for (ADR 0143): the profile's keyboard, else
 * the text's language and its macrolanguage in the same script, from CLDR's data.
 */
import { describe, expect, it } from "vitest";
import { keyboardLanguages } from "../src/index.ts";

describe("keyboardLanguages", () => {
  it("puts the keyboard a profile names first, then the text's own language", () => {
    expect(keyboardLanguages("fa-Arab", "cldr-kbd:fa")).toEqual(["fa"]);
    expect(keyboardLanguages("hbo-Hebr", "cldr-kbd:he")).toEqual(["he", "hbo"]);
    expect(keyboardLanguages("apc-Arab", "cldr-kbd:ar")).toEqual(["ar", "apc"]);
    // A romanization typed on a Latin keyboard: never the Chinese keyboard its language would give.
    expect(keyboardLanguages("yue-Latn-jyutping", "cldr-kbd:en")).toEqual(["en", "yue-Latn-jyutping"]);
    expect(keyboardLanguages("tok-Latn", "cldr-kbd:en")).toEqual(["en", "tok"]);
  });

  it("without one, follows the text's language with its macrolanguage in the same script and region", () => {
    expect(keyboardLanguages("yue-Hant-HK")).toEqual(["yue-HK", "zh-Hant-HK"]);
    expect(keyboardLanguages("lzh-Hant")).toEqual(["lzh", "zh-Hant"]);
    expect(keyboardLanguages("apc-Arab")).toEqual(["apc", "ar"]);
    // A script that is not the language's own stays, so a Cyrillic field never asks for Latin Uzbek.
    expect(keyboardLanguages("uz-Cyrl")).toEqual(["uz-Cyrl"]);
    expect(keyboardLanguages("es-Latn")).toEqual(["es"]);
    expect(keyboardLanguages("en")).toEqual(["en"]);
  });

  it("gives nothing for a tag that is no language", () => {
    expect(keyboardLanguages("")).toEqual([]);
    expect(keyboardLanguages("en--US")).toEqual([]);
  });
});
