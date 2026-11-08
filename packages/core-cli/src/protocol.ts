/**
 * core-cli protocol: one JSON request per line on stdin, one JSON response per
 * line on stdout, in order. The Python compiler keeps one process alive and
 * calls the same normalization and matching code that grades learners
 * (gameplan §5.1). The conformance harnesses in both languages drive it.
 *
 * Request: { id, op, ...args }. Response: { id, ok: true, result } or { id, ok: false, error }.
 */
import { caseFold, checkTaggedText, compileAcceptSet, compileGlossary, glossText, glossTokens, glossUnits, gradeReading, gradeVowels, graphemes, grade, lexiconKey, parseExemplarSet, type CompiledAcceptSet, type CompiledGlossary, type CompiledProfile, type GlossEntry } from "@nabu/core";
import { directionOf, scriptOf } from "@nabu/i18n";
import type { TaggedText } from "@nabu/schema";
import { loadProfiles } from "./load.ts";

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

const acceptCache = new Map<string, CompiledAcceptSet>();
const acceptSet = (args: Args): CompiledAcceptSet => {
  const p = profile(args);
  const source = String(args["accept"]);
  const key = `${p.id}\u0000${source}`;
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
  if (!Array.isArray(entries)) throw new Error('"entries" must be an array of {kc, text}');
  const key = `${p.id}\u0000${JSON.stringify(entries)}`;
  let compiled = glossaryCache.get(key);
  if (compiled === undefined) {
    compiled = compileGlossary(p, entries as GlossEntry[]);
    glossaryCache.set(key, compiled);
  }
  return compiled;
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
    // Each inflected word with the forms the course pins it as: { word: [form KC ids] } (ADR 0084).
    const given = a["forms"];
    const forms =
      typeof given === "object" && given !== null && !Array.isArray(given)
        ? new Map(Object.entries(given).map(([w, fs]) => [lexiconKey(set.profile, w), Array.isArray(fs) ? fs.map(String) : []]))
        : undefined;
    return grade(set, text(a, "answer"), { ...(lexicon && { lexicon }), ...(inflected && { inflected }), ...(forms && { forms }) });
  },
  /** A word's vowel marks as the learner wrote them, against its vocalized form (ADR 0054). */
  "grade-vowels": (a) => gradeVowels(profile(a).marks, text(a, "expected"), text(a, "answer")),
  /** A word's romanized reading as typed, against the pinned one (ADR 0054). */
  "grade-reading": (a) => gradeReading(text(a, "scheme"), text(a, "expected"), text(a, "answer")),
  direction: (a) => ({ script: scriptOf(text(a, "tag")), dir: directionOf(text(a, "tag")) }),
  "check-tagged-text": (a) => checkTaggedText(a["text"] as TaggedText).map((i) => i.code),
  "unicode-set": (a) => parseExemplarSet(text(a, "set")),
};

export const handleRequest = (request: Args): Response => {
  const id = (request["id"] ?? null) as Id;
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
