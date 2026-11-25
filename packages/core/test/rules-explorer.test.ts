/**
 * The rules explorer (debug mode): a lexeme realised in a cell with other lexemes written onto it and
 * spelled by every orthography of the course, from the lexicon's own files (as lexicon-source/<course>.json
 * carries them), with the same functions as the compiler's token check; how the course's tokens write a
 * lexeme, each compared as that check compares it; a lexeme's paradigm; a request kept in an address.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { decodeExplore, encodeExplore, explore, EXPLORE_DEFAULTS, explorerParadigm, fitCell, rulesExplorer, waysOf, type ExploreRequest, type LexiconSource, type RulesExplorer } from "../src/lesson/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const yaml = (path: string): unknown => parse(readFileSync(join(ROOT, path), "utf8")) as unknown;

/** A course's lexicon source, as apps/web/lexicon-source.ts writes it. */
const sourceOf = (lang: string, orthographies: readonly string[]): LexiconSource =>
  ({
    lexemes: yaml(`lexicons/${lang}/lexemes.yaml`),
    language: yaml(`lexicons/${lang}/language.yaml`),
    profiles: Object.fromEntries(orthographies.map((o) => [o, yaml(`profiles/${o.replace("/", ".")}.yaml`)])),
  }) as LexiconSource;

const apc = (): RulesExplorer => rulesExplorer(loadCourse("apc", "apc-Arab/standard"), sourceOf("apc", ["apc-Arab/standard", "apc-Latn/arabizi"]));

const ask = (base: string, feats: ExploreRequest["feats"], more: Partial<ExploreRequest> = {}): ExploreRequest => ({ base, feats, before: [], after: [], ...EXPLORE_DEFAULTS, ...more });

