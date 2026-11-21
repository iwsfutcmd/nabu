/**
 * What a word a learner chose or wrote means, for the feedback on a wrong answer (P3 in the 2026-11
 * review, ADR 0121): "hablas", where hablo was asked, is hablar "to speak", present tense, you (tú).
 * The meanings are glossAt's, as tap-for-gloss gives them; this module only chooses which reading of
 * the word to gloss, and adds the form it stands in, as the language names it.
 *
 * - A word that carries its analysis (a gap's option is a word of a sentence) is glossed by it: an
 *   inflected form by its own lexeme (como of "Como arroz" is comer's, not the entry como "like").
 * - A word the learner wrote is looked up among the course's words spelled like it, as grading's
 *   lexicon keys them (`lexiconKey`): each reading once (como: comer's, and "like, as").
 * - A word whose lexeme is a phrase (por of por favor) means, alone, what the glossary's entry for it
 *   says, else it is glossed as part of its phrase (días: Buenos días, "good morning"). A word
 *   without an analysis (a lexeme's spelling among a card's options, a number) is glossed by its entries.
 *
 * Pure; what is built per course (the glossary, the words by key) is built once.
 */
import type { BundleLexeme, TaggedText, Token } from "@nabu/schema";
import { allSentences, lexemesById, profileOf, type CourseView } from "../lesson/course.ts";
import { analysed, baseIdOf, baseOf, formKey, lexemesOf } from "../lesson/lexemes.ts";
import { formPart } from "../lesson/templates.ts";
import { lexiconKey } from "../match/grade.ts";
import type { CompiledProfile } from "../profile/compile.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { allStories, courseGlossary, glossAt, glossLine, type Gloss, type StoryGlossary } from "./story.ts";

/** One reading of a word: what it means, and the form it stands in. */
export interface WordMeaning {
  /** glossAt's glosses: the word's lexeme, or its lexemes one by one; each with a meaning. */
  readonly glosses: readonly Gloss[];
  /** The form the word stands in (ADR 0076), as the language names it: the name's id, and the name. */
  readonly form?: { readonly id: string; readonly meaning: TaggedText } | undefined;
}

/** At most this many readings of a word the learner wrote. */
const MAX_READINGS = 3;

const isWord = (t: Token): boolean => t.kind === "lexical" || t.kind === "number";

/** Built once per course (feedback asks after every wrong answer), each by orthography. */
const perCourse = <T>(cache: WeakMap<CourseView, Map<string, T>>, course: CourseView, orthography: string, build: () => T): T => {
  let byOrthography = cache.get(course);
  if (byOrthography === undefined) {
    byOrthography = new Map();
    cache.set(course, byOrthography);
  }
  let built = byOrthography.get(orthography);
  if (built === undefined) {
    built = build();
    byOrthography.set(orthography, built);
  }
  return built;
};

const glossaries = new WeakMap<CourseView, Map<string, StoryGlossary>>();
const wordIndexes = new WeakMap<CourseView, Map<string, ReadonlyMap<string, readonly (readonly Token[])[]>>>();
/** A word as grading's lexicon keys it: each of its units by `lexiconKey`. */
const keyOf = (profile: CompiledProfile, surface: string): string =>
  profile
    .units(profile.normalize(surface))
    .map((u) => lexiconKey(profile, u))
    .join(" ");

/**
 * The course's analysed words in an orthography (its sentences' and story lines'), by key: each
 * reading (the lexemes it writes and their forms) once, in course order, with the first token of
 * each spelling it takes (Como, como).
 */
