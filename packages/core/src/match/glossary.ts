/**
 * The runtime glossary (gameplan §7.5 stage 7, Phase 6): tap-for-gloss segments a
 * text into glossary entries by longest match over its runtime units.
 *
 * Two passes run side by side at every position, as LEXIS learned:
 * - **exact**: normalized units, as written (a vocalized entry matches only vocalized text);
 * - **folded**: case-folded, with the marks the profile ignores stripped, so the
 *   vocalized كِيفَك finds the unvocalized entry كيفك.
 *
 * The longer match wins; on a tie the exact one does, being the more specific.
 * The compiler's glossary lints call this same function through core-cli, so an
 * entry the lint calls dead is one the app can never show.
 */
import type { KcId, Token } from "@nabu/schema";
import type { CompiledProfile } from "../profile/compile.ts";
import { glossUnits } from "./gloss.ts";

export interface GlossEntry {
  readonly kc: KcId;
  /** How the entry is written in the orthography (a KC's form). */
  readonly text: string;
}

interface CompiledEntry extends GlossEntry {
  readonly exact: readonly string[];
  readonly folded: readonly string[];
}

export interface CompiledGlossary {
  readonly profile: string;
  readonly entries: readonly CompiledEntry[];
  /** First unit → entries starting with it, longest first. */
  readonly exact: ReadonlyMap<string, readonly number[]>;
  readonly folded: ReadonlyMap<string, readonly number[]>;
}

export type GlossPass = "exact" | "folded";

/** A run of units matched by one entry: units [start, end). */
export interface GlossMatch {
  readonly entry: number;
  readonly kc: KcId;
  readonly start: number;
  readonly end: number;
  readonly pass: GlossPass;
}

/** A match over tokens: tokens [tokenStart, tokenEnd); `partial` when it covers only part of a token (我 in 我哋). */
export interface TokenGloss extends GlossMatch {
  readonly tokenStart: number;
  readonly tokenEnd: number;
  readonly partial: boolean;
}

/** The units of a text, exact and folded, index for index. */
export const unitsOf = (profile: CompiledProfile, text: string): { readonly exact: readonly string[]; readonly folded: readonly string[] } => ({
  exact: profile.units(profile.normalize(text)),
  folded: glossUnits(profile, text),
});

const index = (entries: readonly CompiledEntry[], key: "exact" | "folded"): ReadonlyMap<string, readonly number[]> => {
  const map = new Map<string, number[]>();
  for (const [i, e] of entries.entries()) {
    const first = e[key][0];
    if (first === undefined) continue;
    const list = map.get(first) ?? [];
    list.push(i);
    map.set(first, list);
  }
  for (const list of map.values()) list.sort((a, b) => (entries[b]?.[key].length ?? 0) - (entries[a]?.[key].length ?? 0) || a - b);
  return map;
};

export const compileGlossary = (profile: CompiledProfile, entries: readonly GlossEntry[]): CompiledGlossary => {
  const compiled = entries.map((e) => ({ ...e, ...unitsOf(profile, e.text) }));
  return { profile: profile.id, entries: compiled, exact: index(compiled, "exact"), folded: index(compiled, "folded") };
};

const longest = (glossary: CompiledGlossary, units: readonly string[], at: number, key: GlossPass): number | undefined => {
  const first = units[at];
  if (first === undefined) return undefined;
  for (const i of glossary[key].get(first) ?? []) {
    const want = glossary.entries[i]?.[key] ?? [];
    if (want.every((u, k) => units[at + k] === u)) return i;
  }
  return undefined;
};

/** Longest-match segmentation of a unit sequence: the matches, left to right; unmatched units are skipped. */
export const matchUnits = (glossary: CompiledGlossary, exact: readonly string[], folded: readonly string[]): readonly GlossMatch[] => {
  const out: GlossMatch[] = [];
  let at = 0;
  while (at < exact.length) {
    const e = longest(glossary, exact, at, "exact");
    const f = longest(glossary, folded, at, "folded");
    const eLen = e === undefined ? 0 : (glossary.entries[e]?.exact.length ?? 0);
    const fLen = f === undefined ? 0 : (glossary.entries[f]?.folded.length ?? 0);
    if (eLen === 0 && fLen === 0) {
      at += 1;
      continue;
    }
    const [entry, len, pass] = eLen >= fLen ? [e as number, eLen, "exact" as const] : [f as number, fLen, "folded" as const];
    out.push({ entry, kc: glossary.entries[entry]?.kc as KcId, start: at, end: at + len, pass });
    at += len;
  }
  return out;
};

export const glossText = (glossary: CompiledGlossary, profile: CompiledProfile, text: string): readonly GlossMatch[] => {
  const { exact, folded } = unitsOf(profile, text);
  return matchUnits(glossary, exact, folded);
};

/** Glosses a token sequence (a sentence or a story line): matches mapped back to whole or partial tokens. */
export const glossTokens = (glossary: CompiledGlossary, profile: CompiledProfile, tokens: readonly Pick<Token, "surface" | "kind">[]): readonly TokenGloss[] => {
  const exact: string[] = [];
  const folded: string[] = [];
  const owner: number[] = [];
  const firstUnit: number[] = [];
  for (const [t, token] of tokens.entries()) {
    firstUnit.push(exact.length);
    if (token.kind !== "word" && token.kind !== "number") continue;
    const u = unitsOf(profile, token.surface);
    exact.push(...u.exact);
    folded.push(...u.folded);
    for (let k = 0; k < u.exact.length; k += 1) owner.push(t);
  }
  firstUnit.push(exact.length);
  return matchUnits(glossary, exact, folded).map((m) => {
    const tokenStart = owner[m.start] ?? 0;
    const tokenEnd = (owner[m.end - 1] ?? tokenStart) + 1;
    const partial = m.start !== firstUnit[tokenStart] || m.end !== firstUnit[tokenEnd];
    return { ...m, tokenStart, tokenEnd, partial };
  });
};

/** The glosses covering a token, in order: what a tap on it shows. */
export const glossesAt = (glosses: readonly TokenGloss[], token: number): readonly TokenGloss[] => glosses.filter((g) => g.tokenStart <= token && token < g.tokenEnd);
