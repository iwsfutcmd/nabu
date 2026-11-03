import { describe, expect, it } from "vitest";
import { negotiateLocale, parseAcceptLanguage, PSEUDO_LOCALES } from "../src/index.ts";

const base = { available: ["en", "en-001", "fa", "zh-Hant", "zh-Hans"], pseudo: PSEUDO_LOCALES, defaultLocale: "en" };

describe("parseAcceptLanguage", () => {
  it("orders by quality, then position", () => {
    expect(parseAcceptLanguage("fa;q=0.5, en-GB;q=0.8, *;q=0.1, ar")).toEqual(["ar", "en-GB", "fa"]);
    expect(parseAcceptLanguage("de;q=0")).toEqual([]);
  });
});

describe("negotiateLocale", () => {
  it("prefers the user's setting over Accept-Language", () => {
    expect(negotiateLocale({ ...base, userSetting: "fa", accepted: "en" })).toMatchObject({ locale: "fa", source: "user" });
  });
  it("walks CLDR parents: en-IN → en-001", () => {
    expect(negotiateLocale({ ...base, accepted: "en-IN" }).locale).toBe("en-001");
  });
  it("uses likely subtags: zh-TW and zh-HK get Traditional, zh-SG gets Simplified", () => {
    expect(negotiateLocale({ ...base, accepted: "zh-TW" }).locale).toBe("zh-Hant");
    expect(negotiateLocale({ ...base, accepted: "zh-HK" }).locale).toBe("zh-Hant");
    expect(negotiateLocale({ ...base, accepted: "zh-SG" }).locale).toBe("zh-Hans");
  });
  it("skips unavailable requests and falls back to the default", () => {
    expect(negotiateLocale({ ...base, accepted: ["de-CH", "fa-AF"] }).locale).toBe("fa");
    expect(negotiateLocale({ ...base, accepted: "de" })).toEqual({ locale: "en", formattingLocale: "en", source: "default" });
  });
  it("keeps -u- extensions for formatting only", () => {
    expect(negotiateLocale({ ...base, userSetting: "fa-IR-u-nu-latn" })).toMatchObject({
      locale: "fa",
      formattingLocale: "fa-u-nu-latn",
    });
  });
  it("selects pseudo-locales only on exact request, never as fallbacks", () => {
    expect(negotiateLocale({ ...base, userSetting: "ar-XB" }).locale).toBe("ar-XB");
    expect(negotiateLocale({ ...base, userSetting: "en-xa" }).locale).toBe("en-XA");
    expect(negotiateLocale({ ...base, available: ["en"], accepted: "ar-EG" }).locale).toBe("en");
    expect(negotiateLocale({ ...base, accepted: "en-US" }).locale).toBe("en");
  });
  it("ignores malformed requests", () => {
    expect(negotiateLocale({ ...base, accepted: ["!!", "fa"] }).locale).toBe("fa");
  });
});
