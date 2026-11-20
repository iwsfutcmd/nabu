/**
 * A course laid out for browsing (the Data page of debug mode): every word with the ways its
 * sentences write it, every form and pattern with the words that carry it, every letter its script
 * tracks teach, and every sentence with what its tokens say. It reads the course as lessons do and
 * adds nothing: what it lists is what cards are made from. Built once per course view.
 */
import type { BundleKc, BundleSentence, KcId, SchemeId, TaggedText, Token } from "@nabu/schema";
import type { CourseView } from "./course.ts";
import { readingAsText } from "./homographs.ts";
import { textMatcher } from "./search.ts";
import { senseKcOf } from "./signature.ts";
import { tokenParts, tokenText, type TokenParts } from "./templates.ts";

/**
 * An id as the page shows it. A course may name a KC by the word itself (sense:係, grapheme:ҳ): such an
 * id is text in one of the course's scripts and is set as that (`text`); the rest are plain code.
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
  readonly kc: BundleKc;
  readonly id: EntryId;
  /** Its part of speech and features as the course tags them (UD: NOUN, Gender=Fem). */
  readonly tags: readonly string[];
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
  readonly id: EntryId;
  /** Its kind (form, construction), then its part of speech and features where the course tags them. */
  readonly tags: readonly string[];
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
  /** The KCs it lists, in its own order. */
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
 * orthographies whose script has its first such letter (sense:係 in yue-Hant-HK, grapheme:ҳ in
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
      entry = home === undefined ? { id } : { id, text: { lang: home.text.lang, orthography: home.text.orthography, tokens: [{ surface: id, kind: "word" }] } };
      made.set(id, entry);
    }
    return entry;
  };
};

/** A KC's part of speech and features, as the course tags them. */
const tagsOf = (kc: BundleKc): readonly string[] => [...(kc.pos === undefined ? [] : [kc.pos as string]), ...Object.entries(kc.features ?? {}).map(([name, value]) => `${name}=${String(value)}`)];

const readingsOf = (text: TaggedText, token: Token): readonly PinnedReading[] =>
  (Object.entries(token.readings ?? {}) as [SchemeId, string][]).map(([scheme, reading]) => ({ scheme, text: readingAsText(scheme, reading, text) }));

/** What tells two tokens of a word apart: its spelling, its analysis and its readings. */
const writtenKey = (token: Token): string => JSON.stringify([token.surface, token.sense ?? null, token.form ?? null, token.morphs ?? [], token.readings ?? {}]);

const built = new WeakMap<CourseView, CourseData>();

/** The course laid out for browsing, in the orthography being learned. */
export const courseData = (course: CourseView): CourseData => {
  const cached = built.get(course);
  if (cached !== undefined) return cached;
  const { orthography, supportKey } = course;
  const idOf = entryIds(course);

  // Every sentence, with its words; and each word's tokens, grouped by how they are written.
  const listed = new Map<string, number>();
  type Way = { readonly text: TaggedText; readonly readings: readonly PinnedReading[]; readonly carries: TokenParts | undefined; readonly sentences: string[] };
  const writtenBy = new Map<string, Map<string, Way>>();
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
        const readings = readingsOf(text, token);
        words.push({ at, text: alone, readings, carries });
        const sense = senseKcOf(token);
        if (sense === undefined) continue;
        const ways = writtenBy.get(sense) ?? new Map<string, Way>();
        writtenBy.set(sense, ways);
        const key = writtenKey(token);
        const way = ways.get(key) ?? { text: alone, readings, carries, sentences: [] };
        ways.set(key, way);
        if (way.sentences.at(-1) !== s.id) way.sentences.push(s.id);
      }
      const tags = [s.provenance.status as string, ...(s.persons?.speaker === undefined ? [] : [`speaker=${s.persons.speaker}`]), ...(s.persons?.addressee === undefined ? [] : [`addressee=${s.persons.addressee}`])];
      sentences.push({ sentence: s, listed: s.kcs.map(idOf), tags, unit, text, translation: s.translations[supportKey]?.text, words });
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
        words.push({ kc, id: idOf(kc.id), tags: tagsOf(kc), unit, forms: own, gloss, written, sentences: listed.get(kc.id) ?? 0 });
      } else if (kc.kind === "grapheme") {
        letters.push({ kc, id: idOf(kc.id), tags: tagsOf(kc), unit, forms: own, gloss });
      } else {
        forms.push({ kc, id: idOf(kc.id), tags: [kc.kind, ...tagsOf(kc)], unit, gloss, carriers: [], sentences: listed.get(kc.id) ?? 0 });
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
