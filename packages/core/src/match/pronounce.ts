/**
 * A word's pronunciation as its writing system leaves it out (ADR 0054), graded:
 * - **vowel marks** (`gradeVowels`): an abjad word with the marks the learner wrote in, against
 *   its vocalized form. The letters must stay as they are; each letter's marks must be the
 *   expected ones, except the profile's optional marks (sukun), which may be written or not.
 * - **a reading** (`gradeReading`): an ideographic word's romanization (Jyutping), syllable by
 *   syllable, spaces optional and case ignored, in a scheme whose data gives a syllable's shape
 *   (profiles/schemes, ADR 0109).
 *
 * Both are all or nothing: a word's pronunciation is right or it is not. `off` lists what was
 * wrong (letters by grapheme index, or syllables), for feedback.
 */
import { readingScheme } from "../profile/schemes.ts";
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

/** A scheme's typed shape (its data, ADR 0109): one syllable, what may stand between, its tone marks. */
interface Shape {
  readonly syllable: RegExp;
  readonly between: RegExp;
  readonly locale: string;
  /** A character class of what marks a tone in a syllable, where the scheme has tones. */
  readonly marks: string | undefined;
  /** `marks`, compiled once: every tone mark of a syllable. */
  readonly marksAll: RegExp | undefined;
}

const shapes = new Map<string, Shape | undefined>();
const shapeOf = (scheme: string): Shape | undefined => {
  if (!shapes.has(scheme)) {
    const data = readingScheme(scheme);
    const typed = data?.typed;
    const marks = data?.tones?.marks;
    shapes.set(
      scheme,
      typed === undefined
        ? undefined
        : { syllable: new RegExp(typed.syllable, "gu"), between: new RegExp(typed.between, "gu"), locale: typed.locale, marks, marksAll: marks === undefined ? undefined : new RegExp(marks, "gu") },
    );
  }
  return shapes.get(scheme);
};

/** Whether a word's reading in this scheme can be asked for as typed text: the scheme gives a syllable's shape. */
export const transcribable = (scheme: string): boolean => shapeOf(scheme) !== undefined;

/**
 * Whether a reading in this scheme is typed as text of its answer orthography and graded by that
 * profile (ADR 0131: Schluessel's transliteration), rather than syllable by syllable.
 */
export const typedByProfile = (scheme: string): boolean => {
  const data = readingScheme(scheme);
  return data?.typedByProfile === true && data.answer !== undefined && shapeOf(scheme) === undefined;
};

/** A typed reading's syllables: lowercased, what may stand between them dropped, end to end; undefined where it is not syllables. */
const syllablesOf = (scheme: string, text: string): readonly string[] | undefined => {
  const shape = shapeOf(scheme);
  if (shape === undefined) throw new Error(`no syllable shape for ${scheme}`);
  const squeezed = text.normalize("NFC").toLocaleLowerCase(shape.locale).replace(shape.between, "");
  const found = squeezed.match(shape.syllable) ?? [];
  return found.join("") === squeezed && found.length > 0 ? found : undefined;
};

/** The syllables of a reading as typed in a scheme, as grading reads them (conformance: reading-syllables). */
export const readingSyllables = (scheme: string, text: string): readonly string[] | undefined => syllablesOf(scheme, text);

/** A syllable without its tone marks: the sounds its tone variants share. */
const toneless = (shape: Shape, syllable: string): string => (shape.marksAll === undefined ? syllable : syllable.replace(shape.marksAll, ""));

/** The attested syllables by what they are without their tone, per set of syllables (a course's, in a scheme). */
const tonelessIndex = new WeakMap<ReadonlySet<string>, Map<string, ReadonlyMap<string, readonly string[]>>>();
const byToneless = (scheme: string, shape: Shape, attested: ReadonlySet<string>): ReadonlyMap<string, readonly string[]> => {
  const byScheme = tonelessIndex.get(attested) ?? new Map<string, ReadonlyMap<string, readonly string[]>>();
  tonelessIndex.set(attested, byScheme);
  let index = byScheme.get(scheme);
  if (index === undefined) {
    const out = new Map<string, string[]>();
    for (const a of [...attested].sort()) {
      const base = toneless(shape, a.toLocaleLowerCase(shape.locale));
      out.set(base, [...(out.get(base) ?? []), a]);
    }
    index = out;
    byScheme.set(scheme, index);
  }
  return index;
};

/**
 * Other readings a word could be mistaken for, for a multiple-choice reading card (ADR 0098): one
 * syllable in another tone, among the syllables the course's readings use (`attested`). Tones are
 * what a learner most often gets wrong. In a stable order: the caller picks.
 */
export const toneVariants = (scheme: string, reading: string, attested: ReadonlySet<string>): readonly string[] => {
  const shape = shapeOf(scheme);
  const syllables = shape === undefined ? undefined : syllablesOf(scheme, reading);
  if (shape === undefined || syllables === undefined) return [];
  const byBase = new Map<string, string[]>();
  for (const a of [...attested].sort()) byBase.set(toneless(shape, a), [...(byBase.get(toneless(shape, a)) ?? []), a]);
  const out: string[] = [];
  for (const [i, syllable] of syllables.entries()) {
    for (const other of byBase.get(toneless(shape, syllable)) ?? []) {
      if (other === syllable) continue;
      const variant = syllables.map((x, k) => (k === i ? other : x)).join(" ");
      if (!out.includes(variant)) out.push(variant);
    }
  }
  return out;
};

/**
 * A reading with one letter traded for another that the script writes alike (the scheme's `variants`,
 * ADR 0131): Schluessel's bardi as bärdi, bārdi, barde, bardī; each once, in the reading's order. A
 * capital is traded for the other letter's capital, in the scheme's language. None for a scheme
 * without variants.
 */
