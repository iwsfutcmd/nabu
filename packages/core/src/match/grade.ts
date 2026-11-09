/**
 * The deterministic part of the grading cascade (gameplan §8.3): normalize the
 * settled answer with the profile, find the closest path through the accept
 * lattice by dynamic programming (edit distance against a DAG), and classify
 * the alignment into a §8.6 verdict. The LLM judge and human review come later
 * and only ever see what this returns as WRONG.
 */
import { compileLattice, type Lattice, type LatticeAlternative, type LatticeWarning } from "../accept/lattice.ts";
import { parseAcceptSet, type NotationError, type NotationWarning } from "../accept/notation.ts";
import type { CompiledProfile } from "../profile/compile.ts";
import { err, ok, type Result } from "../result.ts";
import { compareUnits, contrastOf, COST, type Comparison, type MatchKind } from "./compare.ts";

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

export type AlignOp =
  | { readonly op: "match"; readonly expected: string; readonly actual: string; readonly kind: MatchKind; readonly folds?: readonly string[] }
  | { readonly op: "substitute"; readonly expected: string; readonly actual: string }
  | { readonly op: "insert"; readonly actual: string }
  | { readonly op: "delete"; readonly expected: string };

export interface Grade {
  readonly verdict: Verdict;
  /** Feedback note ids (MF2 messages feedback.note.<id>), in first-seen order. */
  readonly notes: readonly string[];
  /** The closest accepted answer, normalized. */
  readonly matched: string;
  readonly canonical: boolean;
  readonly cost: number;
  readonly alignment: readonly AlignOp[];
}

export interface CompiledAcceptSet {
  readonly profile: CompiledProfile;
  readonly lattice: Lattice;
  /** Unit comparisons, shared by every grade() against this set (pure; bounded). */
  readonly comparisons: Map<string, Comparison>;
  readonly paths: number;
  readonly warnings: readonly (NotationWarning | LatticeWarning)[];
}

export const compileAcceptSet = (source: string, profile: CompiledProfile): Result<CompiledAcceptSet, readonly NotationError[]> => {
  const parsed = parseAcceptSet(source);
  if (!parsed.ok) return err(parsed.error);
  const lattice = compileLattice(parsed.value, profile);
  return ok({ profile, lattice, comparisons: new Map(), paths: parsed.value.paths, warnings: [...parsed.value.warnings, ...lattice.warnings] });
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
   * The forms each inflected word is pinned as in the course (form KC ids, the forms of the
   * tokens it spells), keyed by `lexiconKey`: contrasts with `forms` apply to the words pinned as
   * one (ADR 0084).
   */
  readonly forms?: ReadonlyMap<string, readonly string[]>;
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

/** Closest path: minimal-cost alignment of the answer's units against any lattice path. */
const align = (set: CompiledAcceptSet, units: readonly string[]) => {
  const { nodes } = set.lattice;
  const n = units.length;
  const width = n + 1;
  const cost = new Float64Array(nodes.length * width).fill(Number.POSITIVE_INFINITY);
  const back = new Uint8Array(nodes.length * width);
  const memo = set.comparisons;
  const compare = (expected: string, actual: string): Comparison => {
    const key = `${expected}\u0000${actual}`;
    let c = memo.get(key);
    if (c === undefined) {
      if (memo.size >= 8192) memo.clear();
      c = compareUnits(set.profile, expected, actual);
      memo.set(key, c);
    }
    return c;
  };

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

  const ops: AlignOp[] = [];
  let v = best;
  let i = n;
  while (v > 0 || i > 0) {
    const op = back[v * width + i];
    const node = nodes[v] as (typeof nodes)[number];
    if (op === OP_INSERT || (v === 0 && op === OP_NONE)) {
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

export const grade = (set: CompiledAcceptSet, answer: string, options: GradeOptions = {}): Grade => {
  const { profile } = set;
  const normalized = profile.normalize(answer);
  const units = profile.units(normalized);
  const { ops, cost, final, compare } = align(set, units);
  const alt = set.lattice.alternatives[final.alternative] as LatticeAlternative;

  let verdict: Verdict = final.canonical ? "CORRECT" : "CORRECT_ALT";
  const notes: string[] = [];
  const raise = (v: Verdict): void => {
    if (RANK[v] > RANK[verdict]) verdict = v;
  };
  const note = (id: string | undefined): void => {
    if (id !== undefined && !notes.includes(id)) notes.push(id);
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

  if (units.length === 0) raise("WRONG");
  for (const op of ops) {
    if (op.op !== "match") {
      raise("WRONG");
      if (op.op === "substitute") {
        const c = compare(op.expected, op.actual);
        if (c.kind === "mismatch") note(c.note);
      }
      continue;
    }
    const c = compare(op.expected, op.actual);
    for (const f of c.folds) {
      // Marks that tell words apart (ADR 0076): left out or added, they can spell another word (esta for está).
      if (f.kind === "marks" && profile.marks?.distinguishes === true && options.lexicon?.has(lexiconKey(profile, op.actual)) === true) {
        raise("WRONG_WORD");
        note(profile.marks.wordNote ?? f.note ?? f.id);
        continue;
      }
      applyPolicy(f.policy, f.kind === "marks" ? "CORRECT_MARKS" : f.kind === "variant" ? "CORRECT_VARIANT" : verdict, f.note ?? f.id);
    }
    if (c.kind === "homophone") applyPolicy(profile.homophones?.policy, "PARTIAL", "ime-homophone");
    else if (c.kind === "typo") {
      // A typo that makes another word, or trades a meaningful ending for another (erratum 46),
      // changes what the answer says.
      const word = lexiconKey(profile, op.expected);
      const contrast = contrastOf(profile, op.expected, op.actual, options.inflected?.has(word) === true, options.forms?.get(word));
      if (contrast !== undefined) note(contrast.note);
      raise(contrast !== undefined || options.lexicon?.has(lexiconKey(profile, op.actual)) === true ? "WRONG_WORD" : "CORRECT_WITH_TYPO");
    }
  }
  if (final.flags.includes("zwnj") && profile.zwnj !== undefined) applyPolicy(profile.zwnj.policy, verdict, profile.zwnj.note ?? "zwnj");
  if (profile.apostrophe !== undefined && APOSTROPHES.test(answer) && MODIFIER_APOSTROPHES.test(alt.normalized)) {
    applyPolicy(profile.apostrophe.policy, verdict, profile.apostrophe.note ?? "apostrophe");
  }
  if (profile.scriptMismatch !== undefined && Array.from(normalized).some((c) => profile.scriptMismatch!.chars.has(c))) {
    applyPolicy(profile.scriptMismatch.policy, verdict, profile.scriptMismatch.note ?? "script-mismatch");
  }
  return { verdict, notes, matched: alt.normalized, canonical: final.canonical, cost: Math.round(cost * 1000) / 1000, alignment: ops };
};
