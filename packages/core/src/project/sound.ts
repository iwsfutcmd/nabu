/**
 * The writing side of a profile's statement (ADR 0148; docs/migration-design.md, "Stages 5 and 6"):
 * what a spelling says, read forwards off its letters by the profile's correspondences, so two
 * spellings can be compared by sound and a word's other spellings of its sound listed.
 *
 * A word is one grading unit, already through the profile's normalization. It is prepared once:
 * NFC, case folded as the profile folds (where `match.case` is not none), the marks of
 * `sound.ignores` removed, and, where `stress` is stated, the stress mark noted on its letter and
 * removed. Then it is read left to right: at each place, among every correspondence's non-empty
 * written forms that match there with their `when` holding, the longest wins, the earlier
 * correspondence on a tie; where none matches, the letter is itself and says itself.
 */
import type { OrthographyProfile } from "@nabu/schema";
import { err, ok, type Result } from "../result.ts";
import { graphemes } from "../text/graphemes.ts";
import { parseExemplarSet } from "../text/unicode-set.ts";
import { compileRules, holds, spellingUnits, startsWith, type Rule } from "./rules.ts";

/** One place of a spelling as read: what it says, how it is written there, and by which correspondence. */
export interface SoundSite {
  readonly says: string;
  readonly written: string;
  /** The correspondence's id (its `says`, or `~` and its first written form); absent for a letter as itself. */
  readonly rule?: string;
  readonly kind?: "fixed" | "free";
  readonly note?: string;
}

export interface SoundReading {
  readonly sites: readonly SoundSite[];
  /** Its syllables, where the profile states stress. */
  readonly syllables?: number;
  /** The stressed syllable (from 0), where the profile states stress and the word has one. */
  readonly stressed?: number;
}

/** Where two spellings of one sound differ. */
export interface SoundPlace {
  readonly expected: string;
  readonly typed: string;
  /** The correspondence that decides the place (`stress` for the stress mark). */
  readonly rule?: string;
  readonly kind: "fixed" | "free";
  readonly note?: string;
}

export interface SoundComparison {
  /** Both say the same: the same sounds in order, and the same stress. */
  readonly same: boolean;
  /**
   * The same sounds in order, whatever the stress: true with `same` false where only the stress is
   * another (ke for qué, tambien for también), so a letter place can still be named beside it.
   */
  readonly sounds: boolean;
  /** The same, and every place apart is a free correspondence: an accepted variant. */
  readonly free: boolean;
  /**
   * Where the spellings differ, when they have the same sounds (empty otherwise). Where the stress
   * is another, the letter places only: the stress is then no place of the spelling but the miss.
   */
  readonly differs: readonly SoundPlace[];
}

export interface SpellingProjection {
  readonly from: "spelling";
  readonly read: (word: string) => SoundReading;
  readonly compare: (expected: string, typed: string) => SoundComparison;
  readonly spellings: (word: string) => readonly string[];
}

/** A profile whose sound is a token's pinned reading: grading compares readings, not spellings. */
export interface ReadingSoundProjection {
  readonly from: "reading";
  readonly scheme: string;
}

export type Projection = SpellingProjection | ReadingSoundProjection;

/** A unit of the prepared word: its key (as read) and what preparing took from it. */
interface Unit {
  readonly text: string;
  readonly key: string;
  readonly marked: boolean;
  /** The marks removed (ignored ones and the stress mark), NFD, to put back on a traded letter. */
  readonly removed: string;
  readonly capital: boolean;
}

interface Site extends SoundSite {
  readonly from: number;
  readonly to: number;
  readonly marked: boolean;
}

interface Read {
  readonly units: readonly Unit[];
  readonly sites: readonly Site[];
  readonly syllables: number | undefined;
  readonly stressed: number | undefined;
  /** For each site, its syllable (vowel sites only). */
  readonly nucleusOf: ReadonlyMap<number, number>;
}

const CACHE_LIMIT = 4096;
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

const STRESS = "stress";

/**
 * The writing side of a profile, or undefined where it states no `sound` (the sound question is
 * never asked). An error names a statement that cannot be read.
 */