export const letterVariants = (scheme: string, reading: string): readonly string[] => {
  const data = readingScheme(scheme);
  if (data?.variants === undefined) return [];
  const locale = data.lang ?? data.language;
  const setOf = new Map<string, readonly string[]>();
  for (const set of data.variants) {
    const letters = set.map((l) => l.normalize("NFC"));
    for (const l of letters) setOf.set(l, [...new Set([...(setOf.get(l) ?? []), ...letters])]);
  }
  const letters = graphemes(reading.normalize("NFC"), locale);
  const out: string[] = [];
  letters.forEach((g, i) => {
    const lower = g.toLocaleLowerCase(locale);
    const capital = lower !== g;
    for (const other of setOf.get(lower) ?? []) {
      if (other === lower) continue;
      const variant = letters.map((x, k) => (k !== i ? x : capital ? other.toLocaleUpperCase(locale) : other)).join("");
      if (!out.includes(variant)) out.push(variant);
    }
  });
  return out;
};

/**
 * The places of a reading the script leaves open in two or more ways (ADR 0139), each with the
 * reading changed there in every way the scheme's data allows: a letter traded for each other
 * letter of its `variants` set (üzüm: özüm, uzüm, ozüm, ūzüm), or one syllable in each other tone
 * the course's readings use (`attested`: ngo5: ngo1, ngo4). A capital is traded for a capital. In
 * a stable order, places first to last: the caller picks.
 */
export const readingFeatures = (scheme: string, reading: string, attested: ReadonlySet<string>): readonly (readonly string[])[] => {
  const out: string[][] = [];
  const data = readingScheme(scheme);
  if (data?.variants !== undefined) {
    const locale = data.lang ?? data.language;
    const setOf = new Map<string, readonly string[]>();
    for (const set of data.variants) {
      const letters = set.map((l) => l.normalize("NFC"));
      for (const l of letters) setOf.set(l, [...new Set([...(setOf.get(l) ?? []), ...letters])]);
    }
    const letters = graphemes(reading.normalize("NFC"), locale);
    letters.forEach((g, i) => {
      const lower = g.toLocaleLowerCase(locale);
      const capital = lower !== g;
      const others = (setOf.get(lower) ?? []).filter((o) => o !== lower);
      if (others.length > 0) out.push(others.map((o) => letters.map((x, k) => (k !== i ? x : capital ? o.toLocaleUpperCase(locale) : o)).join("")));
    });
  }
  const shape = shapeOf(scheme);
  const syllables = shape === undefined ? undefined : syllablesOf(scheme, reading);
  if (shape !== undefined && shape.marks !== undefined && syllables !== undefined) {
    const own = reading.normalize("NFC").split(" ");
    const parts = own.length === syllables.length ? own : syllables;
    const index = byToneless(scheme, shape, attested);
    for (const [i, syllable] of parts.entries()) {
      const others = (index.get(toneless(shape, syllable.toLocaleLowerCase(shape.locale))) ?? []).filter((a) => a !== syllable);
      if (others.length > 0) out.push(others.map((o) => parts.map((x, k) => (k === i ? o : x)).join(" ")));
    }
  }
  return out;
};

/** Where a reading's letters the script leaves open are left out: a run of others stands as one dot. */
const CLOSED = "\u00B7";

/**
 * Whether a scheme's data says which of its letters the script leaves open (ADR 0141): letters it
 * writes alike (`variants`) or tone marks (`tones`).
 */
export const hasOpenLetters = (scheme: string): boolean => {
  const data = readingScheme(scheme);
  return data?.variants !== undefined || data?.tones?.marks !== undefined;
};

/**
 * A reading as minimal ruby (ADR 0141): only what the script leaves open (its `variants` letters,
 * its tone marks), each run of other letters a middle dot (üzüm is ü·ü·, ngo5 is ·5, shàn is ·à·).
 * Empty where nothing in it is open. Spaces between syllables are kept.
 */
export const openLetters = (scheme: string, reading: string): string => {
  const data = readingScheme(scheme);
  const locale = data?.lang ?? data?.language;
  const open = new Set((data?.variants ?? []).flat().map((l) => l.normalize("NFC")));
  const tone = data?.tones?.marks === undefined ? undefined : new RegExp(`^(?:${data.tones.marks})+$`, "u");
  let out = "";
  let kept = false;
  for (const g of graphemes(reading.normalize("NFC"), locale)) {
    if (/^\s+$/u.test(g)) out += g;
    else if (open.has(g.toLocaleLowerCase(locale)) || tone?.test(g) === true) {
      out += g;
      kept = true;
    } else if (!out.endsWith(CLOSED)) out += CLOSED;
  }
  return kept ? out : "";
};

/** An ideographic word's romanized reading, typed, against the pinned one. */
export const gradeReading = (scheme: string, expected: string, answer: string): PronunciationGrade => {
  const want = syllablesOf(scheme, expected);
  if (want === undefined) throw new Error(`${expected} is not ${scheme}`);
  const shape = shapeOf(scheme) as Shape;
  const got = syllablesOf(scheme, answer);
  // Letters with no tone marks, or something that is not syllables at all.
  if (got === undefined) return shape.marks === undefined || new RegExp(shape.marks, "u").test(answer) ? wrong("reading-syllables") : wrong("reading-no-tones");
  if (got.length !== want.length) return wrong("reading-syllables");
  const off = want.flatMap((s, i) => (s === got[i] ? [] : [i]));
  if (off.length === 0) return RIGHT;
  // The same sounds, other tones.
  return off.every((i) => toneless(shape, want[i] as string) === toneless(shape, got[i] as string)) ? wrong("reading-tone", off) : wrong("reading-syllables", off);
};
