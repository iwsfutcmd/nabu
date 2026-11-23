/**
 * core-cli protocol: one JSON request per line on stdin, one JSON response per
 * line on stdout, in order. The Python compiler keeps one process alive and
 * calls the same normalization and matching code that grades learners
 * (gameplan §5.1). The conformance harnesses in both languages drive it.
 *
 * Request: { id, op, ...args }. Response: { id, ok: true, result } or { id, ok: false, error }.
 */
import { caseFold, checkTaggedText, compileProfile, readingProjection, type ReadingProjection, type SpellingProjection, compileAcceptSet, compileGlossary, glossText, glossTokens, glossUnits, gradeReading, gradeVowels, graphemes, grade, lexiconKey, parseExemplarSet, readingSyllables, type CompiledAcceptSet, type CompiledGlossary, type CompiledProfile, type GlossEntry, type LexemeForm, type WordForm } from "@nabu/core";
import { TONE_SYSTEMS } from "@nabu/core/speech";
import { directionOf, scriptOf } from "@nabu/i18n";
import { formKey, homophoneScheme, homophoneTable, otherSpellings, parseFormKey } from "@nabu/core/lesson";
import type { OrthographyProfile, TaggedText, Token } from "@nabu/schema";
import { loadProfileData, loadProfiles } from "./load.ts";
import { REALISE_OPS } from "./realise.ts";

type Id = number | string | null;
export type Response = { readonly id: Id; readonly ok: true; readonly result: unknown } | { readonly id: Id; readonly ok: false; readonly error: string };

type Args = Readonly<Record<string, unknown>>;

let profiles: ReadonlyMap<string, CompiledProfile> | undefined;
const profile = (args: Args): CompiledProfile => {
  profiles ??= loadProfiles();
  const p = profiles.get(String(args["profile"]));
  if (p === undefined) throw new Error(`unknown profile "${String(args["profile"])}"`);
  return p;
};

/**
 * A profile with another sound statement (`statement`: its `sound`, `stress` and `correspondences`
 * in place of the profile's), so a vector can exercise a correspondence no profile states yet: a
 * free one (an accepted variant), a sound read off a scheme's pinned readings.
 */
const restated = new Map<string, CompiledProfile>();
const profileFor = (args: Args): CompiledProfile => {
  const p = profile(args);
  const statement = args["statement"];
  if (statement === undefined) return p;
  if (typeof statement !== "object" || statement === null || Array.isArray(statement)) throw new Error('"statement" must be an object of sound, stress and correspondences');
  const key = `${p.id}\u0000${JSON.stringify(statement)}`;
  let compiled = restated.get(key);
  if (compiled === undefined) {
    const { sound: _sound, stress: _stress, correspondences: _correspondences, ...rest } = p.source;
    const made = compileProfile({ ...rest, ...(statement as Partial<OrthographyProfile>) }, loadProfileData());
    if (!made.ok) throw new Error(`statement: ${JSON.stringify(made.error)}`);
    compiled = made.value;
    restated.set(key, compiled);
  }
  return compiled;
};

const acceptCache = new Map<string, CompiledAcceptSet>();
const acceptSet = (args: Args): CompiledAcceptSet => {
  const p = profileFor(args);
  const source = String(args["accept"]);
  const key = `${p.id}\u0000${JSON.stringify(args["statement"] ?? null)}\u0000${source}`;
  let set = acceptCache.get(key);
  if (set === undefined) {
    const compiled = compileAcceptSet(source, p);
    if (!compiled.ok) throw new Error(`accept set: ${compiled.error.map((e) => `${e.code} (line ${e.line}): ${e.message}`).join("; ")}`);
    set = compiled.value;
    acceptCache.set(key, set);
  }
  return set;
};

const glossaryCache = new Map<string, CompiledGlossary>();
const glossary = (args: Args): CompiledGlossary => {
  const p = profile(args);
  const entries = args["entries"];
  if (!Array.isArray(entries)) throw new Error('"entries" must be an array of {id, text}');
  const key = `${p.id}\u0000${JSON.stringify(entries)}`;
  let compiled = glossaryCache.get(key);
  if (compiled === undefined) {
    compiled = compileGlossary(p, entries as GlossEntry[]);
    glossaryCache.set(key, compiled);
  }
  return compiled;
};

/** A form as a request gives it: `{ pos?, feats }` (a word's part of speech and feature values there). */
const wordForm = (given: unknown): WordForm => {
  const form = typeof given === "object" && given !== null ? (given as Record<string, unknown>) : {};
  const feats = typeof form["feats"] === "object" && form["feats"] !== null ? (form["feats"] as Record<string, unknown>) : {};
  return {
    ...(typeof form["pos"] === "string" && { pos: form["pos"] }),
    feats: Object.fromEntries(Object.entries(feats).map(([name, value]) => [name, String(value)])),
  };
};

