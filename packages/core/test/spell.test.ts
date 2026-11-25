/**
 * Spelling a lexical form (docs/rules-design.md, stage 1): an orthography's `spell` statement run over
 * a lexeme's form (`compileSpeller`, `spell`). conformance/spell.json pins each rule of apc's three
 * statements on a word; these tests hold the statements against apc's whole lexicon, and tie the
 * Arabizi statement's free alternatives to the profile's sound statement: an alternative either
 * compares as the same word under the stated free correspondences (e/i, i/ee, o/u, e/ei, an initial
 * ق, the helping vowel), or, for the article, grades as the same word by the profile's join (`joins`:
 * compared word by word, which a statement of sounds cannot), or is counted below by the variation it
 * took, waiting where the profile cannot take it (question 6). A new kind of alternative, or a count
 * that moves, fails here.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LangTag, LanguageDeclaration, Lexicon, OrthographyId, OrthographyProfile } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { literalAccept } from "../src/accept/notation.ts";
import { profileOf } from "../src/lesson/index.ts";
import { compileSpeller, spell, spelledAs, spellingKey, type Speller } from "../src/lexicon/index.ts";
import { compileAcceptSet, grade } from "../src/match/grade.ts";
import { loadCourse } from "./learner-fixtures.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const read = <T>(path: string): T => parse(readFileSync(join(ROOT, path), "utf8")) as T;
const notation = read<LanguageDeclaration>("lexicons/apc/language.yaml").notation;
const arab = read<OrthographyProfile>("profiles/apc-Arab.standard.yaml");
const latn = read<OrthographyProfile>("profiles/apc-Latn.arabizi.yaml");
const forms = read<Lexicon>("lexicons/apc/lexemes.yaml").lexemes.flatMap((l) => (typeof l.form === "string" ? [{ id: l.id, form: l.form, spelled: l.spelled ?? {} }] : []));

const speller = (profile: OrthographyProfile, layer?: string): Speller => {
  if (notation === undefined) throw new Error("apc declares no notation");
  const made = compileSpeller(profile, notation, layer);
  if (!made.ok) throw new Error(made.error.join("; "));
  return made.value;
};

const FIXTURE: OrthographyProfile = {
  id: "und-Latn/fixture" as OrthographyId,
  lang: "und-Latn" as LangTag,
  segmentation: { content: "hand-pinned", runtime: "grapheme" },
  normalize: [],
  spell: { from: "lexical", rules: [{ find: "e", to: "e", alternatives: [{ id: "e-i", to: "i" }] }] },
};
const FIXTURE_NOTATION = { vowels: { e: "e" }, sets: { C: "[bcdt]" } };

describe("compileSpeller and spell", () => {
  it("says what is wrong with a statement, as a Result", () => {
    const bad = compileSpeller({ ...FIXTURE, spell: { from: "lexical", rules: [{ find: "[a", to: "" }, { find: "{Z}", to: "" }, { find: "a", to: "{C}" }] } }, FIXTURE_NOTATION);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toEqual(["rules[0].find: [a: an unclosed UnicodeSet", "rules[1].find: {Z}: no set named Z", "rules[2].to: {C}: {C} is not in the find"]);
    expect(compileSpeller(FIXTURE, FIXTURE_NOTATION, "vocalized")).toEqual({ ok: false, error: ["und-Latn/fixture has no layer vocalized"] });
  });

  it("gives every rule's `to` first, and each other choice once, by the fewest variations", () => {
    const s = speller(FIXTURE);
    expect(spell(s, "bebe")).toEqual({ spelling: "bebe", alternatives: [{ spelling: "bebi", by: ["e-i"] }, { spelling: "bibe", by: ["e-i"] }, { spelling: "bibi", by: ["e-i"] }] });
    // Past the limit, the spelling is still first, and nothing past it is invented.
    const long = spell(s, "be ".repeat(20).trim());
    expect(long.spelling).toBe("be ".repeat(20).trim());
    expect(long.alternatives.length).toBe(4095);
  });

  it("writes a form as it is where an alphabet's statement has no rules: its notation names no vowel sign", () => {
    const alphabet = compileSpeller({ ...FIXTURE, spell: { from: "lexical", rules: [] } }, { sets: { L: "[a-z]" } });
    expect(alphabet.ok).toBe(true);
    if (alphabet.ok) expect(spell(alphabet.value, "be+de")).toEqual({ spelling: "bede", alternatives: [] });
  });

  it("compares a spelling with the course's as the profile keys a word, a layer exactly", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const z = speller(latn);
    const ahwe = spell(z, "قَهْو\u065cة");
    expect(spelledAs(ahwe, "Ahwe", spellingKey(profileOf(course, "apc-Latn/arabizi")))).toBe("alternative");
    expect(spelledAs(ahwe, "2ahwe", spellingKey(profileOf(course, "apc-Latn/arabizi")))).toBe("spelling");
    // Arabic's shadda is the writer's choice; the marked layer's marks are not.
    const yalla = spell(speller(arab), "يَلَّا");
    expect(spelledAs(yalla, "يلّا", spellingKey(profileOf(course, "apc-Arab/standard")))).toBe("spelling");
    const marked = spell(speller(arab, "vocalized"), "يَلَّا");
    expect(spelledAs(marked, "يَلا", spellingKey(profileOf(course, "apc-Arab/standard"), "vocalized"))).toBeUndefined();
  });
});

describe("apc's statements over its lexicon", () => {
  const arabic = speller(arab);
  const marked = speller(arab, "vocalized");
  const arabizi = speller(latn);

  it("spell every stored form: Arabic with no mark, the marked layer in NFC, Arabizi in its letters alone", () => {
    expect(forms.length).toBeGreaterThan(300);
    for (const { id, form } of forms) {
      const a = spell(arabic, form);
      expect(a.spelling, id).toMatch(/^[\p{Script=Arabic}\s]+$/u);
      expect(a.spelling, id).not.toMatch(/\p{M}/u);
      expect(a.alternatives, id).toEqual([]);
      const m = spell(marked, form);
      expect(m.spelling, id).toBe(m.spelling.normalize("NFC"));
      expect(m.spelling, id).not.toMatch(/[\u065c\u065d\u06df]/u);
      const z = spell(arabizi, form);
      for (const s of [z.spelling, ...z.alternatives.map((x) => x.spelling)]) expect(s, id).toMatch(/^[a-z0-9 ]+$/u);
    }
  });

  it("ties Arabizi's free alternatives to its sound statement: each compares free, or waits on the owner by variation", () => {
    const profile = profileOf(loadCourse("apc", "apc-Arab/standard"), "apc-Latn/arabizi");
    const projection = profile.projection;
    if (projection?.from !== "spelling") throw new Error("apc-Latn reads its sound off its spelling");
    const waiting = new Map<string, number>();
    let free = 0;
    let joined = 0;
    for (const { form } of forms) {
      const z = spell(arabizi, form);
      for (const alternative of z.alternatives) {
        if (projection.compare(z.spelling, alternative.spelling).free) {
          free++;
          continue;
        }
        // The article's forms are the profile's join, read by the grader word by word against the spelling.
        const set = compileAcceptSet(literalAccept(z.spelling), profile);
        if (!set.ok) throw new Error(z.spelling);
        if (alternative.by.includes("article") && grade(set.value, alternative.spelling).verdict === "CORRECT_VARIANT") {
          joined++;
          continue;
        }
        const key = alternative.by.join("+");
        waiting.set(key, (waiting.get(key) ?? 0) + 1);
      }
    }
    // The variations the sound statement states free: their alternatives alone compare free.
    expect(free).toBe(FREE);
    expect(joined).toBe(JOINED);
    expect(Object.fromEntries([...waiting].sort(([a], [b]) => a.localeCompare(b)))).toEqual(WAITING);
  });
});

/**
 * Alternatives that compare free under apc-Latn's correspondences: e/i, which also covers a final
 * long i written e (*fe* for *fi*: the statement's e/i holds wherever the letter stands), and i/ee
 * (stated 2026-11-23, the owner's answer to question 6: 58 alternatives moved up, every one that took
 * i/ee alone or beside e/i and a final e/i); then, the same day, o/u (with ou, so u/ou's moved up
 * too), e/ei, an initial ق written 2 or not, and the helping vowel in a final cluster (130 more).
 * Then 11 fewer (stage 3 of rules in a lexicon): the words the statement spells whole (bus, bas, nos,
 * sa77tein…) have no alternatives, the teens alone end in a silent r, and the clitics (el, b, w, hal)
 * have their forms. Then 40 more: the lexemes of apc's units 21 to 30.
 */
