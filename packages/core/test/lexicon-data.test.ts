/**
 * The lexicon laid out for browsing (`lexiconData`): every lexeme of every fixture course's lexicon
 * is listed once, in the order the course introduces them, and each record has every key its
 * lexicon entry and its bundle lexeme store, with every value, none left out. Searched as the rest
 * of the Data page is (`dataMatcher`, `textMatcher`).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { dataMatcher, isLexiconSource, lexemesInOrder, lexiconData, type DataNode, type LexemeRow, type LexiconSource } from "../src/lesson/index.ts";
import { surfaceOf } from "../src/text/index.ts";
import { aliasesOf, loadCourse } from "./learner-fixtures.ts";

const ROOT = resolve(import.meta.dirname, "../../..");

/** A course's lexicon files as lexicon-source.ts serves them: lexemes.yaml and language.yaml, parsed. */
const sourceOf = (course: string): LexiconSource => {
  const lexicon = (parse(readFileSync(join(ROOT, "courses", course, "course.yaml"), "utf8")) as { lexicon: string }).lexicon;
  const read = (file: string): unknown => parse(readFileSync(join(ROOT, "lexicons", lexicon, file), "utf8"));
  const source = { lexemes: read("lexemes.yaml"), language: read("language.yaml") };
  if (!isLexiconSource(source)) throw new Error(`${course}: no lexicon`);
  return source;
};

const COURSES: readonly (readonly [string, string])[] = [
  ["apc", "apc-Arab/standard"],
  ["chg", "chg-Arab/standard"],
  ["es", "es-Latn/standard"],
  ["fa", "fa-Arab/standard"],
  ["grc", "grc-Grek/polytonic"],
  ["hbo", "hbo-Hebr/tiberian"],
  ["lzh", "lzh-Hant/standard"],
  ["tok", "tok-Qaap/sitelen-pona"],
  ["uz", "uz-Latn/standard"],
  ["yue", "yue-Hant-HK/standard"],
];

const isTagged = (value: unknown): value is TaggedText => typeof value === "object" && value !== null && "tokens" in value && "lang" in value && "orthography" in value;

/**
 * Where a stored value and its tree disagree: a key left out or added, a value changed. Every key
 * comes out, in its order, and every string, number and boolean, as code or as text.
 */
const differences = (value: unknown, node: DataNode, at: string): readonly string[] => {
  if (typeof value === "string") {
    if (node.kind === "code") return node.value === (value === "" ? '""' : value) ? [] : [`${at}: code ${node.value} for ${value}`];
    if (node.kind === "text") return surfaceOf(node.text) === value.normalize("NFC") ? [] : [`${at}: text ${surfaceOf(node.text)} for ${value}`];
    return [`${at}: ${node.kind} for a string`];
  }
  if (typeof value === "number" || typeof value === "boolean") return node.kind === "code" && node.value === String(value) ? [] : [`${at}: not ${String(value)}`];
  if (Array.isArray(value)) {
    if (node.kind !== "list" || node.items.length !== value.length) return [`${at}: not a list of ${String(value.length)}`];
    return value.flatMap((item, i) => differences(item, node.items[i] as DataNode, `${at}[${String(i)}]`));
  }
  if (isTagged(value)) return node.kind === "text" && node.text === value ? [] : [`${at}: not its text`];
  if (typeof value === "object" && value !== null) {
    if (node.kind !== "record") return [`${at}: not a record`];
    const keys = Object.keys(value);
    if (JSON.stringify(node.fields.map((f) => f.key)) !== JSON.stringify(keys)) return [`${at}: keys ${node.fields.map((f) => f.key).join(",")} for ${keys.join(",")}`];
    return node.fields.flatMap((f) => differences((value as Record<string, unknown>)[f.key], f.value, `${at}.${f.key}`));
  }
  return [`${at}: ${typeof value}`];
};

