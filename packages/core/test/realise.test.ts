/**
 * Realisation (docs/rules-design.md, sections 2 and 4): the engine's own semantics, beside the
 * vectors of conformance/realise.json (which run in both harnesses). Patterns match letters with
 * their sets of marks and name every boundary; an affix's carrier gives its vowel to the letter it
 * joins; realisation is deterministic, and a rewrite that matches nothing changes nothing.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LanguageDeclaration, Lexicon } from "@nabu/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileLanguage, paradigm, realise, realiseToken, type CompiledLanguage } from "../src/lexicon/index.ts";
import { applyRewrite, compileNotation, compilePattern, textOf, unitsOf, type CompiledRewrite } from "../src/lexicon/realise-pattern.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const FATHA = "َ";
const KASRA = "ِ";
const SUKUN = "ْ";
const SHADDA = "ّ";
const TATWEEL = "ـ";

const PROVENANCE = { author: "llm:claude@rules2-test", status: "draft" } as const;

/** A small language in Arabic script: a perfect with two suffixes, and the rewrites the tests need. */
const DECLARED: LanguageDeclaration = {
  id: "zz",
  license: "CC0-1.0",
  provenance: PROVENANCE,
  dimensions: { VERB: ["Person"] },
  notation: { vowels: { a: FATHA, i: KASRA }, none: SUKUN, long: { a: `${FATHA}ا` }, sets: { K: "[ب-غف-ن]", V: `[${FATHA}${KASRA}]` } },
  rootClasses: [{ id: "doubled", same: [2, 3] }, { id: "sound" }],
  stems: [
    { id: "perfect", form: "I", template: `1${FATHA}2{past}3` },
    { id: "perfect", form: "I", class: "doubled", template: `1${FATHA}2${SHADDA}` },
  ],
  realisation: [
    {
      id: "rule:zz-perfect",
      when: { feats: { Aspect: "Perf" } },
      stem: "perfect",
      blocks: [{ suffix: [{ branch: "1sg", feats: { Person: "1" }, add: "ت" }, { branch: "3fs", feats: { Person: "3", Gender: "Fem" }, add: `${TATWEEL}${KASRA}ت` }, { branch: "3ms", feats: { Person: "3" }, add: "" }] }],
    },
  ],
};

const LEXICON: Lexicon = {
  language: "zz",
  license: "CC0-1.0",
  provenance: PROVENANCE,
  lexemes: [
    { id: "lexeme:katab", pos: "VERB", form: { radicals: ["ك", "ت", "ب"], form: "I", vowels: { past: "a" } } },
    { id: "lexeme:7abb", pos: "VERB", form: { radicals: ["ح", "ب", "ب"], form: "I" } },
  ],
};

const compiled = (declared: LanguageDeclaration = DECLARED, lexicon: Lexicon = LEXICON): CompiledLanguage => {
  const made = compileLanguage(declared, lexicon);
  if (!made.ok) throw new Error(made.error.join("; "));
  return made.value;
};

const formOf = (lang: CompiledLanguage, lexeme: string, cell: Readonly<Record<string, string>>): string => {
  const r = realise(lang, lexeme, cell);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value.form;
};

