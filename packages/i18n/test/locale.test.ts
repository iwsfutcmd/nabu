import { describe, expect, it } from "vitest";
import { asciiLowercase, cldrLocaleId, maximize, parentChain, parseTag, sameLocale } from "../src/index.ts";

describe("parseTag", () => {
  it("canonicalizes case and splits subtags", () => {
    expect(parseTag("YUE-hant-hk")).toEqual({ language: "yue", script: "Hant", region: "HK", variants: [], extensions: [] });
    expect(parseTag("fa-IR-u-nu-latn")).toEqual({ language: "fa", region: "IR", variants: [], extensions: ["u-nu-latn"] });
    expect(parseTag("yue-Latn-jyutping")).toMatchObject({ script: "Latn", variants: ["jyutping"] });
    expect(parseTag("es-419")).toMatchObject({ region: "419" });
  });
  it("rejects garbage", () => {
    expect(() => parseTag("arabic")).not.toThrow(); // 5–8 letters is a (registered-language) subtag
    expect(() => parseTag("a")).toThrow(RangeError);
    expect(() => parseTag("en--US")).toThrow(RangeError);
  });
});

describe("maximize (CLDR likely subtags)", () => {
  it.each([
    ["fa", "fa-Arab-IR"],
    ["yue", "yue-Hant-HK"],
    ["uz", "uz-Latn-UZ"],
    ["uz-Cyrl", "uz-Cyrl-UZ"],
    ["apc", "apc-Arab-SY"],
    ["zh-TW", "zh-Hant-TW"],
    ["en-XA", "en-Latn-XA"],
    ["ar-XB", "ar-Arab-XB"],
    ["und-IR", "fa-Arab-IR"],
    ["fa-u-nu-latn", "fa-Arab-IR-u-nu-latn"],
  ])("%s → %s", (tag, expected) => expect(maximize(tag)).toBe(expected));

  it.each(["fa", "yue", "uz", "uz-Cyrl", "zh-TW", "ar-XB", "en-XA", "ckb", "pa-PK", "sr", "mn"])(
    "agrees with this engine's Intl.Locale#maximize for %s",
    (tag) => expect(maximize(tag)).toBe(new Intl.Locale(tag).maximize().toString()),
  );
});

describe("CLDR parent chains", () => {
  it.each([
    ["en-IN", ["en-IN", "en-001", "en", "und"]],
    ["en-Latn-IN", ["en-IN", "en-001", "en", "und"]],
    ["es-AR", ["es-AR", "es-419", "es", "und"]],
    ["zh-TW", ["zh-Hant-TW", "zh-Hant", "und"]],
    ["zh-HK", ["zh-Hant-HK", "zh-Hant", "und"]],
    ["uz-Cyrl-UZ", ["uz-Cyrl-UZ", "uz-Cyrl", "und"]],
    ["uz-Latn-UZ", ["uz-UZ", "uz", "und"]],
    ["pa-PK", ["pa-Arab-PK", "pa-Arab", "und"]],
    ["yue-Hant-HK", ["yue-HK", "yue", "und"]],
    ["en", ["en", "und"]],
  ])("%s", (tag, chain) => expect(parentChain(tag)).toEqual(chain));

  it("drops extensions", () => expect(cldrLocaleId("fa-IR-u-nu-latn")).toBe("fa-IR"));
});

describe("sameLocale", () => {
  it("compares after likely-subtag expansion", () => {
    expect(sameLocale("zh-TW", "zh-Hant")).toBe(true);
    expect(sameLocale("zh-TW", "zh-Hans")).toBe(false);
    expect(sameLocale("en", "en-US")).toBe(true);
    expect(sameLocale("uz", "uz-Cyrl")).toBe(false);
  });
});

describe("ASCII case mapping", () => {
  it("leaves non-ASCII alone (Turkish İ/ı are not identifiers)", () => {
    expect(asciiLowercase("TR-Latn İ")).toBe("tr-latn İ");
  });
});
