/**
 * A course laid out for browsing (`courseData`): every word, form, letter and sentence of every
 * fixture course is listed once, with what the course says of it, and the lists are searched as the
 * word list is.
 */
import { describe, expect, it } from "vitest";
import { allKcs, allSentences, courseData, dataMatcher, textMatcher } from "../src/lesson/index.ts";
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

  it("lists every KC once, as a word, a form or a letter, and every sentence written in the orthography", () => {
    const listed = [...data.words, ...data.forms, ...data.letters].map((r) => r.kc.id as string);
    expect(new Set(listed).size).toBe(listed.length);
    expect(new Set(listed)).toEqual(new Set(allKcs(course).map((k) => k.id as string)));
    for (const w of data.words) expect(w.kc.kind, w.kc.id).toBe("sense");
    for (const l of data.letters) expect(l.kc.kind, l.kc.id).toBe("grapheme");
    for (const f of data.forms) expect(["sense", "grapheme"], f.kc.id).not.toContain(f.kc.kind);
    expect(data.sentences.map((s) => s.sentence.id)).toEqual(allSentences(course).filter((s) => s.forms[orthography] !== undefined).map((s) => s.id));
    expect(courseData(course)).toBe(data);
  });

  it("gives each word the ways its sentences write it, each with its sentences", () => {
    const sentences = new Map(data.sentences.map((s) => [s.sentence.id, s]));
    let ways = 0;
    for (const word of data.words) {
      for (const w of word.written) {
        ways += 1;
        expect(w.text.tokens.length, word.kc.id).toBe(1);
        expect(w.text.tokens[0]?.sense === undefined ? undefined : `sense:${w.text.tokens[0].sense}`, word.kc.id).toBe(word.kc.id);
        expect(w.sentences.length, word.kc.id).toBeGreaterThan(0);
        expect(new Set(w.sentences).size, word.kc.id).toBe(w.sentences.length);
        for (const s of w.sentences) {
          const row = sentences.get(s);
          expect(row?.words.some((x) => surfaceOf(x.text) === surfaceOf(w.text)), `${word.kc.id} in ${s}`).toBe(true);
          expect(row?.sentence.kcs, `${word.kc.id} in ${s}`).toContain(word.kc.id);
        }
        // Its own word is among what it carries, once, where the course has an entry for it.
        if (w.carries !== undefined) expect(w.carries.parts.filter((p) => p.base === true).map((p) => p.kc), word.kc.id).toEqual([word.kc.id]);
      }
    }
    expect(ways).toBeGreaterThan(data.words.length / 2);
  });

  it("gives each form the words that carry it, and says where a word has it of itself", () => {
    const words = new Map(data.words.map((w) => [w.kc.id as string, w]));
    for (const form of data.forms) {
      for (const c of form.carriers) {
        const word = words.get(c.word);
        const way = word?.written.find((w) => w.text === c.text);
        expect(way, `${form.kc.id} on ${c.word}`).toBeDefined();
        expect(way?.carries?.parts.some((p) => p.kc === form.kc.id && p.text === undefined), `${form.kc.id} on ${c.word}`).toBe(true);
        expect(c.ofItself, `${form.kc.id} on ${c.word}`).toBe(way?.carries?.ofItself === form.kc.id);
        expect(c.sentences, `${form.kc.id} on ${c.word}`).toBe(way?.sentences.length);
        // A word that has a form of itself is never asked for it; one that is asked has a form added.
        if (way?.carries?.asked === true) expect(way.carries.parts.some((p) => p.text === undefined && p.kc !== way.carries?.ofItself), c.word).toBe(true);
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
    expect(data.words.filter(dataMatcher(course, word.kc.id).words)).toEqual([word]);
    // A sentence is found by a KC it lists, by its id, and by its own text.
    const sentence = data.sentences[Math.floor(data.sentences.length / 2)];
    if (sentence === undefined) throw new Error(`${id} has sentences`);
    const kc = sentence.sentence.kcs[0] as string;
    const byKc = data.sentences.filter(dataMatcher(course, kc).sentences);
    expect(byKc).toContain(sentence);
    expect(byKc.every((s) => s.sentence.kcs.some((k) => k.includes(kc)) || s.sentence.id.includes(kc))).toBe(true);
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
    for (const w of han) expect(w.id.text?.orthography, w.kc.id).toBe("yue-Hant-HK/standard");
    for (const w of han) expect(surfaceOf(w.id.text as NonNullable<typeof w.id.text>), w.kc.id).toBe(w.kc.id);
    expect(yue.sentences.every((s) => s.listed.map((k) => k.id).join(" ") === s.sentence.kcs.join(" "))).toBe(true);

    const uz = courseData(loadCourse("uz", "uz-Latn/standard"));
    expect(uz.words.every((w) => w.id.text === undefined && w.id.id === w.kc.id)).toBe(true);
    const cyrillic = uz.letters.filter((l) => l.id.text !== undefined);
    expect(cyrillic.length).toBeGreaterThan(0);
    for (const l of cyrillic) expect(l.id.text?.orthography, l.kc.id).toBe("uz-Cyrl/standard");

    const fa = courseData(loadCourse("fa", "fa-Arab/standard"));
    expect([...fa.words, ...fa.forms, ...fa.letters].every((r) => r.id.text === undefined)).toBe(true);
  });

  it("tags a row as the course tags it, and gives each token its readings as text", () => {
    const es = courseData(loadCourse("es", "es-Latn/standard"));
    const noun = es.words.find((w) => w.kc.pos === "NOUN");
    expect(noun?.tags[0]).toBe("NOUN");
    expect(es.forms.every((f) => f.tags[0] === f.kc.kind)).toBe(true);
    expect(es.sentences.every((s) => s.tags[0] === s.sentence.provenance.status)).toBe(true);
    const tagged = es.sentences.find((s) => s.sentence.persons?.speaker !== undefined);
    expect(tagged?.tags).toContain(`speaker=${String(tagged?.sentence.persons?.speaker)}`);

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
