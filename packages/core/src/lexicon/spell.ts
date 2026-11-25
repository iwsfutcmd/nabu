/**
 * Spelling a lexical form (docs/rules-design.md, sections 3 and 4; ADR 0145, 0148): an orthography's
 * `spell` statement, read as data, run over a lexeme's form in its language's notation.
 *
 * A statement is a list of rewrites, run in order over the whole form. A rule's pattern is matched
 * against the form with each letter's marks in the order the notation names them (`order`: a shadda
 * before the vowel, where NFC puts it after), so a pattern is written as the notation is; the
 * result is NFC. A rule's `alternatives` are the free spellings: at each place the rule applies,
 * one may stand in place of its `to`, so a form has one spelling (every rule's `to`) and the
 * alternatives the choices give, each with the variations it took.
 *
 * No letter, mark or ending is named here: sets, patterns and replacements are the statement's.
 */
import type { Notation, OrthographyProfile } from "@nabu/schema";
import type { CompiledProfile } from "../profile/compile.ts";
import { err, ok, type Result } from "../result.ts";
import { parseExemplarSet } from "../text/unicode-set.ts";

type SpellStatement = NonNullable<OrthographyProfile["spell"]>;
type SpellRule = SpellStatement["rules"][number];

/** A free spelling of a form, with the variations (`alternatives` ids) it took. */
export interface SpelledAlternative {
  readonly spelling: string;
  readonly by: readonly string[];
}

/** A form spelled: what the statement writes, and its free spellings. */
export interface Spelled {
  readonly spelling: string;
  readonly alternatives: readonly SpelledAlternative[];
}

/** One piece of a replacement: text as itself, or what a {name} of the find matched. */
type Piece = { readonly text: string } | { readonly group: number };

interface Choice {
  readonly pieces: readonly Piece[];
  /** The variation this choice is; absent for the rule's own `to`. */
  readonly id?: string;
}

interface CompiledRule {
  readonly regex: RegExp;
  readonly choices: readonly Choice[];
  readonly map?: ReadonlyMap<string, string>;
}

/** A statement compiled: its rules, and the notation's order of marks. */
export interface Speller {
  readonly id: string;
  readonly rules: readonly CompiledRule[];
  readonly order: ReadonlyMap<string, number>;
  /** Whether a realised form's boundaries (+) stay for the rules (the statement's `boundaries`), to be dropped after them. */
  readonly boundaries?: boolean;
}

/** The most spellings one form is taken through: past it, the later choices keep the rule's own `to`. */
const LIMIT = 4096;

const escape = (c: string): string => `\\u{${(c.codePointAt(0) as number).toString(16)}}`;

/** A set's members as one regex piece: one of its letters, or one of its strings (the longest first). */
const alternation = (members: readonly string[]): string => {
  const single = members.filter((m) => Array.from(m).length === 1);
  const multi = members.filter((m) => Array.from(m).length > 1).sort((a, b) => Array.from(b).length - Array.from(a).length);
  const parts = multi.map((m) => Array.from(m).map(escape).join(""));
  if (single.length > 0) parts.push(`[${single.map(escape).join("")}]`);
  return parts.length === 0 ? "[]" : parts.join("|");
};

/** Where a UnicodeSet that starts at `start` (its `[`) ends: the index of its closing `]`. */
const closing = (cps: readonly string[], start: number): number => {
  let inString = false;
  for (let i = start + 1; i < cps.length; i++) {
    const c = cps[i];
    if (c === "\\") i++;
    else if (c === "{") inString = true;
    else if (c === "}") inString = false;
    else if (c === "]" && !inString) return i;
  }
  return -1;
};

/** A word begins where nothing but a space stands before; it ends where nothing but a space stands after. */
const WORD_START = "(?<![^ ])";
const WORD_END = "(?![^ ])";

interface Pattern {
  readonly source: string;
  /** The set each capturing group stands for, in order. */
  readonly groups: readonly string[];
}