const FREE = 347;
/**
 * Alternatives that took the article's forms (stated 2026-11-23 as the profile's join, `joins`: the
 * owner's answer to question 6) and grade as the same word, word by word: a statement of sounds compares
 * one string with another and never sees the article written apart or onto its noun, so they are
 * counted here, not in FREE. 29 of the 30 that waited; then 96 more (stage 3): kanoun el tene and
 * tishrin el tene spell their article gone into the t (ettene), and its forms (eltene, el tene) are joins.
 */
const JOINED = 125;
/**
 * Alternatives that do not, by the variations they took (an alternative that took several is counted
 * under all of them together). The article waits once: ma3 salame for ma3 essalame writes neither its
 * vowel, its l nor the doubled letter, which is the article left out (the profile says why). The helping vowel waits where the profile leaves it out: before
 * a final t (bent, benet; ekht, ikhet: the past's -t beside its she, -et), in ba3d (ba3ed would compare
 * with ba3id, far) and inside a word (khamsta3shar, a kasra of the stem the spelling cannot tell from it).
 * 3a 2albak waits only here: compared as one string, its albak does not begin it (graded word by word,
 * it is a variant). The two month names with an assimilated article (stage 3) add 13 that leave the
 * article out or write it neither as the spelling nor as a join takes it (kanoun tteni): compiler-only
 * alternatives, never graded. apc's units 21 to 30 add 14 more: final clusters no line of the profile states yet (mel7,
 * forn, sokhn, nafs, dakhl: each waits until a line for it is proved to merge no two forms), ba3d.some's ba3ed, and
 * 2abelma's cluster inside the word.
 */
const WAITING: Readonly<Record<string, number>> = {
  "article": 4,
  "article+e-i": 1,
  "article+e-i+final-e-i": 1,
  "article+e-i+final-e-i+i-ee": 1,
  "article+e-i+i-ee": 1,
  "article+final-e-i": 2,
  "article+final-e-i+i-ee": 1,
  "article+final-e-i+u-ou": 1,
  "article+i-ee": 1,
  "article+u-ou": 1,
  "e-i+helping-vowel": 3,
  "helping-vowel": 19,
  "helping-vowel+o-u": 5,
  "helping-vowel+q-initial": 1,
  "q-initial": 1,
};
