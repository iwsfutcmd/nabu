/**
 * A lexeme's forms as the bundle lists them (docs/rules-design.md, stage 4): the lexicon's cells and
 * each lexeme's paradigm, read by grading (`spellingsIn`), by what a word is shown with after its
 * lemma (`principalParts`, the tapped word's meaning, what is logged as seen) and by the Data page.
 * apc is the course whose language has rules; es has none, and nothing of it changes.
 */
import type { TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { lexiconKey } from "../src/index.ts";
import { cellFeats, displayedBefore, displayedWith, lexemeFormKey, lexemesById, lexiconData, paradigmForms, paradigmRows, principalParts, profileOf, sampleExercise, spellingsIn, type CourseView } from "../src/lesson/index.ts";
import { courseGlossary, glossAt, glossLine } from "../src/story/index.ts";
import { surfaceOf } from "../src/text/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

/** The he-present (the owner's answer 1: shown after a verb's he-past). */
const HE_PRESENT = "Aspect=Imp;Gender=Masc;Mood=Ind;Number=Sing;Person=3";

/** The same course with no paradigms: what grading knew before stage 4. */
const withoutParadigms = (course: CourseView): CourseView => {
  const { cells: _cells, ...lexicon } = course.lexicon;
  return { ...course, units: [...course.units], lexicon };
};

describe("apc's paradigms", () => {
  const arab = loadCourse("apc", "apc-Arab/standard");
  const latn = loadCourse("apc", "apc-Latn/arabizi");

  it("list each category's cells, the he-present among a verb's, as its principal part", () => {
    expect(arab.lexicon.principalParts).toEqual({ VERB: [HE_PRESENT] });
    expect(arab.lexicon.cells?.["VERB"]).toContain(HE_PRESENT);
    expect(cellFeats(HE_PRESENT)).toEqual({ Aspect: "Imp", Gender: "Masc", Mood: "Ind", Number: "Sing", Person: "3" });
    // Every lexeme's row has a form for each cell of its category.
    for (const lexeme of arab.lexicon.lexemes) {
      for (const row of Object.values(lexeme.paradigm ?? {})) expect(row.length, lexeme.id).toBe(arab.lexicon.cells?.[lexeme.pos ?? ""]?.length);
    }
  });

  it("show a verb with its he-present after its lemma: a text naming the lexeme and the cell, marked in Arabic script", () => {
    const shereb = lexemesById(arab).get("lexeme:shereb");
    const [part, ...more] = principalParts(arab.lexicon, shereb, arab.orthography);
    expect(more).toEqual([]);
    expect(part?.lang).toBe(shereb?.forms?.[arab.orthography]?.[0]?.lang);
    expect(part?.tokens).toEqual([{ kind: "lexical", surface: "بْيِشْرَب", tileGroup: 0, lexemes: [{ lexeme: "lexeme:shereb", feats: cellFeats(HE_PRESENT) }] }]);
    expect(principalParts(latn.lexicon, lexemesById(latn).get("lexeme:shereb"), latn.orthography).map(surfaceOf)).toEqual(["byeshrab"]);
    // An adjective has paradigms but no principal parts; a noun neither.
    expect(principalParts(arab.lexicon, lexemesById(arab).get("lexeme:kbir"), arab.orthography)).toEqual([]);
    expect(lexemesById(arab).get("lexeme:kbir")?.paradigm).toBeDefined();
    expect(lexemesById(arab).get("lexeme:bet")?.paradigm).toBeUndefined();
  });

  it("let grading know a form no token writes as its lexeme's form in that cell", () => {
    const profile = profileOf(latn, latn.orthography);
    const before = spellingsIn(withoutParadigms(latn), latn.orthography);
    const after = spellingsIn(latn, latn.orthography);
    const unwritten = paradigmForms(latn.lexicon, latn.orthography).filter((f) => !before.words.has(lexiconKey(profile, f.spelling)));
    expect(unwritten.length).toBeGreaterThan(100);
    for (const f of unwritten.slice(0, 50)) {
      const key = lexiconKey(profile, f.spelling);
      expect(after.words.has(key)).toBe(true);
      expect(after.lexemes.get(key)).toContainEqual({ lexeme: f.lexeme, form: lexemeFormKey(f.lexeme, f.feats) });
      expect(after.forms.get(key)?.some((w) => w.pos === f.pos && Object.entries(f.feats).every(([k, v]) => w.feats[k] === v))).toBe(true);
    }
    // What the course writes is known as before.
    for (const [key, forms] of before.lexemes) expect(after.lexemes.get(key)).toEqual(expect.arrayContaining([...forms]));
  });

  it("gloss a tapped verb's lemma with its principal parts", () => {
    const glossary = courseGlossary(latn);
    const shereb = lexemesById(latn).get("lexeme:shereb");
    const lemma = shereb?.forms?.[latn.orthography]?.[0] as TaggedText;
    const glosses = glossAt(latn, glossary, glossLine(latn, glossary, lemma), lemma, 0);
    expect(glosses.find((g) => g.id === "lexeme:shereb")?.principalParts?.map(surfaceOf)).toEqual(["byeshrab"]);
  });

  it("log a principal part shown beside a card as that form, once", () => {
    const ex = sampleExercise(latn, "translate-type.l1-l2", 3);
    if (ex === undefined) throw new Error("no exercise");
    const parts = principalParts(latn.lexicon, lexemesById(latn).get("lexeme:shereb"), latn.orthography);
    const shown = { lexeme: "lexeme:shereb", feats: cellFeats(HE_PRESENT) };
    expect(displayedBefore(latn, ex, { before: parts, after: [] })).toContainEqual(shown);
    expect(displayedBefore(latn, ex)).not.toContainEqual(shown);
    expect(displayedWith(latn, ex, { before: [], after: parts })).toContainEqual(shown);
    expect(displayedWith(latn, ex, { before: parts, after: parts })).not.toContainEqual(shown);
  });

  it("lay out an entry's paradigm on the Data page, a row per cell, a form per orthography", () => {
    const shereb = lexemesById(arab).get("lexeme:shereb");
    if (shereb === undefined) throw new Error("no shereb");
    const rows = paradigmRows(arab.lexicon, shereb);
    expect(rows.map((r) => r.cell)).toEqual(arab.lexicon.cells?.["VERB"]);
    expect(rows.find((r) => r.cell === HE_PRESENT)?.forms["apc-Latn/arabizi"]).toEqual({ spelling: "byeshrab" });
    const row = lexiconData(arab).lexemes.find((r) => r.id.id === "lexeme:shereb");
    const table = row?.course.kind === "record" ? row.course.fields.find((f) => f.key === "paradigm")?.value : undefined;
    expect(table?.kind === "list" ? table.items.length : 0).toBe(rows.length);
  });
});

describe("a course whose language has no rules", () => {
  it("lists no paradigms and grades as before", () => {
    // Toki Pona does not inflect: it has lexical forms and no realisation rules (docs/rules/tok.md).
    const tok = loadCourse("tok");
    expect(tok.lexicon.cells).toBeUndefined();
    expect(paradigmForms(tok.lexicon, tok.orthography)).toEqual([]);
    const verb = tok.lexicon.lexemes.find((l) => l.pos === "VERB");
    expect(verb).toBeDefined();
    expect(principalParts(tok.lexicon, verb, tok.orthography)).toEqual([]);
    // Its grading knows what its tokens write, nothing more.
    expect(spellingsIn(tok, tok.orthography).words).toEqual(spellingsIn(withoutParadigms(tok), tok.orthography).words);
  });
});
