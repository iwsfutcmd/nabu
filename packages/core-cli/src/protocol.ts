/**
 * core-cli protocol: one JSON request per line on stdin, one JSON response per
 * line on stdout, in order. The Python compiler keeps one process alive and
 * calls the same normalization and matching code that grades learners
 * (gameplan §5.1). The conformance harnesses in both languages drive it.
 *
 * Request: { id, op, ...args }. Response: { id, ok: true, result } or { id, ok: false, error }.
 */
import { caseFold, checkTaggedText, compileAcceptSet, glossUnits, graphemes, grade, parseExemplarSet, type CompiledAcceptSet, type CompiledProfile } from "@nabu/core";
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
    const lexicon = Array.isArray(a["lexicon"]) ? new Set((a["lexicon"] as unknown[]).map(String)) : undefined;
    return grade(acceptSet(a), text(a, "answer"), lexicon === undefined ? {} : { lexicon });
  },
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
