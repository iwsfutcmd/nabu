/**
 * Italics by script: only the scripts with an italic style in print may be slanted (Latin, Cyrillic,
 * Greek, Armenian); every other is set upright. Read from the language tag's script, as direction is.
 */
import { describe, expect, it } from "vitest";
import { italicAllowed } from "../src/index.ts";

describe("italicAllowed", () => {
  it("allows italics in scripts that have them, by the tag's explicit or likely script", () => {
    for (const tag of ["en", "es-Latn-CU", "uz-Latn", "tok-Latn", "ru", "el", "grc", "hy", "chg-Latn"]) expect(italicAllowed(tag), tag).toBe(true);
  });

  it("keeps every other script upright", () => {
    for (const tag of ["ar", "fa", "apc-Arab", "chg-Arab", "he", "hbo", "zh-Hant", "yue-Hant-HK", "lzh", "ja", "ko", "hi", "th", "tok-Qaap", "ar-XB"]) expect(italicAllowed(tag), tag).toBe(false);
  });
});
