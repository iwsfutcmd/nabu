/**
 * Accent rules (a rewrite's `accent`; docs/rules/grc.md): a word's pitch accent placed by counting
 * its syllables from the end, as the language's notation (`prosody`) says what a syllable's nucleus
 * is, which are long and what the accent marks are. Each letter is read as its canonical
 * decomposition, a base letter and marks, so a mark NFC composes into its letter is seen.
 *
 * - recessive: every accent goes; an acute stands as far from the end as the last syllable allows
 *   (the third syllable, or the second where the last is long), no further back than the last
 *   syllable before the notation's `limit`; a long second-to-last syllable before a short last takes
 *   the circumflex.
 * - persistent: the form's last accent stays on its syllable as far as the last syllable allows
 *   (else it moves to the third, or the second, from the end); every other accent goes; on the
 *   second-to-last syllable it is a circumflex where that syllable is long and the last short, an
 *   acute where not; on the last it stays as it was. A form with no accent is left so.
 * - oxytone: a form with no accent takes an acute on its last syllable (an oxytone whose cited ending,
 *   the accent with it, gave way to another); a form with one is left so.
 * - ultima: every accent goes, and the last syllable takes one: a circumflex where it is long, an acute
 *   where it is short (the genitive and dative of a first- or second-declension oxytone; of a
 *   monosyllabic third-declension stem).
 *
 * Pure. No letter or mark of a language is named here: they are the notation's.
 */
import type { Notation } from "@nabu/schema";
import { err, ok, type Result } from "../result.ts";
import { parseExemplarSet } from "../text/unicode-set.ts";
import { unitsOf, type Unit } from "./realise-pattern.ts";

type Prosody = NonNullable<Notation["prosody"]>;

export type AccentMode = "recessive" | "persistent" | "oxytone" | "ultima";

/** The notation's prosody as the accent rules read it. */
export interface CompiledProsody {
  readonly vowels: ReadonlySet<string>;
  readonly long: ReadonlySet<string>;
  readonly lengthen: ReadonlySet<string>;
  readonly diphthongs: ReadonlySet<string>;
  readonly apart: ReadonlySet<string>;
  readonly shortAtEnd: ReadonlySet<string>;
  readonly acute: string;
  readonly circumflex: string;
  readonly limit: string | undefined;
}

const MARK = /^\p{M}$/u;

export const compileProsody = (prosody: Prosody): Result<CompiledProsody, readonly string[]> => {
  const errors: string[] = [];
  const set = (name: string, pattern: string | undefined): ReadonlySet<string> => {
    if (pattern === undefined) return new Set();
    try {
      return new Set(parseExemplarSet(pattern).map((m) => m.normalize("NFD")));
    } catch (e) {
      errors.push(`notation.prosody.${name}: ${(e as Error).message}`);
      return new Set();
    }
  };
  const mark = (name: string, text: string): string => {
    const nfd = text.normalize("NFD");
    if (Array.from(nfd).length !== 1 || !MARK.test(nfd)) errors.push(`notation.prosody.${name} is one mark (${JSON.stringify(text)})`);
    return nfd;
  };
  const compiled: CompiledProsody = {
    vowels: set("vowels", prosody.vowels),
    long: set("long", prosody.long),
    lengthen: set("lengthen", prosody.lengthen),
    diphthongs: set("diphthongs", prosody.diphthongs),
    apart: set("apart", prosody.apart),
    shortAtEnd: set("shortAtEnd", prosody.shortAtEnd),
    acute: mark("acute", prosody.acute),
    circumflex: mark("circumflex", prosody.circumflex),
    limit: prosody.limit?.normalize("NFC"),
  };
  for (const d of compiled.diphthongs) if (Array.from(d).length !== 2) errors.push(`notation.prosody.diphthongs: ${JSON.stringify(d)} is not two letters`);
  return errors.length > 0 ? err(errors) : ok(compiled);
};

/** A letter unit read as its decomposition: its base letter and its marks, in canonical order. */
const decomposed = (u: Unit & { readonly kind: "letter" }): { readonly letter: string; readonly marks: readonly string[] } => {
  const [letter = "", ...marks] = Array.from((u.base + u.marks.join("")).normalize("NFD"));
  return { letter, marks };
};

interface Nucleus {
  /** The units it is written with: one vowel, or a diphthong's two. */
  readonly at: readonly number[];
  readonly letters: string;
  /** Whether a letter follows it in the word. */
  readonly followed: boolean;
}

