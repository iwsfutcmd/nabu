/**
 * Joining words (a profile's `match.joins`): a word an orthography writes onto the word after it or
 * apart, in forms no norm picks among. Arabizi's article is one: el shay, elshay, l shay, lshay, and
 * before a sun letter esh shay, eshshay, essalame. Grading compares word by word, so the article
 * written onto its noun is one word against two; these read one or two words as the joining word and
 * the word after it, and the grader (grade.ts) asks it only where the accepted answer has the joining
 * word there. Everything about the word is the profile's data: no form, letter or word is named here.
 */
import type { Join } from "@nabu/schema";
import { err, ok, type Result } from "../result.ts";
import type { StepFn } from "../normalize/steps.ts";
import { graphemes } from "../text/graphemes.ts";
import { parseExemplarSet } from "../text/unicode-set.ts";

export interface CompiledJoin {
  readonly id: string;
  readonly note?: string | undefined;
  /** The word after it has at least this many graphemes. */
  readonly minRest: number;
  /** Its forms before any word, case-folded. */
  readonly forms: ReadonlySet<string>;
  /** The letters before which it also takes `assimilated` forms, case-folded, as graphemes, longest first. */
  readonly before: readonly (readonly string[])[];
  /** Those forms: what is written, then whether the letter after it is written again ({next}). */
  readonly assimilated: readonly { readonly written: string; readonly doubled: boolean }[];
  /** Never before a word the course stands only as one of these parts of speech. */
  readonly notBefore: ReadonlySet<string>;
  /** Every way it can be written (a doubled form with each letter), case-folded: a word is read only where it begins with one. */
  readonly written: readonly string[];
  /** Their beginnings, whole graphemes: a first word of two is read only where it is one. */
  readonly beginnings: ReadonlySet<string>;
  /** The readings found, by words read (pure; bounded, cleared when full). */
  readonly found: Map<string, readonly JoinSplit[]>;
  readonly fold: StepFn;
}

const DEFAULT_MIN_REST = 3;
const CACHE_LIMIT = 8192;
const NEXT = "{next}";

export const compileJoin = (join: Join, fold: StepFn): Result<CompiledJoin, string> => {
  const keyOf = (s: string): string => fold(s.normalize("NFC")).normalize("NFC");
  let before: (readonly string[])[] = [];
  const assimilated: { written: string; doubled: boolean }[] = [];
  if (join.assimilates !== undefined) {
    try {
      before = parseExemplarSet(join.assimilates.before).map((l) => graphemes(keyOf(l)));
    } catch (e) {
      return err(`join ${join.id}: ${(e as Error).message}`);
    }
    before.sort((a, b) => b.length - a.length);
    for (const form of join.assimilates.forms) {
      const at = form.indexOf(NEXT);
      if (at >= 0 && at !== form.length - NEXT.length) return err(`join ${join.id}: {next} stands only at a form's end (${form})`);
      const written = keyOf(at < 0 ? form : form.slice(0, at));
      if (written === "" && at < 0) return err(`join ${join.id}: a form is never empty`);
      assimilated.push({ written, doubled: at >= 0 });
    }
  }
  const forms = join.forms.map(keyOf);
  if (forms.some((f) => f === "")) return err(`join ${join.id}: a form is never empty`);
  const written = [...new Set([...forms, ...assimilated.flatMap((a) => (a.doubled ? before.map((l) => `${a.written}${l.join("")}`) : [a.written]))])];
  const beginnings = new Set(written.flatMap((w) => graphemes(w).map((_, i, gs) => gs.slice(0, i + 1).join(""))));
  return ok({ id: join.id, note: join.note, minRest: join.minRest ?? DEFAULT_MIN_REST, forms: new Set(forms), before, assimilated, notBefore: new Set(join.notBefore ?? []), written, beginnings, found: new Map(), fold });
};

/** One way to read some words as the joining word and the word after it. */
export interface JoinSplit {
  /** The joining word as written, case-folded (the forms compare by it). */
  readonly form: string;
  /** Its letters as typed, where it is written onto the word after it (one word read). */
  readonly head: string;
  /** The word after it, as written. */
  readonly rest: string;
}

/** Whether `form` is a form of the join before a word whose folded letters are `rest`; `doubled`: only forms that write its letter again. */
const isForm = (join: CompiledJoin, form: string, rest: readonly string[], doubled: boolean): boolean => {
  if (!doubled && join.forms.has(form)) return true;
  const letter = join.before.find((l) => l.length <= rest.length && l.every((g, i) => rest[i] === g));
  if (letter === undefined) return false;
  const again = letter.join("");
  return join.assimilated.some((a) => (a.doubled || !doubled) && (a.doubled ? `${a.written}${again}` : a.written) === form);
};

/**
 * Each way to read `units` (one word, or two in a row) as the joining word and a word after it of at
 * least `minRest` graphemes: one word, its first letters the joining word (lshay, essalame); two, the
 * first the joining word and the second the word (l shay, es salame), or the second's first letters
 * still the joining word's (el ssalame, which a detach step makes of elssalame). `doubled`: only
 * forms that write the next letter again, for a single word of an accepted answer (essalame, never
 * lebnen as l and ebnen).
 */
export const joinSplits = (join: CompiledJoin, units: readonly string[], doubled = false): readonly JoinSplit[] => {
  const key = `${doubled ? "1" : "0"}\u0000${units.join("\u0000")}`;
  let found = join.found.get(key);
  if (found === undefined) {
    if (join.found.size >= CACHE_LIMIT) join.found.clear();
    found = splitsOf(join, units, doubled);
    join.found.set(key, found);
  }
  return found;
};

const splitsOf = (join: CompiledJoin, units: readonly string[], doubled: boolean): readonly JoinSplit[] => {
  const out: JoinSplit[] = [];
  // Most words begin with no form of it: they are passed over before they are cut into graphemes.
  const first = join.fold(units[0] ?? "");
  if (units.length === 1 ? !join.written.some((w) => first.startsWith(w) && first !== w) : !join.beginnings.has(first)) return out;
  if (units.length === 1) {
    const gs = graphemes(units[0] as string);
    const fs = gs.map(join.fold);
    for (let k = 1; k + join.minRest <= gs.length; k++) {
      const form = fs.slice(0, k).join("");
      if (isForm(join, form, fs.slice(k), doubled)) out.push({ form, head: gs.slice(0, k).join(""), rest: gs.slice(k).join("") });
    }
  } else if (units.length === 2) {
    const gs = graphemes(units[1] as string);
    const fs = gs.map(join.fold);
    for (let k = 0; k + join.minRest <= gs.length; k++) {
      const form = `${first}${fs.slice(0, k).join("")}`;
      if (isForm(join, form, fs.slice(k), doubled)) out.push({ form, head: "", rest: gs.slice(k).join("") });
    }
  }
  return out;
};
