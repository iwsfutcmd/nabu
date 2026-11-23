/**
 * The deterministic part of the grading cascade (gameplan §8.3): normalize the
 * settled answer with the profile, find the closest path through the accept
 * lattice by dynamic programming (edit distance against a DAG), and classify
 * the alignment into a §8.6 verdict. The LLM judge and human review come later
 * and only ever see what this returns as WRONG.
 */
import { compileLattice, type Lattice, type LatticeAlternative, type LatticeWarning } from "../accept/lattice.ts";
import { parseAcceptSet, type NotationError, type NotationWarning } from "../accept/notation.ts";
import type { MissLabel } from "@nabu/schema";
import type { CompiledProfile } from "../profile/compile.ts";
import { readingProjection } from "../profile/schemes.ts";
import { compareByReading } from "../project/by-reading.ts";
import type { ReadingProjection } from "../project/reading.ts";
import type { SoundComparison } from "../project/sound.ts";
import { err, ok, type Result } from "../result.ts";
import { graphemes } from "../text/graphemes.ts";
import { compareUnits, contrastOf, COST, type Comparison, type MatchKind, type WordForm } from "./compare.ts";
import { joinSplits, type CompiledJoin, type JoinSplit } from "./join.ts";

export type Verdict =
  | "CORRECT"
  | "CORRECT_ALT"
  | "CORRECT_MARKS"
  | "CORRECT_VARIANT"
  | "CORRECT_WITH_TYPO"
  | "CORRECT_PROVISIONAL"
  | "PARTIAL"
  | "WRONG_WORD"
  | "WRONG"
  | "SKIPPED";

export type { MissLabel };

/**
 * What a miss can be (ADR 0148), worst first: the order a grade lists its labels in, and the one in
 * which the worst decides what feedback says first.
 */
export const MISS_LABELS: readonly MissLabel[] = ["lexical", "grammatical", "regularised", "scope", "order", "phonemic", "orthographic", "slip"];

const byWorst = (labels: Iterable<MissLabel>): readonly MissLabel[] => {
  const set = new Set(labels);
  return MISS_LABELS.filter((l) => set.has(l));
};

/**
 * How one unit of the answer lines up with the closest accepted answer. A unit that raised a
 * feedback note carries it (`note`, the first it raised): the accent mark that makes como of cómo
 * (accent-word), the ending that trades hablo for hablas (contrast-ending). A unit that is a miss
 * carries its labels (ADR 0148), worst first; a slip alone is a typo, accepted.
 */
export type AlignOp =
  | {
      readonly op: "match";
      readonly expected: string;
      readonly actual: string;
      readonly kind: MatchKind;
      readonly folds?: readonly string[];
      readonly note?: string;
      readonly labels?: readonly MissLabel[];
      /** Written onto the next unit's `actual`, with no space: a joining word typed onto its word (lshay for el shay). */
      readonly joined?: boolean;
    }
  | { readonly op: "substitute"; readonly expected: string; readonly actual: string; readonly note?: string; readonly labels?: readonly MissLabel[] }
  | { readonly op: "insert"; readonly actual: string; readonly labels?: readonly MissLabel[] }
  | { readonly op: "delete"; readonly expected: string; readonly labels?: readonly MissLabel[] };

export interface Grade {
  readonly verdict: Verdict;
  /** Feedback note ids (MF2 messages feedback.note.<id>), in first-seen order. */
  readonly notes: readonly string[];
  /** The closest accepted answer, normalized. */
  readonly matched: string;
  readonly canonical: boolean;
  readonly cost: number;
  readonly alignment: readonly AlignOp[];
  /** What the miss is (ADR 0148): the union of its units' labels, worst first. Empty for an answer accepted as it is. */
  readonly labels: readonly MissLabel[];
  /**
   * The fixed correspondences an orthographic miss differed by, each once, as full ids
   * (`<orthography id>:<id>`, the correspondence's `says`; `stress` for the stress statement).
   */
  readonly correspondences: readonly string[];
}

export interface CompiledAcceptSet {
  readonly profile: CompiledProfile;
  readonly lattice: Lattice;
  /** Unit comparisons, shared by every grade() against this set (pure; bounded). */
  readonly comparisons: Map<string, Comparison>;
  /** Unit comparisons by sound (a spelling projection's), shared the same way. */
  readonly sounds: Map<string, SoundComparison>;
  /** By lattice node, the ways the accepted answers go on from it with a joining word and its word (the profile's `joins`). */
  readonly joined: Map<number, readonly ExpectedJoin[]>;
  readonly paths: number;
  readonly warnings: readonly (NotationWarning | LatticeWarning)[];
}