describe("joining an affix", () => {
  const lang = compiled();
  it("gives a bare letter before a consonant suffix the sign of no vowel", () => {
    expect(formOf(lang, "lexeme:katab", { Aspect: "Perf", Person: "1" })).toBe(`ك${FATHA}ت${FATHA}ب${SUKUN}+ت`.normalize("NFC"));
  });
  it("puts a carrier's vowel on the letter it joins, the boundary after it", () => {
    expect(formOf(lang, "lexeme:katab", { Aspect: "Perf", Person: "3", Gender: "Fem" })).toBe(`ك${FATHA}ت${FATHA}ب${KASRA}+ت`.normalize("NFC"));
  });
  it("adds no boundary for an empty exponent, and records its branch", () => {
    const r = realise(lang, "lexeme:katab", { Aspect: "Perf", Person: "3", Gender: "Masc" });
    expect(r.ok && r.value).toMatchObject({ form: `ك${FATHA}ت${FATHA}ب`.normalize("NFC"), steps: [{ rule: "rule:zz-perfect", branch: "3ms" }] });
  });
  it("chooses the template by the root class the radicals give", () => {
    expect(formOf(lang, "lexeme:7abb", { Aspect: "Perf", Person: "3" })).toBe(`ح${FATHA}ب${SHADDA}`.normalize("NFC"));
  });
  it("reports a template that names a vowel the base lacks", () => {
    const lexicon: Lexicon = { ...LEXICON, lexemes: [{ id: "lexeme:x", pos: "VERB", form: { radicals: ["ك", "ت", "ب"], form: "I" } }] };
    expect(realise(compiled(DECLARED, lexicon), "lexeme:x", { Aspect: "Perf", Person: "3" })).toMatchObject({ ok: false, error: { kind: "template", stem: "perfect", root: "sound" } });
  });
  it("realises every cell of a paradigm, failing ones included", () => {
    const cells = [{ Aspect: "Perf", Person: "1" }, { Aspect: "Imp" }];
    expect(paradigm(lang, "lexeme:katab", cells).map((r) => r.result.ok)).toEqual([true, false]);
  });
  it("takes the token's base and joins the lexemes after it", () => {
    const lexicon: Lexicon = { ...LEXICON, lexemes: [...LEXICON.lexemes, { id: "lexeme:obj", pos: "PRON", allomorphs: [{ form: `${TATWEEL}${FATHA}ك` }] }] };
    const r = realiseToken(compiled(DECLARED, lexicon), [{ lexeme: "lexeme:katab", feats: { Aspect: "Perf", Person: "3" }, base: true }, { lexeme: "lexeme:obj" }]);
    expect(r.ok && r.value.form).toBe(`ك${FATHA}ت${FATHA}ب${FATHA}+ك`.normalize("NFC"));
  });
});

describe("patterns", () => {
  const notation = compileNotation(DECLARED.notation);
  if (!notation.ok) throw new Error("notation");
  const n = notation.value;
  const rewrite = (find: string, to: string): CompiledRewrite => {
    const f = compilePattern(find, n);
    const t = compilePattern(to, n);
    if (!f.ok || !t.ok) throw new Error("pattern");
    return { id: "rule:t", branch: undefined, find: f.value, to: t.value, map: undefined, before: [], after: [], at: undefined };
  };
  const run = (rw: CompiledRewrite, form: string): string => textOf(applyRewrite(rw, unitsOf(form), n).units);

  it("match a letter's marks exactly: none written is no marks", () => {
    expect(run(rewrite("ب", "م"), `بَب`)).toBe(`بَم`);
  });
  it("never skip a boundary the pattern does not name", () => {
    expect(run(rewrite("بت", "مت"), "ب+ت")).toBe("ب+ت");
    expect(run(rewrite("ب+?ت", "م+?ت"), "ب+ت")).toBe("م+ت");
  });
  it("read a set of marks as exactly one of them", () => {
    expect(run(rewrite("{K}{V}", `{K}${SUKUN}`), `ب${KASRA}`)).toBe(`ب${SUKUN}`);
    expect(run(rewrite("{K}{V}", `{K}${SUKUN}`), `ب${SHADDA}${KASRA}`.normalize("NFC"))).toBe(`ب${SHADDA}${KASRA}`.normalize("NFC"));
  });
  it("keep a copied letter's doubling where `to` writes its vowel", () => {
    expect(run(rewrite("{K}*", `{K}${SUKUN}`), `ب${SHADDA}${KASRA}`.normalize("NFC"))).toBe(`ب${SHADDA}${SUKUN}`.normalize("NFC"));
  });
  it("refuse a set the notation lacks", () => {
    expect(compilePattern("{Q}", n).ok).toBe(false);
  });
});

