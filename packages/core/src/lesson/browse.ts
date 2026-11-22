/**
 * A course laid out for browsing (the Data page of debug mode): every lexeme the course cites, with
 * the ways its sentences write it; every form and pattern (a lexeme written only inside words, a
 * form the language names, a rule) with the words that carry it; every letter its script tracks
 * teach; and every sentence with what its tokens say. It reads the course as lessons do and adds
 * nothing: what it lists is what cards are made from. Built once per course view.
 */
import type { BundleLexeme, BundleSentence, LexemeId, SchemeId, TaggedText, Token, UdFeatures } from "@nabu/schema";
import { lexemesInOrder, unitIndexOf, type CourseView } from "./course.ts";
import { readingAsText } from "./homographs.ts";
import type { LexemeRow } from "./lexicon-data.ts";
import { baseIdOf, bound, sentencePersons } from "./lexemes.ts";
import { textMatcher } from "./search.ts";
import { labelId, tokenParts, tokenText, type TokenParts } from "./templates.ts";

/**
 * An id as the page shows it. A course may name a lexeme by the word itself (lexeme:係, grapheme:ҳ):
 * such an id is text in one of the course's scripts and is set as that (`text`); the rest are plain code.
 */
export interface EntryId {
  readonly id: string;
  readonly text?: TaggedText | undefined;
}

/** A reading a token pins, as text of its own in its scheme. */
export interface PinnedReading {
  readonly scheme: SchemeId;
  readonly text: TaggedText;
}

/** A word as one or more sentences write it: one token, with what it carries. */
export interface WrittenWord {
  /** The token alone, readings and all. */
  readonly text: TaggedText;
  /** Every reading it pins, by scheme: ruby shows one layer at most. */
  readonly readings: readonly PinnedReading[];
  /** What it carries (`tokenParts`); undefined for a token that is no word of the course (a name left unglossed). */
  readonly carries?: TokenParts | undefined;
  /** The sentences that write it so, in course order. */
  readonly sentences: readonly string[];
}

export interface WordRow {
  readonly lexeme: BundleLexeme;
  readonly id: EntryId;
  /** Its part of speech and the features it has of itself, as its lexicon tags them (UD: NOUN, Gender=Fem). */
  readonly tags: readonly string[];
  /** The unit that first teaches it, from 0. */
  readonly unit: number;
  /** Its first spelling in the orthography being learned (its lemma), and the rest (its variants). */
  readonly forms: readonly TaggedText[];
  readonly gloss?: TaggedText | undefined;
  /** The ways sentences write it, in the order they first do. */
  readonly written: readonly WrittenWord[];
  /** How many sentences list it. */
  readonly sentences: number;
}

/** A word that carries a form, as a sentence writes it. */
export interface Carrier {
  readonly word: LexemeId;
  readonly text: TaggedText;
  /** The word has the form of itself (a noun always plural): nothing is built with it. */
  readonly ofItself: boolean;
  readonly sentences: number;
}

/**
 * A form or a pattern: a lexeme written only inside words (an ending, a suffixed pronoun), a form
 * the language names (a label over feature values), or a rule.
 */
export interface FormRow {
  readonly id: EntryId;
  /** What it is (affix, form, rule), then its part of speech and feature values where it has them. */
  readonly tags: readonly string[];
  /** The unit that first teaches it, or first writes it, from 0. */
  readonly unit: number;
  readonly gloss?: TaggedText | undefined;
  /** The words whose tokens carry it. */
  readonly carriers: readonly Carrier[];
  /** How many sentences list it, or write a word that carries it. */
  readonly sentences: number;
}

/** A letter of a script track. */
export interface LetterRow {
  readonly id: EntryId;
  readonly tags: readonly string[];
  readonly unit: number;
  readonly forms: readonly TaggedText[];
  readonly gloss?: TaggedText | undefined;
}

/** One word of a sentence. */
export interface SentenceWord {
  /** Its place among the text's tokens. */
  readonly at: number;
  readonly text: TaggedText;
  readonly readings: readonly PinnedReading[];
  readonly carries?: TokenParts | undefined;
}