const wordsOf = (course: CourseView, orthography: string): ReadonlyMap<string, readonly (readonly Token[])[]> =>
  perCourse(wordIndexes, course, orthography, () => {
    const profile = profileOf(course, orthography);
    const byKey = new Map<string, Map<string, Map<string, Token>>>();
    const add = (text: TaggedText): void => {
      for (const token of text.tokens) {
        if (!isWord(token) || !analysed(token)) continue;
        const key = keyOf(profile, token.surface);
        const readings = byKey.get(key) ?? new Map<string, Map<string, Token>>();
        byKey.set(key, readings);
        const reading = formKey(token) ?? "";
        const spellings = readings.get(reading) ?? new Map<string, Token>();
        readings.set(reading, spellings);
        if (!spellings.has(token.surface)) spellings.set(token.surface, token);
      }
    };
    for (const s of allSentences(course)) {
      const form = s.forms[orthography];
      if (form !== undefined) add(form.text);
    }
    for (const story of allStories(course)) {
      for (const step of story.steps) {
        const line = step.line?.forms[orthography];
        if (line !== undefined) add(line);
      }
    }
    return new Map([...byKey].map(([key, readings]) => [key, [...readings.values()].map((spellings) => [...spellings.values()])]));
  });

/** The phrase a token's lexeme is (Buenos días for días): its first spelling, where that has several words. */
const phraseOf = (lexemes: ReadonlyMap<string, BundleLexeme>, token: Token, orthography: string): TaggedText | undefined => {
  const form = lexemes.get(baseIdOf(token) ?? "")?.forms?.[orthography]?.[0];
  return form !== undefined && form.tokens.filter(isWord).length > 1 ? form : undefined;
};

/** The glossary's course for an orthography, compiled once. */
const glossaryOf = (course: CourseView, orthography: string): StoryGlossary => perCourse(glossaries, course, orthography, () => courseGlossary(course, orthography));

/**
 * What the word at `at` of a text means, by glossAt:
 * - its own analysis (glossAt with no glossary match glosses the word's lexeme, or its lexemes one by one);
 * - a word of a phrase, the glossary's entry for it alone (por: "by, for"), else the phrase it is
 *   part of (días: Buenos días, "good morning");
 * - a word without an analysis, the glossary's entries for it.
 */
const meaningOf = (course: CourseView, text: TaggedText, at: number): WordMeaning | undefined => {
  const token = text.tokens[at];
  if (token === undefined) return undefined;
  const glossary = glossaryOf(course, text.orthography);
  const lexemes = lexemesById(course);
  const own = (): readonly Gloss[] => glossAt(course, glossary, [], text, at);
  // Without its analysis, so that glossAt finds the entries for it and falls back on nothing.
  const alone = (): readonly Gloss[] => {
    const { lexemes: _lexemes, ...bare } = token;
    const word = { ...text, tokens: text.tokens.map((t, i) => (i === at ? bare : t)) };
    return glossAt(course, glossary, glossLine(course, glossary, word), word, at);
  };
  const inPhrase = (phrase: TaggedText): readonly Gloss[] => glossAt(course, glossary, glossLine(course, glossary, phrase), phrase, phrase.tokens.findIndex(isWord));
  const phrase = phraseOf(lexemes, token, text.orthography);
  let glosses: readonly Gloss[];
  if (!analysed(token)) glosses = alone();
  else if (phrase === undefined) glosses = own();
  else {
    glosses = alone();
    if (glosses.length === 0) glosses = inPhrase(phrase);
    if (glosses.length === 0) glosses = own();
  }
  const meant = glosses.filter((g) => g.meaning !== undefined);
  const named = formPart(course, token);
  const form = named === undefined ? undefined : { id: named.id, meaning: named.gloss };
  if (meant.length === 0 && form === undefined) return undefined;
  return { glosses: meant, ...(form === undefined ? {} : { form }) };
};

