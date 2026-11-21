/**
 * A course laid out for browsing (`courseData`): every word, form, letter and sentence of every
 * fixture course is listed once, with what the course says of it, and the lists are searched as the
 * word list is.
 */
import { describe, expect, it } from "vitest";
import { allLexemes, allSentences, baseIdOf, bound, courseData, dataMatcher, sentencePersons, textMatcher } from "../src/lesson/index.ts";
import { labelId } from "../src/lesson/templates.ts";
import { surfaceOf } from "../src/text/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

const COURSES: readonly (readonly [string, string])[] = [
  ["apc", "apc-Arab/standard"],
  ["apc", "apc-Latn/arabizi"],
  ["chg", "chg-Arab/standard"],
  ["es", "es-Latn/standard"],
  ["fa", "fa-Arab/standard"],
  ["grc", "grc-Grek/polytonic"],
  ["hbo", "hbo-Hebr/tiberian"],
  ["lzh", "lzh-Hant/standard"],
  ["tok", "tok-Qaap/sitelen-pona"],
  ["uz", "uz-Cyrl/standard"],
  ["yue", "yue-Hant-HK/standard"],
];

describe.each(COURSES)("the data of %s (%s)", (id, orthography) => {
  const course = loadCourse(id, orthography);
  const data = courseData(course);

  it("lists every lexeme, named form, rule and letter once, as a word, a form or a letter, and every sentence written in the orthography", () => {
    const listed = [...data.words, ...data.forms, ...data.letters].map((r) => r.id.id);
    expect(new Set(listed).size).toBe(listed.length);
    const entries = [
      ...allLexemes(course).map((l) => l.id),
      ...(course.lexicon.labels ?? []).map(labelId),
      ...(course.lexicon.rules ?? []).map((r) => r.id),
      ...course.units.flatMap((u) => (u.graphemes ?? []).map((g) => g.id)),
    ];
    expect(new Set(listed)).toEqual(new Set(entries));
    // A word is a lexeme the course cites; a lexeme written only inside words is a form (an affix).
    for (const w of data.words) {
      expect(w.id.id, w.id.id).toBe(w.lexeme.id);
      expect(bound(w.lexeme), w.id.id).toBe(false);
    }
    for (const l of data.letters) expect(l.id.id.startsWith("grapheme:"), l.id.id).toBe(true);
    const kindOf = (id: string): string => (id.startsWith("lexeme:") ? "affix" : id.startsWith("form:") ? "form" : id.startsWith("rule:") ? "rule" : id);
    for (const f of data.forms) expect(f.tags[0], f.id.id).toBe(kindOf(f.id.id));
    expect(data.sentences.map((s) => s.sentence.id)).toEqual(allSentences(course).filter((s) => s.forms[orthography] !== undefined).map((s) => s.id));
    expect(courseData(course)).toBe(data);
  });

  it("gives each word the ways its sentences write it, each with its sentences", () => {
    const sentences = new Map(data.sentences.map((s) => [s.sentence.id, s]));
    let ways = 0;
    for (const word of data.words) {
      for (const w of word.written) {
        ways += 1;
        expect(w.text.tokens.length, word.id.id).toBe(1);
        const token = w.text.tokens[0];
        expect(token === undefined ? undefined : baseIdOf(token), word.id.id).toBe(word.lexeme.id);
        expect(w.sentences.length, word.id.id).toBeGreaterThan(0);
        expect(new Set(w.sentences).size, word.id.id).toBe(w.sentences.length);
        for (const s of w.sentences) {
          const row = sentences.get(s);
          expect(row?.words.some((x) => surfaceOf(x.text) === surfaceOf(w.text)), `${word.id.id} in ${s}`).toBe(true);
          expect(row?.sentence.parts, `${word.id.id} in ${s}`).toContain(word.lexeme.id);
        }
        // Its own word is among what it carries, once, where the course has an entry for it.
        if (w.carries !== undefined) expect(w.carries.parts.filter((p) => p.base === true).map((p) => p.id), word.id.id).toEqual([word.lexeme.id]);
      }
    }
    expect(ways).toBeGreaterThan(data.words.length / 2);
  });

  it("gives each form the words that carry it, and says where a word has it of itself", () => {
    const words = new Map(data.words.map((w) => [w.lexeme.id, w]));
    for (const form of data.forms) {
      for (const c of form.carriers) {
        const word = words.get(c.word);
        const way = word?.written.find((w) => w.text === c.text);
        expect(way, `${form.id.id} on ${c.word}`).toBeDefined();
        expect(way?.carries?.parts.some((p) => p.id === form.id.id && p.text === undefined), `${form.id.id} on ${c.word}`).toBe(true);
        expect(c.ofItself, `${form.id.id} on ${c.word}`).toBe(way?.carries?.ofItself === form.id.id);
        expect(c.sentences, `${form.id.id} on ${c.word}`).toBe(way?.sentences.length);
        // A word that has a form of itself is never asked for it; one that is asked has a form added.
        if (way?.carries?.asked === true) expect(way.carries.parts.some((p) => p.text === undefined && p.id !== way.carries?.ofItself), c.word).toBe(true);
      }
    }
    expect(data.forms.every((f) => f.sentences >= 0)).toBe(true);
  });

  it("is searched by letters, readings, meanings and ids", () => {
    const all = dataMatcher(course, "  ");
    expect(data.words.every(all.words) && data.forms.every(all.forms) && data.letters.every(all.letters) && data.sentences.every(all.sentences)).toBe(true);
    const none = dataMatcher(course, "zzqqxxzzqq");
    expect([...data.words.filter(none.words), ...data.forms.filter(none.forms), ...data.sentences.filter(none.sentences)]).toEqual([]);
    // A word is found by its lemma, by any way it is written, and by its id.
    const word = data.words.find((w) => w.forms.length > 0 && w.written.length > 0);
    if (word === undefined) throw new Error(`${id} has a word some sentence writes`);
    expect(data.words.filter(dataMatcher(course, surfaceOf(word.forms[0] as (typeof word.forms)[number])).words)).toContain(word);
    expect(data.words.filter(dataMatcher(course, surfaceOf((word.written[0] as (typeof word.written)[number]).text)).words)).toContain(word);
    expect(data.words.filter(dataMatcher(course, word.id.id).words)).toEqual([word]);
    // A sentence is found by a part it lists, by its id, and by its own text.
    const sentence = data.sentences[Math.floor(data.sentences.length / 2)];
    if (sentence === undefined) throw new Error(`${id} has sentences`);
    const part = sentence.sentence.parts[0] as string;
    const byPart = data.sentences.filter(dataMatcher(course, part).sentences);
    expect(byPart).toContain(sentence);
    expect(byPart.every((s) => s.sentence.parts.some((k) => k.includes(part)) || s.sentence.id.includes(part))).toBe(true);
    expect(data.sentences.filter(dataMatcher(course, sentence.sentence.id).sentences)).toContain(sentence);
    expect(data.sentences.filter(dataMatcher(course, surfaceOf(sentence.text)).sentences)).toContain(sentence);
  });
});