export const compileAcceptSet = (source: string, profile: CompiledProfile): Result<CompiledAcceptSet, readonly NotationError[]> => {
  const parsed = parseAcceptSet(source);
  if (!parsed.ok) return err(parsed.error);
  const lattice = compileLattice(parsed.value, profile);
  return ok({ profile, lattice, comparisons: new Map(), sounds: new Map(), joined: new Map(), paths: parsed.value.paths, warnings: [...parsed.value.warnings, ...lattice.warnings] });
};

export interface GradeOptions {
  /**
   * Word forms of the target language, each keyed by `lexiconKey`: a typo that lands on one is
   * WRONG_WORD. The profile's contrasts (meaningful endings) apply without it.
   */
  readonly lexicon?: ReadonlySet<string>;
  /**
   * The words the course inflects, each keyed by `lexiconKey`: the profile's contrasts marked
   * `inflected` (Lebanese verb prefixes, a feminine ending) apply to them alone.
   */
  readonly inflected?: ReadonlySet<string>;
  /**
   * The forms each word stands in in the course (the forms of the tokens spelled so: a part of
   * speech and feature values), keyed by `lexiconKey`: contrasts with `forms` apply to the words
   * that stand in one of theirs (ADR 0084).
   */
  readonly forms?: ReadonlyMap<string, readonly WordForm[]>;
  /**
   * Whose form each word is (ADR 0148: by lexeme, never by string), keyed by `lexiconKey`: every
   * lexeme a token of the course spelled so writes, with the token's form key, and each lexicon lemma
   * with its own id. A typed word that shares a form key with the expected one is the same word
   * spelled another way; one that shares a lexeme only is another form of it (grammatical); one
   * that shares none is another lexeme's (lexical). Where a word has no entry, `lexicon` decides as
   * before: a word of it is another lexeme's.
   */
  readonly lexemes?: ReadonlyMap<string, readonly LexemeForm[]>;
  /**
   * For a profile whose sound is a pinned reading (`sound: {from: reading}`): the readings the
   * course's tokens give each spelling in the profile's scheme, keyed by `lexiconKey`. A word with
   * none is not asked the sound question.
   */
  readonly readings?: ReadonlyMap<string, readonly string[]>;
  /** The scheme such a profile's sound is read in, compiled; by default the scheme its id names. */
  readonly scheme?: ReadingProjection;
}

/** A lexeme a spelling writes, and the form key of the token (or lemma) that writes it so. */
export interface LexemeForm {
  readonly lexeme: string;
  readonly form: string;
  /**
   * The lexemes of the form the spelling leaves unwritten (ADR 0136: fa's ezafe after a word that
   * does not show it), joined by `+`; absent where it writes them all. Two spellings of one form are
   * one word spelled two ways only where they write the same lexemes.
   */
  readonly unwritten?: string;
}

/**
 * A word as the lexicon holds it and looks it up (erratum 46): case-folded, the profile's silent
 * equivalences applied, and stripped of the marks the profile ignores. A vocalized course's words
 * carry vowel marks its learners do not type (ADR 0053): نروح must find نْروح. Marks that tell
 * words apart (Spanish está/esta, ADR 0076) are not ignored, so they stay.
 */
export const lexiconKey = (profile: CompiledProfile, word: string): string => {
  let k = profile.fold(word);
  for (const eq of profile.equivalences) if (eq.policy === "accept") k = eq.apply(k);
  return profile.marks?.policy === "ignore" ? profile.marks.strip(k) : k.normalize("NFC");
};

const OP_NONE = 0;
const OP_INSERT = 1;
const OP_DELETE = 2;
const OP_SUB = 3;
const OP_JOIN = 4;

/** Where an accepted answer goes on from a lattice node with a joining word and its word: one edge (essalame) or two (el shay). */
export interface ExpectedJoin {
  readonly join: CompiledJoin;
  /** The node the word's edge leads to. */
  readonly end: number;
  readonly edges: 1 | 2;
  readonly split: JoinSplit;
}

/**
 * A step of the closest path: a unit as the alignment shows it, or a joining word and its word,
 * read off one or two edges of the accepted answer and one or two units of the answer.
 */
type Step =
  | AlignOp
  | { readonly op: "join"; readonly join: CompiledJoin; readonly expected: readonly string[]; readonly actual: readonly string[]; readonly e: JoinSplit; readonly t: JoinSplit };

/** The comparison memo of an accept set: each pair of units compared once. */
const comparer = (set: CompiledAcceptSet) => (expected: string, actual: string): Comparison => {
  const memo = set.comparisons;
  const key = `${expected}\u0000${actual}`;
  let c = memo.get(key);
  if (c === undefined) {
    if (memo.size >= 8192) memo.clear();
    c = compareUnits(set.profile, expected, actual);
    memo.set(key, c);
  }
  return c;
};

