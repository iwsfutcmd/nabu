/**
 * Lexical forms as rules read them (docs/rules-design.md, section 2): letters with their sets of
 * marks, never code points in a row, and `+` boundaries kept until projection. The patterns a
 * rewrite rule, a root class or an allomorph's condition is written in, compiled once, and the one
 * matcher every rule runs. Nothing here knows a language: what a vowel sign is, which marks are
 * the vowel slot and which letters a set holds all come from the language's notation (data).
 */
import type { Notation } from "@nabu/schema";
import { err, ok, type Result } from "../result.ts";
import { graphemes } from "../text/graphemes.ts";
import { parseExemplarSet } from "../text/unicode-set.ts";

const MARK = /^\p{M}$/u;
const FORMAT = /^\p{Cf}$/u;
/** A modifier letter (the Arabic tatweel): an affix's first unit that carries its vowel to the letter it joins. */
const CARRIER = /^\p{Lm}$/u;

/** One unit of a lexical form: a letter (or a format character) with the marks on it, or a boundary. */
export type Unit = { readonly kind: "letter"; readonly base: string; readonly marks: readonly string[] } | { readonly kind: "boundary" };

export const BOUNDARY: Unit = { kind: "boundary" };

/** A set of marks as one comparable key: its code points, sorted. */
export const markKey = (marks: Iterable<string>): string => [...marks].sort().join("");

const letter = (base: string, marks: Iterable<string>): Unit => ({ kind: "letter", base, marks: [...marks].sort() });

/** A lexical form's units: each grapheme cluster split into its letter and its marks, `+` a boundary. */
export const unitsOf = (form: string): readonly Unit[] => {
  const out: Unit[] = [];
  for (const cluster of graphemes(form.normalize("NFC"))) {
    let base = "";
    let marks: string[] = [];
    const flush = (): void => {
      if (base !== "" || marks.length > 0) out.push(letter(base, marks));
      base = "";
      marks = [];
    };
    // Within one cluster, by code point: only to tell its letter from its marks.
    for (const c of cluster) {
      if (c === "+") {
        flush();
        out.push(BOUNDARY);
      } else if (MARK.test(c)) marks.push(c);
      else if (FORMAT.test(c)) {
        flush();
        out.push(letter(c, []));
      } else {
        flush();
        base = c;
      }
    }
    flush();
  }
  return out;
};

/** Units written out again, NFC. */
export const textOf = (units: readonly Unit[]): string => units.map((u) => (u.kind === "boundary" ? "+" : u.base + u.marks.join(""))).join("").normalize("NFC");

export const isCarrier = (u: Unit | undefined): boolean => u !== undefined && u.kind === "letter" && CARRIER.test(u.base);

/** A named set of the notation: letters, or mark sequences (each as its key). */
export type NamedSet = { readonly kind: "letters"; readonly members: ReadonlySet<string> } | { readonly kind: "marks"; readonly members: ReadonlySet<string> };

/** The notation as the engine reads it. */
export interface CompiledNotation {
  readonly vowels: Readonly<Record<string, string>>;
  readonly long: Readonly<Record<string, string>>;
  /** The sign of no vowel, if the notation has one. */
  readonly none: string | undefined;
  /** The marks of the vowel slot: every vowel sign and the sign of no vowel. A written mark replaces these, never the others. */
  readonly vowelSlot: ReadonlySet<string>;
  /** Letters a long vowel is written with (its last letter): bare after a vowel, they are length, not consonants. */
  readonly lengthLetters: ReadonlySet<string>;
  readonly sets: ReadonlyMap<string, NamedSet>;
}

const isMarks = (s: string): boolean => s !== "" && [...s].every((c) => MARK.test(c));

/** A UnicodeSet as a named set: marks only, or letters. */
export const namedSet = (pattern: string): NamedSet => {
  const members = parseExemplarSet(pattern);
  if (members.length > 0 && members.every(isMarks)) return { kind: "marks", members: new Set(members.map((m) => markKey(m))) };
  return { kind: "letters", members: new Set(members) };
};