/** Every text node of a tree. */
const textsOf = (node: DataNode | undefined): readonly TaggedText[] =>
  node === undefined ? [] : node.kind === "text" ? [node.text] : node.kind === "list" ? node.items.flatMap(textsOf) : node.kind === "record" ? node.fields.flatMap((f) => textsOf(f.value)) : [];

const fieldOf = (node: DataNode | undefined, key: string): DataNode | undefined => (node?.kind === "record" ? node.fields.find((f) => f.key === key)?.value : undefined);

describe.each(COURSES)("the lexicon of %s (%s)", (id, orthography) => {
  const course = loadCourse(id, orthography);
  const source = sourceOf(id);
  const data = lexiconData(course, source, aliasesOf(id));
  const entries = new Map(source.lexemes.lexemes.map((e) => [e["id"] as string, e]));

  it("lists every lexeme of the lexicon once, in the order the course introduces them", () => {
    const ids = data.lexemes.map((r) => r.id.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set([...entries.keys(), ...course.lexicon.lexemes.map((l) => l.id)]));
    expect(ids.slice(0, course.lexicon.lexemes.length)).toEqual(lexemesInOrder(course).map((l) => l.id));
    expect(data.source).toBe(true);
    // Built once per course view, source and alias table.
    expect(lexiconData(course, source, aliasesOf(id))).not.toBe(data);
    const again = aliasesOf(id);
    expect(lexiconData(course, source, again)).toBe(lexiconData(course, source, again));
    expect(lexiconData(course)).toBe(lexiconData(course));
  });

  it("shows every key and value of each lexeme's entry and of its bundle lexeme, none left out", () => {
    for (const row of data.lexemes) {
      const entry = entries.get(row.id.id);
      expect(entry, row.id.id).toBeDefined();
      expect(row.source, row.id.id).toBeDefined();
      expect(differences(entry, row.source as DataNode, row.id.id)).toEqual([]);
      if (row.lexeme !== undefined) expect(differences(row.lexeme, row.bundle as DataNode, row.id.id)).toEqual([]);
    }
    // The lexicon file's own fields, and the language file, whole.
    const { lexemes: _l, ...head } = source.lexemes;
    expect(differences(head, data.file as DataNode, "lexicon")).toEqual([]);
    expect(differences(source.language, data.language, "language")).toEqual([]);
  });

  it("tags every text with a language and an orthography, and spellings as their orthography's", () => {
    for (const row of data.lexemes) {
      for (const t of [...textsOf(row.source), ...textsOf(row.bundle), ...textsOf(row.course)]) {
        expect(t.lang.length, row.id.id).toBeGreaterThan(0);
        expect(surfaceOf(t), row.id.id).toBe(surfaceOf(t).normalize("NFC"));
      }
      const spelled = fieldOf(row.source, "spelled");
      for (const f of spelled?.kind === "record" ? spelled.fields : []) for (const t of textsOf(f.value)) expect(t.orthography, row.id.id).toBe(f.key);
      const glosses = fieldOf(row.source, "gloss");
      for (const f of glosses?.kind === "record" ? glosses.fields : []) for (const t of textsOf(f.value)) expect(t.lang.split("-")[0], row.id.id).toBe(f.key);
    }
  });

  it("says what the course does with each lexeme", () => {
    for (const row of data.lexemes) {
      const keys = row.course.kind === "record" ? row.course.fields.map((f) => f.key) : [];
      expect(keys.slice(0, 6), row.id.id).toEqual(["unit", "node", "sentences", "bound", "skills", "labels"]);
      expect(keys.includes("clip"), row.id.id).toBe(course.audio[row.id.id] !== undefined);
      expect(keys.includes("aliases"), row.id.id).toBe(true);
      if (row.bound) expect(row.written, row.id.id).toEqual([]);
      else expect(row.carriers, row.id.id).toEqual([]);
    }
  });

  it("is found by its id, a gloss and a code value", () => {
    const found = (query: string): readonly LexemeRow[] => data.lexemes.filter(dataMatcher(course, query).lexicon);
    const row = data.lexemes.find((r) => r.gloss !== undefined && r.lexeme?.pos !== undefined);
    if (row === undefined) throw new Error(`${id} has a glossed lexeme`);
    expect(found(row.id.id)).toContain(row);
    expect(found(surfaceOf(row.gloss as TaggedText))).toContain(row);
    expect(found(row.lexeme?.pos as string)).toContain(row);
    expect(found("")).toHaveLength(data.lexemes.length);
    expect(found("zzqqxxzzqq")).toEqual([]);
  });
});

