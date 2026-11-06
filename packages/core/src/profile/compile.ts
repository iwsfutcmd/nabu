/**
 * Profile compiler: an OrthographyProfile plus the data it refers to (tables,
 * keyboard layout, numbering systems) becomes a set of pure functions the
 * matcher uses. Data is passed in, never imported or fetched, so core stays
 * pure; the Node loader (core-cli) and the client both resolve it.
 */
import type { DataTable, KeyboardLayout, OrthographyProfile, Policy } from "@nabu/schema";
import { compileNormalizer, literalMap, type StepFn } from "../normalize/steps.ts";
import { err, ok, type Result } from "../result.ts";
import { asciiLowercase } from "../text/ascii.ts";
import { caseFold } from "../text/case.ts";
import { graphemes } from "../text/graphemes.ts";
import { letterSegmenter } from "../text/letters.ts";
import { parseExemplarSet } from "../text/unicode-set.ts";

export interface ProfileData {
  readonly numberingSystems: Readonly<Record<string, string>>;
  readonly tables: Readonly<Record<string, DataTable>>;
  readonly keyboards: Readonly<Record<string, KeyboardLayout>>;
}

export type UnitKind = "token" | "grapheme";

interface Policied {
  readonly policy: Policy;
  readonly note?: string | undefined;
}

export interface CompiledEquivalence extends Policied {
  readonly id: string;
  readonly apply: StepFn;
}

export interface CompiledProfile {
  readonly id: string;
  readonly lang: string;
  readonly source: OrthographyProfile;
  readonly normalize: StepFn;
  /** Tokens (split at spaces) when spaces survive normalization, else grapheme clusters (§6.5). */
  readonly unitKind: UnitKind;
  readonly units: (normalized: string) => readonly string[];
  /** Locale-aware case fold; identity for caseless orthographies. */
  readonly fold: StepFn;
  /** The orthography's letters (longest match), else grapheme clusters. */
  readonly letters: (text: string) => readonly string[];
  readonly equivalences: readonly CompiledEquivalence[];
  readonly marks?: Policied & {
    readonly strip: StepFn;
    /** The marks, one code point each (NFD). */
    readonly set: ReadonlySet<string>;
    /** Marks a learner supplying the vowel marks may write or leave out (ADR 0054). */
    readonly optional: ReadonlySet<string>;
    /** Marks that tell words apart (Spanish está/esta, ADR 0075): another word of the course is WRONG_WORD. */
    readonly distinguishes: boolean;
    readonly wordNote?: string | undefined;
  };
  readonly zwnj?: Policied & { readonly equivalents: readonly string[] };
  readonly variants?: Policied & { readonly key: StepFn };
  readonly homophones?: Policied & { readonly readings: (cluster: string) => readonly string[] | undefined };
  readonly scriptMismatch?: Policied & { readonly chars: ReadonlySet<string> };
  readonly typo?: {
    readonly model: "keyboard" | "marks" | "ime-homophone";
    readonly maxRatio: number;
    readonly minLength: number;
    readonly adjacent: (a: string, b: string) => boolean;
    /** A unit as contrasts compare it: case-folded, equivalences applied, marks stripped. */
    readonly key: StepFn;
    /** Sets of meaningful endings (erratum 46): each member's spellings, keyed, as graphemes. */
    readonly contrasts: readonly CompiledContrast[];
  };
  readonly apostrophe?: Policied;
}

export interface CompiledContrast {
  readonly id: string;
  readonly note?: string | undefined;
  readonly members: readonly (readonly (readonly string[])[])[];
}

export type ProfileError =
  | { readonly code: "unknown-table"; readonly table: string }
  | { readonly code: "wrong-table-kind"; readonly table: string; readonly expected: DataTable["kind"] }
  | { readonly code: "unknown-keyboard"; readonly keyboard: string }
  | { readonly code: "bad-step"; readonly message: string }
  | { readonly code: "bad-unicode-set"; readonly message: string };

const DEFAULT_MAX_RATIO = 0.2;
const CACHE_LIMIT = 4096;

/** Memoizes a pure string function (bounded; cleared when full). Invisible to callers. */
const memo = <T>(fn: (s: string) => T): ((s: string) => T) => {
  const cache = new Map<string, T>();
  return (s) => {
    let v = cache.get(s);
    if (v === undefined) {
      if (cache.size >= CACHE_LIMIT) cache.clear();
      v = fn(s);
      cache.set(s, v);
    }
    return v;
  };
};
const DEFAULT_MIN_LENGTH = 3;

/** Physical adjacency from row geometry: neighbours within one key width, same or next row. */
export const keyboardAdjacency = (layout: KeyboardLayout | undefined): ((a: string, b: string) => boolean) => {
  if (layout === undefined) return () => false;
  const positions = new Map<string, { x: number; y: number }[]>();
  layout.rows.forEach((row, y) => {
    row.keys.forEach((key, col) => {
      if (Array.from(key).length !== 1) return;
      const list = positions.get(key) ?? [];
      list.push({ x: (row.offset ?? 0) + col, y });
      positions.set(key, list);
    });
  });
  return (a, b) => {
    const pa = positions.get(a);
    const pb = positions.get(b);
    if (pa === undefined || pb === undefined || a === b) return false;
    return pa.some((p) => pb.some((q) => Math.abs(p.y - q.y) <= 1 && Math.abs(p.x - q.x) <= 1.01));
  };
};

