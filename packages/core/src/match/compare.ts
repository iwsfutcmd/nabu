/**
 * Comparing one expected unit with one typed unit (gameplan §8.3–8.4). The
 * checks run from cheapest and most lenient to most specific; the first that
 * makes the two equal decides the kind. Costs make the aligner prefer exact
 * paths, then silent folds, then noted folds, then typos and IME slips, and
 * only then a substitution.
 */
import type { Policy } from "@nabu/schema";
import type { CompiledContrast, CompiledProfile } from "../profile/compile.ts";
import { graphemes } from "../text/graphemes.ts";

export type MatchKind = "exact" | "case" | "fold" | "typo" | "homophone";

/** One lenient comparison step that changed the text: an equivalence, the marks policy or the variant table. */
export interface Fold {
  readonly kind: "equivalence" | "marks" | "variant";
  readonly id: string;
  readonly policy: Policy;
  readonly note?: string | undefined;
}

export type Comparison =
  | { readonly kind: MatchKind; readonly cost: number; readonly folds: readonly Fold[] }
  | { readonly kind: "mismatch"; readonly cost: number; readonly folds: readonly Fold[]; readonly note?: string | undefined };

export const COST = { insert: 1, delete: 1, mismatch: 1, fold: 0.001, typo: 0.3, homophone: 0.5 } as const;

const rejects = (policy: Policy): boolean => policy === "reject" || policy === "reject-with-note";

/**
 * Weighted optimal-string-alignment distance over letter units: adjacent-key
 * substitutions and transpositions cost 0.5, everything else 1 (§8.4).
 */
export const keyboardDistance = (a: readonly string[], b: readonly string[], adjacent: (x: string, y: string) => boolean): number => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = new Float64Array(rows * cols);
  for (let i = 0; i < rows; i++) d[i * cols] = i;
  for (let j = 0; j < cols; j++) d[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const x = a[i - 1] as string;
      const y = b[j - 1] as string;
      const sub = x === y ? 0 : adjacent(x, y) ? 0.5 : 1;
      let best = Math.min((d[(i - 1) * cols + j] as number) + 1, (d[i * cols + j - 1] as number) + 1, (d[(i - 1) * cols + j - 1] as number) + sub);
      if (i > 1 && j > 1 && x === b[j - 2] && a[i - 2] === y && x !== y) best = Math.min(best, (d[(i - 2) * cols + j - 2] as number) + 0.5);
      d[i * cols + j] = best;
    }
  }
  return d[rows * cols - 1] as number;
};

const NONE: readonly Fold[] = [];

