/**
 * A word's pronunciation as its writing system leaves it out (ADR 0054), graded:
 * - **vowel marks** (`gradeVowels`): an abjad word with the marks the learner wrote in, against
 *   its vocalized form. The letters must stay as they are; each letter's marks must be the
 *   expected ones, except the profile's optional marks (sukun), which may be written or not.
 * - **a reading** (`gradeReading`): an ideographic word's romanization (Jyutping), syllable by
 *   syllable, spaces optional and case ignored.
 *
 * Both are all or nothing: a word's pronunciation is right or it is not. `off` lists what was
 * wrong (letters by grapheme index, or syllables), for feedback.
 */
import { graphemes } from "../text/graphemes.ts";

/** An orthography's vowel marks (a profile's `match.marks`): one code point each, NFD. */
export interface VowelMarks {
  readonly set: ReadonlySet<string>;
  /** Marks a learner may write or leave out (sukun). */
  readonly optional: ReadonlySet<string>;
}

export interface PronunciationGrade {
  readonly verdict: "CORRECT" | "WRONG";
  /** Feedback note ids (MF2 feedback.note.<id>). */
  readonly notes: readonly string[];
  /** The letters (grapheme indexes of the expected form) or syllables that were wrong. */
  readonly off: readonly number[];
}

const RIGHT: PronunciationGrade = { verdict: "CORRECT", notes: [], off: [] };
const wrong = (note: string, off: readonly number[] = []): PronunciationGrade => ({ verdict: "WRONG", notes: [note], off });

/** A grapheme's marks, minus the optional ones, in canonical order. */
const marksOf = (grapheme: string, set: ReadonlySet<string>, optional: ReadonlySet<string>): string =>
  Array.from(grapheme.normalize("NFD"))
    .filter((c) => set.has(c) && !optional.has(c))
    .join("");

/** A text without its vowel marks. */
export const withoutMarks = (marks: VowelMarks, text: string): string =>
  Array.from(text.normalize("NFD"))
    .filter((c) => !marks.set.has(c))
    .join("")
    .normalize("NFC");

/** Whether a word has vowel marks for a learner to supply (sukun alone does not count). */
export const hasVowelMarks = (marks: VowelMarks, vocalized: string): boolean =>
  graphemes(vocalized.normalize("NFC")).some((g) => marksOf(g, marks.set, marks.optional) !== "");

/** An abjad word with the learner's vowel marks against its vocalized form. */
export const gradeVowels = (marks: VowelMarks | undefined, expected: string, answer: string): PronunciationGrade => {
  if (marks === undefined) throw new Error("the orthography has no vowel marks");
  const want = graphemes(expected.normalize("NFC"));
  const got = graphemes(answer.normalize("NFC").trim());
  const strip = (g: string): string => withoutMarks(marks, g);
  const letters = (gs: readonly string[]): string => gs.map(strip).join("");
  // A letter added, dropped or changed, or a mark with no letter: not the same word.
  if (got.length !== want.length || letters(got) !== letters(want) || got.some((g) => strip(g) === "")) return wrong("vocalize-letters");
  const off = want.flatMap((g, i) => (marksOf(g, marks.set, marks.optional) === marksOf(got[i] ?? "", marks.set, marks.optional) ? [] : [i]));
  return off.length === 0 ? RIGHT : wrong("vocalize-marks", off);
};

/** Where a letter stands in its word: what marks it may take depends on it (no shadda word-initially). */
export type LetterPosition = "initial" | "medial" | "final";

const positionOf = (index: number, length: number): LetterPosition => (index === 0 ? "initial" : index === length - 1 ? "final" : "medial");

const baseOf = (marks: VowelMarks, grapheme: string): string =>
  Array.from(grapheme.normalize("NFD"))
    .filter((c) => !marks.set.has(c))
    .join("");

/**
 * The marks each letter takes in a body of vocalized words, by where it stands, most frequent first
 * (a letter written bare is ""): what other vocalizations of a word may plausibly use (ADR 0098).
 * Learned from the course, so no shadda word-initially, no dagesh in alef, no vowel on a long vowel's
 * seat, in any abjad, with no list of rules. A one-off (fewer than ATTESTED_MIN, or under
 * ATTESTED_SHARE of the letter's occurrences there) is not plausible enough.
 */
const ATTESTED_MIN = 2;
const ATTESTED_SHARE = 0.05;

export const attestedMarks = (marks: VowelMarks, words: Iterable<string>): ((base: string, position: LetterPosition) => readonly string[]) => {
  const counts = new Map<string, Map<string, number>>();
  for (const word of words) {
    const gs = graphemes(word.normalize("NFC"));
    for (const [i, g] of gs.entries()) {
      const base = baseOf(marks, g);
      if (base === "") continue;
      const key = `${positionOf(i, gs.length)}|${base}`;
      const seen = counts.get(key) ?? new Map<string, number>();
      const m = marksOf(g, marks.set, marks.optional);
      seen.set(m, (seen.get(m) ?? 0) + 1);
      counts.set(key, seen);
    }
  }
  const ordered = new Map(
    [...counts].map(([key, seen]) => {
      const total = [...seen.values()].reduce((a, b) => a + b, 0);
      const plausible = [...seen].filter(([, n]) => n >= ATTESTED_MIN && n / total >= ATTESTED_SHARE);
      return [key, plausible.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([m]) => m)];
    }),
  );
  return (base, position) => ordered.get(`${position}|${base}`) ?? [];
};