export const compileProfile = (profile: OrthographyProfile, data: ProfileData): Result<CompiledProfile, readonly ProfileError[]> => {
  const errors: ProfileError[] = [];
  const table = (id: string, kind: DataTable["kind"]): DataTable | undefined => {
    const t = data.tables[id];
    if (t === undefined) errors.push({ code: "unknown-table", table: id });
    else if (t.kind !== kind) errors.push({ code: "wrong-table-kind", table: id, expected: kind });
    else return t;
    return undefined;
  };

  let normalize: StepFn = (t) => t.normalize("NFC");
  try {
    normalize = compileNormalizer(profile.normalize, data.numberingSystems);
  } catch (e) {
    errors.push({ code: "bad-step", message: (e as Error).message });
  }

  const graphemeUnits = profile.normalize.some((s) => typeof s === "object" && "whitespace" in s && s.whitespace === "remove");
  const match = profile.match ?? {};
  const caseLocale = match.case === "none" ? undefined : (match.case?.locale ?? profile.lang);
  const fold: StepFn = caseLocale === undefined ? (t) => t : memo((t) => caseFold(t, caseLocale));
  const letters = memo(letterSegmenter(profile.letters?.map(fold)));

  let marks: CompiledProfile["marks"];
  if (match.marks !== undefined) {
    try {
      const set = new Set(parseExemplarSet(match.marks.set));
      const optional = new Set(match.marks.optional === undefined ? [] : parseExemplarSet(match.marks.optional));
      marks = {
        policy: match.marks.policy,
        note: match.marks.note,
        strip: (t) => Array.from(t.normalize("NFD")).filter((c) => !set.has(c)).join("").normalize("NFC"),
        set,
        optional,
        distinguishes: match.marks.distinguishes === true,
        wordNote: match.marks.wordNote,
      };
    } catch (e) {
      errors.push({ code: "bad-unicode-set", message: (e as Error).message });
    }
  }

  let variants: CompiledProfile["variants"];
  if (match.variants !== undefined) {
    const t = table(match.variants.table, "variants");
    const rep = new Map<string, string>();
    for (const group of t?.groups ?? []) for (const form of group) rep.set(form, group[0] as string);
    // Variant groups are single code points (Han characters), so no segmentation is needed.
    variants = { policy: match.variants.policy, note: match.variants.note, key: memo((s) => Array.from(s, (c) => rep.get(c) ?? c).join("")) };
  }

  let homophones: CompiledProfile["homophones"];
  if (match.homophones !== undefined) {
    const t = table(match.homophones.table, "readings");
    const readings = t?.readings ?? {};
    homophones = { policy: match.homophones.policy, readings: (c) => readings[c] };
  }

  let scriptMismatch: CompiledProfile["scriptMismatch"];
  if (match.scriptMismatch !== undefined) {
    const t = table(match.scriptMismatch.table, "charset");
    scriptMismatch = { policy: match.scriptMismatch.policy, note: match.scriptMismatch.note, chars: new Set(Array.from(t?.chars ?? "")) };
  }

  const equivalences = (match.equivalences ?? []).map((e) => ({ id: e.id, policy: e.policy, note: e.note, apply: literalMap(e.map) }));
  // As compareUnits folds two units: case, then each equivalence, then the marks.
  const key: StepFn = memo((t) => {
    let k = fold(t);
    for (const eq of equivalences) k = eq.apply(k);
    return (marks?.strip(k) ?? k).normalize("NFC");
  });

  let typo: CompiledProfile["typo"];
  if (match.typo !== undefined) {
    const kbdId = match.typo.layout === undefined ? undefined : asciiLowercase(match.typo.layout.replace(/^cldr-kbd:/u, ""));
    const layout = kbdId === undefined ? undefined : data.keyboards[kbdId];
    if (kbdId !== undefined && layout === undefined) errors.push({ code: "unknown-keyboard", keyboard: kbdId });
    typo = {
      model: match.typo.model,
      maxRatio: match.typo.maxRatio ?? DEFAULT_MAX_RATIO,
      minLength: match.typo.minLength ?? DEFAULT_MIN_LENGTH,
      adjacent: keyboardAdjacency(layout),
      key,
      contrasts: (match.typo.contrasts ?? []).map((c) => ({
        id: c.id,
        note: c.note,
        members: c.members.map((m) => (typeof m === "string" ? [m] : m).map((spelling) => graphemes(key(normalize(spelling))))),
      })),
    };
  }

  if (errors.length > 0) return err(errors);
  return ok({
    id: profile.id,
    lang: profile.lang,
    source: profile,
    normalize,
    unitKind: graphemeUnits ? "grapheme" : "token",
    units: graphemeUnits ? (t) => graphemes(t) : (t) => t.split(" ").filter((u) => u !== ""),
    fold,
    letters,
    equivalences,
    ...(marks && { marks }),
    ...(match.zwnj && { zwnj: { policy: match.zwnj.policy, note: match.zwnj.note, equivalents: match.zwnj.equivalents } }),
    ...(variants && { variants }),
    ...(homophones && { homophones }),
    ...(scriptMismatch && { scriptMismatch }),
    ...(typo && { typo }),
    ...(match.apostrophe && { apostrophe: { policy: match.apostrophe.policy, note: match.apostrophe.note } }),
  });
};
