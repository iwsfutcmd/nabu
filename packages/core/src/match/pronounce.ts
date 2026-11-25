/**
 * A word's pronunciation as its writing system leaves it out (ADR 0054), graded:
 * - **vowel marks** (`gradeVowels`): an abjad word with the marks the learner wrote in, against
 *   its vocalized form. The letters must stay as they are; each letter's marks must be the
 *   expected ones, except the profile's optional marks (sukun), and those optional before the
 *   letter that follows (a fatha before an alif, a kasra before a bare ya), which may be written
 *   or not.
 * - **a reading** (`gradeReading`): an ideographic word's romanization (Jyutping), syllable by
 *   syllable, spaces optional and case ignored, in a scheme whose data gives a syllable's shape
 *   (profiles/schemes, ADR 0109).
 *
 * Both are all or nothing: a word's pronunciation is right or it is not. `off` lists what was
 * wrong (letters by grapheme index, or syllables), for feedback.
 */
import { readingProjection, readingScheme } from "../profile/schemes.ts";
import { graphemes } from "../text/graphemes.ts";

/** An orthography's vowel marks (a profile's `match.marks`): one code point each, NFD. */
export interface VowelMarks {
  readonly set: ReadonlySet<string>;
  /** Marks a learner may write or leave out (sukun). */
  readonly optional: ReadonlySet<string>;
  /**
   * Marks a learner may write or leave out on a letter before certain letters: the fatha before the
   * alif that writes its long a (ADR 0054 as amended: مَرْحَبا, مَرْحَبَا), the kasra before a bare ya
   * (فيلِم, فِيلِم). The same mark anywhere else counts.
   */
  readonly optionalBefore?: readonly OptionalBefore[] | undefined;
  /** Marks a learner may write or leave out on a letter that already says them (the kasra under إ), by the letter (NFC). */
  readonly optionalOn?: ReadonlyMap<string, ReadonlySet<string>> | undefined;
}

