/**
 * Joining words (a profile's `match.joins`): Arabizi's article, written onto its noun or apart, in
 * free forms (the owner's answer 6, 2026-11-23). The conformance vectors (conformance/grade.json,
 * grade/apc-latn/article-…) pin the verdicts in both harnesses; these pin what they cannot: the
 * compiled data, the readings of a word, the course's own grader and the credit a joined answer earns.
 */
import type { OrthographyProfile } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { creditOf } from "../src/learner/credit.ts";
import { allSentences, answerDiff, createGrader, gradeExercise, lexemesById, profileOf, seededRng, type TranslateType } from "../src/lesson/index.ts";
import { makeTranslateType } from "../src/lesson/templates.ts";
import { joinSplits } from "../src/match/join.ts";
import { compileProfile } from "../src/profile/compile.ts";
import { loadCourse } from "./learner-fixtures.ts";

const ORTH = "apc-Latn/arabizi";
const apc = loadCourse("apc", ORTH);
const profile = profileOf(apc, ORTH);
const article = profile.joins?.find((j) => j.id === "article");

describe("a joining word's readings", () => {
  if (article === undefined) throw new Error("apc-Latn/arabizi states no article");
  const reads = (units: readonly string[], doubled = false) => joinSplits(article, units, doubled).map((s) => [s.form, s.head, s.rest]);

  it("reads a word as the article and the word after it, joined or apart", () => {
    expect(reads(["lshay"])).toEqual([["l", "l", "shay"]]);
    expect(reads(["Lshay"])).toEqual([["l", "L", "shay"]]);
    expect(reads(["l", "shay"])).toEqual([["l", "", "shay"]]);
    // Before a sun letter written with two letters, e and the letter again; or the letter single.
    expect(reads(["eshshay"])).toEqual([["e", "e", "shshay"], ["esh", "esh", "shay"]]);
    expect(reads(["es", "salame"])).toEqual([["es", "", "salame"]]);
    // The second word's first letters still the article's: el ssalame, which detach makes of elssalame.
    expect(reads(["el", "ssalame"])).toEqual([["el", "", "ssalame"], ["els", "", "salame"]]);
  });

  it("never reads an empty article, a short word after it, or a letter that is no sun letter doubled", () => {
    expect(reads(["salame"])).toEqual([]);
    expect(reads(["elf"])).toEqual([]);
    expect(reads(["el", "li"])).toEqual([]);
    expect(reads(["ebnen"])).toEqual([]);
  });

  it("reads an accepted word as the article and a word only where its letter is written twice", () => {
    expect(reads(["essalame"], true)).toEqual([["es", "es", "salame"]]);
    expect(reads(["lebnen"], true)).toEqual([]);
    expect(reads(["enta"], true)).toEqual([]);
    // enno (that) is e and a doubled n, but no is too short a word.
    expect(reads(["enno"], true)).toEqual([]);
  });
});

describe("a joining word's statement", () => {
  const base = { id: "apc-Latn/arabizi", lang: "apc-Latn", segmentation: { content: "hand-pinned", runtime: "grapheme" }, normalize: ["nfc"] } as unknown as OrthographyProfile;
  const compiled = (join: unknown) => compileProfile({ ...base, match: { joins: [join as never] } }, { numberingSystems: {}, tables: {}, keyboards: {} });

  it("is refused where {next} stands inside a form, or a form is empty", () => {
    expect(compiled({ id: "article", forms: ["el"], assimilates: { before: "[s]", forms: ["{next}e"] } })).toMatchObject({ ok: false, error: [{ code: "bad-join" }] });
    expect(compiled({ id: "article", forms: ["el", ""] })).toMatchObject({ ok: false, error: [{ code: "bad-join" }] });
    expect(compiled({ id: "article", forms: ["el"], assimilates: { before: "[s", forms: ["e"] } })).toMatchObject({ ok: false, error: [{ code: "bad-join" }] });
  });

  it("is absent from a profile that states none, which grades as before", () => {
    const made = compileProfile(base, { numberingSystems: {}, tables: {}, keyboards: {} });
    expect(made.ok && made.value.joins).toBe(undefined);
  });
});

describe("the article joined, on the apc course", () => {
  const grader = createGrader(apc);
  const s = allSentences(apc).find((x) => x.id === "s.food.11");
  const ex: TranslateType | undefined = s === undefined ? undefined : makeTranslateType({ course: apc, rng: seededRng(1), introduced: [] }, s);
  if (ex === undefined) throw new Error("s.food.11 has no translate-type card");

  it("is a variant, every word of the sentence credited as typed whole", () => {
    // l shay is the accept set's own (it lists el, l and il by hand): an alternative, as before.
    for (const [text, verdict] of [["lshay mni7", "CORRECT_VARIANT"], ["eshshay mni7", "CORRECT_VARIANT"], ["esh shay mni7", "CORRECT_VARIANT"], ["l shay mni7", "CORRECT_ALT"]] as const) {
      const outcome = gradeExercise(ex, { tag: "text", text }, grader);
      expect(outcome, text).toMatchObject({ verdict, labels: [] });
      const credits = creditOf(ex, outcome, apc.profiles, lexemesById(apc)).filter((c) => c.part.startsWith("lexeme:") && c.skill === "produce");
      expect(credits.length, text).toBeGreaterThan(0);
      expect(credits.every((c) => c.status === "right"), text).toBe(true);
    }
  });

  it("is shown as typed: no space between the article and its word", () => {
    const g = grader.grade(ORTH, "(el|l|il) shay (mni7|mnih)", "lshay mni7");
    expect(g.alignment.map((op) => (op.op === "match" ? [op.expected, op.actual, op.joined === true] : op.op))).toEqual([
      ["el", "l", true],
      ["shay", "shay", false],
      ["mni7", "mni7", false],
    ]);
    const diff = answerDiff(g.alignment, { lang: "apc-Latn-LB", orthography: ORTH } as Parameters<typeof answerDiff>[1], " ");
    expect(diff.text.tokens.map((t) => t.surface).join("")).toBe("lshay mni7");
  });

  it("is still wrong left out, added, or before another word", () => {
    expect(grader.grade(ORTH, "el shay mni7", "shay mni7").verdict).toBe("WRONG");
    expect(grader.grade(ORTH, "shay mni7", "lshay mni7").verdict).toBe("WRONG");
    expect(grader.grade(ORTH, "el shay mni7", "lbet mni7").verdict).toBe("WRONG");
  });

  it("is never read in a verb the detach step splits: elbos (I wear) and el3ab (I play) are no article and word", () => {
    // The course stands bos and 3ab only as verbs (its tokens elbos, el3ab): the article goes before none.
    expect(grader.grade(ORTH, "ra7 elbos", "ra7 lbos").verdict).not.toMatch(/^CORRECT/u);
    expect(grader.grade(ORTH, "kent el3ab", "kent l3ab").verdict).not.toMatch(/^CORRECT/u);
    // As before: il and el, which the detach step splits off alike, compare by e/i.
    expect(grader.grade(ORTH, "ra7 elbos", "ra7 ilbos").verdict).toBe("CORRECT_VARIANT");
  });
});