export const compileNotation = (notation: Notation | undefined): Result<CompiledNotation, readonly string[]> => {
  const errors: string[] = [];
  const vowels = notation?.vowels ?? {};
  const long = notation?.long ?? {};
  const vowelSlot = new Set<string>();
  for (const sign of [...Object.values(vowels), ...(notation?.none === undefined ? [] : [notation.none])]) {
    for (const c of sign.normalize("NFC")) {
      if (!MARK.test(c)) errors.push(`notation: a vowel sign or the sign of no vowel is marks only (${JSON.stringify(sign)})`);
      else vowelSlot.add(c);
    }
  }
  const lengthLetters = new Set<string>();
  for (const value of Object.values(long)) {
    const units = unitsOf(value);
    const last = units.at(-1);
    if (last !== undefined && last.kind === "letter" && last.marks.length === 0) lengthLetters.add(last.base);
  }
  const sets = new Map<string, NamedSet>();
  for (const [name, pattern] of Object.entries(notation?.sets ?? {})) {
    try {
      sets.set(name, namedSet(pattern));
    } catch (e) {
      errors.push(`notation: set ${name}: ${(e as Error).message}`);
    }
  }
  if (errors.length > 0) return err(errors);
  return ok({ vowels, long, none: notation?.none?.normalize("NFC"), vowelSlot, lengthLetters, sets });
};

/** Marks with their vowel slot replaced by `written`'s (and `written`'s other marks added). */
export const withVowel = (notation: CompiledNotation, marks: readonly string[], written: readonly string[]): readonly string[] => {
  const writesVowel = written.some((m) => notation.vowelSlot.has(m));
  const kept = writesVowel ? marks.filter((m) => !notation.vowelSlot.has(m)) : marks;
  return [...new Set([...kept, ...written])].sort();
};

// ------------------------------------------------------------------------------------------------
// Patterns

type BaseSpec = { readonly kind: "literal"; readonly text: string } | { readonly kind: "set"; readonly ref: string; readonly members: ReadonlySet<string> } | { readonly kind: "any"; readonly ref: string };
type MarkSpec = { readonly kind: "none" } | { readonly kind: "exact"; readonly marks: readonly string[] } | { readonly kind: "set"; readonly ref: string; readonly members: ReadonlySet<string> } | { readonly kind: "any" };

export type Item =
  | { readonly kind: "letter"; readonly base: BaseSpec; readonly marks: MarkSpec }
  | { readonly kind: "boundary"; readonly optional: boolean }
  | { readonly kind: "edge" };

export type Pattern = readonly Item[];

type Token =
  | { readonly kind: "set"; readonly text: string; readonly set: NamedSet }
  | { readonly kind: "any" }
  | { readonly kind: "anyMarks" }
  | { readonly kind: "boundary"; readonly optional: boolean }
  | { readonly kind: "edge" }
  | { readonly kind: "mark"; readonly mark: string }
  | { readonly kind: "letter"; readonly text: string };

