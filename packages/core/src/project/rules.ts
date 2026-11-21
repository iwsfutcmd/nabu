/**
 * The correspondences a profile or a reading scheme states (ADR 0148), compiled once: each with its
 * written forms as units, its context as sets, and its id. Shared by the writing side (sound.ts) and
 * the reading side (reading.ts).
 */
import type { Correspondence } from "@nabu/schema";
import { err, ok, type Result } from "../result.ts";
import { graphemes } from "../text/graphemes.ts";
import { parseExemplarSet } from "../text/unicode-set.ts";

/** A format character (ZWNJ, ZWJ): a unit of its own, though Unicode clusters it with the letter before. */
const FORMAT = /^\p{Cf}$/u;

/**
 * A spelling's units as the writing side reads them: its grapheme clusters, with each format
 * character (ZWNJ) split off as a unit of its own, so a letter before a half-space is still that letter.
 */
export const spellingUnits = (text: string): readonly string[] => {
  const out: string[] = [];
  for (const cluster of graphemes(text.normalize("NFC"))) {
    let current = "";
    // Within one cluster, by code point: only to split off format characters.
    for (const c of cluster) {
      if (FORMAT.test(c)) {
        if (current !== "") out.push(current);
        out.push(c);
        current = "";
      } else current += c;
    }
    if (current !== "") out.push(current);
  }
  return out;
};

export interface Written {
  readonly text: string;
  readonly units: readonly string[];
}

export interface Rule {
  /** Its place in the statement: the earlier wins a tie. */
  readonly index: number;
  /** Its `says`, or `~` and its first written form where it says nothing. */
  readonly id: string;
  readonly says: string;
  readonly written: readonly Written[];
  readonly kind: "fixed" | "free";
  readonly note?: string | undefined;
  readonly loses: readonly string[];
  readonly at?: "start" | "end" | undefined;
  readonly before?: ReadonlySet<string> | undefined;
  readonly after?: ReadonlySet<string> | undefined;
}

export interface RuleOptions {
  /** How a `says` is compared (a scheme lowercases it in its language). */
  readonly says: (text: string) => string;
  /** How a written form is cut into the units a spelling is read in. */
  readonly units: (text: string) => readonly string[];
  /** How a written form and a context's letters are compared (a profile's case fold). */
  readonly written: (text: string) => string;
}

const setOf = (pattern: string | undefined, written: (text: string) => string): ReadonlySet<string> | undefined =>
  pattern === undefined ? undefined : new Set(parseExemplarSet(pattern).map((s) => written(s).normalize("NFC")));

/** The statement compiled, or why it cannot be: a correspondence that says nothing and is written as nothing. */
export const compileRules = (list: readonly Correspondence[], options: RuleOptions): Result<readonly Rule[], readonly string[]> => {
  const errors: string[] = [];
  const rules: Rule[] = [];
  list.forEach((c, index) => {
    const says = options.says(c.says.normalize("NFC"));
    const forms = c.written.map((w) => options.written(w.normalize("NFC")));
    // Saying nothing and written as nothing would read nothing at all: never a correspondence.
    const kept = says === "" ? forms.filter((w) => w !== "") : forms;
    if (kept.length === 0) {
      errors.push(`correspondence ${index + 1} says nothing and is written only as nothing`);
      return;
    }
    try {
      rules.push({
        index,
        id: says !== "" ? says : `~${kept[0] as string}`,
        says,
        written: kept.map((text) => ({ text, units: text === "" ? [] : options.units(text) })),
        kind: c.kind,
        note: c.note,
        loses: (c.loses ?? []).map((l) => options.says(l.normalize("NFC"))).filter((l) => l !== says),
        at: c.when?.at,
        before: setOf(c.when?.before, options.written),
        after: setOf(c.when?.after, options.written),
      });
    } catch (e) {
      errors.push(`correspondence ${index + 1}: ${(e as Error).message}`);
    }
  });
  return errors.length > 0 ? err(errors) : ok(rules);
};

/** Whether a rule's context holds for the written span [start, end) of `units` (letters compared as `key`). */
export const holds = (rule: Rule, units: readonly string[], start: number, end: number): boolean => {
  if (rule.at === "start" && start !== 0) return false;
  if (rule.at === "end" && end !== units.length) return false;
  if (rule.before !== undefined) {
    const next = units[end];
    if (next === undefined || !rule.before.has(next)) return false;
  }
  if (rule.after !== undefined) {
    const prev = start > 0 ? units[start - 1] : undefined;
    if (prev === undefined || !rule.after.has(prev)) return false;
  }
  return true;
};

/** Whether `units` from `start` begin with `want`. */
export const startsWith = (units: readonly string[], start: number, want: readonly string[]): boolean => {
  if (start + want.length > units.length) return false;
  for (let k = 0; k < want.length; k++) if (units[start + k] !== want[k]) return false;
  return true;
};
