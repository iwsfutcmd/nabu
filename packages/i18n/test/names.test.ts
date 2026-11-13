import type { MessageCatalog } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { courseBlurb, courseName, createTranslator, orthographyHint, orthographyName, sourceCatalog, type Named } from "../src/index.ts";

const strict = { onError: (e: unknown) => { throw e; } };
const en = createTranslator({ locale: "en", catalogs: [sourceCatalog()], ...strict });
/** A UI catalog that translated two names before the courses carried them. */
const fa = createTranslator({
  locale: "fa",
  catalogs: [{ locale: "fa", messages: { "course.name.yue": { message: "کانتونی" }, "orthography.yue-Hant-HK.standard": { message: "حروف سنتی" } } } as unknown as MessageCatalog, sourceCatalog()],
  ...strict,
});

const yue: Named = { id: "yue", target: "yue-Hant-HK", names: { en: { course: "Cantonese", orthographies: { "yue-Hant-HK/standard": "Traditional characters" } } } };

describe("course and orthography names are course data (ADR 0109)", () => {
  it("in the UI language, where the course gives one", () => {
    expect(courseName(en, yue)).toBe("Cantonese");
    expect(orthographyName(en, yue, "yue-Hant-HK/standard")).toBe("Traditional characters");
    // en-GB inherits en.
    const gb = createTranslator({ locale: "en-GB", catalogs: [sourceCatalog()], ...strict });
    expect(courseName(gb, yue)).toBe("Cantonese");
  });

  it("else a UI catalog's translation, while the catalogs still carry one", () => {
    expect(courseName(fa, yue)).toBe("کانتونی");
    expect(orthographyName(fa, yue, "yue-Hant-HK/standard")).toBe("حروف سنتی");
    // The course's own in that language wins over the catalog's.
    expect(courseName(fa, { ...yue, names: { ...yue.names, fa: { course: "زبان کانتونی" } } })).toBe("زبان کانتونی");
  });

  it("else the course's own in its first language: a new course needs no message", () => {
    const xx: Named = { id: "nan", target: "nan-Hant-TW", names: { en: { course: "Taiwanese Hokkien", orthographies: { "nan-Latn/poj": "Pe̍h-ōe-jī" } } } };
    expect(courseName(fa, xx)).toBe("Taiwanese Hokkien");
    expect(orthographyName(fa, xx, "nan-Latn/poj")).toBe("Pe̍h-ōe-jī");
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