describe("rulesExplorer", () => {
  it("compiles apc's rules and spells in both orthographies and the marked layer", () => {
    const x = apc();
    expect(x.problems).toEqual([]);
    expect(x.orthographies).toEqual([
      { orthography: "apc-Arab/standard", spells: true },
      { orthography: "apc-Arab/standard", layer: "vocalized", spells: true },
      { orthography: "apc-Latn/arabizi", spells: true },
    ]);
    const shereb = x.lexemes.find((l) => l.row.id.id === "lexeme:shereb");
    expect(shereb?.pos).toBe("VERB");
    expect(shereb?.features.map((f) => f.feature)).toEqual(["Aspect", "Voice", "Mood", "Person", "Gender", "Number"]);
    expect(shereb?.features[0]?.values).toEqual(["Imp", "Part", "Perf"]);
    // The passive participle (units 26 on): Voice=Pass beside Aspect=Part.
    expect(shereb?.features[1]?.values).toEqual(["Pass"]);
  });

  it("realises a verb in a cell, every rule and branch taken, and spells it", () => {
    const got = explore(apc(), ask("lexeme:shereb", { Aspect: "Imp", Mood: "Ind", Person: "2", Gender: "Fem", Number: "Sing" }));
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.status).toBe("given");
    expect(got.steps.map((s) => `${s.rule}|${s.branch ?? ""}`)).toContain("rule:apc-imperfect|ind");
    const spelled = Object.fromEntries(got.spellings.map((s) => [s.layer ?? s.orthography, s.spelling?.tokens[0]?.surface]));
    expect(spelled).toEqual({ "apc-Arab/standard": "بتشربي", vocalized: "بْتِشْرَبي", "apc-Latn/arabizi": "bteshrabi" });
    // The course's Arabizi is a free alternative of the statement's spelling, with the variation it took.
    const arabizi = got.spellings.find((s) => s.orthography === "apc-Latn/arabizi");
    expect(arabizi?.alternatives.find((a) => a.spelling.tokens[0]?.surface === "btishrabi")?.by).toEqual(["e-i"]);
    expect(got.form.lang).toBe("apc-Arab-LB");
  });

  it("writes other lexemes onto the base, as a token lists them", () => {
    const got = explore(apc(), ask("lexeme:bent", {}, { after: [{ lexeme: "lexeme:poss-2pl" }] }));
    expect(got.ok && got.spellings.map((s) => s.spelling?.tokens[0]?.surface)).toEqual(["بنتكن", "بِنِتْكُن", "benetkon"]);
    // Arabizi leaves the helping vowel inside a word out, or writes it: bentkon is the other way.
    expect(got.ok && got.spellings[2]?.alternatives.map((a) => a.spelling.tokens[0]?.surface)).toContain("bentkon");
  });

  it("says what went wrong, as the engine says it", () => {
    expect(explore(apc(), ask("lexeme:nothing", {}))).toEqual({ ok: false, error: { kind: "unknown-lexeme", details: [{ key: "lexeme", value: "lexeme:nothing" }] } });
    const none = explore(apc(), ask("lexeme:ahla", { Number: "Plur" }));
    expect(none.ok).toBe(false);
  });

  it("finds every way the course writes a lexeme, each given as the compiler's check gives it", () => {
    const x = apc();
    const ways = waysOf(x, "lexeme:shereb");
    expect(ways.length).toBeGreaterThan(5);
    expect(new Set(ways.map((w) => w.orthography))).toEqual(new Set(["apc-Arab/standard", "apc-Latn/arabizi"]));
    expect(ways.filter((w) => w.verdict !== "spelling" && w.verdict !== "alternative")).toEqual([]);
    // Loading a way asks for what its token writes.
    const way = ways.find((w) => w.request.after.length > 0) ?? ways[0];
    expect(way !== undefined && explore(x, way.request).ok).toBe(true);
  });

  it("lists a lexeme's paradigm over the cells the bundle lists", () => {
    const x = apc();
    const shereb = x.lexemes.find((l) => l.row.id.id === "lexeme:shereb");
    if (shereb === undefined) throw new Error("no shereb");
    const cells = explorerParadigm(x, shereb, EXPLORE_DEFAULTS);
    expect(cells.length).toBe(x.course.lexicon.cells?.["VERB"]?.length);
    expect(cells.every((c) => c.result.ok)).toBe(true);
  });

  it("spells nothing where an orthography states no statement (sitelen pona), and keeps going", () => {
    const x = rulesExplorer(loadCourse("tok", "tok-Latn/standard"), sourceOf("tok", ["tok-Latn/standard", "tok-Qaap/sitelen-pona"]));
    expect(x.problems).toEqual([]);
    const got = explore(x, ask("lexeme:moku", {}));
    expect(got.ok && got.spellings.map((s) => [s.orthography, s.spells, s.spelling?.tokens[0]?.surface])).toEqual([
      ["tok-Latn/standard", true, "moku"],
      ["tok-Qaap/sitelen-pona", false, undefined],
    ]);
    expect(waysOf(x, "lexeme:moku").every((w) => w.verdict === (w.orthography === "tok-Latn/standard" ? "spelling" : "unspelled"))).toBe(true);
  });

  it("gives a token's free variants, and counts a course token written as one", () => {
    const x = rulesExplorer(loadCourse("chg", "chg-Arab/standard"), sourceOf("chg", ["chg-Arab/standard"]));
    expect(x.problems).toEqual([]);
    const ways = x.lexemes.flatMap((l) => waysOf(x, l.row.id.id));
    // Every way the course writes a word is given, an alternative or a free variant: never another spelling.
    expect(ways.filter((w) => w.verdict === "differs" || w.verdict === "error")).toEqual([]);
    const variant = ways.find((w) => w.verdict === "variant");
    if (variant === undefined) throw new Error("chg writes a free variant");
    const got = explore(x, variant.request);
    expect(got.ok && got.variants.length).toBeGreaterThan(0);
  });

  it("realises a lexeme beside the base in the values the token gives it, as es's tokens are checked", () => {
    const x = rulesExplorer(loadCourse("es", "es-Latn/standard"), sourceOf("es", ["es-Latn/standard"]));
    expect(x.problems).toEqual([]);
    const ways = x.lexemes.flatMap((l) => waysOf(x, l.row.id.id));
    expect(ways.length).toBeGreaterThan(1000);
    expect(ways.filter((w) => w.verdict === "differs" || w.verdict === "error").map((w) => `${w.items[0] ?? ""} ${w.text.tokens[0]?.surface ?? ""}`)).toEqual([]);
    const beside = ways.find((w) => w.request.after.some((a) => a.feats !== undefined));
    expect(beside).toBeDefined();
  });

  it("says a language without a notation cannot be explored", () => {
    const x = rulesExplorer(loadCourse("yue", "yue-Hant-HK/standard"), { lexemes: { lexemes: [] }, language: {} });
    expect(x.problems).toEqual([{ kind: "no-notation" }]);
    expect(explore(x, ask("lexeme:我", {}))).toEqual({ ok: false, error: { kind: "not-ready", details: [] } });
  });
});