/** A pattern as a regex source; its {name} pieces capture where `capture` is set (a rule's `find`). */
const compilePattern = (pattern: string, sets: ReadonlyMap<string, readonly string[]>, capture: boolean): Result<Pattern, string> => {
  const cps = Array.from(pattern);
  const groups: string[] = [];
  let source = "";
  let depth = 0;
  let piece = false;
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i] as string;
    if (c === "\\") {
      const next = cps[++i];
      if (next === undefined) return err(`${pattern}: a backslash with nothing after it`);
      source += escape(next);
      piece = true;
    } else if (c === "{") {
      const close = cps.indexOf("}", i);
      if (close < 0) return err(`${pattern}: an unclosed {name}`);
      const name = cps.slice(i + 1, close).join("");
      const members = sets.get(name);
      if (members === undefined) return err(`${pattern}: no set named ${name}`);
      source += capture ? `(${alternation(members)})` : `(?:${alternation(members)})`;
      if (capture) groups.push(name);
      i = close;
      piece = true;
    } else if (c === "[") {
      const close = closing(cps, i);
      if (close < 0) return err(`${pattern}: an unclosed UnicodeSet`);
      let members: readonly string[];
      try {
        members = parseExemplarSet(cps.slice(i, close + 1).join(""));
      } catch (e) {
        return err(`${pattern}: ${(e as Error).message}`);
      }
      source += `(?:${alternation(members)})`;
      i = close;
      piece = true;
    } else if (c === "(") {
      source += "(?:";
      depth++;
      piece = false;
    } else if (c === ")") {
      if (depth === 0) return err(`${pattern}: a ) with no (`);
      source += ")";
      depth--;
      piece = true;
    } else if (c === "|") {
      source += "|";
      piece = false;
    } else if (c === "^" || c === "$") {
      source += c === "^" ? WORD_START : WORD_END;
      piece = false;
    } else if (c === "?" || c === "*") {
      if (!piece) return err(`${pattern}: ${c} with nothing before it`);
      source += c;
      piece = false;
    } else {
      source += escape(c);
      piece = true;
    }
  }
  if (depth !== 0) return err(`${pattern}: an unclosed (`);
  return ok({ source, groups });
};

/** A replacement's pieces: {name} is what the find's {name} of the same rank matched (its last, where it has fewer). */
const compileReplacement = (to: string, groups: readonly string[]): Result<readonly Piece[], string> => {
  const pieces: Piece[] = [];
  const seen = new Map<string, number>();
  const cps = Array.from(to);
  let text = "";
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i] as string;
    if (c === "\\" && i + 1 < cps.length) {
      text += cps[++i];
      continue;
    }
    if (c !== "{") {
      text += c;
      continue;
    }
    const close = cps.indexOf("}", i);
    if (close < 0) return err(`${to}: an unclosed {name}`);
    const name = cps.slice(i + 1, close).join("");
    const rank = seen.get(name) ?? 0;
    seen.set(name, rank + 1);
    // The k-th {name} of the replacement is the k-th of the find, or its last where it has fewer.
    const ranks = groups.flatMap((g, i) => (g === name ? [i] : []));
    if (ranks.length === 0) return err(`${to}: {${name}} is not in the find`);
    const found = ranks[Math.min(rank, ranks.length - 1)] as number;
    if (text !== "") pieces.push({ text });
    text = "";
    pieces.push({ group: found + 1 });
    i = close;
  }
  if (text !== "") pieces.push({ text });
  return ok(pieces);
};

const compileRule = (rule: SpellRule, index: number, sets: ReadonlyMap<string, readonly string[]>, errors: string[]): CompiledRule | undefined => {
  const where = `rules[${index}]`;
  const find = compilePattern(rule.find, sets, true);
  const after = rule.after === undefined ? undefined : compilePattern(rule.after, sets, false);
  const before = rule.before === undefined ? undefined : compilePattern(rule.before, sets, false);
  for (const [name, p] of [["find", find], ["after", after], ["before", before]] as const) {
    if (p !== undefined && !p.ok) errors.push(`${where}.${name}: ${p.error}`);
  }
  if (!find.ok || (after !== undefined && !after.ok) || (before !== undefined && !before.ok)) return undefined;
  if ((rule.to === undefined) === (rule.map === undefined)) {
    errors.push(`${where}: a rule has \`to\` or \`map\`, one of the two`);
    return undefined;
  }
  if (rule.map !== undefined && rule.alternatives !== undefined) {
    errors.push(`${where}: a rule with \`map\` has no alternatives`);
    return undefined;
  }
  let source = "";
  if (after !== undefined) source += `(?<=${rule.at === "start" ? WORD_START : ""}(?:${after.value.source}))`;
  else if (rule.at === "start") source += WORD_START;
  source += `(?:${find.value.source})`;
  if (before !== undefined) source += `(?=(?:${before.value.source})${rule.at === "end" ? WORD_END : ""})`;
  else if (rule.at === "end") source += WORD_END;
  let regex: RegExp;
  try {
    regex = new RegExp(source, "gu");
  } catch (e) {
    errors.push(`${where}: ${(e as Error).message}`);
    return undefined;
  }
  if (rule.map !== undefined) {
    return { regex, choices: [], map: new Map(Object.entries(rule.map).map(([k, v]) => [k.normalize("NFC"), v])) };
  }
  const choices: Choice[] = [];
  const own = compileReplacement(rule.to as string, find.value.groups);
  if (!own.ok) errors.push(`${where}.to: ${own.error}`);
  else choices.push({ pieces: own.value });
  for (const [k, alt] of (rule.alternatives ?? []).entries()) {
    const pieces = compileReplacement(alt.to, find.value.groups);
    if (!pieces.ok) errors.push(`${where}.alternatives[${k}]: ${pieces.error}`);
    else choices.push({ pieces: pieces.value, id: alt.id });
  }
  return choices.length === 1 + (rule.alternatives?.length ?? 0) ? { regex, choices } : undefined;
};

