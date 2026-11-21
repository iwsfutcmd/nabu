/**
 * Projections (ADR 0148; docs/migration-design.md, "Stages 5 and 6"): the statements the profiles
 * and schemes make, which grading, spelling-choice and reading cards and the compiler's leftovers
 * read. fa's statement replaced ADR 0142's sound-alike sets and the schemes' replaced their
 * `variants` sets: these tests pin what each gives on concrete words (as the removed parity tests
 * proved it gave what those sets gave), and how much of chg's pinned readings Schluessel's
 * statement relates to their spellings.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { OrthographyProfile, ReadingScheme, Token } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { compileProfile } from "../src/profile/compile.ts";
import { readingProjection, readingSchemes } from "../src/profile/schemes.ts";
import { compileProjection, type SpellingProjection } from "../src/project/sound.ts";
import { compileReadingProjection } from "../src/project/reading.ts";
import { profileOf } from "../src/lesson/index.ts";
import { graphemes } from "../src/text/graphemes.ts";
import { loadCourse, manifestOf } from "./learner-fixtures.ts";

const BUNDLES = resolve(import.meta.dirname, "../../../apps/web/public/bundles");

/** Every lexical token of a course's committed bundle written in an orthography (units and lexicon). */
const tokensOf = (course: string, orthography: string): readonly Token[] => {
  const out: Token[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) for (const n of node) walk(n);
    else if (node !== null && typeof node === "object") {
      const o = node as Record<string, unknown>;
      if (o["orthography"] === orthography && Array.isArray(o["tokens"])) for (const t of o["tokens"] as Token[]) if (t.kind === "lexical") out.push(t);
      for (const v of Object.values(o)) walk(v);
    }
  };
  for (const f of manifestOf(course).files) if (f.role === "unit" || f.role === "lexicon") walk(JSON.parse(readFileSync(join(BUNDLES, course, f.path), "utf8")));
  return out;
};

const spellingSide = (course: string, orthography: string): SpellingProjection => {
  const p = profileOf(loadCourse(course), orthography).projection;
  if (p?.from !== "spelling") throw new Error(`${orthography} reads no sound off its spelling`);
  return p;
};

/** A token's pinned reading in a scheme. */
const readingOf = (t: Token, scheme: string): string | undefined => (t.readings as Readonly<Record<string, string>> | undefined)?.[scheme];