describe("lexiconData", () => {
  it("finds a lexeme by a spelling of its second orthography", () => {
    const course = loadCourse("uz", "uz-Latn/standard");
    const data = lexiconData(course, sourceOf("uz"));
    const row = data.lexemes.find((r) => r.id.id === "lexeme:aka");
    expect(row).toBeDefined();
    expect(data.lexemes.filter(dataMatcher(course, "ака").lexicon)).toContain(row);
  });

  it("finds a lexeme by a reading without its tones", () => {
    const course = loadCourse("yue", "yue-Hant-HK/standard");
    const data = lexiconData(course, sourceOf("yue"));
    const row = data.lexemes.find((r) => r.lexeme?.forms?.["yue-Hant-HK/standard"]?.[0]?.tokens[0]?.readings?.["jyutping" as SchemeId] === "jat1 zan6");
    expect(row).toBeDefined();
    expect(data.lexemes.filter(dataMatcher(course, "jatzan").lexicon)).toContain(row);
    expect(data.lexemes.filter(dataMatcher(course, "jat1 zan6").lexicon)).toContain(row);
  });

  it("finds lexemes by a form's status, a key and a kind: pinned, allomorphs, bound", () => {
    const course = loadCourse("es", "es-Latn/standard");
    const source = sourceOf("es");
    const data = lexiconData(course, source);
    const pinned = source.lexemes.lexemes.filter((e) => Array.isArray(e["forms"])).map((e) => e["id"]);
    // An id or a gloss may say "pinned" too: every lexeme with a pinned form is found, and few others.
    const byStatus = data.lexemes.filter(dataMatcher(course, "pinned").lexicon).map((r) => r.id.id);
    expect(new Set(byStatus)).toEqual(new Set([...pinned, ...byStatus.filter((id) => !pinned.includes(id))]));
    expect(byStatus.length).toBeGreaterThanOrEqual(pinned.length);
    const withAllomorphs = source.lexemes.lexemes.filter((e) => e["allomorphs"] !== undefined).map((e) => e["id"]);
    for (const lexeme of withAllomorphs) expect(data.lexemes.filter(dataMatcher(course, "allomorphs").lexicon).map((r) => r.id.id)).toContain(lexeme);
    const uz = loadCourse("uz", "uz-Latn/standard");
    const bound = lexiconData(uz, sourceOf("uz")).lexemes.filter((r) => r.bound);
    expect(bound.length).toBeGreaterThan(10);
    expect(lexiconData(uz, sourceOf("uz")).lexemes.filter(dataMatcher(uz, "bound").lexicon).length).toBeGreaterThanOrEqual(bound.length);
  });

  it("marks a bundle lexeme's features stored by its entry or given by a default", () => {
    const course = loadCourse("es", "es-Latn/standard");
    const data = lexiconData(course, sourceOf("es"));
    const noteOf = (lexeme: string): string | undefined => {
      const feats = fieldOf(data.lexemes.find((r) => r.id.id === lexeme)?.bundle, "feats");
      return feats?.kind === "record" ? feats.fields.find((f) => f.key === "Gender")?.note : undefined;
    };
    expect(noteOf("lexeme:aceite")).toBe("stored");
    expect(noteOf("lexeme:casa")).toBe("default");
    // Without the entry nothing is marked.
    const bare = lexiconData(course);
    const feats = fieldOf(bare.lexemes.find((r) => r.id.id === "lexeme:casa")?.bundle, "feats");
    expect(feats?.kind === "record" ? feats.fields.map((f) => f.note) : []).toEqual([undefined]);
  });

  it("names the old ids that became a lexeme where the alias table is at hand", () => {
    const course = loadCourse("es", "es-Latn/standard");
    const aliases = aliasesOf("es");
    const data = lexiconData(course, sourceOf("es"), aliases);
    const [kc, alias] = Object.entries(aliases.aliases).find(([, a]) => a.part?.startsWith("lexeme:") === true) ?? [];
    const row = data.lexemes.find((r) => r.id.id === alias?.part);
    const old = fieldOf(row?.course, "aliases");
    expect(old?.kind === "list" ? old.items.map((i) => (i.kind === "code" ? i.value : "")) : []).toContain(kc);
    expect(fieldOf(lexiconData(course).lexemes[0]?.course, "aliases")).toBeUndefined();
  });

  it("without the lexicon's files, shows the bundle's lexemes and what it carries of the language", () => {
    const course = loadCourse("es", "es-Latn/standard");
    const data = lexiconData(course);
    expect(data.source).toBe(false);
    expect(data.file).toBeUndefined();
    expect(data.lexemes.map((r) => r.id.id)).toEqual(lexemesInOrder(course).map((l) => l.id));
    for (const row of data.lexemes) {
      expect(row.source).toBeUndefined();
      expect(differences(row.lexeme, row.bundle as DataNode, row.id.id)).toEqual([]);
    }
    const { lexemes: _l, ...language } = course.lexicon;
    expect(differences(language, data.language, "language")).toEqual([]);
    expect(isLexiconSource({ lexemes: { lexemes: [] } })).toBe(true);
    expect(isLexiconSource({ lexemes: [] })).toBe(false);
    expect(isLexiconSource("<!doctype html>")).toBe(false);
  });

  it("shows apc's lexical forms as the language's own text, a verb's radicals beside the code of its Form and sources", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const data = lexiconData(course, sourceOf("apc"));
    const formOf = (lexeme: string): DataNode | undefined => fieldOf(data.lexemes.find((r) => r.id.id === lexeme)?.source, "form");
    // A string in the notation (docs/lexical-forms/apc.md), tagged as the course's Arabic.
    const ahwe = formOf("lexeme:ahwe");
    expect(ahwe?.kind === "text" ? ahwe.text.orthography : undefined).toBe("apc-Arab/standard");
    // A verb's radical form: its radicals are letters, its Form, vowels and source code, its basis a note in English.
    const azam = formOf("lexeme:3azam");
    const kinds = (node: DataNode | undefined): readonly string[] =>
      node?.kind === "record" ? node.fields.map((f) => `${f.key}:${f.value.kind === "list" ? `list of ${f.value.items[0]?.kind ?? ""}` : f.value.kind === "record" ? `record of ${f.value.fields[0]?.value.kind ?? ""}` : f.value.kind}`) : [];
    expect(kinds(azam)).toEqual(["radicals:list of text", "form:code", "vowels:record of code", "source:code", "basis:text"]);
    const basis = fieldOf(azam, "basis");
    expect(basis?.kind === "text" ? basis.text.lang : undefined).toMatch(/^en/u);
    // The notation in the Language view: its signs are text, its order and sets code.
    const notation = fieldOf(data.language, "notation");
    expect(kinds(notation)).toEqual(["vowels:record of text", "long:record of text", "none:text", "order:code", "sets:record of code"]);
  });

  it("lays out the largest lexicon quickly", () => {
    const course = loadCourse("es", "es-Latn/standard");
    const source = sourceOf("es");
    const started = performance.now();
    const data = lexiconData(course, source);
    const took = performance.now() - started;
    expect(data.lexemes).toHaveLength(721);
    expect(took).toBeLessThan(2000);
  });
});