/** Reads a pattern's tokens. A pattern is rule data, not text a learner sees: it is read by code point, as unicode-set.ts reads a set. */
const tokenize = (pattern: string, notation: CompiledNotation): Result<readonly Token[], string> => {
  const cps = Array.from(pattern.normalize("NFC"));
  const out: Token[] = [];
  let i = 0;
  while (i < cps.length) {
    const c = cps[i] as string;
    if (c === "{") {
      const close = cps.indexOf("}", i);
      if (close < 0) return err(`unclosed { in ${JSON.stringify(pattern)}`);
      const name = cps.slice(i + 1, close).join("");
      const set = notation.sets.get(name);
      if (set === undefined) return err(`no set {${name}} in the notation (${JSON.stringify(pattern)})`);
      out.push({ kind: "set", text: `{${name}}`, set });
      i = close + 1;
    } else if (c === "[") {
      // To the bracket that closes it, past any {string} inside.
      let j = i + 1;
      while (j < cps.length && cps[j] !== "]") {
        if (cps[j] === "{") {
          const close = cps.indexOf("}", j);
          if (close < 0) return err(`unclosed { in ${JSON.stringify(pattern)}`);
          j = close;
        }
        j++;
      }
      if (j >= cps.length) return err(`unclosed [ in ${JSON.stringify(pattern)}`);
      const text = cps.slice(i, j + 1).join("");
      try {
        out.push({ kind: "set", text, set: namedSet(text) });
      } catch (e) {
        return err(`${(e as Error).message}`);
      }
      i = j + 1;
    } else if (c === ".") {
      out.push({ kind: "any" });
      i++;
    } else if (c === "*") {
      out.push({ kind: "anyMarks" });
      i++;
    } else if (c === "+") {
      const optional = cps[i + 1] === "?";
      out.push({ kind: "boundary", optional });
      i += optional ? 2 : 1;
    } else if (c === "#") {
      out.push({ kind: "edge" });
      i++;
    } else if (MARK.test(c)) {
      out.push({ kind: "mark", mark: c });
      i++;
    } else {
      out.push({ kind: "letter", text: c });
      i++;
    }
  }
  return ok(out);
};

/**
 * A pattern compiled. A letter item is a literal letter, a {set} or [set] of letters, or . (any
 * letter), and then its marks: none written (no marks), literal marks (exactly those), a {set} or
 * [set] of marks (one of them), or * (any). + is a boundary, +? a boundary or none, # the edge.
 */
export const compilePattern = (pattern: string, notation: CompiledNotation): Result<Pattern, string> => {
  const tokens = tokenize(pattern, notation);
  if (!tokens.ok) return tokens;
  const items: Item[] = [];
  const list = tokens.value;
  let i = 0;
  while (i < list.length) {
    const t = list[i] as Token;
    if (t.kind === "boundary") {
      items.push({ kind: "boundary", optional: t.optional });
      i++;
      continue;
    }
    if (t.kind === "edge") {
      items.push({ kind: "edge" });
      i++;
      continue;
    }
    let base: BaseSpec;
    if (t.kind === "letter") base = { kind: "literal", text: t.text };
    else if (t.kind === "any") base = { kind: "any", ref: "." };
    else if (t.kind === "set" && t.set.kind === "letters") base = { kind: "set", ref: t.text, members: t.set.members };
    else return err(`marks with no letter before them in ${JSON.stringify(pattern)}`);
    i++;
    // Its marks: literal marks, one set of marks, or *.
    const literal: string[] = [];
    let marks: MarkSpec = { kind: "none" };
    while (i < list.length) {
      const m = list[i] as Token;
      if (m.kind === "mark") {
        if (marks.kind !== "none") return err(`literal marks after a set of marks in ${JSON.stringify(pattern)}`);
        literal.push(m.mark);
        i++;
      } else if (m.kind === "anyMarks" || (m.kind === "set" && m.set.kind === "marks")) {
        if (literal.length > 0 || marks.kind !== "none") return err(`two mark specifications on one letter in ${JSON.stringify(pattern)}`);
        marks = m.kind === "anyMarks" ? { kind: "any" } : { kind: "set", ref: `m${m.text}`, members: m.set.members };
        i++;
      } else break;
    }
    if (literal.length > 0) marks = { kind: "exact", marks: [...literal].sort() };
    items.push({ kind: "letter", base, marks });
  }
  return ok(items);
};

/** A pattern with no edges, boundaries or sets: a literal form's units (a template, an affix). */
const baseMatches = (spec: BaseSpec, base: string): boolean => (spec.kind === "literal" ? spec.text === base : spec.kind === "set" ? spec.members.has(base) : true);

const marksMatch = (spec: MarkSpec, marks: readonly string[]): boolean => {
  switch (spec.kind) {
    case "none":
      return marks.length === 0;
    case "exact":
      return markKey(spec.marks) === markKey(marks);
    case "set":
      return spec.members.has(markKey(marks));
    case "any":
      return true;
  }
};

