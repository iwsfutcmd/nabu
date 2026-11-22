/**
 * The Data page's generic renderer (DataTree) and its Lexicon view: code reads left to right in the
 * interface's own face, text goes through <T> in its own language and direction, lists and records
 * nest, and a bundle lexeme's feature says whether its entry stores it or a default gives it. A
 * lexeme's body is laid out only once opened, and then shows every key of its entry.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isLexiconSource, type DataNode, type LexiconSource } from "@nabu/core/lesson";
import type { TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DataBrowser } from "../src/data/DataBrowser.tsx";
import { DataTree } from "../src/data/DataTree.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const fa: TaggedText = { lang: "fa-Arab" as TaggedText["lang"], orthography: "fa-Arab/standard" as TaggedText["orthography"], tokens: [{ surface: "کتاب", kind: "lexical" }] };
const en: TaggedText = { lang: "en-Latn" as TaggedText["lang"], orthography: "en-Latn/standard" as TaggedText["orthography"], tokens: [{ surface: "book", kind: "lexical" }] };

const tree = (node: DataNode): string => render(<DataTree node={node} />);

describe("DataTree", () => {
  it("sets code left to right, as code", () => {
    const html = tree({ kind: "code", value: "Gender=Fem" });
    expect(html).toMatch(/<code[^>]*dir="ltr"[^>]*data-tree="code"[^>]*>Gender=Fem<\/code>/u);
  });

  it("sets text through <T>, in its own language and direction", () => {
    const html = tree({ kind: "text", text: fa });
    expect(html).toMatch(/<span[^>]*lang="fa-Arab"[^>]*dir="rtl"[^>]*data-nabu-text=""/u);
    expect(html).toContain("کتاب");
    expect(tree({ kind: "text", text: en })).toMatch(/lang="en-Latn"[^>]*dir="ltr"/u);
  });

  it("lays out lists, nested records and empty ones", () => {
    const html = tree({
      kind: "record",
      fields: [
        { key: "spelled", value: { kind: "record", fields: [{ key: "fa-Arab/standard", value: { kind: "list", items: [{ kind: "text", text: fa }] } }] } },
        { key: "gloss", value: { kind: "record", fields: [{ key: "en", value: { kind: "text", text: en } }] } },
        { key: "classes", value: { kind: "list", items: [] } },
      ],
    });
    // Keys are code, left to right; each value under its key; a nested record inside its parent's.
    expect([...html.matchAll(/data-key="([^"]+)"/gu)].map((m) => m[1])).toEqual(["spelled", "fa-Arab/standard", "gloss", "en", "classes"]);
    expect(html).toMatch(/<dt[^>]*><code[^>]*dir="ltr"[^>]*>spelled<\/code><\/dt>/u);
    expect(html.indexOf('data-key="fa-Arab/standard"')).toBeGreaterThan(html.indexOf('data-key="spelled"'));
    expect(html.indexOf('data-key="fa-Arab/standard"')).toBeLessThan(html.indexOf('data-key="gloss"'));
    expect(html).toMatch(/<ol[^>]*data-tree="list"/u);
    expect(html).toMatch(/data-key="classes"[^]*data-tree="none"[^>]*>none</u);
  });

  it("a record or a list of plain values only is flat: one line, pair by pair; one with something under a value is not", () => {
    const feats: DataNode = { kind: "record", fields: [{ key: "Mood", value: { kind: "code", value: "Cnd" } }, { key: "Number", value: { kind: "code", value: "Plur" } }] };
    const spellings: DataNode = { kind: "list", items: [{ kind: "text", text: fa }] };
    const flat = tree({ kind: "record", fields: [{ key: "feats", value: feats }, { key: "spelled", value: spellings }] });
    // The two under the keys are flat; the record that holds them is not.
    expect([...flat.matchAll(/<(dl|ol)[^>]*data-tree="(?:record|list)"([^>]*)>/gu)].map((m) => [m[1], /data-flat=""/u.test(m[2] ?? "")])).toEqual([
      ["dl", false],
      ["dl", true],
      ["ol", true],
    ]);
    // A list of records is not flat.
    expect(tree({ kind: "list", items: [feats] })).not.toMatch(/<ol[^>]*data-flat/u);
  });

  it("says whether a feature is stored or given by a default", () => {
    const html = tree({
      kind: "record",
      fields: [
        { key: "Gender", value: { kind: "code", value: "Fem" }, note: "default" },
        { key: "Number", value: { kind: "code", value: "Sing" }, note: "stored" },
        { key: "Case", value: { kind: "code", value: "Nom" } },
      ],
    });
    expect(html).toMatch(/data-key="Gender" data-note="default"[^]*given by a default/u);
    expect(html).toMatch(/data-key="Number" data-note="stored"[^]*>stored</u);
    expect(html).toMatch(/data-key="Case">/u);
  });
});

const ROOT = resolve(import.meta.dirname, "../../..");
const sourceOf = (lang: string): LexiconSource => {
  const read = (file: string): unknown => parse(readFileSync(join(ROOT, "lexicons", lang, file), "utf8"));
  const source = { lexemes: read("lexemes.yaml"), language: read("language.yaml") };
  if (!isLexiconSource(source)) throw new Error(lang);
  return source;
};

describe("the Lexicon view", () => {
  const uz = loadCourse("uz", "uz-Latn/standard");
  const source = sourceOf("uz");
  const entry = source.lexemes.lexemes.find((e) => e["id"] === "lexeme:abl");
  if (entry === undefined) throw new Error("uz has an ablative");

  it("opens a lexeme to its entry, its bundle lexeme and what the course does with it, every key of its entry shown", () => {
    const html = render(<DataBrowser course={uz} view="lexicon" query="lexeme:abl" opened="lexeme:abl" lexicon={source} />);
    expect(html).toContain('data-data-view="lexicon"');
    expect(html).toMatch(/data-lexicon-file=""/u);
    const row = html.slice(html.indexOf('data-data-row="lexeme:abl"'));
    expect([...row.matchAll(/data-lexicon-part="([^"]+)"/gu)].map((m) => m[1])).toEqual(["source", "bundle", "course"]);
    const sourcePart = row.slice(row.indexOf('data-lexicon-part="source"'), row.indexOf('data-lexicon-part="bundle"'));
    for (const key of Object.keys(entry)) expect(sourcePart, key).toContain(`data-key="${key}"`);
    // Its Cyrillic spelling, as Cyrillic text.
    expect(sourcePart).toMatch(/lang="uz-Cyrl[^"]*"[^>]*>[^]*дан/u);
    expect(html).not.toContain("data-lexicon-missing");
  });

  it("lays a lexeme's body out only once opened", () => {
    const html = render(<DataBrowser course={uz} view="lexicon" query="lexeme:abl" lexicon={source} />);
    expect(html).toContain('data-data-row="lexeme:abl"');
    expect(html).not.toContain("data-lexicon-part");
  });

  it("without the lexicon's files, says so once and shows the bundle's and the course's parts", () => {
    const html = render(<DataBrowser course={uz} view="lexicon" query="lexeme:abl" opened="lexeme:abl" lexicon={null} />);
    expect(html.match(/data-lexicon-missing/gu)).toHaveLength(1);
    expect([...html.matchAll(/data-lexicon-part="([^"]+)"/gu)].map((m) => m[1])).toEqual(["bundle", "course"]);
  });

  it("shows the language file by the same renderer", () => {
    const html = render(<DataBrowser course={loadCourse("es")} view="language" lexicon={sourceOf("es")} />);
    expect(html).toContain('data-language-file="source"');
    for (const key of Object.keys(sourceOf("es").language ?? {})) expect(html, key).toContain(`data-key="${key}"`);
  });
});