export interface SentenceRow {
  readonly sentence: BundleSentence;
  /** The parts it lists, in its own order. */
  readonly listed: readonly EntryId[];
  /** Its review status, and who speaks to whom where the course says (speaker=f, addressee=pl). */
  readonly tags: readonly string[];
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

/** Unicode's name for an ISO 15924 script a course is written in: the Han subsets are Han. */
const unicodeScript = (script: string): string => (script === "Hant" || script === "Hans" || script === "Hanb" ? "Hani" : script);

/**
 * Ids as the page shows them: one that is not plain ASCII is text in the first of the course's
 * orthographies whose script has its first such letter (lexeme:係 in yue-Hant-HK, grapheme:ҳ in
 * uz-Cyrl), so it is set in that script's face and never in a fallback one.
 */
const entryIds = (course: CourseView): ((id: string) => EntryId) => {
  // A text in each of the course's orthographies, the one being learned first: its tags are the id's.
  const first = course.units.flatMap((u) => u.sentences)[0]?.forms ?? {};
  const texts = [first[course.orthography]?.text, ...Object.values(first).map((f) => f.text)].flatMap((text) => text ?? []);
  const scripts = texts.flatMap((text) => {
    try {
      const script = new Intl.Locale(text.lang).maximize().script;
      return script === undefined ? [] : [{ text, letters: new RegExp(`\\p{Script=${unicodeScript(script)}}`, "u") }];
    } catch {
      return [];
    }
  });
  const made = new Map<string, EntryId>();
  return (id) => {
    let entry = made.get(id);
    if (entry === undefined) {
      const letter = /(?=\P{ASCII})\p{L}/u.exec(id)?.[0];
      const home = letter === undefined ? undefined : (scripts.find((s) => s.letters.test(letter)) ?? scripts[0]);
      entry = home === undefined ? { id } : { id, text: { lang: home.text.lang, orthography: home.text.orthography, tokens: [{ surface: id, kind: "lexical" }] } };
      made.set(id, entry);
    }
    return entry;
  };
};

const valueTags = (feats: UdFeatures | undefined): readonly string[] =>
  Object.keys(feats ?? {})
    .sort()
    .map((name) => `${name}=${(feats ?? {})[name] ?? ""}`);

/** A lexeme's part of speech and the features it has of itself or realises, as its lexicon tags them. */
const tagsOf = (lexeme: BundleLexeme): readonly string[] => [...(lexeme.pos === undefined ? [] : [lexeme.pos as string]), ...valueTags(lexeme.feats), ...valueTags(lexeme.realises)];

const readingsOf = (text: TaggedText, token: Token): readonly PinnedReading[] =>
  (Object.entries(token.readings ?? {}) as [SchemeId, string][]).map(([scheme, reading]) => ({ scheme, text: readingAsText(scheme, reading, text) }));

/** What tells two tokens of a word apart: its spelling, its analysis and its readings. */
const writtenKey = (token: Token): string => JSON.stringify([token.surface, token.lexemes ?? [], token.readings ?? {}]);

const built = new WeakMap<CourseView, CourseData>();

/** The course laid out for browsing, in the orthography being learned. */
export const courseData = (course: CourseView): CourseData => {
  const cached = built.get(course);
  if (cached !== undefined) return cached;
  const { orthography, supportKey } = course;
  const idOf = entryIds(course);

  // Every sentence, with its words; and each lexeme's tokens, grouped by how they are written.
  const listed = new Map<string, number>();
  const carried = new Map<string, Set<string>>();
  type Way = { readonly text: TaggedText; readonly readings: readonly PinnedReading[]; readonly carries: TokenParts | undefined; readonly sentences: string[] };
  const writtenBy = new Map<string, Map<string, Way>>();
  const sentences: SentenceRow[] = [];
  for (const [unit, u] of course.units.entries()) {
    for (const s of u.sentences) {
      for (const part of new Set(s.parts)) listed.set(part, (listed.get(part) ?? 0) + 1);
      const text = s.forms[orthography]?.text;
      if (text === undefined) continue;
      const words: SentenceWord[] = [];
      for (const [at, token] of text.tokens.entries()) {
        if (token.kind !== "lexical") continue;
        const carries = tokenParts(course, token);
        const alone = tokenText(text, token);
        const readings = readingsOf(text, token);
        words.push({ at, text: alone, readings, carries });
        for (const part of carries?.parts ?? []) if (part.text === undefined) carried.set(part.id, (carried.get(part.id) ?? new Set<string>()).add(s.id));
        const base = baseIdOf(token);
        if (base === undefined) continue;
        const ways = writtenBy.get(base) ?? new Map<string, Way>();
        writtenBy.set(base, ways);
        const key = writtenKey(token);
        const way = ways.get(key) ?? { text: alone, readings, carries, sentences: [] };
        ways.set(key, way);
        if (way.sentences.at(-1) !== s.id) way.sentences.push(s.id);
      }
      const persons = sentencePersons(s);
      const tags = [s.provenance.status as string, ...(persons?.speaker === undefined ? [] : [`speaker=${persons.speaker}`]), ...(persons?.addressee === undefined ? [] : [`addressee=${persons.addressee}`])];
      sentences.push({ sentence: s, listed: s.parts.map(idOf), tags, unit, text, translation: s.translations[supportKey]?.text, words });
    }
  }

  const units = unitIndexOf(course);
  const unitOf = (id: string): number => units.get(id) ?? course.units.length;
  const firstUnit = new Map<string, number>();
  for (const row of sentences) for (const word of row.words) for (const part of word.carries?.parts ?? []) if (!firstUnit.has(part.id)) firstUnit.set(part.id, row.unit);

  const words: WordRow[] = [];
  const forms: FormRow[] = [];
  const carriersOf = new Map<string, Carrier[]>();
  for (const lexeme of lexemesInOrder(course)) {
    const gloss = lexeme.gloss?.[supportKey];
    if (bound(lexeme)) {
      forms.push({ id: idOf(lexeme.id), tags: ["affix", ...tagsOf(lexeme)], unit: unitOf(lexeme.id), gloss, carriers: [], sentences: listed.get(lexeme.id) ?? 0 });
      continue;
    }
    const written = [...(writtenBy.get(lexeme.id) ?? new Map<string, WrittenWord>()).values()];
    for (const w of written) {
      for (const part of w.carries?.parts ?? []) {
        if (part.text !== undefined) continue;
        const list = carriersOf.get(part.id) ?? [];
        carriersOf.set(part.id, list);
        list.push({ word: lexeme.id, text: w.text, ofItself: w.carries?.ofItself === part.id, sentences: w.sentences.length });
      }
    }
    words.push({ lexeme, id: idOf(lexeme.id), tags: tagsOf(lexeme), unit: unitOf(lexeme.id), forms: lexeme.forms?.[orthography] ?? [], gloss, written, sentences: listed.get(lexeme.id) ?? 0 });
  }
  for (const label of course.lexicon.labels ?? []) {
    const id = labelId(label);
    forms.push({
      id: idOf(id),
      tags: ["form", ...(label.pos === undefined ? [] : [label.pos as string]), ...valueTags(label.feats)],
      unit: firstUnit.get(id) ?? course.units.length,
      gloss: label.gloss[supportKey],
      carriers: [],
      sentences: carried.get(id)?.size ?? 0,
    });
  }
  for (const rule of course.lexicon.rules ?? []) {
    forms.push({ id: idOf(rule.id), tags: ["rule"], unit: unitOf(rule.id), gloss: rule.gloss?.[supportKey], carriers: [], sentences: listed.get(rule.id) ?? 0 });
  }
  const letters: LetterRow[] = [];
  for (const [unit, u] of course.units.entries()) {
    for (const letter of u.graphemes ?? []) {
      letters.push({ id: idOf(letter.id), tags: [], unit, forms: letter.forms?.[orthography] ?? [], gloss: letter.gloss?.[supportKey] });
    }
  }
  // Forms and patterns by the unit that first teaches or writes them; within a unit, as listed above.
  const ordered = forms.map((f, i) => ({ f, i })).sort((a, b) => a.f.unit - b.f.unit || a.i - b.i);
  const data: CourseData = { words, forms: ordered.map(({ f }) => ({ ...f, carriers: carriersOf.get(f.id.id) ?? [] })), letters, sentences };
  built.set(course, data);
  return data;
};

/**
 * The lists of a course's data, each a way to look at it; and its lexicon (`lexiconData`): every
 * lexeme with everything stored on it, and the language file.
 */
export type DataView = "words" | "forms" | "letters" | "sentences" | "lexicon" | "language";

export interface DataMatcher {
  readonly words: (row: WordRow) => boolean;
  readonly forms: (row: FormRow) => boolean;
  readonly letters: (row: LetterRow) => boolean;
  readonly sentences: (row: SentenceRow) => boolean;
  readonly lexicon: (row: LexemeRow) => boolean;
}

/**
 * Which rows match what was typed (`textMatcher`). A word by its spellings, any way a sentence writes
 * it, its readings, its gloss or its id; a form or a letter by its entry or its id; a sentence by its
 * text, its translation, its id, or the id of a part it lists (feature:Case=Dat finds every dative).
 * A lexeme by anything stored on it: its id, a spelling in any orthography, a reading, a gloss or a
 * note in its own language, a key or a code value (NOUN, Gender=Fem, pinned, bound, allomorphs).
 */
export const dataMatcher = (course: CourseView, query: string): DataMatcher => {
  const matches = textMatcher(course, query);
  const support = (gloss: TaggedText | undefined): readonly TaggedText[] => (gloss === undefined ? [] : [gloss]);
  return {
    words: (row) => matches({ target: [...row.forms, ...row.written.map((w) => w.text)], support: support(row.gloss), ids: [row.id.id] }),
    forms: (row) => matches({ support: support(row.gloss), ids: [row.id.id, ...row.tags] }),
    letters: (row) => matches({ target: row.forms, support: support(row.gloss), ids: [row.id.id] }),
    sentences: (row) => matches({ target: [row.text], support: support(row.translation), ids: [row.sentence.id, ...row.sentence.parts] }),
    lexicon: (row) => matches(row.searched),
  };
};