/** What each item of a pattern matched: a unit's index, or null (an edge, a +? that took none). */
export type Captures = readonly (number | null)[];

interface Match {
  readonly end: number;
  readonly captures: Captures;
}

/** Every way `items` match `units` from `start`, the longest first. */
const matchesFrom = (items: Pattern, units: readonly Unit[], start: number): readonly Match[] => {
  const out: Match[] = [];
  const go = (k: number, pos: number, caps: (number | null)[]): void => {
    if (k === items.length) {
      out.push({ end: pos, captures: [...caps] });
      return;
    }
    const item = items[k] as Item;
    const unit = units[pos];
    switch (item.kind) {
      case "edge":
        if (pos === 0 || pos === units.length) go(k + 1, pos, [...caps, null]);
        return;
      case "boundary":
        if (unit !== undefined && unit.kind === "boundary") go(k + 1, pos + 1, [...caps, pos]);
        if (item.optional) go(k + 1, pos, [...caps, null]);
        return;
      case "letter":
        if (unit !== undefined && unit.kind === "letter" && baseMatches(item.base, unit.base) && marksMatch(item.marks, unit.marks)) go(k + 1, pos + 1, [...caps, pos]);
        return;
    }
  };
  go(0, start, []);
  return out;
};

/** Whether `items` match `units` ending exactly at `end`. */
const matchesEndingAt = (items: Pattern, units: readonly Unit[], end: number): boolean => {
  for (let start = end; start >= 0; start--) {
    if (matchesFrom(items, units, start).some((m) => m.end === end)) return true;
  }
  return false;
};

/** Whether a form ends in what `pattern` matches (a condition's `endsIn`). */
export const endsIn = (pattern: Pattern, units: readonly Unit[]): boolean => matchesEndingAt(pattern, units, units.length);

// ------------------------------------------------------------------------------------------------
// Rewrites

export interface CompiledRewrite {
  readonly id: string;
  readonly branch: string | undefined;
  readonly find: Pattern;
  readonly to: Pattern | undefined;
  readonly map: Readonly<Record<string, string>> | undefined;
  readonly before: readonly Pattern[];
  readonly after: readonly Pattern[];
  readonly at: "start" | "end" | undefined;
}

/** The refs of a pattern, in order: what the n-th of each in `to` copies. */
const refOf = (item: Item): string | undefined => {
  if (item.kind === "boundary") return item.optional ? "+?" : undefined;
  if (item.kind !== "letter") return undefined;
  return item.base.kind === "literal" ? undefined : item.base.ref;
};

const markRefOf = (item: Item): string | undefined => (item.kind === "letter" && item.marks.kind === "set" ? item.marks.ref : undefined);

/** Checks that a rewrite's `to` copies only what its `find` has, and writes only what it can. */
export const checkRewrite = (rw: CompiledRewrite): readonly string[] => {
  const errors: string[] = [];
  if ((rw.to === undefined) === (rw.map === undefined)) errors.push("a rewrite has `to` or `map`, one of them");
  if (rw.find.some((i) => i.kind === "edge")) errors.push("`find` has no edge (#): use `at`");
  if (rw.map !== undefined && rw.find.filter((i) => i.kind === "letter").length !== 1) errors.push("`map` needs a `find` of one letter");
  if (rw.to !== undefined) {
    const count = (p: Pattern, f: (i: Item) => string | undefined): Map<string, number> => {
      const m = new Map<string, number>();
      for (const i of p) {
        const r = f(i);
        if (r !== undefined) m.set(r, (m.get(r) ?? 0) + 1);
      }
      return m;
    };
    const have = count(rw.find, refOf);
    const haveMarks = count(rw.find, markRefOf);
    for (const [r, n] of count(rw.to, refOf)) if ((have.get(r) ?? 0) < n) errors.push(`\`to\` copies ${r} more often than \`find\` has it`);
    for (const [r, n] of count(rw.to, markRefOf)) if ((haveMarks.get(r) ?? 0) < n) errors.push(`\`to\` copies ${r.slice(1)} more often than \`find\` has it`);
    for (const i of rw.to) {
      if (i.kind === "edge") errors.push("`to` has no edge (#)");
      if (i.kind === "letter" && i.marks.kind === "any") errors.push("`to` writes no * (any marks)");
    }
  }
  return errors;
};