describe("the statement compiles", () => {
  const base: OrthographyProfile = { id: "es-Latn/standard", lang: "es-Latn", segmentation: { content: "whitespace", runtime: "grapheme" }, normalize: ["nfc"] } as unknown as OrthographyProfile;
  it("is absent without `sound`", () => {
    const r = compileProfile(base, { numberingSystems: {}, tables: {}, keyboards: {} });
    expect(r.ok && r.value.projection).toBe(undefined);
  });
  it("refuses a correspondence that says nothing and is written as nothing", () => {
    const r = compileProfile({ ...base, sound: { from: "spelling" }, correspondences: [{ says: "", written: [""], kind: "fixed" }] }, { numberingSystems: {}, tables: {}, keyboards: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual([{ code: "bad-correspondence", message: "correspondence 1 says nothing and is written only as nothing" }]);
  });
  it("reads a letter no correspondence names as itself", () => {
    const r = compileProjection({ ...base, sound: { from: "spelling" }, correspondences: [] }, (t) => t, "es");
    expect(r.ok && r.value?.from === "spelling" && r.value.read("ab").sites).toEqual([
      { says: "a", written: "a" },
      { says: "b", written: "b" },
    ]);
  });
  it("in every scheme", () => {
    for (const s of readingSchemes()) expect(() => compileReadingProjection(s)).not.toThrow();
    expect(() => compileReadingProjection({ id: "x", names: { en: { scheme: "x" } }, language: "und", correspondences: [{ says: "", written: [""], kind: "fixed" }] } as unknown as ReadingScheme)).toThrow(/says nothing/);
  });
});

describe("es (Cuban: seseo, yeísmo, b/v, silent h, stress)", () => {
  const es = spellingSide("es", "es-Latn/standard");
  it("tells sounds a mark writes apart", () => {
    for (const [a, b] of [["está", "esta"], ["también", "tambien"], ["tú", "tu"], ["día", "dia"], ["baúl", "baul"], ["pingüino", "pinguino"]] as const) expect(es.compare(a, b).same).toBe(false);
    for (const [a, b] of [["hablo", "háblo"], ["examen", "exámen"]] as const) expect(es.compare(a, b)).toMatchObject({ same: true, free: false });
  });
  it("finds a spelling leftover in many of the course's words, never a word's own spelling", () => {
    const words = [...new Set(tokensOf("es", "es-Latn/standard").map((t) => t.surface.normalize("NFC")))];
    const traded = words.filter((w) => es.spellings(w).length > 0);
    expect(traded.length).toBeGreaterThan(words.length / 3);
    for (const w of words) for (const s of es.spellings(w)) expect(es.compare(w, s)).toMatchObject({ same: true, free: false });
  });
});

describe("fa: ADR 0142's sound-alike letters as fixed correspondences", () => {
  const fa = spellingSide("fa", "fa-Arab/standard");
  const words = [...new Set(tokensOf("fa", "fa-Arab/standard").map((t) => t.surface.normalize("NFC")))];

  it("trades one letter within its set, its marks kept", () => {
    expect(fa.spellings("صد")).toEqual(["سد", "ثد"]);
    expect(fa.spellings("ذهن")).toEqual(["زهن", "ضهن", "ظهن", "ذحن"]);
    expect(fa.spellings("حالا")).toEqual(["هالا"]);
    expect(fa.spellings("سَلام")).toEqual(["صَلام", "ثَلام"]);
    // A letter before a half-space is traded too (ADR 0142's trading, by grapheme, never did).
    expect(fa.spellings("بچه\u200cها")).toEqual(["بچح\u200cها", "بچه\u200cحا"]);
    expect(fa.spellings("مرد")).toEqual([]);
  });

  it("gives the course's words only other spellings of their sound, one letter apart within a set", () => {
    const sets = [["س", "ص", "ث"], ["ز", "ذ", "ض", "ظ"], ["ت", "ط"], ["ه", "ح"], ["ء", "ع"], ["ق", "غ"]];
    const alike = (a: string, b: string): boolean => sets.some((set) => set.includes(a) && set.includes(b));
    expect(words.length).toBeGreaterThan(300);
    let traded = 0;
    for (const w of words) {
      const others = fa.spellings(w);
      if (others.length > 0) traded += 1;
      for (const o of others) {
        expect(fa.compare(w, o)).toMatchObject({ same: true, free: false });
        const [x, y] = [Array.from(w.normalize("NFD")), Array.from(o.normalize("NFD"))];
        expect(x.length).toBe(y.length);
        const apart = x.flatMap((c, i) => (c === y[i] ? [] : [[c, y[i] as string] as const]));
        expect(apart).toHaveLength(1);
        expect(alike(...(apart[0] as readonly [string, string]))).toBe(true);
      }
    }
    expect(traded).toBeGreaterThan(words.length / 4);
  });
});

describe("chg: Schluessel's statement of chg-Arab/standard", () => {
  const scheme = readingProjection("schluessel");
  if (scheme === undefined) throw new Error("no schluessel");
  const pairs = tokensOf("chg", "chg-Arab/standard").flatMap((t) => {
    const r = readingOf(t, "schluessel");
    return r === undefined ? [] : [[t.surface, r] as const];
  });

  it("relates more than 99% of the pinned readings to their spellings", () => {
    const spelled = pairs.filter(([s, r]) => scheme.spells(r, s) !== undefined).length;
    expect(pairs.length).toBeGreaterThan(3000);
    expect(spelled / pairs.length).toBeGreaterThan(0.99);
  });

  it("without a spelling, trades a piece within the sets its correspondences state (as `variants` did)", () => {
    expect(scheme.variants("bardi")).toEqual([
      ["pardi", "ṗardi"],
      ["bärdi", "bārdi", "berdi", "birdi", "burdi", "bürdi"],
      ["barda", "bardä", "bardā", "barde", "bardu", "bardī", "bardà", "bardē", "bardü"],
    ]);
    expect(scheme.variants("Čay")).toEqual([["Jay"], ["Čäy", "Čāy", "Čey", "Čiy", "Čuy", "Čüy"]]);
    expect(scheme.open("bardi")).toBe("ba\u00B7i");
    expect(scheme.open("üzüm")).toBe("ü\u00B7ü\u00B7");
  });

  it("with its spelling, trades only what the letter written there also writes", () => {
    expect(scheme.variants("bardi", "باردی")).toEqual([
      ["pardi", "ṗardi"],
      ["bärdi", "bārdi"],
      ["bardä", "bardā", "barde", "bardī", "bardà", "bardē"],
    ]);
    expect(scheme.variants("üzüm", "اوزوم")).toEqual([
      ["ozüm", "özüm", "uzüm", "ūzüm"],
      ["üzom", "üzöm", "üzum", "üzūm"],
    ]);
  });

  it("with its spelling, trades a subset of what the sets alone trade, and fewer", () => {
    let was = 0;
    let now = 0;
    for (const [s, r] of pairs) {
      const sets = new Set(scheme.letterVariants(r));
      const narrow = scheme.letterVariants(r, s);
      for (const v of narrow) expect(sets.has(v)).toBe(true);
      was += sets.size;
      now += narrow.length;
    }
    expect(now).toBeLessThan(was * 0.6);
  });
});

describe("hbo: the tiberian statement of the consonantal text (its points ignored)", () => {
  const scheme = readingProjection("tiberian");
  if (scheme === undefined) throw new Error("no tiberian");
  const pairs = tokensOf("hbo", "hbo-Hebr/tiberian").flatMap((t) => {
    const r = readingOf(t, "tiberian");
    return r === undefined ? [] : [[t.surface, r] as const];
  });

  it("relates more than 95% of the pinned readings to their spellings", () => {
    const spelled = pairs.filter(([s, r]) => scheme.spells(r, s) !== undefined).length;
    expect(pairs.length).toBeGreaterThan(2000);
    expect(spelled / pairs.length).toBeGreaterThan(0.95);
  });

  it("passes over the points (`ignores`): a pointed and an unpointed spelling take one path", () => {
    const pointed = scheme.spells("bərēʾšîṯ", "ב\u05b0\u05bcר\u05b5אש\u05b4\u05c1ית");
    expect(pointed).toBeDefined();
    expect(scheme.spells("bərēʾšîṯ", "בראשית")).toEqual(pointed);
    // Without `ignores` the same statement accounts for no point.
    const bare = compileReadingProjection({ ...(readingSchemes().find((s) => s.id === "tiberian") as ReadingScheme), ignores: undefined } as unknown as ReadingScheme);
    expect(bare.spells("bərēʾšîṯ", "ב\u05b0\u05bcר\u05b5אש\u05b4\u05c1ית")).toBeUndefined();
  });

  it("leaves nothing open for reading cards (no `loses`)", () => {
    expect(scheme.opens).toBe(false);
  });
});

describe("lzh: Pinyin's and Baxter's sets as statements", () => {
  it("pinyin: a syllable in another tone, one vowel at a time", () => {
    const p = readingProjection("pinyin");
    expect(p?.variants("shàn")).toEqual([["shān", "shán", "shǎn"]]);
    expect(p?.variants("rén yì")).toEqual([
      ["rēn yì", "rěn yì", "rèn yì"],
      ["rén yī", "rén yí", "rén yǐ"],
    ]);
    expect(p?.open("shàn")).toBe("\u00B7à\u00B7");
  });
  it("baxter: x and h traded, a capital kept", () => {
    const b = readingProjection("baxter");
    expect(b?.variants("dzyenX")).toEqual([["dzyenH"]]);
    expect(b?.variants("xjang")).toEqual([["hjang"]]);
    expect(b?.open("hjang")).toBe("h\u00B7");
  });
  for (const scheme of ["pinyin", "baxter"] as const) {
    it(`${scheme}: every reading's variants differ from it in one piece`, () => {
      const p = readingProjection(scheme);
      if (p === undefined) throw new Error(`no ${scheme}`);
      const readings = [...new Set(tokensOf("lzh", "lzh-Hant/standard").flatMap((t) => readingOf(t, scheme) ?? []))];
      expect(readings.length).toBeGreaterThan(100);
      for (const r of readings) for (const v of p.letterVariants(r)) expect(graphemes(v).filter((g, i) => g !== graphemes(r)[i])).toHaveLength(1);
    });
  }
});