/** Levenshtein distance over code points (internal: compares two comparison keys, never user-facing text). */
const editDistance = (x: string, y: string): number => {
  const a = Array.from(x);
  const b = Array.from(y);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min((prev[j] as number) + 1, (row[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length] as number;
};

export const compareUnits = (profile: CompiledProfile, expected: string, actual: string): Comparison => {
  if (expected === actual) return { kind: "exact", cost: 0, folds: NONE };
  let e = profile.fold(expected);
  let a = profile.fold(actual);
  if (e === a) return { kind: "case", cost: 0, folds: NONE };

  const folds: Fold[] = [];
  /** Equal after the folds so far: a rejecting fold turns the match into a mismatch that carries its note. */
  const settle = (): Comparison => {
    const rejecting = folds.find((f) => rejects(f.policy));
    return rejecting !== undefined
      ? { kind: "mismatch", cost: COST.mismatch, folds, note: rejecting.policy === "reject-with-note" ? rejecting.note ?? rejecting.id : undefined }
      : { kind: "fold", cost: COST.fold * folds.length, folds };
  };

  // A fold counts only when it brings the two sides closer: folding a hamza seat that both
  // sides share is not a learner deviation and earns no note.
  const closer = (ne: string, na: string): boolean => (ne !== e || na !== a) && editDistance(ne, na) < editDistance(e, a);

  for (const eq of profile.equivalences) {
    const ne = eq.apply(e);
    const na = eq.apply(a);
    if (closer(ne, na)) folds.push({ kind: "equivalence", id: eq.id, policy: eq.policy, note: eq.note });
    e = ne;
    a = na;
    if (e === a) return settle();
  }

  if (profile.marks !== undefined) {
    const me = profile.marks.strip(e);
    const ma = profile.marks.strip(a);
    if (closer(me, ma)) folds.push({ kind: "marks", id: "marks", policy: profile.marks.policy, note: profile.marks.note });
    e = me;
    a = ma;
    if (e === a) return settle();
  }

  if (profile.variants !== undefined && profile.variants.key(e) === profile.variants.key(a)) {
    folds.push({ kind: "variant", id: "variant", policy: profile.variants.policy, note: profile.variants.note });
    return settle();
  }

  // A Simplified-only character is a script mismatch, not an IME slip, even when the readings agree.
  const wrongScript = profile.scriptMismatch?.chars.has(actual) === true;
  if (profile.homophones !== undefined && profile.unitKind === "grapheme" && !wrongScript) {
    const re = profile.homophones.readings(expected);
    const ra = profile.homophones.readings(actual);
    if (re !== undefined && ra !== undefined && re.some((r) => ra.includes(r))) {
      return { kind: "homophone", cost: COST.homophone, folds };
    }
  }

  if (profile.typo?.model === "keyboard" && profile.unitKind === "token") {
    const le = profile.letters(e);
    if (le.length >= profile.typo.minLength) {
      const distance = keyboardDistance(le, profile.letters(a), profile.typo.adjacent);
      if (distance <= le.length * profile.typo.maxRatio) return { kind: "typo", cost: COST.typo + distance / 100, folds };
    }
  }

  // A fold that rejects explains the mismatch even when other differences remain.
  const rejecting = folds.find((f) => f.policy === "reject-with-note");
  return { kind: "mismatch", cost: COST.mismatch, folds, note: rejecting?.note ?? rejecting?.id };
};

const startsAt = (word: readonly string[], at: number, part: readonly string[]): boolean =>
  at + part.length <= word.length && part.every((g, i) => word[at + i] === g);

/** Whether graphemes `from…` of a key are nothing but endings of the profile's contrasts, stacked. */
const onlyEndings = (word: readonly string[], from: number, contrasts: readonly CompiledContrast[]): boolean => {
  const ok = new Array<boolean>(word.length + 1).fill(false);
  ok[word.length] = true;
  for (let i = word.length - 1; i >= from; i--) {
    ok[i] = contrasts.some((c) => c.members.some((spellings) => spellings.some((m) => m.length > 0 && startsAt(word, i, m) && ok[i + m.length] === true)));
  }
  return ok[from] === true;
};

/**
 * The contrast set (profile `typo.contrasts`) an edit trades one member of for
 * another, the rest of the word unchanged: talabasan for talabaman, Сен for Мен,
 * Lebanese wa-ana for wa-inte. That is a meaning change, not a typo (erratum 46).
 * - Endings: the member ends the word or is followed only by other endings, as suffixes
 *   stack (maktabgaman for maktabdaman).
 * - Prefixes (`at: start`): the member starts the word, or follows one of the set's
 *   proclitics (Lebanese bishteghel for btishteghel, w-bishteghel for w-btishteghel).
 * - An empty member is the word without the affix: shteghel for bishteghel, b3id for b3ide.
 * - Sets marked `inflected` apply only when `inflected` says the expected word is one the
 *   course inflects, so a noun's first letter stays a typo.
 * - Sets with `forms` apply only when the expected word is pinned as one of them (`forms`, the
 *   word's forms in the course; an entry also matches the forms it begins: form:yiqtol, ADR 0084).
 * Compared by graphemes of the units' contrast keys.
 */
export const contrastOf = (
  profile: CompiledProfile,
  expected: string,
  actual: string,
  inflected = false,
  forms: readonly string[] = [],
): CompiledContrast | undefined => {
  const typo = profile.typo;
  if (typo === undefined || typo.contrasts.length === 0) return undefined;
  const applies = (c: CompiledContrast): boolean =>
    c.forms === undefined ? inflected || !c.inflected : forms.some((f) => c.forms?.some((start) => f.startsWith(start)) === true);
  const sets = typo.contrasts.filter(applies);
  const endings = sets.filter((c) => c.at === "end");
  const e = graphemes(typo.key(expected));
  const a = graphemes(typo.key(actual));
  /** Whether `a` is `e` with the member at `at` (of length `len`) traded for another of `set`. */
  const traded = (set: CompiledContrast, i: number, at: number, len: number): boolean => {
    const rest = e.slice(at + len);
    for (const [j, others] of set.members.entries()) {
      if (j === i) continue;
      for (const o of others) {
        if (a.length === at + o.length + rest.length && startsAt(a, 0, e.slice(0, at)) && startsAt(a, at, o) && startsAt(a, at + o.length, rest)) return true;
      }
    }
    return false;
  };
  for (const set of sets) {
    // Where the set's members may stand: after nothing or a proclitic (prefixes), anywhere
    // only endings follow (endings).
    const starts = set.at === "start" ? [0, ...set.after.filter((p) => p.length > 0 && startsAt(e, 0, p)).map((p) => p.length)] : undefined;
    for (const [i, spellings] of set.members.entries()) {
      for (const m of spellings) {
        if (starts !== undefined) {
          for (const at of starts) if (startsAt(e, at, m) && traded(set, i, at, m.length)) return set;
          continue;
        }
        for (let at = 0; at + m.length <= e.length; at++) {
          if (startsAt(e, at, m) && onlyEndings(e, at + m.length, endings) && traded(set, i, at, m.length)) return set;
        }
      }
    }
  }
  return undefined;
};
