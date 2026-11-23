/**
 * core-cli's realisation ops (docs/rules-design.md, section 4): `realise`, `realise-token` and
 * `paradigm`. The language is `lang` (lexicons/<lang>/language.yaml and lexemes.yaml, or under the
 * folder `lexicons` names: a course's own, as the compiler passes it) or, as a
 * projection vector passes a `statement`, a `language` and a `lexicon` given whole, so a vector can
 * test blocking and each rewrite on a fixture; or `lang` with a `lexicon` given whole, so a vector runs
 * the language's own rules over a lexeme form its lexicon does not hold yet. All are checked against
 * their schemas first.
 * Each op answers with the result as a value ({ ok, value } or { ok: false, error }): a realisation
 * that fails is an answer, not a protocol error.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { compileLanguage, paradigm, realise, realiseToken, type CompiledLanguage, type WrittenLexeme } from "@nabu/core/lexicon";
import type { LanguageDeclaration, Lexicon, UdFeatures } from "@nabu/schema";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { parse } from "yaml";
import { REPO } from "./load.ts";

type Args = Readonly<Record<string, unknown>>;

let ajv: Ajv2020 | undefined;
const validator = (name: string): ValidateFunction => {
  if (ajv === undefined) {
    ajv = new Ajv2020({ strict: true, allErrors: true });
    ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
    const dir = join(REPO, "schemas");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".schema.json"))) ajv.addSchema(JSON.parse(readFileSync(join(dir, f), "utf8")) as object);
  }
  return ajv.getSchema(`https://nabu.invalid/schemas/v0/${name}.schema.json`)!;
};

const checked = <T>(data: unknown, schema: string, what: string): T => {
  const validate = validator(schema);
  if (!validate(data)) throw new Error(`${what}: ${ajv?.errorsText(validate.errors) ?? "invalid"}`);
  return data as T;
};

const compiled = new Map<string, CompiledLanguage>();
const compile = (key: string, declared: LanguageDeclaration, lexicon: Lexicon): CompiledLanguage => {
  let lang = compiled.get(key);
  if (lang === undefined) {
    const made = compileLanguage(declared, lexicon);
    if (!made.ok) throw new Error(`language: ${made.error.join("; ")}`);
    lang = made.value;
    compiled.set(key, lang);
  }
  return lang;
};

/** The language a request names (`lang`) or gives (`language` and `lexicon`). */
const languageOf = (args: Args): CompiledLanguage => {
  const declared = args["language"];
  const lexicon = args["lexicon"];
  const code = args["lang"];
  if (typeof code === "string" && declared === undefined && typeof lexicon === "object" && lexicon !== null) {
    // The language's own rules over a lexicon given whole (a lexeme form its lexicon does not hold yet).
    if (!/^[a-z]{2,3}$/u.test(code)) throw new Error('"lang" must be a language code');
    const read = parse(readFileSync(join(REPO, "lexicons", code, "language.yaml"), "utf8")) as unknown;
    const key = `lang+lexicon\u0000${code}\u0000${JSON.stringify(lexicon)}`;
    return compile(key, checked<LanguageDeclaration>(read, "language", `lexicons/${code}/language.yaml`), checked<Lexicon>(lexicon, "lexicon", "lexicon"));
  }
  if (declared !== undefined || lexicon !== undefined) {
    if (typeof declared !== "object" || declared === null || typeof lexicon !== "object" || lexicon === null) throw new Error('"language" and "lexicon" are given together, as objects');
    const key = `given\u0000${JSON.stringify(declared)}\u0000${JSON.stringify(lexicon)}`;
    return compile(key, checked<LanguageDeclaration>(declared, "language", "language"), checked<Lexicon>(lexicon, "lexicon", "lexicon"));
  }
  if (typeof code !== "string" || !/^[a-z]{2,3}$/u.test(code)) throw new Error('"lang" must be a language code, or "language" and "lexicon" given');
  // `lexicons`: the folder a course keeps its lexicons in, where it is not the repo's (a test's course).
  const folder = args["lexicons"];
  if (folder !== undefined && typeof folder !== "string") throw new Error('"lexicons" must be a folder');
  const dir = folder ?? join(REPO, "lexicons");
  const key = `lang\u0000${dir}\u0000${code}`;
  const cached = compiled.get(key);
  if (cached !== undefined) return cached;
  const read = (name: string): unknown => parse(readFileSync(join(dir, code, name), "utf8"));
  return compile(key, checked<LanguageDeclaration>(read("language.yaml"), "language", `lexicons/${code}/language.yaml`), checked<Lexicon>(read("lexemes.yaml"), "lexicon", `lexicons/${code}/lexemes.yaml`));
};

const feats = (given: unknown, what: string): UdFeatures => {
  if (typeof given !== "object" || given === null || Array.isArray(given)) throw new Error(`"${what}" must be an object of feature values`);
  return Object.fromEntries(Object.entries(given).map(([k, v]) => [k, String(v)]));
};

const options = (args: Args): { blocking?: boolean; spellings?: boolean; pinned?: boolean; word?: number; next?: string; strict?: boolean } => {
  const word = args["word"];
  const next = args["next"];
  if (next !== undefined && typeof next !== "string") throw new Error('"next" must be a lexeme id');
  if (word !== undefined && (typeof word !== "number" || !Number.isInteger(word) || word < 0)) throw new Error('"word" must be a whole number, from 0');
  return {
    ...(args["blocking"] === false && { blocking: false }),
    ...(args["spellings"] === false && { spellings: false }),
    ...(args["pinned"] === false && { pinned: false }),
    ...(args["strict"] === true && { strict: true }),
    ...(typeof word === "number" && { word }),
    ...(typeof next === "string" && { next }),
  };
};

const lexemeArg = (args: Args): string => {
  const id = args["lexeme"];
  if (typeof id !== "string") throw new Error('"lexeme" must be a lexeme id');
  return id;
};

export const REALISE_OPS: Readonly<Record<string, (args: Args) => unknown>> = {
  /** A lexeme in a cell: its lexical form, status and the rules (with branches) taken (`blocking: false`: the regularised form; `spellings: false`: forms that pin spellings only passed over; `pinned: false`: every pinned form passed over). */
  realise: (a) => realise(languageOf(a), lexemeArg(a), feats(a["cell"] ?? {}, "cell"), options(a)),
  /** A token's lexemes (`lexemes`: [{ lexeme, feats?, base? }]) realised and joined (`word`: the word of a phrase lexeme's form the token writes; `next`: the base lexeme of the word after it). */
  "realise-token": (a) => {
    const written = a["lexemes"];
    if (!Array.isArray(written)) throw new Error('"lexemes" must be an array of { lexeme, feats?, base? }');
    const list: WrittenLexeme[] = written.map((w: unknown) => {
      const o = (typeof w === "object" && w !== null ? w : {}) as Record<string, unknown>;
      if (typeof o["lexeme"] !== "string") throw new Error("each written lexeme names its lexeme");
      return { lexeme: o["lexeme"], ...(o["feats"] !== undefined && { feats: feats(o["feats"], "feats") }), ...(o["base"] === true && { base: true }) };
    });
    return realiseToken(languageOf(a), list, options(a));
  },
  /** A lexeme in each of `cells` (`strict: true`: as the bundle's paradigms list them, a cell no exponent names is no-rule). */
  paradigm: (a) => {
    const cells = a["cells"];
    if (!Array.isArray(cells)) throw new Error('"cells" must be an array of cells');
    return paradigm(languageOf(a), lexemeArg(a), cells.map((c: unknown) => feats(c, "cells")), options(a));
  },
};
