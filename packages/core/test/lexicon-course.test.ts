/**
 * A lexicon no course uses (lexicons/arb, Modern Standard Arabic, ADR 0158) opened as a course view with
 * no units, so the rules explorer can realise and spell with it (debug mode).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  attachable,
  explore,
  EXPLORE_DEFAULTS,
  lexiconCourse,
  rulesExplorer,
  type LexiconSource,
} from "../src/lesson/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const read = (path: string): unknown =>
  parse(readFileSync(resolve(ROOT, path), "utf8")) as unknown;
const numberingSystems = JSON.parse(
  readFileSync(
    resolve(ROOT, "packages/i18n/src/generated/numbering-systems.json"),
    "utf8",
  ),
) as Record<string, string>;
const SOURCE = {
  lexemes: read("lexicons/arb/lexemes.yaml"),
  language: read("lexicons/arb/language.yaml"),
  profiles: {
    "arb-Arab/standard": read("profiles/arb-Arab.standard.yaml"),
    "en-Latn/standard": read("profiles/en-Latn.standard.yaml"),
  },
} as LexiconSource;

describe("lexiconCourse", () => {
  it("opens arb's lexicon in its own orthography, with no units, and explores it", () => {
    const course = lexiconCourse(SOURCE, {
      language: "arb",
      support: "en-Latn/standard",
      numberingSystems,
    });
    if (!course.ok) throw new Error(JSON.stringify(course.error));
    expect(course.value.orthography).toBe("arb-Arab/standard");
    expect(course.value.units).toEqual([]);
    const x = rulesExplorer(course.value, SOURCE);
    expect(x.problems).toEqual([]);
    // qāla's jussive, he: yaqul, its long vowel shortened in the closed syllable.
    const r = explore(x, {
      base: "lexeme:qala",
      feats: {},
      before: [{ lexeme: "lexeme:impf-3" }],
      after: [
        { lexeme: "lexeme:impf" },
        { lexeme: "lexeme:ms" },
        { lexeme: "lexeme:jus" },
      ],
      ...EXPLORE_DEFAULTS,
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.steps.map((s) => `${s.rule}|${s.branch ?? ""}`)).toEqual([
      "rule:arb-shorten|u",
    ]);
    expect(r.spellings.map((s) => s.spelling?.tokens[0]?.surface)).toEqual([
      "يقل",
      "يَقُلْ",
    ]);
  });

  it("places each lexeme on the side its entry says, and refuses it on the other", () => {
    const course = lexiconCourse(SOURCE, {
      language: "arb",
      support: "en-Latn/standard",
      numberingSystems,
    });
    if (!course.ok) throw new Error(JSON.stringify(course.error));
    const x = rulesExplorer(course.value, SOURCE);
    // Every lexeme that merges onto another says where it stands.
    const entries = (
      SOURCE.lexemes as { lexemes: { id: string; on?: { at?: string } }[] }
    ).lexemes;
    expect(
      entries
        .filter((e) => e.on !== undefined && e.on.at === undefined)
        .map((e) => e.id),
    ).toEqual([]);
    const ids = (side: "before" | "after"): readonly string[] =>
      attachable(x, side).map((l) => l.row.id.id);
    expect(ids("before")).toEqual(
      expect.arrayContaining([
        "lexeme:impf-3",
        "lexeme:al",
        "lexeme:wa",
        "lexeme:sa",
      ]),
    );
    expect(ids("before")).not.toContain("lexeme:perf");
    expect(ids("after")).toEqual(
      expect.arrayContaining([
        "lexeme:perf",
        "lexeme:impf",
        "lexeme:poss-3ms",
        "lexeme:nom",
      ]),
    );
    expect(ids("after")).not.toContain("lexeme:impf-3");
    // A person prefix written after the verb is no word.
    const wrong = explore(x, {
      base: "lexeme:kataba",
      feats: {},
      before: [],
      after: [
        { lexeme: "lexeme:impf" },
        { lexeme: "lexeme:impf-3" },
        { lexeme: "lexeme:ms" },
        { lexeme: "lexeme:ind" },
      ],
      ...EXPLORE_DEFAULTS,
    });
    expect(wrong.ok).toBe(false);
    expect(JSON.stringify(wrong)).toContain('"at"');
  });

  it("says so where the language has no orthography among the profiles", () => {
    expect(
      lexiconCourse(
        {
          ...SOURCE,
          profiles: {
            "en-Latn/standard": SOURCE.profiles?.["en-Latn/standard"],
          },
        },
        { language: "arb", support: "en-Latn/standard", numberingSystems },
      ),
    ).toEqual({ ok: false, error: { kind: "no-orthography" } });
  });
});
