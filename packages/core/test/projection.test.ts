/**
 * Projections (ADR 0148; docs/migration-design.md, "Stages 5 and 6"): the statements the profiles
 * and schemes make, checked against what the cards and the grader read today. Nothing reads them
 * yet, so each test pins parity (fa's sound-alike sets, the schemes' variants) or coverage (how much
 * of chg's pinned readings the Schluessel statement relates to their spellings).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { OrthographyProfile, ReadingScheme, Token } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { letterVariants, openLetters, readingFeatures } from "../src/match/pronounce.ts";
import { compileProfile, type CompiledProfile } from "../src/profile/compile.ts";
import { readingProjection, readingSchemes } from "../src/profile/schemes.ts";
import { compileProjection, type SpellingProjection } from "../src/project/sound.ts";
import { compileReadingProjection } from "../src/project/reading.ts";
import { profileOf } from "../src/lesson/index.ts";
import { graphemes } from "../src/text/graphemes.ts";
import { loadCourse, manifestOf } from "./learner-fixtures.ts";

/**
 * The grader's sound-alike test before ADR 0148 (removed from match/grade.ts when grading came to
 * read the statement), kept here as the reference the statement is checked against: whether two
 * words differ only in letters of the profile's `soundAlike` sets, at least one, compared as the
 * profile's letters, case folded and marks stripped.
 */
const soundAlikeOnly = (profile: CompiledProfile, expected: string, actual: string): boolean => {
  const sets = profile.soundAlike;
  if (sets === undefined) return false;
  const plain = (t: string): string => (profile.marks?.strip(profile.fold(t)) ?? profile.fold(t)).normalize("NFC");
  const e = profile.letters(plain(expected));
  const a = profile.letters(plain(actual));
  if (e.length !== a.length) return false;
  let apart = 0;
  for (const [i, letter] of e.entries()) {
    const other = a[i] as string;
    if (letter === other) continue;
    if (!sets.alike(letter, other)) return false;
    apart += 1;
  }
  return apart > 0;
};

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

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

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

describe("fa: the statement is ADR 0142's sound-alike sets", () => {
  const course = loadCourse("fa");
  const profile = profileOf(course, "fa-Arab/standard");
  const fa = spellingSide("fa", "fa-Arab/standard");
  const alike = profile.soundAlike;
  if (alike === undefined) throw new Error("fa states sound-alike sets");
  // Today's trading (lesson/templates.ts soundAlikeSpellings, its letter half): one grapheme at a time, marks kept.
  const today = (surface: string): readonly string[] => {
    const word = surface.normalize("NFC");
    const out: string[] = [];
    const letters = graphemes(word);
    letters.forEach((g, i) => {
      const bare = profile.marks?.strip(g) ?? g;
      const marks = g.normalize("NFD").slice(bare.normalize("NFD").length);
      for (const other of alike.others(bare)) {
        const s = letters.map((x, k) => (k === i ? `${other}${marks}` : x)).join("").normalize("NFC");
        if (s !== word && !out.includes(s)) out.push(s);
      }
    });
    return out;
  };
  const words = [...new Set(tokensOf("fa", "fa-Arab/standard").map((t) => t.surface.normalize("NFC")))];

  it("gives every spelling today's trading gives, and more only before a half-space", () => {
    let equal = 0;
    for (const w of words) {
      const was = today(w);
      const now = fa.spellings(w);
      expect(sorted(now)).toEqual(expect.arrayContaining(sorted(was)));
      const extra = now.filter((s) => !was.includes(s));
      // Today a letter clustered with the half-space after it (the he of bachche-ha) is never traded.
      for (const s of extra) {
        const at = graphemes(w).findIndex((g, i) => g !== graphemes(s)[i]);
        expect(graphemes(w)[at]).toMatch(/\u200C$/u);
      }
      if (extra.length === 0) equal += 1;
    }
    expect(words.length).toBeGreaterThan(300);
    expect(words.length - equal).toBeLessThanOrEqual(3);
  });

  it("compares as soundAlikeOnly does on those pairs", () => {
    for (const w of words) {
      const was = today(w);
      for (const s of was) {
        expect(soundAlikeOnly(profile, w, s)).toBe(true);
        expect(fa.compare(w, s)).toMatchObject({ same: true, free: false });
      }
      // The spellings only the statement finds: the same sound; today's check reads the letter with its half-space.
      for (const s of fa.spellings(w).filter((x) => !was.includes(x))) {
        expect(fa.compare(w, s)).toMatchObject({ same: true, free: false });
        expect(soundAlikeOnly(profile, w, s)).toBe(false);
      }
    }
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

  it("without a spelling, opens what the scheme's variants open today", () => {
    for (const [, r] of pairs) {
      expect(scheme.variants(r)).toEqual(readingFeatures("schluessel", r, new Set()));
      expect(scheme.letterVariants(r)).toEqual(letterVariants("schluessel", r));
      expect(scheme.open(r)).toBe(openLetters("schluessel", r));
    }
  });

  it("with its spelling, trades only what today's variants trade, and fewer", () => {
    let was = 0;
    let now = 0;
    for (const [s, r] of pairs) {
      const today = new Set(letterVariants("schluessel", r));
      const narrow = scheme.letterVariants(r, s);
      for (const v of narrow) expect(today.has(v)).toBe(true);
      was += today.size;
      now += narrow.length;
    }
    expect(now).toBeLessThan(was * 0.6);
  });
});

describe("lzh: Pinyin's and Baxter's sets as statements", () => {
  for (const scheme of ["pinyin", "baxter"] as const) {
    it(`${scheme}: what today's variants give, for every reading`, () => {
      const p = readingProjection(scheme);
      if (p === undefined) throw new Error(`no ${scheme}`);
      const readings = [...new Set(tokensOf("lzh", "lzh-Hant/standard").flatMap((t) => readingOf(t, scheme) ?? []))];
      expect(readings.length).toBeGreaterThan(100);
      for (const r of readings) {
        expect(p.variants(r)).toEqual(readingFeatures(scheme, r, new Set()));
        expect(p.letterVariants(r)).toEqual(letterVariants(scheme, r));
        expect(p.open(r)).toBe(openLetters(scheme, r));
      }
    });
  }
});