describe("encodeExplore and decodeExplore", () => {
  it("keep a request in an address, and back", () => {
    const request = ask("lexeme:shereb", { Aspect: "Imp", Mood: "Ind" }, { before: [{ lexeme: "lexeme:w" }], after: [{ lexeme: "lexeme:obj-1sg" }], next: "lexeme:bet", blocking: false });
    const encoded = encodeExplore(request);
    expect(encoded).toBe("b=lexeme%3Ashereb&f=Aspect%3DImp%3BMood%3DInd&p=lexeme%3Aw&s=lexeme%3Aobj-1sg&n=lexeme%3Abet&o=blocking");
    expect(decodeExplore(encoded)).toEqual(request);
    // A lexeme beside the base with the values the token gives it (es buscarlos).
    const los = ask("lexeme:buscar", { VerbForm: "Inf" }, { after: [{ lexeme: "lexeme:lo", feats: { Gender: "Masc", Number: "Plur" } }] });
    expect(decodeExplore(encodeExplore(los))).toEqual(los);
    expect(decodeExplore("")).toBeUndefined();
    expect(decodeExplore("b=lexeme%3Abet")).toEqual(ask("lexeme:bet", {}));
  });
});

describe("a cell's defaults", () => {
  const es = (): RulesExplorer => rulesExplorer(loadCourse("es"), sourceOf("es", ["es-Latn/standard"]));
  const hbo = (): RulesExplorer => rulesExplorer(loadCourse("hbo"), sourceOf("hbo", ["hbo-Hebr/tiberian"]));
  const lexeme = (x: RulesExplorer, id: string) => {
    const found = x.lexemes.find((l) => l.row.id.id === id);
    if (found === undefined) throw new Error(id);
    return found;
  };

  it("opens a lexeme in its citation cell: es the infinitive, apc and hbo the 3ms perfect, a lexeme's own citation", () => {
    expect(lexeme(es(), "lexeme:tener").citation).toEqual({ VerbForm: "Inf" });
    expect(lexeme(apc(), "lexeme:shereb").citation).toEqual({ Aspect: "Perf", Person: "3", Gender: "Masc", Number: "Sing" });
    expect(lexeme(hbo(), "lexeme:halakh").citation).toMatchObject({ Aspect: "Perf", Person: "3", Gender: "Masc", Number: "Sing" });
    expect(lexeme(apc(), "lexeme:khayef").citation).toEqual({ Aspect: "Part", Gender: "Masc", Number: "Sing" });
    // A noun's gender is its own, not its cell's.
    expect(lexeme(es(), "lexeme:casa").citation).toEqual({ Number: "Sing" });
  });

  it("never offers a lexical feature the lexeme does not choose: قهوة's gender is its own, tío's is chosen", () => {
    const x = apc();
    const ahwe = lexeme(x, "lexeme:ahwe");
    expect(ahwe.features.map((f) => f.feature)).toEqual(["Number"]);
    // Its own Fem gives قهوة with the cell's number alone.
    const result = explore(x, ask("lexeme:ahwe", { Number: "Sing" }));
    expect(result.ok && result.spellings.find((s) => s.orthography === "apc-Arab/standard" && s.layer === undefined)?.spelling?.tokens[0]?.surface).toBe("قهوة");
    expect(lexeme(es(), "lexeme:tío").features.map((f) => f.feature)).toContain("Gender");
  });

  it("drops the values no known cell combines with the one chosen (es: a finite verb has no gender)", () => {
    const x = es();
    const tener = lexeme(x, "lexeme:tener");
    const participle = { Gender: "Fem", Number: "Sing", Tense: "Past", VerbForm: "Part" };
    expect(fitCell(x, tener, { ...participle, VerbForm: "Fin" }, "VerbForm")).toEqual({ Number: "Sing", Tense: "Past", VerbForm: "Fin" });
    // A cell that fits is left as it is.
    expect(fitCell(x, tener, participle, "Gender")).toEqual(participle);
    // apc: the participle has no person.
    const y = apc();
    const shereb = lexeme(y, "lexeme:shereb");
    expect(fitCell(y, shereb, { Aspect: "Part", Person: "3", Gender: "Masc", Number: "Sing" }, "Aspect")).toEqual({ Aspect: "Part", Gender: "Masc", Number: "Sing" });
  });
});
