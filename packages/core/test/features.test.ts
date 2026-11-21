/**
 * Feature cards (ADR 0139): a word's reading among the same reading changed in one place the script
 * leaves open, in every way the scheme's data allows there.
 */
import type { SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { askedParts } from "../src/learner/credit.ts";
import { lexemeIdsOf } from "../src/lesson/lexemes.ts";
import { emptyLearnerState, plan } from "../src/learner/index.ts";
import { lessonNodes, sampleExercise, type Exercise } from "../src/lesson/index.ts";
import { homographsOf, otherReadings } from "../src/lesson/index.ts";
import { hasOpenLetters, openLetters, readingFeatures } from "../src/match/pronounce.ts";
import { graphemes } from "../src/text/graphemes.ts";
import { loadCourse } from "./learner-fixtures.ts";

const now = "2026-03-01T08:00:00.000Z";
const text = (t: TaggedText): string => t.tokens.map((x) => x.surface).join("");

/** The feature cards the first lessons plan for a new learner. */
const featureCards = (id: string, reading?: string): Exercise[] => {
  const course = loadCourse(id);
  return lessonNodes(course)
    .slice(0, 15)
    .flatMap(({ node }) => plan(course, emptyLearnerState(), { mode: "lesson", node: node.id }, { now, seed: 3, ...(reading === undefined ? {} : { reading: reading as SchemeId }) }).exercises)
    .filter((ex) => ex.template === "reading-feature");
};

/** The grapheme places where two strings of one length differ. */
const differ = (a: string, b: string): number[] => {
  const ga = graphemes(a.normalize("NFC"));
  const gb = graphemes(b.normalize("NFC"));
  return ga.length !== gb.length ? [-1] : ga.flatMap((g, i) => (g === gb[i] ? [] : [i]));
};

describe("feature cards (ADR 0139)", () => {
  it("a letter the script writes alike, traded for every other of its set (Schluessel)", () => {
    const places = readingFeatures("schluessel", "üzüm", new Set());
    // ü at 0 and 2, z and m in no set.
    expect(places).toHaveLength(2);
    for (const variants of places) for (const v of variants) expect(differ("üzüm", v)).toHaveLength(1);
    expect(places[0]).toEqual(expect.arrayContaining(["özüm", "uzüm", "ozüm"]));
  });

  it("a syllable in each other tone the course attests (Jyutping), a vowel's other tone marks (Pinyin)", () => {
    expect(readingFeatures("jyutping", "ngo5 dei6", new Set(["ngo5", "ngo4", "ngo1", "dei6", "dei2"]))).toEqual([
      ["ngo1 dei6", "ngo4 dei6"],
      ["ngo5 dei2"],
    ]);
    expect(readingFeatures("pinyin", "shàn", new Set())).toEqual([["shā" + "n", "shán", "shǎn"]]);
    // Baxter's x and h: one alternative a place, never a feature card's (two or more).
    expect(readingFeatures("baxter", "dzyenX", new Set()).every((f) => f.length === 1)).toBe(true);
  });

  it("asks one place: every option differs from the answer there alone, and credits the word", () => {
    for (const [id, reading] of [["chg", undefined], ["yue", undefined], ["lzh", undefined]] as const) {
      const cards = featureCards(id, reading);
      expect(cards.length, id).toBeGreaterThan(0);
      for (const ex of cards) {
        if (ex.template !== "reading-feature" || ex.word === undefined) throw new Error("a feature card asks about a word");
        const right = text(ex.options[ex.answer] as TaggedText);
        const places = new Set(ex.options.filter((_, i) => i !== ex.answer).flatMap((o) => differ(right, text(o))));
        // Jyutping's tone is a syllable's last letter; Schluessel's and Pinyin's a letter: one place either way.
        expect(places.size, `${id} ${ex.id}`).toBe(1);
        expect(ex.options.length).toBeGreaterThanOrEqual(3);
        expect(askedParts(ex)).toEqual(lexemeIdsOf(ex.prompt.tokens[ex.word] as never));
      }
    }
  });

  it("none where the script leaves nothing open in two ways: Baxter, and courses without readings", () => {
    expect(featureCards("lzh", "baxter")).toEqual([]);
    expect(sampleExercise(loadCourse("fa"), "reading-feature", 3)).toBeUndefined();
    expect(sampleExercise(loadCourse("tok"), "reading-feature", 3)).toBeUndefined();
  });
});

describe("minimal ruby (ADR 0141)", () => {
  it("keeps what the script leaves unwritten, a dot for each run of the rest", () => {
    expect(openLetters("schluessel", "üzüm")).toBe("ü\u00B7ü\u00B7");
    expect(openLetters("schluessel", "kördüm")).toBe("kö\u00B7ü\u00B7");
    expect(openLetters("jyutping", "ngo5 dei6")).toBe("\u00B75 \u00B76");
    expect(openLetters("pinyin", "shàn")).toBe("\u00B7à\u00B7");
    // A scheme that says nothing of what is unwritten keeps nothing, and offers no such choice.
    expect(openLetters("lasina", "toki")).toBe("");
    expect(hasOpenLetters("lasina")).toBe(false);
    expect(hasOpenLetters("jyutping")).toBe(true);
  });
});

describe("homographs (ADR 0140)", () => {
  it("are spellings the course reads more than one way, case and the maqaf hyphen aside", () => {
    const chg = homographsOf(loadCourse("chg"), "schluessel" as SchemeId);
    expect(chg.get("اوزوم")?.map((r) => r.reading)).toEqual(["üzüm", "özüm"]);
    // ay and Ay are one reading (a capital); not a homograph.
    expect(chg.has("آی")).toBe(false);
    const lzh = homographsOf(loadCourse("lzh"), "pinyin" as SchemeId);
    expect(lzh.get("知")?.map((r) => r.reading)).toEqual(["zhī", "zhì"]);
    expect(lzh.get("知")?.map((r) => r.meaning?.tokens.map((t) => t.surface).join(""))).toEqual(["to know", "wise"]);
    // A Tiberian reading bound by maqaf (wayhî-) is the same word as the free one (wayhî).
    expect([...homographsOf(loadCourse("hbo"), "tiberian" as SchemeId).values()].every((rs) => new Set(rs.map((r) => r.reading.replace(/-$/u, ""))).size === rs.length)).toBe(true);
  });

  it("a word's other readings leave out its own", () => {
    const course = loadCourse("chg");
    const token = { surface: "اوزوم", kind: "lexical" as const, readings: { schluessel: "özüm" } };
    expect(otherReadings(course, "schluessel" as SchemeId, token).map((r) => r.reading)).toEqual(["üzüm"]);
  });
});

describe("spelling choice (ADR 0142)", () => {
  /** The spelling choices the first lessons plan, and the course's sample. */
  const choices = (id: string): Exercise[] => {
    const course = loadCourse(id);
    const sample = sampleExercise(course, "spelling-choice", 3);
    return [...(sample === undefined ? [] : [sample])];
  };

  it("offers a Persian word among itself with a sound-alike letter traded, its marks kept", () => {
    const [ex] = choices("fa");
    if (ex?.template !== "spelling-choice") throw new Error("no spelling choice in fa");
    const right = text(ex.options[ex.answer] as TaggedText);
    for (const [i, o] of ex.options.entries()) {
      if (i === ex.answer) continue;
      const apart = differ(right, text(o));
      expect(apart).toHaveLength(1);
    }
    // The right option is the sentence's own word, credited; the others are no word of it.
    expect(askedParts(ex)?.length).toBeGreaterThan(0);
    expect(ex.reading).toBeUndefined();
  });

  it("offers a Cantonese word with a character the course reads alike, and gives its Jyutping", () => {
    const [ex] = choices("yue");
    if (ex?.template !== "spelling-choice") throw new Error("no spelling choice in yue");
    expect(ex.reading?.lang).toBe("yue-Latn-HK-jyutping");
    for (const o of ex.options) expect(o.tokens.every((t) => t.ruby === undefined && t.readings === undefined)).toBe(true);
  });

  it("none where nothing sounds alike in the profile: courses without sets or homophones", () => {
    for (const id of ["es", "uz", "tok", "chg"]) expect(choices(id), id).toEqual([]);
  });
});