describe("properties", () => {
  const lang = compiled();
  const cell = fc.record({ Aspect: fc.constantFrom("Perf", "Imp"), Person: fc.constantFrom("1", "2", "3"), Gender: fc.constantFrom("Masc", "Fem") });
  it("realisation is deterministic", () => {
    fc.assert(
      fc.property(cell, fc.constantFrom("lexeme:katab", "lexeme:7abb"), (c, lexeme) => {
        expect(realise(lang, lexeme, c)).toEqual(realise(lang, lexeme, c));
      }),
    );
  });
  it("a rewrite that matches nothing changes nothing", () => {
    const notation = compileNotation(DECLARED.notation);
    if (!notation.ok) throw new Error("notation");
    const find = compilePattern("غ", notation.value);
    const to = compilePattern("ق", notation.value);
    if (!find.ok || !to.ok) throw new Error("pattern");
    const rw: CompiledRewrite = { id: "rule:t", branch: undefined, find: find.value, to: to.value, map: undefined, before: [], after: [], at: undefined };
    const letters = fc.array(fc.constantFrom("ب", "ت", "ك", "+", FATHA, KASRA, SUKUN), { maxLength: 12 }).map((xs) => xs.join(""));
    fc.assert(
      fc.property(letters, (form) => {
        const units = unitsOf(form);
        const applied = applyRewrite(rw, units, notation.value);
        expect(applied.matched).toBe(false);
        expect(applied.units).toBe(units);
      }),
    );
  });
});

describe("apc's rules", () => {
  it("compile, with the notation and every pattern", () => {
    const declared = parse(readFileSync(resolve(ROOT, "lexicons/apc/language.yaml"), "utf8")) as LanguageDeclaration;
    const made = compileLanguage(declared, { ...LEXICON, language: "apc", lexemes: [] });
    expect(made.ok ? [] : made.error).toEqual([]);
  });
});

describe("merging lexemes (ADR 0158): a stem chosen by the lexeme that joins", () => {
  const read = (path: string): unknown => parse(readFileSync(resolve(ROOT, path), "utf8")) as unknown;
  const declared = read("lexicons/apc/language.yaml") as LanguageDeclaration;
  const lexicon = read("lexicons/apc/lexemes.yaml") as Lexicon;
  const rules = compileLanguage(declared, lexicon);
  // apc's perfect as lexemes: the perfect (a zero morpheme that takes the perfect stem) and its 1sg and
  // 3fs endings, the 1sg taking the short stem where the verb has one, as rule:apc-perfect's branches do.
  const merging = compileLanguage(
    { ...declared, realisation: [], requires: { VERB: ["Aspect"] } },
    {
      ...lexicon,
      lexemes: [
        ...lexicon.lexemes,
        { id: "lexeme:zz-perf", realises: { Aspect: "Perf" }, on: { pos: ["VERB"] }, requires: ["Person", "Number"], selects: "perfect", allomorphs: [{ form: "" }] },
        { id: "lexeme:zz-perf-1sg", realises: { Person: "1", Number: "Sing" }, on: { has: { Aspect: "Perf" } }, selects: ["perfect-short", "perfect"], allomorphs: [{ form: "ت" }] },
        { id: "lexeme:zz-perf-3ms", realises: { Person: "3", Gender: "Masc", Number: "Sing" }, on: { has: { Aspect: "Perf" } }, allomorphs: [{ form: "" }] },
      ],
    },
  );

  it("gives the lexical form the cell's rules gave, for every verb of the course", () => {
    if (!rules.ok || !merging.ok) throw new Error(JSON.stringify([rules, merging].flatMap((r) => (r.ok ? [] : r.error))));
    const verbs = lexicon.lexemes.filter((l) => l.pos === "VERB" && typeof l.form === "object" && l.form !== null && "radicals" in l.form);
    expect(verbs.length).toBeGreaterThan(20);
    for (const verb of verbs) {
      for (const [ending, cell] of [
        ["lexeme:zz-perf-1sg", { Aspect: "Perf", Person: "1", Number: "Sing" }],
        ["lexeme:zz-perf-3ms", { Aspect: "Perf", Person: "3", Gender: "Masc", Number: "Sing" }],
      ] as const) {
        const before = realise(rules.value, verb.id, cell, { strict: true });
        if (!before.ok) continue;
        const merged = realiseToken(merging.value, [{ lexeme: verb.id, base: true }, { lexeme: "lexeme:zz-perf" }, { lexeme: ending }]);
        expect(merged.ok && merged.value.form.replace(/\+/gu, ""), `${verb.id} ${ending}`).toBe(before.value.form.replace(/\+/gu, ""));
        expect(merged.ok && merged.value.missing).toBeUndefined();
      }
    }
  });
});