/** Spelling-projection sound comparisons of an accept set, memoized. */
const sounder = (set: CompiledAcceptSet) => (expected: string, actual: string): SoundComparison | undefined => {
  const projection = set.profile.projection;
  if (projection === undefined || projection.from === "reading") return undefined;
  const k = `${expected}\u0000${actual}`;
  let c = set.sounds.get(k);
  if (c === undefined) {
    if (set.sounds.size >= 8192) set.sounds.clear();
    c = projection.compare(expected, actual);
    set.sounds.set(k, c);
  }
  return c;
};

/**
 * Closest path: minimal-cost alignment of the answer's units against any lattice path. Where the
 * profile has joining words (`joins`), a joining word and its word on the accepted side may also
 * take one or two units of the answer that read as one of its forms and a spelling of that word, or
 * a form of its lexeme the course writes (`related`), graded as that word apart would be (`blocked`:
 * a unit the course writes as another lexeme's word is never split; `opens`: the accepted word is
 * one the joining word may stand before).
 */
const align = (
  set: CompiledAcceptSet,
  units: readonly string[],
  blocked: (unit: string, expected: readonly string[]) => boolean,
  related: (expected: string, actual: string) => boolean,
  opens: (join: CompiledJoin, word: string) => boolean,
) => {
  const { nodes } = set.lattice;
  const n = units.length;
  const width = n + 1;
  const cost = new Float64Array(nodes.length * width).fill(Number.POSITIVE_INFINITY);
  const back = new Uint8Array(nodes.length * width);
  const compare = comparer(set);

  // Joining words: each unit's readings as one, and each node's on the accepted side, found once.
  const joins = set.profile.joins ?? [];
  const sound = sounder(set);
  const typedJoins =
    joins.length === 0
      ? []
      : units.map((u, i) =>
          joins.flatMap((join) => [
            ...joinSplits(join, [u]).map((split) => ({ join, units: 1 as const, split })),
            ...(i + 1 < n ? joinSplits(join, [u, units[i + 1] as string]).map((split) => ({ join, units: 2 as const, split })) : []),
          ]),
        );
  const expectedJoins = (v: number): readonly ExpectedJoin[] => {
    let found = set.joined.get(v);
    if (found === undefined) {
      const out: ExpectedJoin[] = [];
      for (const join of joins) {
        for (const [a, c] of (nodes[v] as (typeof nodes)[number]).children) {
          for (const split of joinSplits(join, [a], true)) out.push({ join, end: c, edges: 1, split });
          for (const [w, g] of (nodes[c] as (typeof nodes)[number]).children) for (const split of joinSplits(join, [a, w])) out.push({ join, end: g, edges: 2, split });
        }
      }
      found = out;
      set.joined.set(v, found);
    }
    return found;
  };
  /**
   * What the word after a joining word costs, typed so: only a spelling the grader could take for it
   * (a fold, a slip, the same sound by free correspondences) or another form of its lexeme, which is
   * then graded as it is apart (kbire for kbir: grammatical).
   */
  const wordCost = (expected: string, actual: string): number | undefined => {
    const c = compare(expected, actual);
    if (c.kind !== "mismatch") return c.cost;
    if (c.rejected === true) return undefined;
    return (c.required !== true && sound(expected, actual)?.free === true) || related(expected, actual) ? c.cost : undefined;
  };
  const edgesOf = (end: number, edges: 1 | 2): readonly string[] => {
    const node = nodes[end] as (typeof nodes)[number];
    return edges === 1 ? [node.unit] : [(nodes[node.parent] as (typeof nodes)[number]).unit, node.unit];
  };
  const joinedAt = new Map<number, { readonly from: number; readonly i: number; readonly expected: ExpectedJoin; readonly units: 1 | 2; readonly split: JoinSplit }>();

  cost[0] = 0;
  for (let v = 0; v < nodes.length; v++) {
    const base = v * width;
    for (let i = 1; i <= n; i++) {
      const c = (cost[base + i - 1] as number) + COST.insert;
      if (c < (cost[base + i] as number)) {
        cost[base + i] = c;
        back[base + i] = OP_INSERT;
      }
    }
    for (const [unit, child] of (nodes[v] as (typeof nodes)[number]).children) {
      const cb = child * width;
      for (let i = 0; i <= n; i++) {
        const here = cost[base + i] as number;
        if (here === Number.POSITIVE_INFINITY) continue;
        if (i < n) {
          const c = here + compare(unit, units[i] as string).cost;
          if (c < (cost[cb + i + 1] as number)) {
            cost[cb + i + 1] = c;
            back[cb + i + 1] = OP_SUB;
          }
        }
        const d = here + COST.delete;
        if (d < (cost[cb + i] as number)) {
          cost[cb + i] = d;
          back[cb + i] = OP_DELETE;
        }
      }
    }
    if (joins.length === 0) continue;
    for (const ej of expectedJoins(v)) {
      // Asked of this answer's grade (the course's forms), never kept with the accept set.
      if (!opens(ej.join, ej.split.rest)) continue;
      for (let i = 0; i < n; i++) {
        const here = cost[base + i] as number;
        if (here === Number.POSITIVE_INFINITY) continue;
        for (const tj of typedJoins[i] as (typeof typedJoins)[number]) {
          if (tj.join !== ej.join || (tj.units === 1 && blocked(units[i] as string, edgesOf(ej.end, ej.edges)))) continue;
          const w = wordCost(ej.split.rest, tj.split.rest);
          if (w === undefined) continue;
          // A fold's cost more than the units compared one by one, so that path wins a tie.
          const c = here + w + COST.fold;
          const at = ej.end * width + i + tj.units;
          if (c < (cost[at] as number)) {
            cost[at] = c;
            back[at] = OP_JOIN;
            joinedAt.set(at, { from: v, i, expected: ej, units: tj.units, split: tj.split });
          }
        }
      }
    }
  }

  // Best final node; ties prefer the canonical answer, then the heavier, then the earlier.
  let best = -1;
  nodes.forEach((node, v) => {
    if (node.final === undefined) return;
    if (best < 0) {
      best = v;
      return;
    }
    const c = cost[v * width + n] as number;
    const b = cost[best * width + n] as number;
    const nf = node.final;
    const bf = (nodes[best] as (typeof nodes)[number]).final!;
    if (c < b - 1e-9 || (Math.abs(c - b) <= 1e-9 && (Number(nf.canonical) > Number(bf.canonical) || (nf.canonical === bf.canonical && nf.weight > bf.weight)))) {
      best = v;
    }
  });

  const ops: Step[] = [];
  let v = best;
  let i = n;
  while (v > 0 || i > 0) {
    const op = back[v * width + i];
    const node = nodes[v] as (typeof nodes)[number];
    if (op === OP_JOIN) {
      const j = joinedAt.get(v * width + i)!;
      ops.push({ op: "join", join: j.expected.join, expected: edgesOf(j.expected.end, j.expected.edges), actual: units.slice(j.i, j.i + j.units), e: j.expected.split, t: j.split });
      v = j.from;
      i = j.i;
    } else if (op === OP_INSERT || (v === 0 && op === OP_NONE)) {
      ops.push({ op: "insert", actual: units[i - 1] as string });
      i--;
    } else if (op === OP_DELETE) {
      ops.push({ op: "delete", expected: node.unit });
      v = node.parent;
    } else {
      const actual = units[i - 1] as string;
      const c = compare(node.unit, actual);
      ops.push(
        c.kind === "mismatch"
          ? { op: "substitute", expected: node.unit, actual }
          : { op: "match", expected: node.unit, actual, kind: c.kind, ...(c.folds.length > 0 && { folds: c.folds.map((f) => f.id) }) },
      );
      v = node.parent;
      i--;
    }
  }
  ops.reverse();
  const final = (nodes[best] as (typeof nodes)[number]).final!;
  return { ops, cost: cost[best * width + n] as number, final, compare };
};