export const compileProjection = (profile: OrthographyProfile, fold: (text: string) => string, locale: string | undefined): Result<Projection | undefined, readonly string[]> => {
  const sound = profile.sound;
  if (sound === undefined) return ok(undefined);
  if (sound.from === "reading") return ok({ from: "reading", scheme: sound.scheme });
  const errors: string[] = [];
  let ignores: ReadonlySet<string> = new Set();
  try {
    ignores = new Set(sound.ignores === undefined ? [] : parseExemplarSet(sound.ignores).flatMap((m) => Array.from(m.normalize("NFD"))));
  } catch (e) {
    errors.push(`sound.ignores: ${(e as Error).message}`);
  }
  const stress = profile.stress;
  const mark = stress?.mark.normalize("NFD");
  const vowels = new Set(stress?.vowels ?? []);
  const weak = new Set(stress?.weak ?? []);
  const defaults: { readonly ends?: ReadonlySet<string>; readonly on: "last" | "penult" }[] = [];
  for (const d of stress?.default ?? []) {
    try {
      defaults.push({ on: d.on, ...(d.when !== undefined && { ends: new Set(parseExemplarSet(d.when.ends).map((s) => fold(s))) }) });
    } catch (e) {
      errors.push(`stress.default: ${(e as Error).message}`);
    }
  }
  const compiled = compileRules(profile.correspondences ?? [], { says: (s) => s, units: spellingUnits, written: (s) => fold(s).normalize("NFC") });
  if (!compiled.ok) errors.push(...compiled.error);
  if (errors.length > 0 || !compiled.ok) return err(errors);
  const rules: readonly Rule[] = compiled.value;
  const fixedBySays = new Map<string, Rule[]>();
  for (const r of rules) if (r.kind === "fixed") fixedBySays.set(r.says, [...(fixedBySays.get(r.says) ?? []), r]);

  const prepare = (word: string): Unit[] => {
    const out: Unit[] = [];
    for (const text of spellingUnits(word)) {
      const folded = fold(text).normalize("NFC");
      let marked = false;
      let removed = "";
      let kept = "";
      for (const c of folded.normalize("NFD")) {
        if (c === mark) {
          marked = true;
          removed += c;
        } else if (ignores.has(c)) removed += c;
        else kept += c;
      }
      const key = kept.normalize("NFC");
      const previous = out.at(-1);
      // A mark standing alone (nothing left of its letter) is no letter: it stays with the one before.
      if (key === "" && previous !== undefined) out[out.length - 1] = { ...previous, text: `${previous.text}${text}`, removed: `${previous.removed}${removed}`, marked: previous.marked || marked };
      else if (key !== "") out.push({ text, key, marked, removed, capital: folded !== text.normalize("NFC") });
    }
    return out;
  };

  const readUnits = (units: readonly Unit[]): Read => {
    const keys = units.map((u) => u.key);
    const sites: Site[] = [];
    let i = 0;
    while (i < keys.length) {
      let best: { rule: Rule; written: string; length: number } | undefined;
      for (const rule of rules) {
        for (const w of rule.written) {
          if (w.units.length === 0 || (best !== undefined && w.units.length <= best.length)) continue;
          if (startsWith(keys, i, w.units) && holds(rule, keys, i, i + w.units.length)) best = { rule, written: w.text, length: w.units.length };
        }
      }
      const to = best === undefined ? i + 1 : i + best.length;
      const marked = units.slice(i, to).some((u) => u.marked);
      if (best === undefined) sites.push({ says: keys[i] as string, written: keys[i] as string, from: i, to, marked });
      else sites.push({ says: best.rule.says, written: best.written, rule: best.rule.id, kind: best.rule.kind, ...(best.rule.note !== undefined && { note: best.rule.note }), from: i, to, marked });
      i = to;
    }
    if (stress === undefined) return { units, sites, syllables: undefined, stressed: undefined, nucleusOf: new Map() };
    // Syllables: adjacent vowels (only silent letters between) share one where one of them is weak and unmarked.
    const nucleusOf = new Map<number, number>();
    let nuclei = 0;
    let strongIn = false;
    let previous: number | undefined;
    sites.forEach((site, k) => {
      if (!vowels.has(site.says)) return;
      const strong = !weak.has(site.says) || site.marked;
      const adjacent = previous !== undefined && sites.slice(previous + 1, k).every((s) => s.says === "");
      if (adjacent && (!strong || !strongIn)) {
        strongIn ||= strong;
      } else {
        nuclei += 1;
        strongIn = strong;
      }
      nucleusOf.set(k, nuclei - 1);
      previous = k;
    });
    let stressed: number | undefined;
    for (const [k, n] of nucleusOf) {
      if ((sites[k] as Site).marked) {
        stressed = n;
        break;
      }
    }
    if (stressed === undefined && nuclei >= 2) {
      const last = keys.at(-1);
      const rule = defaults.find((d) => d.ends === undefined || (last !== undefined && d.ends.has(last)));
      if (rule !== undefined) stressed = rule.on === "last" ? nuclei - 1 : nuclei - 2;
    }
    return { units, sites, syllables: nuclei, stressed, nucleusOf };
  };

  const readWord = memo((word: string): Read => readUnits(prepare(word)));

  const publicSite = ({ says, written, rule, kind, note }: Site): SoundSite => ({ says, written, ...(rule !== undefined && { rule }), ...(kind !== undefined && { kind }), ...(note !== undefined && { note }) });

  const read = (word: string): SoundReading => {
    const r = readWord(word);
    return { sites: r.sites.map(publicSite), ...(r.syllables !== undefined && { syllables: r.syllables }), ...(r.stressed !== undefined && { stressed: r.stressed }) };
  };

  const NOT_SAME: SoundComparison = { same: false, sounds: false, free: false, differs: [] };

  const compare = (expected: string, typed: string): SoundComparison => {
    const e = readWord(expected);
    const t = readWord(typed);
    const eSaid = e.sites.filter((s) => s.says !== "");
    const tSaid = t.sites.filter((s) => s.says !== "");
    if (eSaid.length !== tSaid.length || eSaid.some((s, k) => s.says !== (tSaid[k] as Site).says)) return NOT_SAME;
    const same = e.stressed === t.stressed;
    // Pair the sites: each said site with its twin, the silent ones between in order (one side only: with nothing).
    const pairs: [Site | undefined, Site | undefined][] = [];
    let a = 0;
    let b = 0;
    while (a < e.sites.length || b < t.sites.length) {
      const silentE: Site[] = [];
      const silentT: Site[] = [];
      while (a < e.sites.length && (e.sites[a] as Site).says === "") silentE.push(e.sites[a++] as Site);
      while (b < t.sites.length && (t.sites[b] as Site).says === "") silentT.push(t.sites[b++] as Site);
      for (let k = 0; k < Math.max(silentE.length, silentT.length); k++) pairs.push([silentE[k], silentT[k]]);
      if (a < e.sites.length && b < t.sites.length) pairs.push([e.sites[a++], t.sites[b++]]);
    }
    const differs: SoundPlace[] = [];
    for (const [x, y] of pairs) {
      const xw = x?.written ?? "";
      const yw = y?.written ?? "";
      if (xw !== yw) {
        const rule = x?.rule ?? y?.rule;
        const note = x?.note ?? y?.note;
        const kind = x?.kind === "free" && y?.kind === "free" ? "free" : "fixed";
        differs.push({ expected: xw, typed: yw, ...(rule !== undefined && { rule }), kind, ...(note !== undefined && { note }) });
      }
      if (same && stress !== undefined && (x?.marked ?? false) !== (y?.marked ?? false)) {
        const withMark = (s: Site | undefined): string => (s === undefined ? "" : s.marked ? `${s.written}${mark ?? ""}`.normalize("NFC") : s.written);
        differs.push({ expected: withMark(x), typed: withMark(y), rule: STRESS, kind: "fixed", ...(stress.note !== undefined && { note: stress.note }) });
      }
    }
    return { same, sounds: true, free: same && differs.length > 0 && differs.every((d) => d.kind === "free"), differs };
  };

  const upper = (text: string): string => {
    const [first, ...rest] = graphemes(text);
    return first === undefined ? text : `${locale === undefined ? first : first.toLocaleUpperCase(locale)}${rest.join("")}`;
  };

  const spellings = memo((word: string): readonly string[] => {
    const original = word.normalize("NFC");
    const r = readWord(original);
    const out: string[] = [];
    const seen = new Set<string>([original]);
    const traded = (site: Site, replacement: string): string => {
      const before = r.units.slice(0, site.from).map((u) => u.text);
      const after = r.units.slice(site.to).map((u) => u.text);
      const own = r.units.slice(site.from, site.to);
      const capital = own[0]?.capital === true;
      // A capital letter dropped (Hola without its h) leaves its capital to the next letter.
      if (replacement === "" && capital && after[0] !== undefined) after[0] = upper(after[0]);
      const marks = own.map((u) => u.removed).join("");
      const text = replacement === "" ? "" : `${capital ? upper(replacement) : replacement}${marks}`;
      return [...before, text, ...after].join("").normalize("NFC");
    };
    const consider = (candidate: string): void => {
      if (seen.has(candidate)) return;
      seen.add(candidate);
      const c = compare(original, candidate);
      if (c.same && !c.free) out.push(candidate);
    };
    for (const site of r.sites) {
      if (site.says === "") consider(traded(site, ""));
      for (const rule of fixedBySays.get(site.says) ?? []) {
        // A rare way of writing the sound (k for c) is never offered in place of a usual one.
        for (const w of rule.written) if (w.text !== "" && w.text !== site.written && w.rare !== true) consider(traded(site, w.text));
      }
    }
    return out;
  });

  return ok({ from: "spelling", read, compare, spellings });
};
