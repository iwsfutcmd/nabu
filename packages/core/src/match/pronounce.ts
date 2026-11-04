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