/** Readings that say the same once (de of de, of fin de semana, of a pesar de: each "of, from" alone). */
const distinct = (meanings: readonly WordMeaning[]): readonly WordMeaning[] => {
  const seen = new Set<string>();
  return meanings.filter((m) => {
    const key = JSON.stringify([m.glosses.map((g) => [g.id, g.span]), m.form?.id ?? ""]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * What a word of the course means (an option a learner chose: a gap's word, a heard word's, a
 * picture's): by its analysis where it carries one, else by the glossary's entries for it. Nothing
 * for text in another orthography than the one being learned, or a word the course gives no meaning.
 */
export const wordMeanings = (course: CourseView, word: TaggedText): readonly WordMeaning[] => {
  if (word.orthography !== course.orthography) return [];
  const at = word.tokens.findIndex(isWord);
  const meaning = at < 0 ? undefined : meaningOf(course, word, at);
  return meaning === undefined ? [] : [meaning];
};

/**
 * What a word the learner wrote means (hablas, esta): each reading of the course's words spelled
 * like it, as grading's lexicon keys them, glossed as the course analyses it there (at most three;
 * lexeme by lexeme only where the course glosses it whole nowhere); a word the course writes nowhere
 * with an analysis, by the glossary's entries for it. Nothing for a word the course does not know.
 */
export const writtenMeanings = (course: CourseView, word: TaggedText): readonly WordMeaning[] => {
  if (word.orthography !== course.orthography) return [];
  const surface = surfaceOf(word);
  const readings = wordsOf(course, word.orthography).get(keyOf(profileOf(course, word.orthography), surface));
  if (readings === undefined) return wordMeanings(course, word);
  const meanings = readings.flatMap((spellings) => {
    // The reading as the learner spelled it, where the course writes it so (como, not Como).
    const spelled = spellings.find((t) => t.surface === surface) ?? spellings[0];
    if (spelled === undefined) return [];
    const { tileGroup: _tile, ...token } = spelled;
    return meaningOf(course, { lang: word.lang, orthography: word.orthography, tokens: [token] }, 0) ?? [];
  });
  // A word the course glosses whole somewhere is shown whole: its readings lexeme by lexeme only
  // say it again in parts (Lebanese بدك: baddak, baddik, and badd + -ik).
  const whole = meanings.filter((m) => m.glosses.every((g) => g.span !== "part"));
  return distinct(whole.length > 0 ? whole : meanings).slice(0, MAX_READINGS);
};

/** What a word's form says (ADR 0132): the feedback on a form question shows it beside the right form's. */
export interface FormMeanings {
  /** The word's base lexeme: the same for every option of a form question. */
  readonly lexeme: string | undefined;
  /**
   * Each thing of its form, in the order the word writes them (the form its base stands in last),
   * where the course glosses it: a lexeme written with the base, the name of the form.
   */
  readonly forms: readonly { readonly id: string; readonly meaning: TaggedText }[];
}

/**
 * What a word's form means, part by part (ADR 0132): "-dim: I (past)" for bardim, "-di: he, she
 * (past)" for bardi; "present tense: I" for hablo. What a form question asks of the word, as a
 * learner is shown it. A bare word has none.
 */
export const formMeanings = (course: CourseView, word: TaggedText): FormMeanings => {
  const token = word.tokens.find(isWord);
  if (token === undefined) return { lexeme: undefined, forms: [] };
  const base = baseOf(token);
  const lexemes = lexemesById(course);
  const written = lexemesOf(token)
    .filter((l) => l !== base)
    .map((l) => l.lexeme);
  const others = [...new Set(written)].flatMap((id) => {
    const meaning = lexemes.get(id)?.gloss?.[course.supportKey];
    return meaning === undefined ? [] : [{ id, meaning }];
  });
  const named = formPart(course, token);
  return { lexeme: base?.lexeme, forms: [...others, ...(named === undefined ? [] : [{ id: named.id, meaning: named.gloss }])] };
};

/**
 * Builds what the meanings of the words of the orthography being learned are looked up in, which the
 * first wrong answer's feedback would otherwise wait for (the course's words by key, its glossary).
 * An app calls it while the learner reads, as it calls prepareGrading.
 */
export const prepareMeanings = (course: CourseView): void => {
  wordsOf(course, course.orthography);
  glossaryOf(course, course.orthography);
};