describe("ids on the Data page", () => {
  it("sets an id written in the course's script as text of that script, and leaves the rest as code", () => {
    const yue = courseData(loadCourse("yue", "yue-Latn/jyutping"));
    const han = yue.words.filter((w) => w.id.text !== undefined);
    expect(han.length).toBeGreaterThan(200);
    // Under the Jyutping orthography too, a Han id is tagged as the course's Han orthography.
    for (const w of han) expect(w.id.text?.orthography, w.id.id).toBe("yue-Hant-HK/standard");
    for (const w of han) expect(surfaceOf(w.id.text as NonNullable<typeof w.id.text>), w.id.id).toBe(w.lexeme.id);
    expect(yue.sentences.every((s) => s.listed.map((k) => k.id).join(" ") === s.sentence.parts.join(" "))).toBe(true);

    const uz = courseData(loadCourse("uz", "uz-Latn/standard"));
    expect(uz.words.every((w) => w.id.text === undefined && w.id.id === w.lexeme.id)).toBe(true);
    const cyrillic = uz.letters.filter((l) => l.id.text !== undefined);
    expect(cyrillic.length).toBeGreaterThan(0);
    for (const l of cyrillic) expect(l.id.text?.orthography, l.id.id).toBe("uz-Cyrl/standard");

    const fa = courseData(loadCourse("fa", "fa-Arab/standard"));
    expect([...fa.words, ...fa.forms, ...fa.letters].every((r) => r.id.text === undefined)).toBe(true);
  });

  it("tags a row as the course tags it, and gives each token its readings as text", () => {
    const es = courseData(loadCourse("es", "es-Latn/standard"));
    const noun = es.words.find((w) => w.lexeme.pos === "NOUN");
    expect(noun?.tags[0]).toBe("NOUN");
    const kinds = { lexeme: "affix", form: "form", rule: "rule" } as Record<string, string>;
    expect(es.forms.every((f) => f.tags[0] === kinds[f.id.id.slice(0, f.id.id.indexOf(":"))])).toBe(true);
    expect(es.sentences.every((s) => s.tags[0] === s.sentence.provenance.status)).toBe(true);
    const tagged = es.sentences.find((s) => sentencePersons(s.sentence)?.speaker !== undefined);
    expect(tagged?.tags).toContain(`speaker=${String(tagged === undefined ? undefined : sentencePersons(tagged.sentence)?.speaker)}`);

    const lzh = courseData(loadCourse("lzh", "lzh-Hant/standard"));
    const word = lzh.sentences[0]?.words[0];
    expect(word?.readings.map((r) => r.scheme).sort()).toEqual(["baxter", "jyutping", "pinyin"]);
    for (const r of word?.readings ?? []) expect(surfaceOf(r.text), r.scheme).not.toBe("");
  });
});

describe("search across a course's text", () => {
  it("finds Persian letters whatever the vowel marks, and Cantonese by Jyutping with or without tones", () => {
    const fa = loadCourse("fa", "fa-Arab/standard");
    const marked = courseData(fa).words.find((w) => w.forms[0] !== undefined && /[\u064B-\u0652]/u.test(surfaceOf(w.forms[0])));
    if (marked === undefined) throw new Error("fa has a word written with vowel marks");
    const bare = surfaceOf(marked.forms[0] as (typeof marked.forms)[number]).replace(/[\u064B-\u0652]/gu, "");
    expect(courseData(fa).words.filter(dataMatcher(fa, bare).words)).toContain(marked);

    const yue = loadCourse("yue", "yue-Hant-HK/standard");
    const read = courseData(yue).sentences.find((s) => s.text.tokens.some((t) => /[0-9]/u.test(Object.values(t.readings ?? {}).join(""))));
    if (read === undefined) throw new Error("yue pins Jyutping");
    const jyutping = read.text.tokens.flatMap((t) => Object.values(t.readings ?? {})).join("");
    expect(courseData(yue).sentences.filter(dataMatcher(yue, jyutping).sentences)).toContain(read);
    expect(courseData(yue).sentences.filter(dataMatcher(yue, jyutping.replace(/[0-9\s]/gu, "")).sentences)).toContain(read);
    expect(textMatcher(yue, jyutping)({ ids: ["nothing-like-it"] })).toBe(false);
  });
});
