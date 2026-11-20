/**
 * A course laid out for browsing (the Data page of debug mode): every word with the ways its
 * sentences write it, every form and pattern with the words that carry it, every letter its script
 * tracks teach, and every sentence with what its tokens say. It reads the course as lessons do and
 * adds nothing: what it lists is what cards are made from. Built once per course view.
 */
import type { BundleKc, BundleSentence, KcId, TaggedText, Token } from "@nabu/schema";
import type { CourseView } from "./course.ts";
import { textMatcher } from "./search.ts";
import { senseKcOf } from "./signature.ts";
import { tokenParts, tokenText, type TokenParts } from "./templates.ts";

/** A word as one or more sentences write it: one token, with what it carries. */
export interface WrittenWord {
  /** The token alone, readings and all. */
  readonly text: TaggedText;
  /** What it carries (`tokenParts`); undefined for a token that is no word of the course (a name left unglossed). */
  readonly carries?: TokenParts | undefined;
  /** The sentences that write it so, in course order. */
  readonly sentences: readonly string[];
}

export interface WordRow {
  readonly kc: BundleKc;
  /** The unit that lists it, from 0. */
  readonly unit: number;
  /** Its first form in the orthography being learned (its lemma), and the rest (its variants). */
  readonly forms: readonly TaggedText[];
  readonly gloss?: TaggedText | undefined;
  /** The ways sentences write it, in the order they first do. */
  readonly written: readonly WrittenWord[];
  /** How many sentences list it. */
  readonly sentences: number;
}

/** A word that carries a form, as a sentence writes it. */
export interface Carrier {
  readonly word: KcId;
  readonly text: TaggedText;
  /** The word has the form of itself (a noun's own gender): nothing is built with it. */
  readonly ofItself: boolean;
  readonly sentences: number;
}

/** A form, a pattern or any other KC that is neither a word nor a letter. */
export interface FormRow {
  readonly kc: BundleKc;
  readonly unit: number;
  readonly gloss?: TaggedText | undefined;
  /** The words whose tokens carry it. */
  readonly carriers: readonly Carrier[];
  /** How many sentences list it. */
  readonly sentences: number;
}

/** A letter (a grapheme KC of a script track). */
export interface LetterRow {
  readonly kc: BundleKc;
  readonly unit: number;
  readonly forms: readonly TaggedText[];
  readonly gloss?: TaggedText | undefined;
}

/** One word of a sentence. */
export interface SentenceWord {
  /** Its place among the text's tokens. */
  readonly at: number;
  readonly text: TaggedText;
  readonly carries?: TokenParts | undefined;
}

export interface SentenceRow {
  readonly sentence: BundleSentence;
  readonly unit: number;
  readonly text: TaggedText;
  readonly translation?: TaggedText | undefined;
  readonly words: readonly SentenceWord[];
}

export interface CourseData {
  readonly words: readonly WordRow[];
  readonly forms: readonly FormRow[];
  readonly letters: readonly LetterRow[];
  readonly sentences: readonly SentenceRow[];
}

/** What tells two tokens of a word apart: its spelling, its analysis and its readings. */
const writtenKey = (token: Token): string => JSON.stringify([token.surface, token.sense ?? null, token.form ?? null, token.morphs ?? [], token.readings ?? {}]);

const built = new WeakMap<CourseView, CourseData>();