/**
 * Other vocalizations of a word's letters, for a multiple-choice vocalize card (ADR 0098): each gives
 * one letter (then two letters) other marks that letter takes in that place elsewhere (`attested`),
 * the word's marked letters first. Every one differs from the word in marks a learner must get right
 * (optional marks aside), so none is also correct. In a stable order: the caller picks.
 */
export const vocalizationVariants = (marks: VowelMarks, vocalized: string, attested: (base: string, position: LetterPosition) => readonly string[]): readonly string[] => {
  const word = vocalized.normalize("NFC");
  const gs = graphemes(word);
  const own = gs.map((g) => marksOf(g, marks.set, marks.optional));
  const others = gs.map((g, i) => attested(baseOf(marks, g), positionOf(i, gs.length)).filter((m) => m !== own[i]));
  const seen = new Set<string>([word]);
  const out: string[] = [];
  const add = (variant: readonly string[]): void => {
    const text = variant.join("").normalize("NFC");
    // A vocalization still: the bare word is the prompt itself, never an option.
    if (seen.has(text) || !hasVowelMarks(marks, text) || gradeVowels(marks, word, text).verdict !== "WRONG") return;
    seen.add(text);
    out.push(text);
  };
  const remarked = (i: number, mark: string): string => `${baseOf(marks, gs[i] as string)}${mark}`.normalize("NFC");
  // Marked letters first: a vowel swapped for another is what a learner confuses.
  const order = [...gs.keys()].sort((a, b) => Number(own[b] !== "") - Number(own[a] !== "") || a - b);
  for (const i of order) for (const m of others[i] ?? []) add(gs.map((g, k) => (k === i ? remarked(i, m) : g)));
  const marked = order.filter((i) => own[i] !== "");
  for (const [x, i] of marked.entries())
    for (const j of marked.slice(x + 1))
      for (const m of others[i] ?? []) for (const n of others[j] ?? []) add(gs.map((g, k) => (k === i ? remarked(i, m) : k === j ? remarked(j, n) : g)));
  return out;
};

/** Syllable shapes of the romanizations that can be typed (Jyutping: letters, then a tone 1–6). */
const SYLLABLE: Readonly<Record<string, { readonly syllable: RegExp; readonly locale: string }>> = {
  jyutping: { syllable: /[a-z]+[1-6]/gu, locale: "yue-Latn-HK" },
};

/** Whether a word's reading in this scheme can be asked for as typed text. */
export const transcribable = (scheme: string): boolean => SYLLABLE[scheme] !== undefined;

const syllablesOf = (scheme: string, text: string): readonly string[] | undefined => {
  const shape = SYLLABLE[scheme];
  if (shape === undefined) throw new Error(`no syllable shape for ${scheme}`);
  const squeezed = text.normalize("NFC").toLocaleLowerCase(shape.locale).replace(/[\s'’.-]/gu, "");
  const found = squeezed.match(shape.syllable) ?? [];
  return found.join("") === squeezed && found.length > 0 ? found : undefined;
};

const toneless = (syllable: string): string => syllable.replace(/[0-9]/gu, "");

/**
 * Other readings a word could be mistaken for, for a multiple-choice reading card (ADR 0098): one
 * syllable in another tone, among the syllables the course's readings use (`attested`). Tones are
 * what a learner most often gets wrong. In a stable order: the caller picks.
 */
export const toneVariants = (scheme: string, reading: string, attested: ReadonlySet<string>): readonly string[] => {
  const syllables = transcribable(scheme) ? syllablesOf(scheme, reading) : undefined;
  if (syllables === undefined) return [];
  const byBase = new Map<string, string[]>();
  for (const a of [...attested].sort()) byBase.set(toneless(a), [...(byBase.get(toneless(a)) ?? []), a]);
  const out: string[] = [];
  for (const [i, syllable] of syllables.entries()) {
    for (const other of byBase.get(toneless(syllable)) ?? []) {
      if (other === syllable) continue;
      const variant = syllables.map((x, k) => (k === i ? other : x)).join(" ");
      if (!out.includes(variant)) out.push(variant);
    }
  }
  return out;
};

/** An ideographic word's romanized reading, typed, against the pinned one. */
export const gradeReading = (scheme: string, expected: string, answer: string): PronunciationGrade => {
  const want = syllablesOf(scheme, expected);
  if (want === undefined) throw new Error(`${expected} is not ${scheme}`);
  const got = syllablesOf(scheme, answer);
  // Letters with no tone numbers, or something that is not syllables at all.
  if (got === undefined) return /[0-9]/u.test(answer) ? wrong("reading-syllables") : wrong("reading-no-tones");
  if (got.length !== want.length) return wrong("reading-syllables");
  const off = want.flatMap((s, i) => (s === got[i] ? [] : [i]));
  if (off.length === 0) return RIGHT;
  // The same sounds, other tones.
  return off.every((i) => toneless(want[i] as string) === toneless(got[i] as string)) ? wrong("reading-tone", off) : wrong("reading-syllables", off);
};