const RANK: Readonly<Record<Verdict, number>> = {
  CORRECT: 0,
  CORRECT_ALT: 1,
  CORRECT_MARKS: 2,
  CORRECT_VARIANT: 3,
  CORRECT_WITH_TYPO: 4,
  CORRECT_PROVISIONAL: 5,
  WRONG_WORD: 6,
  PARTIAL: 7,
  SKIPPED: 8,
  WRONG: 9,
};

const APOSTROPHES = /['‘’`]/u;
const MODIFIER_APOSTROPHES = /[ʻʼ]/u;

/** What one unit of the alignment is as a miss: its labels, and whether it is a miss a slip, the sound or the marks explain. */
interface Miss {
  readonly labels: readonly MissLabel[];
  /**
   * A slip, the same sounds (whatever the stress) or marks that make another word of the course
   * explain it: no question of meaning, so the outcome is WRONG_WORD at worst, never the judge's.
   */
  readonly explained: boolean;
  /** A homophone character typed for the expected one (yue's IME slips): PARTIAL, when every miss is one. */
  readonly homophone?: boolean;
}

/** Whose form a typed word is, beside the expected one. */
type Relation = "same" | "grammatical" | "lexical" | "none";

/** Levenshtein distance over letters (comparison keys, never shown). */
const letterDistance = (a: readonly string[], b: readonly string[]): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length] as number;
};