const setsOf = (named: Readonly<Record<string, string>> | undefined, into: Map<string, readonly string[]>, what: string, errors: string[]): void => {
  for (const [name, pattern] of Object.entries(named ?? {})) {
    try {
      into.set(name, parseExemplarSet(pattern));
    } catch (e) {
      errors.push(`${what}.${name}: ${(e as Error).message}`);
    }
  }
};

/**
 * An orthography's `spell` statement compiled (`layer`: an annotation's, such as the marked text the
 * voices read), with the language's notation it is written in; or why it cannot be.
 */
export const compileSpeller = (profile: OrthographyProfile, notation: Notation, layer?: string): Result<Speller, readonly string[]> => {
  let statement: SpellStatement | undefined = profile.spell;
  let id: string = profile.id;
  if (layer !== undefined) {
    const annotation = (profile.annotations ?? []).find((a) => a.id === layer);
    if (annotation === undefined) return err([`${profile.id} has no layer ${layer}`]);
    statement = annotation.spell;
    id = `${profile.id}#${layer}`;
  }
  if (statement === undefined) return err([`${id} states no spell`]);
  const errors: string[] = [];
  const sets = new Map<string, readonly string[]>();
  setsOf(notation.sets, sets, "notation.sets", errors);
  setsOf(statement.sets, sets, "spell.sets", errors);
  const order = new Map<string, number>();
  if (notation.order !== undefined) {
    try {
      for (const [i, mark] of parseExemplarSet(notation.order).entries()) order.set(mark, i);
    } catch (e) {
      errors.push(`notation.order: ${(e as Error).message}`);
    }
  }
  for (const [what, signs] of [["vowels", notation.vowels ?? {}], ["long", notation.long ?? {}]] as const) {
    for (const [name, sign] of Object.entries(signs)) if (sign !== sign.normalize("NFC")) errors.push(`notation.${what}.${name} is not NFC`);
  }
  const rules = statement.rules.map((r, i) => compileRule(r, i, sets, errors));
  if (errors.length > 0) return err(errors);
  return ok({ id, rules: rules as CompiledRule[], order, ...(statement.boundaries === true && { boundaries: true }) });
};

/** The form with each run of marks in the notation's order (NFC puts them by combining class). */
const inOrder = (text: string, order: ReadonlyMap<string, number>): string => {
  if (order.size === 0) return text;
  const out: string[] = [];
  let run: string[] = [];
  const flush = (): void => {
    run.sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
    out.push(...run);
    run = [];
  };
  for (const c of text) {
    if (order.has(c)) run.push(c);
    else {
      flush();
      out.push(c);
    }
  }
  flush();
  return out.join("");
};

interface Branch {
  readonly text: string;
  readonly by: ReadonlySet<string>;
}

const written = (choice: Choice, match: RegExpExecArray): string =>
  choice.pieces.map((p) => ("text" in p ? p.text : (match[p.group] ?? ""))).join("");

