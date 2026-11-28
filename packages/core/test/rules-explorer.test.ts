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
import { decodeExplore, encodeExplore, explore, EXPLORE_DEFAULTS, addable, arrange, attachable, explorerParadigm, fitCell, opening, rulesExplorer, waysOf, type ExploreRequest, type LexiconSource, type RulesExplorer } from "../src/lesson/index.ts";
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
    // apc merges lexemes (ADR 0158, 0159): a verb has no switches; its values are what its lexemes bring.
    expect(x.merging).toBe(true);
    expect(shereb?.features).toEqual([]);
  });

  it("realises a verb merged with its lexemes, every rewrite taken, and spells it", () => {
    const x = apc();
    const merged = ask("lexeme:shereb", {}, { before: [{ lexeme: "lexeme:ind" }, { lexeme: "lexeme:impf-2" }], after: [{ lexeme: "lexeme:fs.verb" }] });
    const got = explore(x, merged);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.status).toBe("given");
    expect(got.feats).toEqual({ Aspect: "Imp", Gender: "Fem", Mood: "Ind", Number: "Sing", Person: "2" });
    // Asked by its values (a paradigm's cell, an older address), the same word: the values become its lexemes.
    const byCell = explore(x, ask("lexeme:shereb", { Aspect: "Imp", Mood: "Ind", Person: "2", Gender: "Fem", Number: "Sing" }));
    expect(byCell.ok && byCell.spellings.map((s) => s.spelling?.tokens[0]?.surface)).toEqual(got.spellings.map((s) => s.spelling?.tokens[0]?.surface));
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

  it("opens a lexeme in its citation cell: es the infinitive, hbo the 3ms perfect, apc's as the lexemes of its merge", () => {
    expect(lexeme(es(), "lexeme:tener").citation).toEqual({ VerbForm: "Inf" });
    expect(lexeme(hbo(), "lexeme:halakh").citation).toMatchObject({ Aspect: "Perf", Person: "3", Gender: "Masc", Number: "Sing" });
    // apc merges lexemes: its citation is a merge (ADR 0158 §5a), the he-past's zero; a lexeme's own, the participle's.
    const x = apc();
    expect(opening(x, lexeme(x, "lexeme:shereb"))).toEqual({ feats: {}, before: [], after: [{ lexeme: "lexeme:perf-3ms" }] });
    expect(opening(x, lexeme(x, "lexeme:khayef")).after.map((a) => a.lexeme)).toEqual(expect.arrayContaining(["lexeme:ptcp", "lexeme:ms"]));
    expect(opening(es(), lexeme(es(), "lexeme:tener"))).toEqual({ feats: { VerbForm: "Inf" }, before: [], after: [] });
    // A noun's gender is its own, not its cell's.
    expect(lexeme(es(), "lexeme:casa").citation).toEqual({ Number: "Sing" });
  });

  it("never offers a lexical feature the lexeme does not choose: قهوة's gender is its own, tío's is chosen", () => {
    const x = apc();
    // apc merges: قهوة's own Fem stands with sg, and no feminine is offered onto it (it would bring Gender twice).
    const result = explore(x, ask("lexeme:ahwe", {}, { after: [{ lexeme: "lexeme:sg" }] }));
    expect(result.ok && result.spellings.find((s) => s.orthography === "apc-Arab/standard" && s.layer === undefined)?.spelling?.tokens[0]?.surface).toBe("قهوة");
    expect(addable(x, ask("lexeme:ahwe", {})).map((l) => l.row.id.id)).not.toContain("lexeme:fs");
    expect(lexeme(es(), "lexeme:tío").features.map((f) => f.feature)).toContain("Gender");
  });

  it("drops the values no known cell combines with the one chosen (es: a finite verb has no gender)", () => {
    const x = es();
    const tener = lexeme(x, "lexeme:tener");
    const participle = { Gender: "Fem", Number: "Sing", Tense: "Past", VerbForm: "Part" };
    expect(fitCell(x, tener, { ...participle, VerbForm: "Fin" }, "VerbForm")).toEqual({ Number: "Sing", Tense: "Past", VerbForm: "Fin" });
    // A cell that fits is left as it is.
    expect(fitCell(x, tener, participle, "Gender")).toEqual(participle);
    // hbo: the infinitive has no person.
    const y = hbo();
    const halakh = lexeme(y, "lexeme:halakh");
    const fitted = fitCell(y, halakh, { ...halakh.citation, VerbForm: "Inf" }, "VerbForm");
    expect(fitted["Person"]).toBeUndefined();
  });
});

describe("what may be written with a base", () => {
  it("offers bound lexemes and the clitics the course writes on that side, never a free word (apc إنت)", () => {
    const x = apc();
    const ids = (side: "before" | "after"): readonly string[] => attachable(x, side).map((l) => l.row.id.id);
    expect(ids("after")).toContain("lexeme:obj-1sg");
    // el- states no side (it follows a preposition in 3al): it stands where the course writes it more often.
    expect(ids("before")).toEqual(expect.arrayContaining(["lexeme:el", "lexeme:b", "lexeme:w"]));
    expect(ids("before")).not.toContain("lexeme:enta");
    expect(ids("after")).not.toContain("lexeme:enta");
    expect(ids("after").length).toBeLessThan(x.lexemes.length / 4);
  });

  it("writes apc's lexemes in the order they merge, the clitics outside: w-b-y-shrab-o-h", () => {
    const x = apc();
    const picked = ["lexeme:obj-3ms", "lexeme:pl.verb", "lexeme:impf-3", "lexeme:w", "lexeme:ind"].reduce(
      (r, id) => ({ ...r, ...arrange(x, r, id) }),
      ask("lexeme:shereb", {}),
    );
    expect(picked.before.map((a) => a.lexeme)).toEqual(["lexeme:w", "lexeme:ind", "lexeme:impf-3"]);
    expect(picked.after.map((a) => a.lexeme)).toEqual(["lexeme:pl.verb", "lexeme:obj-3ms"]);
    const got = explore(x, picked);
    expect(got.ok && got.missing).toBeUndefined();
    // The object suffix is offered only once the word is complete.
    expect(addable(x, ask("lexeme:shereb", {}, { before: [{ lexeme: "lexeme:impf-3" }] })).map((l) => l.row.id.id)).not.toContain("lexeme:obj-3ms");
  });
});