/**
 * Grades an answer (ADR 0148, "What a miss is"), unit by unit of its closest accepted answer, in
 * this order:
 * 1. The profile's policies (equivalences, character variants, the marks, a ZWNJ, an apostrophe):
 *    right with their notes, no label. A typed word that says what the expected one says by free
 *    correspondences alone is that word (CORRECT_VARIANT), unless the course writes it as another
 *    lexeme's, or as another form of its lexeme, or, where no token writes it, stands it only in forms
 *    of the expected word's part of speech that the expected word never stands in (grammatical).
 * 2. A difference inside the typo budget is a slip, accepted, unless the two say the same by a fixed
 *    correspondence (orthographic, no slip), or the typed word is another lexeme's form (lexical and
 *    slip) or another form of the expected word's lexeme (grammatical and slip; a contrast set
 *    decides where the course does not know the typed word).
 * 3. What a slip does not explain: is the sound right (orthographic, else phonemic: asked only of an
 *    attempt at the word), and whose form is it (grammatical, lexical). A word left out or added is
 *    lexical, and an unexplained word that is no attempt and no form of the course is lexical too.
 * 4. A homophone character (yue): orthographic, PARTIAL as before.
 * 5. An answer whose words are an accepted answer's in another order: order, and nothing else.
 * A joining word (the profile's `joins`: Arabizi's article) and the word after it are aligned with one
 * or two typed units where the accepted answer has them (`align`): another of its forms is a variant
 * (CORRECT_VARIANT, its note), and the word after it is graded by 1 to 3 as any other.
 * The verdict is a view of the labels: none, the policies' verdict; a slip alone, CORRECT_WITH_TYPO;
 * else not accepted: PARTIAL where every miss is a homophone character, WRONG_WORD where a slip, the
 * same sounds or marks that make another word explain every miss, else WRONG (what the judge is
 * asked about, as before). Marks that alone differ are explained too where the profile states its
 * sounds (pinguino for pingüino says another sound: WRONG_WORD); where it states none, a required
 * mark that makes no other word stays WRONG (kisi for kiši, as before).
 */