/** The units `to` writes for one match. */
const written = (rw: CompiledRewrite, to: Pattern, units: readonly Unit[], captures: Captures, notation: CompiledNotation): readonly Unit[] => {
  // The n-th capture of each ref, and of each set of marks.
  const refs = new Map<string, (number | null)[]>();
  const markRefs = new Map<string, (number | null)[]>();
  rw.find.forEach((item, k) => {
    const r = refOf(item);
    if (r !== undefined) refs.set(r, [...(refs.get(r) ?? []), captures[k] ?? null]);
    const m = markRefOf(item);
    if (m !== undefined) markRefs.set(m, [...(markRefs.get(m) ?? []), captures[k] ?? null]);
  });
  const used = new Map<string, number>();
  const take = (table: Map<string, (number | null)[]>, key: string): number | null => {
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    return table.get(key)?.[n] ?? null;
  };
  const out: Unit[] = [];
  for (const item of to) {
    if (item.kind === "edge") continue;
    if (item.kind === "boundary") {
      if (!item.optional) out.push(BOUNDARY);
      else if (take(refs, "+?") !== null) out.push(BOUNDARY);
      continue;
    }
    const ref = refOf(item);
    const source = ref === undefined ? null : take(refs, ref);
    const copied = source === null ? undefined : units[source];
    const base = item.base.kind === "literal" ? item.base.text : copied !== undefined && copied.kind === "letter" ? copied.base : "";
    let marks: readonly string[] = item.base.kind === "literal" ? [] : copied !== undefined && copied.kind === "letter" ? copied.marks : [];
    if (item.marks.kind === "exact") marks = item.base.kind === "literal" ? item.marks.marks : withVowel(notation, marks, item.marks.marks);
    else if (item.marks.kind === "set") {
      const from = take(markRefs, item.marks.ref);
      const unit = from === null ? undefined : units[from];
      const theirs = unit !== undefined && unit.kind === "letter" ? unit.marks : [];
      marks = withVowel(notation, marks, theirs);
    }
    out.push(letter(base, marks));
  }
  return out;
};

const holds = (rw: CompiledRewrite, units: readonly Unit[], start: number, end: number): boolean =>
  (rw.at !== "start" || start === 0) &&
  (rw.at !== "end" || end === units.length) &&
  (rw.after.length === 0 || rw.after.some((p) => matchesEndingAt(p, units, start))) &&
  (rw.before.length === 0 || rw.before.some((p) => matchesFrom(p, units, end).length > 0));

/**
 * A rewrite applied once over a form: at every place it matches, left to right, matches not
 * overlapping, each judged on the form as it was before the rewrite. Whether it matched anywhere.
 */
export const applyRewrite = (rw: CompiledRewrite, units: readonly Unit[], notation: CompiledNotation): { readonly units: readonly Unit[]; readonly matched: boolean } => {
  const out: Unit[] = [];
  let matched = false;
  let i = 0;
  while (i < units.length) {
    const found = matchesFrom(rw.find, units, i).find((m) => m.end > i && holds(rw, units, i, m.end));
    if (found === undefined) {
      out.push(units[i] as Unit);
      i++;
      continue;
    }
    matched = true;
    if (rw.to !== undefined) out.push(...written(rw, rw.to, units, found.captures, notation));
    else {
      const map = rw.map ?? {};
      for (let k = i; k < found.end; k++) {
        const u = units[k] as Unit;
        out.push(u.kind === "letter" ? letter(map[u.base] ?? u.base, u.marks) : u);
      }
    }
    i = found.end;
  }
  return { units: matched ? out : units, matched };
};