/** The course laid out for browsing, in the orthography being learned. */
export const courseData = (course: CourseView): CourseData => {
  const cached = built.get(course);
  if (cached !== undefined) return cached;
  const { orthography, supportKey } = course;

  // Every sentence, with its words; and each word's tokens, grouped by how they are written.
  const listed = new Map<string, number>();
  const writtenBy = new Map<string, Map<string, { readonly text: TaggedText; readonly carries: TokenParts | undefined; readonly sentences: string[] }>>();
  const sentences: SentenceRow[] = [];
  for (const [unit, u] of course.units.entries()) {
    for (const s of u.sentences) {
      for (const kc of new Set(s.kcs)) listed.set(kc, (listed.get(kc) ?? 0) + 1);
      const text = s.forms[orthography]?.text;
      if (text === undefined) continue;
      const words: SentenceWord[] = [];
      for (const [at, token] of text.tokens.entries()) {
        if (token.kind !== "word") continue;
        const carries = tokenParts(course, token);
        const alone = tokenText(text, token);
        words.push({ at, text: alone, carries });
        const sense = senseKcOf(token);
        if (sense === undefined) continue;
        const ways = writtenBy.get(sense) ?? new Map<string, { readonly text: TaggedText; readonly carries: TokenParts | undefined; readonly sentences: string[] }>();
        writtenBy.set(sense, ways);
        const key = writtenKey(token);
        const way = ways.get(key) ?? { text: alone, carries, sentences: [] };
        ways.set(key, way);
        if (way.sentences.at(-1) !== s.id) way.sentences.push(s.id);
      }
      sentences.push({ sentence: s, unit, text, translation: s.translations[supportKey]?.text, words });
    }
  }

  const words: WordRow[] = [];
  const forms: FormRow[] = [];
  const letters: LetterRow[] = [];
  const carriersOf = new Map<string, Carrier[]>();
  const seen = new Set<string>();
  for (const [unit, u] of course.units.entries()) {
    for (const kc of u.kcs) {
      if (seen.has(kc.id)) continue;
      seen.add(kc.id);
      const gloss = kc.gloss?.[supportKey];
      const own = kc.forms?.[orthography] ?? [];
      if (kc.kind === "sense") {
        const written = [...(writtenBy.get(kc.id) ?? new Map<string, WrittenWord>()).values()];
        for (const w of written) {
          for (const part of w.carries?.parts ?? []) {
            if (part.text !== undefined) continue;
            const list = carriersOf.get(part.kc) ?? [];
            carriersOf.set(part.kc, list);
            list.push({ word: kc.id, text: w.text, ofItself: w.carries?.ofItself === part.kc, sentences: w.sentences.length });
          }
        }
        words.push({ kc, unit, forms: own, gloss, written, sentences: listed.get(kc.id) ?? 0 });
      } else if (kc.kind === "grapheme") {
        letters.push({ kc, unit, forms: own, gloss });
      } else {
        forms.push({ kc, unit, gloss, carriers: [], sentences: listed.get(kc.id) ?? 0 });
      }
    }
  }
  const data: CourseData = { words, forms: forms.map((f) => ({ ...f, carriers: carriersOf.get(f.kc.id) ?? [] })), letters, sentences };
  built.set(course, data);
  return data;
};

/** The lists of a course's data, each a way to look at it. */
export type DataView = "words" | "forms" | "letters" | "sentences";

export interface DataMatcher {
  readonly words: (row: WordRow) => boolean;
  readonly forms: (row: FormRow) => boolean;
  readonly letters: (row: LetterRow) => boolean;
  readonly sentences: (row: SentenceRow) => boolean;
}

/**
 * Which rows match what was typed (`textMatcher`). A word by its forms, any way a sentence writes it,
 * its readings, its gloss or its id; a form or a letter by its entry or its id; a sentence by its
 * text, its translation, its id, or the id of a KC it lists (form:dat finds every dative).
 */
export const dataMatcher = (course: CourseView, query: string): DataMatcher => {
  const matches = textMatcher(course, query);
  const support = (gloss: TaggedText | undefined): readonly TaggedText[] => (gloss === undefined ? [] : [gloss]);
  return {
    words: (row) => matches({ target: [...row.forms, ...row.written.map((w) => w.text)], support: support(row.gloss), ids: [row.kc.id] }),
    forms: (row) => matches({ support: support(row.gloss), ids: [row.kc.id] }),
    letters: (row) => matches({ target: row.forms, support: support(row.gloss), ids: [row.kc.id] }),
    sentences: (row) => matches({ target: [row.text], support: support(row.translation), ids: [row.sentence.id, ...row.sentence.kcs] }),
  };
};