/** The form's nuclei, in order, and how many stand before its last `limit` (undefined: none). */
const nucleiOf = (units: readonly Unit[], p: CompiledProsody): { readonly nuclei: readonly Nucleus[]; readonly beforeLimit: number | undefined } => {
  const found: { at: number[]; letters: string }[] = [];
  let open: { letter: string; nucleus: number } | undefined;
  let beforeLimit: number | undefined;
  units.forEach((u, i) => {
    if (u.kind !== "letter") {
      open = undefined;
      return;
    }
    const { letter, marks } = decomposed(u);
    if (!p.vowels.has(letter)) {
      open = undefined;
      if (p.limit !== undefined && u.base === p.limit) beforeLimit = found.length;
      return;
    }
    if (open !== undefined && p.diphthongs.has(open.letter + letter) && !marks.some((m) => p.apart.has(m))) {
      const n = found[open.nucleus] as { at: number[]; letters: string };
      n.at.push(i);
      n.letters += letter;
      open = undefined;
      return;
    }
    found.push({ at: [i], letters: letter });
    open = { letter, nucleus: found.length - 1 };
  });
  const lastLetter = units.findLastIndex((u) => u.kind === "letter");
  return { nuclei: found.map((n) => ({ ...n, followed: (n.at.at(-1) as number) < lastLetter })), beforeLimit };
};

/** Whether a nucleus is long, its marks as they stand (a circumflex is a long vowel's). */
const isLong = (units: readonly Unit[], n: Nucleus, last: boolean, p: CompiledProsody): boolean => {
  if (n.at.length === 2) return !(last && !n.followed && p.shortAtEnd.has(n.letters));
  const { letter, marks } = decomposed(units[n.at[0] as number] as Unit & { readonly kind: "letter" });
  return p.long.has(letter) || marks.some((m) => p.lengthen.has(m) || m === p.circumflex);
};

/** Which accent a nucleus carries, if any. */
const accentOf = (units: readonly Unit[], n: Nucleus, p: CompiledProsody): "acute" | "circumflex" | undefined => {
  for (const k of n.at) {
    const { marks } = decomposed(units[k] as Unit & { readonly kind: "letter" });
    if (marks.includes(p.circumflex)) return "circumflex";
    if (marks.includes(p.acute)) return "acute";
  }
  return undefined;
};

/** A letter unit with its accents removed and `accent` (a mark) added, as one NFC unit. */
const withAccent = (u: Unit & { readonly kind: "letter" }, p: CompiledProsody, accent: string | undefined): Unit => {
  const { letter, marks } = decomposed(u);
  const kept = marks.filter((m) => m !== p.acute && m !== p.circumflex);
  return unitsOf(`${letter}${kept.join("")}${accent ?? ""}`)[0] as Unit;
};

const same = (a: readonly Unit[], b: readonly Unit[]): boolean =>
  a.length === b.length && a.every((u, i) => {
    const v = b[i] as Unit;
    return u.kind === v.kind && (u.kind === "boundary" || (v.kind === "letter" && u.base === v.base && u.marks.join("") === v.marks.join("")));
  });

/** A form with its accent placed by `mode`; whether that changed it. */
export const accentuate = (units: readonly Unit[], mode: AccentMode, p: CompiledProsody): { readonly units: readonly Unit[]; readonly changed: boolean } => {
  const { nuclei, beforeLimit } = nucleiOf(units, p);
  const n = nuclei.length;
  if (n === 0) return { units, changed: false };
  const long = nuclei.map((x, i) => isLong(units, x, i === n - 1, p));
  const ultimaLong = long[n - 1] as boolean;
  let k: number;
  let type: "acute" | "circumflex";
  if (mode === "recessive") {
    const earliest = beforeLimit === undefined ? 0 : Math.max(0, beforeLimit - 1);
    const back = n === 1 ? 0 : ultimaLong ? n - 2 : Math.max(0, n - 3);
    k = Math.min(Math.max(back, earliest), n - 1);
    type = (k === n - 2 && long[k] === true && !ultimaLong) || (k === n - 1 && long[k] === true) ? "circumflex" : "acute";
  } else if (mode === "oxytone") {
    if (nuclei.some((x) => accentOf(units, x, p) !== undefined)) return { units, changed: false };
    k = n - 1;
    type = "acute";
  } else if (mode === "ultima") {
    k = n - 1;
    type = ultimaLong ? "circumflex" : "acute";
  } else {
    const accented = nuclei.map((x) => accentOf(units, x, p));
    k = accented.findLastIndex((a) => a !== undefined);
    if (k < 0) return { units, changed: false };
    const given = accented[k] as "acute" | "circumflex";
    k = Math.max(k, ultimaLong ? n - 2 : n - 3, 0);
    type = k === n - 1 ? given : k === n - 2 && long[k] === true && !ultimaLong ? "circumflex" : "acute";
  }
  const out = [...units];
  for (const x of nuclei) for (const i of x.at) out[i] = withAccent(out[i] as Unit & { readonly kind: "letter" }, p, undefined);
  const target = (nuclei[k] as Nucleus).at.at(-1) as number;
  out[target] = withAccent(out[target] as Unit & { readonly kind: "letter" }, p, type === "acute" ? p.acute : p.circumflex);
  return { units: out, changed: !same(units, out) };
};
