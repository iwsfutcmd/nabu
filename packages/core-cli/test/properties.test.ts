/**
 * Property tests (gameplan §15) over the real, compiled profiles:
 * - normalization is idempotent;
 * - grading is invariant under NFC vs NFD input;
 * - the lattice always contains the canonical answer (and every listed alternative);
 * - the alignment conserves the answer's units;
 * - grading is deterministic.
 */
import { compileAcceptSet, grade, type CompiledProfile } from "@nabu/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadProfiles } from "../src/load.ts";

const profiles = loadProfiles();
const p = (id: string): CompiledProfile => profiles.get(id)!;
const cp = (...codes: number[]): string => String.fromCodePoint(...codes);

/** Characters that stress each pipeline: letters, marks, digits of several systems, punctuation, spaces, format controls. */
const NOISE = [
  " ", "  ", "\t", cp(0xa0), cp(0x3000), ",", ".", "!", "?", "'", cp(0x2018), cp(0x2019), "`", "-", "«", "»", cp(0x61f), cp(0x60c),
  cp(0xff01), cp(0xff0c), cp(0x3002), cp(0x200c), cp(0x200d), cp(0x200e), cp(0x200f), cp(0x202b), cp(0x2067), cp(0x2069), cp(0x640),
  "0", "7", cp(0x664), cp(0x6f4), cp(0xff13), cp(0xfefb), cp(0xfed9), cp(0xfb8e), cp(0x301), cp(0x64e), cp(0x651), cp(0xf900),
];
const ALPHABETS: Readonly<Record<string, string>> = {
  "fa-Arab/standard": "کتابهاروییمزستندكيى",
  "ar-Arab/standard": "أإآاكلتفحةهىيشرب",
  "apc-Arab/standard": "شوبدكتالیمڤفپ",
  "yue-Hant-HK/standard": "我哋去飲茶啦係系裏裡着著饮们早晨呀ＯＫ",
  "uz-Latn/standard": `MenozbktilaryapgOGshch${cp(0x2bb)}${cp(0x2bc)}`,
  "uz-Cyrl/standard": "МенўзбектилиганяпқғҳУ",
  "tg-Cyrl/standard": "Манҳарӯзкормеунҷхру",
  "tr-Latn/standard": "İIıistanbuldaşyorumâğ",
  "apc-Latn/arabizi": "shubadktelomy2378SHU",
};

const textFor = (id: string) =>
  fc
    .array(fc.oneof(fc.constantFrom(...Array.from(ALPHABETS[id] as string)), fc.constantFrom(...NOISE)), { maxLength: 24 })
    .map((parts) => parts.join(""));

const SENTENCES: Readonly<Record<string, string>> = {
  "fa-Arab/standard": `کتاب${cp(0x200c)}ها روی میز هستند`,
  "ar-Arab/standard": "أكلت التفاحة",
  "apc-Arab/standard": "شو بدّك تاكل اليوم",
  "yue-Hant-HK/standard": "我哋去飲茶[啦]",
  "uz-Latn/standard": "[Men] o'zbek tilini o'rganyapman",
  "uz-Cyrl/standard": "Мен ўзбек тилини ўрганяпман",
  "tg-Cyrl/standard": "Ман ҳар рӯз кор мекунам",
  "tr-Latn/standard": "İstanbul'da yaşıyorum",
  "apc-Latn/arabizi": "shu baddak tekol el yom",
};

describe.each(Object.keys(SENTENCES))("%s", (id) => {
  const profile = p(id);
  const set = compileAcceptSet(SENTENCES[id] as string, profile);
  if (!set.ok) throw new Error(JSON.stringify(set.error));

  it("normalization is idempotent", () => {
    fc.assert(
      fc.property(textFor(id), (s) => {
        const once = profile.normalize(s);
        expect(profile.normalize(once)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("grading is invariant under NFC vs NFD input", () => {
    fc.assert(
      fc.property(textFor(id), (s) => {
        const a = grade(set.value, s.normalize("NFC"));
        const b = grade(set.value, s.normalize("NFD"));
        expect([b.verdict, b.notes, b.matched]).toEqual([a.verdict, a.notes, a.matched]);
      }),
      { numRuns: 200 },
    );
  });

  it("the alignment conserves the answer's units, and grading is deterministic", () => {
    fc.assert(
      fc.property(textFor(id), (s) => {
        const g = grade(set.value, s);
        const actual = g.alignment.flatMap((op) => (op.op === "delete" ? [] : [op.actual]));
        expect(actual).toEqual(profile.units(profile.normalize(s)));
        expect(grade(set.value, s)).toEqual(g);
      }),
      { numRuns: 200 },
    );
  });

  it("every listed alternative is accepted with cost 0, the canonical one as CORRECT", () => {
    for (const alt of set.value.lattice.alternatives) {
      const g = grade(set.value, alt.source);
      expect(g.cost).toBe(0);
      if (alt.canonical && alt.flags.length === 0) expect(g.verdict).toBe("CORRECT");
    }
  });
});

describe("generated accept sets", () => {
  const uz = p("uz-Latn/standard");
  const yue = p("yue-Hant-HK/standard");
  /** Random notation from a fixed vocabulary, shallow enough to stay within a few dozen alternatives. */
  const notation = (words: readonly string[], sep: string): fc.Arbitrary<string> =>
    fc
      .letrec<{ seq: string; item: string }>((tie) => ({
        seq: fc.array(tie("item"), { minLength: 1, maxLength: 3 }).map((items) => items.join(sep)),
        item: fc.oneof(
          { depthSize: "xsmall", maxDepth: 3 },
          fc.constantFrom(...words),
          fc.array(tie("seq"), { minLength: 2, maxLength: 3 }).map((alts) => `(${alts.join("|")})`),
          tie("seq").map((s) => `[${s}]`),
        ),
      }))
      .seq.map((s) => `${words[0] as string}${sep}${s}`);

  it.each([
    ["uz-Latn (tokens)", uz, notation(["men", "kitob", "daftar", "oldim", "va", "o'qidim"], " ")],
    ["yue-Hant-HK (graphemes)", yue, notation(["我", "哋", "去", "飲茶", "啦", "早晨"], "")],
  ] as const)("%s: the canonical answer is always CORRECT, every alternative accepted", (_name, profile, arb) => {
    fc.assert(
      fc.property(arb, (source) => {
        const set = compileAcceptSet(source, profile);
        if (!set.ok || set.value.lattice.alternatives.length > 64) return;
        const canonical = set.value.lattice.alternatives.find((a) => a.canonical)!;
        expect(grade(set.value, canonical.source).verdict).toBe("CORRECT");
        for (const alt of set.value.lattice.alternatives) expect(["CORRECT", "CORRECT_ALT"]).toContain(grade(set.value, alt.source).verdict);
      }),
      { numRuns: 150 },
    );
  });
});