/** A profile's writing side (ADR 0148): only where its sound is read off its spelling. */
const spellingProjection = (args: Args): SpellingProjection => {
  const p = profile(args);
  const projection = p.projection;
  if (projection === undefined) throw new Error(`${p.id} states no sound`);
  if (projection.from !== "spelling") throw new Error(`${p.id} reads its sound from the scheme ${projection.scheme}`);
  return projection;
};

/** A scheme's statement (ADR 0148). */
const schemeProjection = (args: Args): ReadingProjection => {
  const id = String(args["scheme"]);
  const projection = readingProjection(id);
  if (projection === undefined) throw new Error(`unknown scheme "${id}"`);
  return projection;
};

/** An optional string argument. */
const optionalText = (args: Args, key: string): string | undefined => {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`"${key}" must be a string`);
  return value;
};

const text = (args: Args, key = "text"): string => {
  const value = args[key];
  if (typeof value !== "string") throw new Error(`"${key}" must be a string`);
  return value;
};

const OPS: Readonly<Record<string, (args: Args) => unknown>> = {
  ping: () => "pong",
  graphemes: (a) => graphemes(text(a), typeof a["locale"] === "string" ? a["locale"] : undefined),
  normalize: (a) => profile(a).normalize(text(a)),
  units: (a) => {
    const p = profile(a);
    return p.units(p.normalize(text(a)));
  },
  fold: (a) => profile(a).fold(text(a)),
  /** Runtime units, case-folded, ignorable marks stripped: what tap-to-gloss and hint lookup match on. */
  "fold-units": (a) => glossUnits(profile(a), text(a)),
  "case-fold": (a) => caseFold(text(a), text(a, "locale")),
  /**
   * Tap-for-gloss segmentation: longest match against `entries`, exact and folded passes side
   * by side. Over `tokens` (a compiled sentence or story line) when given, else over `text`.
   */
  gloss: (a) => {
    const g = glossary(a);
    const p = profile(a);
    return Array.isArray(a["tokens"]) ? glossTokens(g, p, a["tokens"] as Parameters<typeof glossTokens>[2]) : glossText(g, p, text(a));
  },
  letters: (a) => {
    const p = profile(a);
    return p.letters(p.fold(p.normalize(text(a))));
  },
  accept: (a) => {
    const set = acceptSet(a);
    return {
      paths: set.paths,
      alternatives: set.lattice.alternatives.filter((x) => x.flags.length === 0).map((x) => x.normalized),
      canonical: set.lattice.alternatives.find((x) => x.canonical)?.normalized,
      /** The canonical answer as written (unnormalized): what a translation displays. */
      canonicalSource: set.lattice.alternatives.find((x) => x.canonical)?.source,
      warnings: set.warnings.map((w) => w.code),
    };
  },
  grade: (a) => {
    const set = acceptSet(a);
    const keyed = (name: string): ReadonlySet<string> | undefined =>
      Array.isArray(a[name]) ? new Set((a[name] as unknown[]).map((w) => lexiconKey(set.profile, String(w)))) : undefined;
    const lexicon = keyed("lexicon");
    const inflected = keyed("inflected");
    // Each word with the forms the course's tokens write it in: { word: [{ pos?, feats }] } (ADR 0084).
    const given = a["forms"];
    const forms =
      typeof given === "object" && given !== null && !Array.isArray(given)
        ? new Map(Object.entries(given).map(([w, fs]) => [lexiconKey(set.profile, w), Array.isArray(fs) ? fs.map(wordForm) : []]))
        : undefined;
    // Whose form each word is: { word: [form key, …] }, each form key's lexemes its own (ADR 0148).
    const written = a["lexemes"];
    const lexemes =
      typeof written === "object" && written !== null && !Array.isArray(written)
        ? new Map(
            Object.entries(written).map(([w, keys]): [string, LexemeForm[]] => [
              lexiconKey(set.profile, w),
              (Array.isArray(keys) ? keys.map(String) : []).flatMap((form) => parseFormKey(form).map(({ lexeme }) => ({ lexeme, form }))),
            ]),
          )
        : undefined;
    // The readings tokens pin on each word, for a sound read off a scheme: { word: [reading, …] }.
    const pinned = a["readings"];
    const readings =
      typeof pinned === "object" && pinned !== null && !Array.isArray(pinned)
        ? new Map(Object.entries(pinned).map(([w, rs]) => [lexiconKey(set.profile, w), Array.isArray(rs) ? rs.map(String) : []]))
        : undefined;
    return grade(set, text(a, "answer"), { ...(lexicon && { lexicon }), ...(inflected && { inflected }), ...(forms && { forms }), ...(lexemes && { lexemes }), ...(readings && { readings }) });
  },
  /** A word's vowel marks as the learner wrote them, against its vocalized form (ADR 0054). */
  "grade-vowels": (a) => gradeVowels(profile(a).marks, text(a, "expected"), text(a, "answer")),
  /** A word's romanized reading as typed, against the pinned one (ADR 0054). */
  "grade-reading": (a) => gradeReading(text(a, "scheme"), text(a, "expected"), text(a, "answer")),
  /** A reading as typed, in syllables as its scheme's data shapes them (ADR 0109); null where it is not syllables. */
  "reading-syllables": (a) => readingSyllables(text(a, "scheme"), text(a)) ?? null,
  /** A syllable's tone, from its scheme's tone marks (ADR 0109); null where it has none. */
  "reading-tone": (a) => {
    const system = TONE_SYSTEMS[text(a, "scheme")];
    if (system === undefined) throw new Error(`no tones in ${text(a, "scheme")}`);
    return system.toneOf(text(a, "syllable")) ?? null;
  },
  direction: (a) => ({ script: scriptOf(text(a, "tag")), dir: directionOf(text(a, "tag")) }),
  "check-tagged-text": (a) => checkTaggedText(a["text"] as TaggedText).map((i) => i.code),
  /** A token's form key (ADR 0146): the lexemes it writes, each in the form it has there; null for a token that names none. */
  "form-key": (a) => ({ key: formKey(a["token"] as Token) ?? null }),
  "parse-form-key": (a) => parseFormKey(text(a, "key")),
  "unicode-set": (a) => parseExemplarSet(text(a, "set")),
  /** What a word's spelling says, site by site, with its syllables and stress where the profile states them (ADR 0148). */
  "sound-read": (a) => spellingProjection(a).read(text(a)),
  /** Two spellings compared by what they say, and where they differ. */
  "sound-compare": (a) => spellingProjection(a).compare(text(a, "expected"), text(a, "typed")),
  /** A word's other spellings of its sound, one place traded for another fixed way of writing it. */
  "sound-spellings": (a) => spellingProjection(a).spellings(text(a)),
  /**
   * Each word's other spellings a spelling card may offer (ADR 0142, 0148: `otherSpellings`), as the
   * card finds them: `words` are tokens (surface, variants, ruby); `tokens` the course's tokens in the
   * orthography, whose ruby gives the homophone characters where the profile knows them.
   */
  "spelling-others": (a) => {
    const p = profile(a);
    const words = a["words"];
    if (!Array.isArray(words)) throw new Error('"words" must be an array of tokens');
    const scheme = homophoneScheme(p);
    const tokens = a["tokens"];
    if (scheme !== undefined && !Array.isArray(tokens)) throw new Error(`"tokens" must be the course's tokens: ${p.id} knows homophones`);
    const homophones = scheme === undefined ? undefined : homophoneTable(tokens as Token[], scheme);
    return (words as Token[]).map((w) => otherSpellings(p, w, homophones));
  },
  /** Whether the scheme's statement relates a reading to a spelling: the sites of one path, or null. */
  "reading-spells": (a) => schemeProjection(a).spells(text(a, "reading"), text(a, "spelling")) ?? null,
  /** The places of a reading the script leaves open, each with the reading changed there in every way. */
  "reading-variants": (a) => schemeProjection(a).variants(text(a, "reading"), optionalText(a, "spelling")),
  /** A reading as minimal ruby: only its open pieces (ADR 0141). */
  "reading-open": (a) => schemeProjection(a).open(text(a, "reading"), optionalText(a, "spelling")),
  /** Realisation (docs/rules-design.md): realise, realise-token, paradigm. */
  ...REALISE_OPS,
};