/** A profile's `optionalBefore` rule, compiled. */
export interface OptionalBefore {
  /** The marks (NFD code points of the set). */
  readonly marks: ReadonlySet<string>;
  /** The letters after (NFC, without vowel marks). */
  readonly letters: ReadonlySet<string>;
  /** Only where that letter carries no mark of the set (a ya that writes a long vowel, not a consonant). */
  readonly bare: boolean;
  /** Marks on the letter itself that keep the marks counting (a sukun: the letter after is a consonant). */
  readonly unless: ReadonlySet<string>;
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

/** A grapheme without its vowel marks (NFD). */
const baseOf = (marks: VowelMarks, grapheme: string): string =>
  Array.from(grapheme.normalize("NFD"))
    .filter((c) => !marks.set.has(c))
    .join("");

const NONE: ReadonlySet<string> = new Set();

/** A grapheme's marks of the set (NFD). */
const ownMarks = (marks: VowelMarks, grapheme: string): string[] => Array.from(grapheme.normalize("NFD")).filter((c) => marks.set.has(c));

/**
 * The marks optional on a letter of a word, as the word writes it (`letter`, with its marks), before
 * the word's next letter (`next`, with its marks): those the letter itself already says (`optionalOn`),
 * and those of each `optionalBefore` rule whose letters hold the next one, bare where the rule asks it,
 * and the letter carrying none of the rule's `unless`. Read off the expected word, the same for an
 * answer's letter in its place.
 */
const optionalHere = (marks: VowelMarks, letter: string, next: string | undefined): ReadonlySet<string> => {
  const rules = rulesHere(marks, letter, next);
  const on = marks.optionalOn?.get(baseOf(marks, letter).normalize("NFC"));
  if (rules.length === 0) return on ?? NONE;
  const out = new Set<string>(on);
  for (const rule of rules) for (const m of rule.marks) out.add(m);
  return out;
};

/** The `optionalBefore` rules that hold on a letter before `next`: `next` writes a long vowel there. */
const rulesHere = (marks: VowelMarks, letter: string, next: string | undefined): readonly OptionalBefore[] => {
  if (next === undefined || marks.optionalBefore === undefined || marks.optionalBefore.length === 0) return [];
  const after = baseOf(marks, next).normalize("NFC");
  const nextBare = ownMarks(marks, next).length === 0;
  const own = ownMarks(marks, letter);
  return marks.optionalBefore.filter((rule) => rule.letters.has(after) && (!rule.bare || nextBare) && !own.some((c) => rule.unless.has(c)));
};

/** A grapheme's marks that count, in canonical order: not the optional ones, nor those optional where it stands (`here`). */
const marksOf = (marks: VowelMarks, grapheme: string, here: ReadonlySet<string>): string =>
  ownMarks(marks, grapheme)
    .filter((c) => !marks.optional.has(c) && !here.has(c))
    .join("");

/** A text without its vowel marks. */
export const withoutMarks = (marks: VowelMarks, text: string): string =>
  Array.from(text.normalize("NFD"))
    .filter((c) => !marks.set.has(c))
    .join("")
    .normalize("NFC");

/** Whether a word has vowel marks for a learner to supply (sukun alone does not count). */
export const hasVowelMarks = (marks: VowelMarks, vocalized: string): boolean =>
  graphemes(vocalized.normalize("NFC")).some((g, i, gs) => marksOf(marks, g, optionalHere(marks, g, gs[i + 1])) !== "");

/** An abjad word with the learner's vowel marks against its vocalized form. */
export const gradeVowels = (marks: VowelMarks | undefined, expected: string, answer: string): PronunciationGrade => {
  if (marks === undefined) throw new Error("the orthography has no vowel marks");
  const want = graphemes(expected.normalize("NFC"));
  const got = graphemes(answer.normalize("NFC").trim());
  const strip = (g: string): string => withoutMarks(marks, g);
  const letters = (gs: readonly string[]): string => gs.map(strip).join("");
  // A letter added, dropped or changed, or a mark with no letter: not the same word.
  if (got.length !== want.length || letters(got) !== letters(want) || got.some((g) => strip(g) === "")) return wrong("vocalize-letters");
  // The letters are the same; what is optional on each is read off the expected word.
  const off = want.flatMap((g, i) => {
    const here = optionalHere(marks, g, want[i + 1]);
    return marksOf(marks, g, here) === marksOf(marks, got[i] ?? "", here) ? [] : [i];
  });
  return off.length === 0 ? RIGHT : wrong("vocalize-marks", off);
};

/** Where a letter stands in its word: what marks it may take depends on it (no shadda word-initially). */
export type LetterPosition = "initial" | "medial" | "final";

const positionOf = (index: number, length: number): LetterPosition => (index === 0 ? "initial" : index === length - 1 ? "final" : "medial");

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
      const m = marksOf(marks, g, optionalHere(marks, g, gs[i + 1]));
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
 * the word's marked letters first, never a letter that writes a long vowel or an unmarked one it
 * lengthens. Every one differs from the word in marks a learner must get right (optional marks
 * aside), so none is also correct. In a stable order: the caller picks.
 */
export const vocalizationVariants = (marks: VowelMarks, vocalized: string, attested: (base: string, position: LetterPosition) => readonly string[]): readonly string[] => {
  const word = vocalized.normalize("NFC");
  const gs = graphemes(word);
  const own = gs.map((g, i) => marksOf(marks, g, optionalHere(marks, g, gs[i + 1])));
  // A letter that writes a long vowel (an alif; a bare ya or waw, by the profile's optionalBefore) keeps its
  // marks, and so does an unmarked letter before a ya or waw: a mark there gives another word's shape (كيّفَك
  // kayyaf-, كَيفَك kayfak: a consonant, a diphthong), not another vocalization of this one.
  const kept = new Set<number>();
  for (const [i, g] of gs.entries()) {
    const rules = rulesHere(marks, g, gs[i + 1]);
    if (rules.length === 0) continue;
    kept.add(i + 1);
    if (own[i] === "" && rules.some((r) => r.bare)) kept.add(i);
  }
  const others = gs.map((g, i) => (kept.has(i) ? [] : attested(baseOf(marks, g), positionOf(i, gs.length)).filter((m) => m !== own[i])));
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
 * The spelling a scheme's statement relates a reading to (ADR 0148), where the word is written in
 * the orthography the scheme states it `of`: then a reading card's options are only what the letter
 * written there also writes. Undefined otherwise: the scheme's sets (`loses`) alone.
 */
export const schemeSpelling = (scheme: string, orthography: string, surface: string): string | undefined => {
  const of = readingProjection(scheme)?.of;
  return of !== undefined && of === orthography ? surface : undefined;
};

/**
 * A reading with one piece traded for another the script writes alike (ADR 0148: the scheme's
 * correspondences): Schluessel's bardi as bärdi, bārdi, barde, bardī. With the word's `spelling`
 * (`schemeSpelling`), only what the letter written there also writes; without it, what the
 * scheme's sets (`loses`) allow. Each once, in the reading's order; a capital stays a capital. None
 * for a scheme that leaves nothing open.
 */
export const letterVariants = (scheme: string, reading: string, spelling?: string): readonly string[] => readingProjection(scheme)?.letterVariants(reading, spelling) ?? [];

/**
 * The places of a reading the script leaves open in two or more ways (ADR 0139), each with the
 * reading changed there in every way the scheme's data allows: a piece traded within its
 * correspondence (ADR 0148: üzüm as özüm, uzüm, ozüm, ūzüm; with the word's spelling, only what its
 * letter there also writes), or one syllable in each other tone the course's readings use
 * (`attested`: ngo5: ngo1, ngo4). A capital is traded for a capital. In a stable order, places
 * first to last: the caller picks.
 */
export const readingFeatures = (scheme: string, reading: string, attested: ReadonlySet<string>, spelling?: string): readonly (readonly string[])[] => {
  const out: (readonly string[])[] = [...(readingProjection(scheme)?.variants(reading, spelling) ?? [])];
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
 * Whether a scheme's data says which of its letters the script leaves open (ADR 0141): pieces its
 * statement writes alike (ADR 0148) or tone marks (`tones`).
 */
export const hasOpenLetters = (scheme: string): boolean => readingProjection(scheme)?.opens === true || readingScheme(scheme)?.tones?.marks !== undefined;

/**
 * A reading as minimal ruby (ADR 0141): only what the script leaves open (the pieces its statement
 * writes alike, ADR 0148, narrowed by the word's `spelling` where given; its tone marks), each run
 * of other letters a middle dot (üzüm is ü·ü·, ngo5 is ·5, shàn is ·à·). Empty where nothing in it
 * is open. Spaces between syllables are kept.
 */
export const openLetters = (scheme: string, reading: string, spelling?: string): string => {
  const data = readingScheme(scheme);
  const locale = data?.lang ?? data?.language;
  const open = readingProjection(scheme)?.openAt(reading, spelling) ?? [];
  const tone = data?.tones?.marks === undefined ? undefined : new RegExp(`^(?:${data.tones.marks})+$`, "u");
  let out = "";
  let kept = false;
  for (const [i, g] of graphemes(reading.normalize("NFC"), locale).entries()) {
    if (/^\s+$/u.test(g)) out += g;
    else if (open[i] === true || tone?.test(g) === true) {
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