/** One rule over one branch: every place it applies, each with every choice; the rule's own `to` first. */
const apply = (rule: CompiledRule, branch: Branch, room: number): Branch[] => {
  const sites = Array.from(branch.text.matchAll(rule.regex));
  if (sites.length === 0) return [branch];
  if (rule.map !== undefined) {
    let text = "";
    let at = 0;
    for (const m of sites) {
      text += branch.text.slice(at, m.index) + (rule.map.get(m[0].normalize("NFC")) ?? m[0]);
      at = m.index + m[0].length;
    }
    return [{ text: text + branch.text.slice(at), by: branch.by }];
  }
  let out: { text: string; at: number; by: Set<string> }[] = [{ text: "", at: 0, by: new Set(branch.by) }];
  for (const m of sites) {
    const next: { text: string; at: number; by: Set<string> }[] = [];
    for (const partial of out) {
      for (const choice of rule.choices) {
        const by = new Set(partial.by);
        if (choice.id !== undefined) by.add(choice.id);
        next.push({ text: partial.text + branch.text.slice(partial.at, m.index) + written(choice, m), at: m.index + m[0].length, by });
      }
    }
    // Past the room left, the later choices keep the rule's own `to`: the spelling stays first.
    out = next.length > room ? next.slice(0, room) : next;
  }
  return out.map((o) => ({ text: o.text + branch.text.slice(o.at), by: o.by }));
};

/** The fewest variations first, then by name: the plainest way to an alternative is the one kept. */
const plainer = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a.size !== b.size ? a.size < b.size : [...a].sort().join(" ") < [...b].sort().join(" ");

/**
 * A lexical form spelled by a statement: its spelling, and the free spellings its alternatives give.
 * A realised form's boundaries (`+`) are dropped first: no orthography writes them. A statement
 * with `boundaries` keeps them for its rules to name (where a suffix joins: a half-space) and drops
 * them after.
 */
export const spell = (speller: Speller, form: string): Spelled => {
  const kept = speller.boundaries === true ? form : form.replace(/\+/gu, "");
  let branches: Branch[] = [{ text: inOrder(kept.normalize("NFC"), speller.order), by: new Set() }];
  for (const rule of speller.rules) {
    const next = new Map<string, Branch>();
    for (const branch of branches) {
      for (const b of apply(rule, branch, Math.max(1, LIMIT - next.size))) {
        const had = next.get(b.text);
        if (had === undefined || plainer(b.by, had.by)) next.set(b.text, b);
      }
    }
    branches = [...next.values()];
  }
  const unbounded = (text: string): string => (speller.boundaries === true ? text.replace(/\+/gu, "") : text).normalize("NFC");
  const spelling = unbounded((branches[0] as Branch).text);
  const alternatives = new Map<string, ReadonlySet<string>>();
  for (const b of branches.slice(1)) {
    const text = unbounded(b.text);
    if (text === spelling) continue;
    const had = alternatives.get(text);
    if (had === undefined || plainer(b.by, had)) alternatives.set(text, b.by);
  }
  return { spelling, alternatives: [...alternatives].map(([s, by]) => ({ spelling: s, by: [...by].sort() })) };
};

/**
 * How a spelling is compared with what the course writes: in the orthography, as the profile keys
 * a typed answer (its normalization: Arabizi's article written onto its noun is detached; case
 * folded; its ignored marks left aside: Arabic's shadda is the writer's choice); in a layer (the
 * marked text), exactly.
 */
export const spellingKey = (profile: CompiledProfile, layer?: string): ((text: string) => string) => {
  if (layer !== undefined) return (text) => text.normalize("NFC");
  return (text) => {
    const folded = profile.fold(profile.normalize(text.normalize("NFC")));
    return profile.marks?.policy === "ignore" ? profile.marks.strip(folded) : folded.normalize("NFC");
  };
};

/**
 * Whether `written` is a form's spelling, one of its alternatives, or neither, compared by `key`.
 * `part`: whether it is one word of it (a token of a phrase written over several tokens), the words
 * as the key gives them (Arabizi's article detached from its noun is a word of its own).
 */
export const spelledAs = (spelled: Spelled, written: string, key: (text: string) => string, part = false): "spelling" | "alternative" | undefined => {
  const want = key(written);
  const is = (text: string): boolean => (part ? key(text).split(" ").includes(want) : key(text) === want);
  if (is(spelled.spelling)) return "spelling";
  return spelled.alternatives.some((a) => is(a.spelling)) ? "alternative" : undefined;
};