/**
 * Many requests in one line (`batch`: `requests`, each an op and its arguments, no id): a response for
 * each, in order, as `handleRequest` gives it. The compiler asks a whole course's questions so.
 */
const batch = (request: Args): Response => {
  const id = (request["id"] ?? null) as Id;
  const requests = request["requests"];
  if (!Array.isArray(requests)) return { id, ok: false, error: '"requests" must be an array' };
  return { id, ok: true, result: requests.map((r: unknown) => (typeof r === "object" && r !== null && (r as Args)["op"] !== "batch" ? handleRequest(r as Args) : { id: null, ok: false, error: "invalid request" })) };
};

export const handleRequest = (request: Args): Response => {
  const id = (request["id"] ?? null) as Id;
  if (request["op"] === "batch") return batch(request);
  const op = OPS[String(request["op"])];
  if (op === undefined) return { id, ok: false, error: "unknown op" };
  try {
    return { id, ok: true, result: op(request) };
  } catch (e) {
    return { id, ok: false, error: (e as Error).message };
  }
};

export const handle = (line: string): Response => {
  let request: unknown;
  try {
    request = JSON.parse(line);
  } catch {
    return { id: null, ok: false, error: "invalid JSON" };
  }
  if (typeof request !== "object" || request === null) return { id: null, ok: false, error: "invalid request" };
  return handleRequest(request as Args);
};
