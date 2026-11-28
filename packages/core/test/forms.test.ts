/**
 * A lexeme's forms, as a tapped word's glossary entry lists them (ADR 0157): its paradigm's cells
 * where the lexicon's rules give it one (apc), else the forms the course writes; each named as the
 * language names it, and the tapped word's own cell found the same way.
 */
import type { TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { lexiconKey } from "../src/index.ts";
import { allSentences, cellFeats, formCellAt, labelOf, lexemeForms, lexemesOf, profileOf, type CourseView } from "../src/lesson/index.ts";
import { allStories } from "../src/story/index.ts";
import { surfaceOf } from "../src/text/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

/** The he-present (the owner's answer 1: shown after a verb's he-past). */
const HE_PRESENT = "Aspect=Imp;Gender=Masc;Mood=Ind;Number=Sing;Person=3";

/** Every token of the course's sentences and story lines, in the learner's orthography, with its text. */
const tokens = function* (course: CourseView): Generator<{ readonly text: TaggedText; readonly at: number }> {
  const lines = allStories(course).flatMap((story) => story.steps.flatMap((step) => step.line?.forms[course.orthography] ?? []));
  for (const text of [...allSentences(course).flatMap((s) => s.forms[course.orthography]?.text ?? []), ...lines]) {
    for (const at of text.tokens.keys()) yield { text, at };
  }
};

const writing = (course: CourseView, lexeme: string): { readonly text: TaggedText; readonly at: number }[] =>
  [...tokens(course)].filter(({ text, at }) => lexemesOf(text.tokens[at] ?? { kind: "space", surface: "" }).some((l) => l.lexeme === lexeme));

const surfaces = (texts: readonly TaggedText[]): readonly string[] => texts.map(surfaceOf);

describe("a lexeme with a paradigm (apc)", () => {
  const arab = loadCourse("apc", "apc-Arab/standard");
  const latn = loadCourse("apc", "apc-Latn/arabizi");

  it("lists every cell of its category, in the lexicon's order, each a text naming the lexeme and the cell", () => {
    const forms = lexemeForms(arab, "lexeme:shereb");
    expect(forms?.source).toBe("paradigm");
    expect(forms?.rows.map((r) => r.cell)).toEqual(arab.lexicon.cells?.["VERB"]);
    for (const row of forms?.rows ?? []) {
      expect(row.texts).toHaveLength(1);
      expect(row.texts[0]?.tokens).toEqual([{ kind: "lexical", surface: expect.any(String) as string, tileGroup: 0, lexemes: [{ lexeme: "lexeme:shereb", feats: cellFeats(row.cell) }] }]);
    }
    // The marked text in Arabic script, as the lemma's own carries its marks; the spelling in Arabizi.
    expect(surfaces(forms?.rows.find((r) => r.cell === HE_PRESENT)?.texts ?? [])).toEqual(["بْيِشْرَب"]);
    expect(surfaces(lexemeForms(latn, "lexeme:shereb")?.rows.find((r) => r.cell === HE_PRESENT)?.texts ?? [])).toEqual(["byeshrab"]);
  });

  it("names each form as the language does, and says which ones the course writes", () => {
    const forms = lexemeForms(latn, "lexeme:shereb");
    const he = forms?.rows.find((r) => r.cell === HE_PRESENT);
    expect(he?.label).toEqual(labelOf(latn, cellFeats(HE_PRESENT), "VERB")?.gloss["en"]);
    expect(surfaceOf(he?.label as TaggedText)).toBe("bi-: he (present)");
    const written = new Set(writing(latn, "lexeme:shereb").map(({ text, at }) => formCellAt(latn, text, at, "lexeme:shereb")));
    expect(written.size).toBeGreaterThan(1);
    for (const row of forms?.rows ?? []) expect(row.attested, row.cell).toBe(written.has(row.cell));
    // The rules give cells no sentence writes.
    expect(forms?.rows.some((r) => !r.attested)).toBe(true);
  });

  it("names a paradigm's form as the language does (es tengo), and keeps the pinned readings of the word the course writes (hbo בֵּן)", () => {
    const es = loadCourse("es");
    const tengo = lexemeForms(es, "lexeme:tener")?.rows.find((r) => r.texts.some((t) => surfaceOf(t) === "tengo"));
    expect(tengo?.attested).toBe(true);
    expect(surfaceOf(tengo?.label as TaggedText)).toBe("present tense: I (yo)");
    const hbo = loadCourse("hbo");
    expect(lexemeForms(hbo, "lexeme:ben")?.source).toBe("paradigm");
    // Full and defective spellings of one reading stay one spelling beside the paradigm's (עֹמֵד, עוֹמֵד: ʿōmēḏ).
    const participle = lexemeForms(hbo, "lexeme:amad")?.rows.find((r) => r.cell === "Gender=Masc;Number=Sing;VerbForm=Part");
    expect(participle?.texts).toHaveLength(1);
    expect(participle?.texts[0]?.tokens[0]?.readings).toBeDefined();
  });

  it("adds the forms the course writes outside the paradigm's cells after them, in the order of the language's labels (ra7's participle)", () => {
    const forms = lexemeForms(latn, "lexeme:ra7");
    const cells = latn.lexicon.cells?.["VERB"] ?? [];
    expect(forms?.rows.slice(0, cells.length).map((r) => r.cell)).toEqual(cells);
    const outside = forms?.rows.slice(cells.length) ?? [];
    expect(outside.length).toBeGreaterThan(0);
    for (const row of outside) {
      expect(row.attested).toBe(true);
      expect(row.feats["Aspect"]).toBe("Part");
    }
  });

  it("finds the cell each token of a verb stands in among its rows", () => {
    const rows = new Set(lexemeForms(arab, "lexeme:shereb")?.rows.map((r) => r.cell));
    const written = writing(arab, "lexeme:shereb");
    expect(written.length).toBeGreaterThan(0);
    for (const { text, at } of written) expect(rows.has(formCellAt(arab, text, at, "lexeme:shereb") ?? "")).toBe(true);
  });

  it("leaves a suffixed pronoun out of the form: بَدّي is badd's بَدّ with 'my'", () => {
    const profile = profileOf(arab, arab.orthography);
    const [badi] = writing(arab, "lexeme:badd").filter(({ text, at }) => lexemesOf(text.tokens[at] as never).some((l) => l.lexeme === "lexeme:poss-1sg"));
    if (badi === undefined) throw new Error("no بدي");
    const token = badi.text.tokens[badi.at];
    const own = lexemesOf(token as never).find((l) => l.lexeme === "lexeme:badd")?.surface ?? "";
    const cell = formCellAt(arab, badi.text, badi.at, "lexeme:badd");
    const row = lexemeForms(arab, "lexeme:badd")?.rows.find((r) => r.cell === cell);
    const keys = surfaces(row?.texts ?? []).map((s) => lexiconKey(profile, s));
    expect(keys).toContain(lexiconKey(profile, own));
    expect(keys).not.toContain(lexiconKey(profile, token?.surface ?? ""));
  });

  it("has no forms for a lexeme written only inside words", () => {
    expect(lexemeForms(arab, "lexeme:poss-1sg")).toBeUndefined();
    expect(lexemeForms(arab, "lexeme:nothing-such")).toBeUndefined();
  });
});

describe("a lexeme with no paradigm: the forms the course writes", () => {
  it("names them as the language does, in the order of its labels (es tener, its lexicon's cells left out)", () => {
    const full = loadCourse("es");
    // es's rules give tener a paradigm; without the lexicon's cells it has none.
    expect(lexemeForms(full, "lexeme:tener")?.source).toBe("paradigm");
    const { cells: _cells, ...lexicon } = full.lexicon;
    const es: CourseView = { ...full, lexicon };
    const forms = lexemeForms(es, "lexeme:tener");
    expect(forms?.source).toBe("written");
    const tengo = forms?.rows.find((r) => r.texts.some((t) => surfaceOf(t) === "tengo"));
    expect(tengo?.feats).toMatchObject({ Mood: "Ind", Number: "Sing", Person: "1", Tense: "Pres" });
    expect(surfaceOf(tengo?.label as TaggedText)).toBe("present tense: I (yo)");
    const labels = es.lexicon.labels ?? [];
    const order = (forms?.rows ?? []).map((r) => {
      const label = labelOf(es, { ...r.feats }, "VERB");
      return label === undefined ? -1 : labels.indexOf(label);
    });
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("lists a form only a sentence's start writes in lower case, as its lemma is (¡Haz!)", () => {
    const es = loadCourse("es");
    const written = writing(es, "lexeme:hacer").map(({ text, at }) => text.tokens[at]?.surface);
    expect(written).toContain("Haz");
    expect(written).not.toContain("haz");
    const all = (lexemeForms(es, "lexeme:hacer")?.rows ?? []).flatMap((r) => surfaces(r.texts));
    expect(all).toContain("haz");
    expect(all).not.toContain("Haz");
  });

  it("takes the values a stem's endings realise as the form's, the whole word its text (uz ichaman, yue 佢哋)", () => {
    const uz = loadCourse("uz", "uz-Latn/standard");
    const ichaman = lexemeForms(uz, "lexeme:ichmoq")?.rows.find((r) => r.texts.some((t) => surfaceOf(t) === "ichaman"));
    expect(ichaman?.feats).toEqual({ Number: "Sing", Person: "1", Tense: "Pres" });
    const yue = loadCourse("yue");
    const forms = lexemeForms(yue, "lexeme:佢");
    expect(forms?.rows.map((r) => r.cell)).toEqual(["", "Number=Plur"]);
    // The whole token, its pinned reading with it.
    const plural = forms?.rows[1]?.texts[0]?.tokens[0];
    expect(plural?.surface).toBe("佢哋");
    expect(plural?.readings?.["jyutping" as never]).toBeDefined();
  });

  it("lists a lexeme the course writes in one form with one row", () => {
    const hbo = loadCourse("hbo");
    expect(lexemeForms(hbo, "lexeme:gan")?.rows).toHaveLength(1);
  });
});

describe("a form written more than one way", () => {
  /** Each way a cell of a lexeme lists, as written. */
  const ways = (course: CourseView, lexeme: string, cell: string): readonly string[] => surfaces(lexemeForms(course, lexeme)?.rows.find((r) => r.cell === cell)?.texts ?? []);

  it("is one spelling where the profile reads both alike: chg's scribes' letters (ʿāliminizlar, written with and without ی)", () => {
    const chg = loadCourse("chg");
    // -iŋizlar is the possessive "your, of several" (poss2pl), the word in the nominative (docs/rules/chg.md).
    const cell = "Case=Nom;Number[psor]=Plur;Person[psor]=2";
    // The course writes it both ways, with one reading.
    const written = writing(chg, "lexeme:alim").filter(({ text, at }) => formCellAt(chg, text, at, "lexeme:alim") === cell);
    const spellings = new Set(written.map(({ text, at }) => text.tokens[at]?.surface.normalize("NFC")));
    const readings = new Set(written.map(({ text, at }) => text.tokens[at]?.readings?.["schluessel" as never]));
    expect(spellings.size).toBeGreaterThan(1);
    expect(readings.size).toBe(1);
    expect(ways(chg, "lexeme:alim", cell)).toHaveLength(1);
  });

  it("is one spelling where only the profile's marks tell them apart (apc's vowel marks, Attic accents)", () => {
    const apc = loadCourse("apc", "apc-Arab/standard");
    for (const lexeme of apc.lexicon.lexemes) for (const row of lexemeForms(apc, lexeme.id)?.rows ?? []) expect(row.texts, `${lexeme.id} ${row.cell}`).toHaveLength(1);
    // ἐστί, ἐστὶ, ἐστι and ἐστίν, ἔστιν: the accent its neighbours give it; the movable ν is another way.
    const grc = loadCourse("grc");
    expect(ways(grc, "lexeme:eimi", "Mood=Ind;Number=Sing;Person=3;Tense=Pres;VerbForm=Fin")).toHaveLength(2);
  });

  it("keeps ways that are other words of the form: es buen beside bueno, sk vo beside v", () => {
    expect(ways(loadCourse("es"), "lexeme:bueno", "Gender=Masc;Number=Sing")).toEqual(["bueno", "buen"]);
    expect(ways(loadCourse("sk"), "lexeme:v", "")).toEqual(["v", "vo"]);
  });

  it("never lists a stem cut before a suffix beside the word itself (hbo בֵּן, not בְּנִ of בְּנִי)", () => {
    const hbo = loadCourse("hbo");
    const [ben, ...more] = lexemeForms(hbo, "lexeme:ben")?.rows.find((r) => r.cell === "Number=Sing")?.texts ?? [];
    expect(more).toEqual([]);
    expect(ben?.tokens[0]?.readings).toBeDefined();
  });

  it("has no forms where the lexeme is a phrase: each of its words is one word of it (buenas tardes)", () => {
    const es = loadCourse("es");
    expect(lexemeForms(es, "lexeme:buenas-tardes")).toBeUndefined();
    expect(lexemeForms(loadCourse("apc", "apc-Arab/standard"), "lexeme:inshalla")).toBeUndefined();
  });
});
