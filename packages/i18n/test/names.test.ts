import { describe, expect, it } from "vitest";
import { courseBlurb, courseName, createTranslator, orthographyHint, orthographyName, pseudoLocalizeText, schemeName, sourceCatalog, toneName, type Named, type SchemeNamesByLanguage } from "../src/index.ts";

const strict = { onError: (e: unknown) => { throw e; } };
const translator = (locale: string) => createTranslator({ locale, catalogs: [sourceCatalog()], ...strict });
const en = translator("en");
const fa = translator("fa");
const draft = { author: "llm:claude@baa6bf1d5e24", status: "draft" } as const;

const yue: Named = {
  id: "yue",
  target: "yue-Hant-HK",
  names: {
    en: { course: "Cantonese", blurb: "Cantonese as Hong Kong speaks it.", orthographies: { "yue-Hant-HK/standard": "Traditional characters" } },
    // Sorted as a compiled manifest is: a language before English.
    ar: { course: "الكانتونية", orthographies: { "yue-Hant-HK/standard": "الرموز التقليدية" }, provenance: draft },
    fa: { course: "کانتونی", orthographies: { "yue-Hant-HK/standard": "نویسه\u200cهای سنتی" }, provenance: draft },
  },
};

describe("course and orthography names are course data (ADR 0109)", () => {
  it("in the UI language, where the course gives one", () => {
    expect(courseName(en, yue)).toBe("Cantonese");
    expect(orthographyName(en, yue, "yue-Hant-HK/standard")).toBe("Traditional characters");
    expect(courseName(fa, yue)).toBe("کانتونی");
    expect(orthographyName(fa, yue, "yue-Hant-HK/standard")).toBe("نویسه\u200cهای سنتی");
    // en-GB inherits en.
    expect(courseName(translator("en-GB"), yue)).toBe("Cantonese");
  });

  it("no UI catalog names a course, an orthography, a reading scheme or a tone", () => {
    const keys = Object.keys(sourceCatalog().messages);
    expect(keys.filter((k) => /^(course\.name|orthography|reading\.scheme)\./.test(k) || (k.startsWith("player.tone.") && k !== "player.tone.label"))).toEqual([]);
  });

  it("else in English, as the app's messages fall back to it; else in the first language the course gives", () => {
    const fr = translator("fr");
    expect(courseName(fr, yue)).toBe("Cantonese");
    expect(orthographyName(fr, yue, "yue-Hant-HK/standard")).toBe("Traditional characters");
    // Field by field: a translation without a blurb leaves the English one.
    expect(courseBlurb(fa, yue)).toBe("Cantonese as Hong Kong speaks it.");
    const nan: Named = { id: "nan", target: "nan-Hant-TW", names: { "nan-Latn": { course: "Tâi-gí", orthographies: { "nan-Latn/poj": "Pe̍h-ōe-jī" } } } };
    expect(courseName(en, nan)).toBe("Tâi-gí");
    expect(orthographyName(fa, nan, "nan-Latn/poj")).toBe("Pe̍h-ōe-jī");
  });

  it("a pseudo-locale shows the English names, pseudo-localized as its messages are", () => {
    const xa = translator("en-XA");
    expect(courseName(xa, yue)).toBe(pseudoLocalizeText("Cantonese", "en-XA"));
    expect(courseName(xa, yue)).not.toBe("Cantonese");
    // ar-XB is English mirrored, not Arabic: never the course's Arabic name.
    const xb = translator("ar-XB");
    expect(courseName(xb, yue)).toBe(pseudoLocalizeText("Cantonese", "ar-XB"));
    expect(orthographyName(xb, yue, "yue-Hant-HK/standard")).toBe(pseudoLocalizeText("Traditional characters", "ar-XB"));
  });

  it("gives the course list's lines from the course too, where it has them", () => {
    const apc: Named = { id: "apc", names: { en: { course: "Lebanese Arabic", blurb: "The Arabic of Lebanon.", hints: { "apc-Latn/arabizi": "Latin letters and digits." } } } };
    expect(courseBlurb(en, apc)).toBe("The Arabic of Lebanon.");
    expect(orthographyHint(fa, apc, "apc-Latn/arabizi")).toBe("Latin letters and digits.");
    expect(orthographyHint(en, apc, "apc-Arab/standard")).toBeUndefined();
    expect(courseBlurb(en, { id: "x" })).toBeUndefined();
  });

  it("else what CLDR calls the language or the script, else the id", () => {
    expect(courseName(en, { id: "cantonese-2", target: "yue-Hant-HK" })).toBe("Cantonese");
    expect(courseName(en, { id: "x-none" })).toBe("x-none");
    expect(orthographyName(en, { id: "uz" }, "uz-Cyrl/standard")).toBe("Cyrillic");
  });
});

describe("reading schemes and their tones are named by their data (ADR 0109)", () => {
  const jyutping: SchemeNamesByLanguage = {
    en: { scheme: "Jyutping", tones: { "1": "high level", "4": "low falling" } },
    "zh-Hant-HK": { scheme: "粵拼", tones: { "1": "高平" }, provenance: draft },
  };

  it("in the UI language where the data gives one, else in English", () => {
    expect(schemeName(en, jyutping)).toBe("Jyutping");
    expect(toneName(en, jyutping, "4")).toBe("low falling");
    const hk = translator("zh-Hant-HK");
    expect(schemeName(hk, jyutping)).toBe("粵拼");
    expect(toneName(hk, jyutping, "1")).toBe("高平");
    expect(toneName(hk, jyutping, "4")).toBe("low falling");
    expect(toneName(en, jyutping, "7")).toBeUndefined();
    expect(schemeName(en, undefined)).toBeUndefined();
  });
});