export const grade = (set: CompiledAcceptSet, answer: string, options: GradeOptions = {}): Grade => {
  const { profile } = set;
  const normalized = profile.normalize(answer);
  const units = profile.units(normalized);

  // Set from the closest path, once it is found (below).
  let verdict: Verdict = "CORRECT";
  const notes: string[] = [];
  // The first note the unit being classified raised: its alignment op carries it.
  let raised: string | undefined;
  const raise = (v: Verdict): void => {
    if (RANK[v] > RANK[verdict]) verdict = v;
  };
  const note = (id: string | undefined): void => {
    if (id === undefined) return;
    raised ??= id;
    if (!notes.includes(id)) notes.push(id);
  };
  const applyPolicy = (policy: string | undefined, onNote: Verdict, id: string | undefined): void => {
    if (policy === "accept-with-note") {
      raise(onNote);
      note(id);
    } else if (policy === "partial-credit") {
      raise("PARTIAL");
      note(id);
    } else if (policy === "reject" || policy === "reject-with-note") {
      raise("WRONG");
      if (policy === "reject-with-note") note(id);
    }
  };

  // Each word keyed and looked up once a grade.
  const keys = new Map<string, string>();
  const keyOf = (unit: string): string => {
    let k = keys.get(unit);
    if (k === undefined) {
      k = lexiconKey(profile, unit);
      keys.set(unit, k);
    }
    return k;
  };
  const formsOf = (unit: string): readonly LexemeForm[] => {
    const k = keyOf(unit);
    const known = options.lexemes?.get(k);
    if (known !== undefined && known.length > 0) return known;
    // A word the course writes whose lexemes the caller did not give: a lexeme of its own.
    return options.lexicon?.has(k) === true ? [{ lexeme: `?${k}`, form: `?${k}` }] : [];
  };
  // A typed word the course writes is read as a joining word and its word only where it writes a
  // lexeme of the accepted side's (l7amdella as el7amdella's): never another lexeme's word.
  const blocked = (unit: string, expected: readonly string[]): boolean => {
    const typed = formsOf(unit);
    if (typed.length === 0) return false;
    const own = [...expected, expected.join("")].flatMap(formsOf);
    return !typed.some((t) => own.some((e) => e.lexeme === t.lexeme));
  };
  const relation = (expected: string, actual: string): Relation => {
    const typed = formsOf(actual);
    if (typed.length === 0) return "none";
    const own = formsOf(expected);
    const shared = new Set(own.filter((e) => typed.some((t) => t.lexeme === e.lexeme)).map((e) => e.lexeme));
    if (shared.size === 0) return "lexical";
    // Another spelling of the same lexeme in the same form (a scribe's variant) is never another word:
    // the two write the same forms of their lexemes, the same morphemes written. Where one is also a
    // form the other is not (خانوادهٔ, the noun with its ezafe, beside خانواده), it is another form.
    const same = (a: LexemeForm, b: LexemeForm): boolean => a.form === b.form && (a.unwritten ?? "") === (b.unwritten ?? "");
    const covers = (xs: readonly LexemeForm[], ys: readonly LexemeForm[]): boolean => xs.filter((x) => shared.has(x.lexeme)).every((x) => ys.some((y) => same(x, y)));
    return covers(own, typed) && covers(typed, own) ? "same" : "grammatical";
  };
  const formLabel = (r: Relation): readonly MissLabel[] => (r === "grammatical" ? ["grammatical"] : r === "lexical" ? ["lexical"] : []);
  /**
   * Whether a typed word no token writes is, by the forms the course stands its words in (`forms`: an
   * accept set's words take their sentence's nearest word's), another form of the expected word's part
   * of speech: none of its forms one the expected word stands in. Asked only where free
   * correspondences alone would make it the expected word: Arabizi's sme3teene (you, a woman, heard
   * me) says what sme3teni (a man) says, but the course stands it in the woman's form.
   */
  const pinnedElsewhere = (expected: string, actual: string): boolean => {
    const typed = options.forms?.get(keyOf(actual));
    const own = options.forms?.get(keyOf(expected));
    if (typed === undefined || own === undefined || typed.length === 0 || own.length === 0) return false;
    const same = (a: WordForm, b: WordForm): boolean => {
      const fa = Object.entries(a.feats);
      return a.pos === b.pos && fa.length === Object.keys(b.feats).length && fa.every(([k, v]) => b.feats[k] === v);
    };
    if (typed.some((t) => own.some((e) => same(e, t)))) return false;
    return typed.some((t) => own.some((e) => e.pos !== undefined && e.pos === t.pos));
  };

  // A word the course stands only as a part of speech the joining word never goes before (elbos, I
  // wear, which the detach step makes el bos) is no joining word and word.
  const opens = (join: CompiledJoin, word: string): boolean => {
    if (join.notBefore.size === 0) return true;
    const stood = options.forms?.get(keyOf(word));
    return stood === undefined || stood.length === 0 || stood.some((f) => f.pos === undefined || !join.notBefore.has(f.pos));
  };
  const { ops, cost, final, compare } = align(set, units, blocked, (expected, actual) => relation(expected, actual) === "grammatical", opens);
  const alt = set.lattice.alternatives[final.alternative] as LatticeAlternative;
  verdict = final.canonical ? "CORRECT" : "CORRECT_ALT";

  // The sound question (ADR 0148): each pair asked once per accept set, as the units are compared.
  const projection = profile.projection;
  const scheme = projection?.from === "reading" ? (options.scheme ?? readingProjection(projection.scheme)) : undefined;
  const spelled = sounder(set);
  const soundOf = (expected: string, actual: string): SoundComparison | undefined => {
    if (projection === undefined) return undefined;
    if (projection.from === "reading") {
      const readings = options.readings?.get(keyOf(expected));
      return scheme === undefined || readings === undefined || readings.length === 0 ? undefined : compareByReading(scheme, readings, expected, actual);
    }
    return spelled(expected, actual);
  };

  const correspondences: string[] = [];
  /** The labels a pair with the same sounds gets, its places' notes raised and its fixed correspondences kept. */
  const bySound = (c: SoundComparison, quiet = false): readonly MissLabel[] => {
    if (!quiet) for (const d of c.differs) note(d.note);
    const fixed = c.differs.filter((d) => d.kind === "fixed");
    for (const d of fixed) {
      if (d.rule === undefined) continue;
      const id = `${profile.id}:${d.rule}`;
      if (!correspondences.includes(id)) correspondences.push(id);
    }
    // The same sounds with another stress (ke for qué, tambien for también): the stress is phonemic,
    // and a fixed letter place beside it (the k) orthographic.
    if (!c.same) return fixed.length > 0 ? ["phonemic", "orthographic"] : ["phonemic"];
    // Free places are no miss: the same sound spelled as no norm forbids.
    return fixed.length > 0 ? ["orthographic"] : [];
  };
  /** Whether a typed word is an attempt at the expected one: the sound question is asked of it only then. */
  const attempt = (expected: string, actual: string, r: Relation, c: SoundComparison | undefined): boolean => {
    if (c?.sounds === true || r === "grammatical" || r === "same") return true;
    const e = graphemes(profile.fold(expected));
    const a = graphemes(profile.fold(actual));
    return letterDistance(e, a) <= Math.max(e.length, a.length) / 2;
  };

  // The misses by their place in the alignment; slips alone are kept apart: they are accepted.
  const misses = new Map<number, Miss>();
  const slips: MissLabel[] = [];
  if (units.length === 0) raise("WRONG");
  // Each unit's op carries the note it raised, so feedback can say which words it is about
  // (cómo and como, W4), and its labels.
  const alignment: AlignOp[] = [];
  const done = (shown: AlignOp, miss?: Miss): void => {
    const at = alignment.length;
    const labelled = miss === undefined ? shown : { ...shown, labels: byWorst(miss.labels) };
    alignment.push(raised === undefined || labelled.op === "insert" || labelled.op === "delete" ? labelled : { ...labelled, note: raised });
    if (miss === undefined) return;
    if (miss.labels.length === 1 && miss.labels[0] === "slip") slips.push("slip");
    else misses.set(at, miss);
  };
  /** Grades one unit of the answer against one of the accepted answer's; `show` says how its op shows them (a joining word's word). */
  const classify = (expected: string, actual: string, show: (op: AlignOp) => AlignOp = (o) => o): void => {
    const c = compare(expected, actual);
    const op: AlignOp = c.kind === "mismatch" ? { op: "substitute", expected, actual } : { op: "match", expected, actual, kind: c.kind, ...(c.folds.length > 0 && { folds: c.folds.map((f) => f.id) }) };

    // 1. The policies.
    if (c.kind === "exact" || c.kind === "case" || c.kind === "fold") {
      let another: Relation | undefined;
      for (const f of c.folds) {
        // Marks a profile notes but that tell words apart (grc, ADR 0087): left out or added, they can spell another word.
        if (f.kind === "marks" && profile.marks?.distinguishes === true) {
          const r = relation(expected, actual);
          if (r === "lexical" || r === "grammatical") {
            another = r;
            note(profile.marks.wordNote ?? f.note ?? f.id);
            continue;
          }
        }
        applyPolicy(f.policy, f.kind === "marks" ? "CORRECT_MARKS" : f.kind === "variant" ? "CORRECT_VARIANT" : verdict, f.note ?? f.id);
      }
      done(show(op), another === undefined ? undefined : { labels: formLabel(another), explained: true });
      return;
    }
    if (c.kind === "homophone") {
      for (const f of c.folds) applyPolicy(f.policy, f.kind === "marks" ? "CORRECT_MARKS" : f.kind === "variant" ? "CORRECT_VARIANT" : verdict, f.note ?? f.id);
      // 4. A homophone character (ADR 0148: a possible spelling of its syllable): orthographic, where the profile does not accept it.
      if (profile.homophones?.policy === "partial-credit") {
        note("ime-homophone");
        done(show(op), { labels: ["orthographic"], explained: true, homophone: true });
      } else {
        applyPolicy(profile.homophones?.policy, "PARTIAL", "ime-homophone");
        done(show(op));
      }
      return;
    }

    const sound = c.kind === "mismatch" && c.rejected === true ? undefined : soundOf(expected, actual);
    const known = relation(expected, actual);
    // Where the course says nothing of the typed word's lexemes, its forms may: another form is never a variant.
    const r: Relation = known === "none" && sound?.free === true && pinnedElsewhere(expected, actual) ? "grammatical" : known;
    // 1. A free correspondence: the same word, spelled as no norm forbids.
    if (sound?.free === true && r !== "lexical" && r !== "grammatical" && !(c.kind === "mismatch" && c.required === true)) {
      for (const f of c.folds) applyPolicy(f.policy, f.kind === "marks" ? "CORRECT_MARKS" : f.kind === "variant" ? "CORRECT_VARIANT" : verdict, f.note ?? f.id);
      raise("CORRECT_VARIANT");
      note(sound.differs.find((d) => d.note !== undefined)?.note ?? "spelling-variant");
      done(show({ op: "match", expected, actual, kind: "fold" }));
      return;
    }

    // 2. The slip.
    if (c.kind === "typo") {
      for (const f of c.folds) applyPolicy(f.policy, f.kind === "marks" ? "CORRECT_MARKS" : f.kind === "variant" ? "CORRECT_VARIANT" : verdict, f.note ?? f.id);
      // A typo that trades a meaningful ending for another (erratum 46) changes what the answer says.
      const word = lexiconKey(profile, expected);
      const contrast = contrastOf(profile, expected, actual, options.inflected?.has(word) === true, options.forms?.get(word));
      if (contrast !== undefined) note(contrast.note);
      // The right sound by a fixed correspondence (havlar, سد for صد): which letter was the question, never a typo.
      if (sound?.sounds === true) {
        done(show(op), { labels: [...bySound(sound), ...formLabel(r)], explained: true });
        return;
      }
      const form: readonly MissLabel[] = r === "lexical" || r === "grammatical" ? formLabel(r) : contrast !== undefined ? ["grammatical"] : [];
      if (form.length === 0) raise("CORRECT_WITH_TYPO");
      done(show(op), { labels: ["slip", ...form], explained: true });
      return;
    }

    // 3. What a slip does not explain.
    if (c.kind !== "mismatch") {
      done(show(op));
      return;
    }
    const markWord = c.required === true && profile.marks?.distinguishes === true && (r === "lexical" || r === "grammatical");
    note(markWord ? (profile.marks?.wordNote ?? c.note) : c.note);
    // A fold the profile refuses (Russian letters for Uzbek ones): the right word, written as the
    // orthography never writes it. Wrong, as the policy says.
    if (c.rejected === true) {
      done(show(op), { labels: ["orthographic"], explained: false });
      return;
    }
    const labels: MissLabel[] = [];
    // Where the marks make another word, its note says it all (accent-word): the places' notes are not repeated.
    if (sound !== undefined && attempt(expected, actual, r, sound)) labels.push(...(sound.sounds ? bySound(sound, markWord) : ["phonemic" as const]));
    // A required mark carries sound (ADR 0134 as amended, ADR 0148): where no statement asks the sound
    // question, a word whose required marks differ says another sound all the same (kisi for kiši).
    else if (sound === undefined && c.required === true) labels.push("phonemic");
    labels.push(...formLabel(r));
    // The same lexeme in the same form, spelled as the course spells it elsewhere: its spelling is the miss.
    if (labels.length === 0) labels.push(r === "same" ? "orthographic" : "lexical");
    // (regularised, the right lexeme and form built by rule where a part is listed, would be asked
    // here, of the forms a lexicon ships with blocking off: none ships yet. scope needs ADR 0147's
    // prompt tags: it is never produced.)
    // Required marks explain a miss where they make another word of the course (bardi for bärdi), as
    // before ADR 0148; the same sounds explain it whatever the marks (tambien, ke for qué).
    // And where the profile states its sounds, marks that alone differ are the statement's to judge
    // (pinguino says another sound): a mark that carries sound is never a question of meaning, so
    // never the judge's, who would excuse it.
    const explained = sound?.sounds === true || r === "same" || markWord || (c.marksOnly === true && sound !== undefined);
    done(show(op), { labels, explained });
  };
  for (const op of ops) {
    raised = undefined;
    // A word left out or added (a sentence's words in another order are told apart below).
    if (op.op === "insert" || op.op === "delete") {
      done(op, { labels: ["lexical"], explained: false });
      continue;
    }
    if (op.op === "join") {
      // A joining word and its word (the profile's `joins`): its form is free, and the word is
      // graded as any other. Another form than the accepted answer's is a variant; another space
      // alone is nothing.
      const { join, e, t } = op;
      const form = (): void => {
        if (e.form === t.form) return;
        raise("CORRECT_VARIANT");
        note(join.note ?? "spelling-variant");
      };
      const typed = op.actual.join(" ");
      if (op.expected.length === 1) {
        form();
        classify(e.rest, t.rest, (o) => ({ ...o, expected: op.expected[0] as string, actual: typed }));
        continue;
      }
      form();
      const [word, onto] = op.actual.length === 1 ? [t.head, t.rest] : [op.actual[0] as string, op.actual[1] as string];
      done({ op: "match", expected: op.expected[0] as string, actual: word, kind: e.form === t.form ? (op.expected[0] === word ? "exact" : "case") : "fold", ...(op.actual.length === 1 && { joined: true }) });
      raised = undefined;
      classify(e.rest, t.rest, (o) => ({ ...o, expected: op.expected[1] as string, actual: onto }));
      continue;
    }
    classify(op.expected, op.actual);
  }

  // 5. The accepted answer's words in another order: order, and nothing else.
  // Only words out of their place: none matched where it stands and missed all the same.
  if (misses.size > 0 && [...misses.keys()].every((i) => alignment[i]?.op !== "match")) {
    const theirs = profile.units(alt.normalized);
    if (theirs.length === units.length) {
      const left = [...theirs];
      const same = units.every((u) => {
        const i = left.findIndex((t) => {
          const k = compare(t, u).kind;
          return k === "exact" || k === "case" || k === "fold";
        });
        if (i < 0) return false;
        left.splice(i, 1);
        return true;
      });
      if (same) {
        correspondences.length = 0;
        for (const [i] of misses) {
          misses.set(i, { labels: ["order"], explained: false });
          alignment[i] = { ...(alignment[i] as AlignOp), labels: ["order"] };
        }
      }
    }
  }

  if (misses.size > 0) {
    const all = [...misses.values()];
    raise(all.every((m) => m.homophone === true) ? "PARTIAL" : all.every((m) => m.explained) ? "WRONG_WORD" : "WRONG");
  }
  raised = undefined;
  if (final.flags.includes("zwnj") && profile.zwnj !== undefined) applyPolicy(profile.zwnj.policy, verdict, profile.zwnj.note ?? "zwnj");
  if (profile.apostrophe !== undefined && APOSTROPHES.test(answer) && MODIFIER_APOSTROPHES.test(alt.normalized)) {
    applyPolicy(profile.apostrophe.policy, verdict, profile.apostrophe.note ?? "apostrophe");
  }
  if (profile.scriptMismatch !== undefined && Array.from(normalized).some((c) => profile.scriptMismatch!.chars.has(c))) {
    applyPolicy(profile.scriptMismatch.policy, verdict, profile.scriptMismatch.note ?? "script-mismatch");
  }
  const labels = byWorst([...slips, ...[...misses.values()].flatMap((m) => m.labels)]);
  return {
    verdict,
    notes,
    matched: alt.normalized,
    canonical: final.canonical,
    cost: Math.round(cost * 1000) / 1000,
    alignment,
    labels,
    correspondences: labels.includes("orthographic") ? correspondences : [],
  };
};
