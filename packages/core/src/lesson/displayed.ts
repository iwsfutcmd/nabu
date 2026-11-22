/**
 * What a card displays (ADR 0146: seen is the app's doing, and it is logged): the lexemes it shows
 * the learner in the orthography being learned, each in the form it shows, once. Two moments, kept
 * apart: what the card shows as it is presented (`displayedBefore`: the prompt, the sentence around
 * a gap, every option and tile, wrong ones too), and what its answer adds (`displayedWith`: the
 * solution, and what an answered card reveals, as a listening card's sentence).
 *
 * A token gives one pair for each lexeme it writes (a stem, a clitic, an affix, a lexeme the script
 * does not write), each with the feature values chosen on it there: what `formKey` keys. A word shown
 * as the lexicon spells it (a word card's lemma, a part on a parts card) is the lexeme without
 * `feats`: the bundle carries no citation cell to say which form that is. Not displayed: text in
 * the support language or in another orthography, a reading (ruby, an option that is a reading), a
 * letter, a token of punctuation, space, a number or a symbol, and an option that is no form of a
 * lexeme (the wrong spellings a spelling or vocalization card offers: their tokens name none).
 *
 * Pure: a card's texts and the course, nothing else. An option taken from the lexicon is found again
 * by the very text the lexicon has (the same object, or the same JSON after a session kept on the
 * device), never by spelling alone: two lexemes the lexicon writes alike are not told apart, and
 * such an option is left out.
 */
import type { DisplayedLexeme, LexemeId, TaggedText } from "@nabu/schema";
import { allLexemes, type CourseView } from "./course.ts";
import type { Exercise } from "./exercise.ts";
import { lexemeFormKey, lexemesOf } from "./lexemes.ts";

export type { DisplayedLexeme };

/** Something a card shows: a text, a lexeme as the lexicon spells it, or a text taken from the lexicon. */
type Shown = { readonly text: TaggedText } | { readonly lemma: string } | { readonly lexiconText: TaggedText };

const text = (t: TaggedText | undefined): readonly Shown[] => (t === undefined ? [] : [{ text: t }]);
const texts = (ts: readonly TaggedText[]): readonly Shown[] => ts.map((t) => ({ text: t }));
/** A part, an item or a word part that names a lexeme: that lexeme, as the lexicon spells it. */
const lemma = (id: string | undefined): readonly Shown[] => (id?.startsWith("lexeme:") === true ? [{ lemma: id }] : []);

/** The options of a word card: the answer is the card's own lexeme, the others the lexicon's texts. */
const wordOptions = (ex: { readonly item: string; readonly answer: number }, options: readonly TaggedText[]): readonly Shown[] =>
  options.flatMap((o, i) => (i === ex.answer ? lemma(ex.item) : [{ lexiconText: o }]));

/** What each card shows: before its answer, and what the answer adds. */
const moments = (ex: Exercise): { readonly before: readonly Shown[]; readonly after: readonly Shown[] } => {
  switch (ex.template) {
    case "select-image":
      return { before: wordOptions(ex, ex.options.map((o) => o.text)), after: [] };
    case "match-pairs":
      // left[i] is the spelling of parts[i]; the glosses are the support language's.
      return { before: ex.left.flatMap((_, i) => lemma(ex.parts[i])), after: [] };
    case "letter-pairs":
      return { before: texts(ex.left), after: [] };
    case "choose-translation":
    case "translate-tap.l2-l1":
    case "char-read":
    case "reading-feature":
    case "transcribe":
    case "speak.tier-0":
    case "speak":
      // The prompt; the options, tiles and answer are a reading or the support language.
      return { before: text(ex.prompt), after: [] };
    case "letter-read":
      return { before: text(ex.prompt), after: [] };
    case "word-read":
      return { before: lemma(ex.item), after: [] };
    case "word-write":
      // Letters to build the word with; once answered, the word.
      return { before: texts(ex.tiles), after: lemma(ex.item) };
    case "translate-tap.l1-l2":
    case "listen-tap":
    case "story-arrange":
      return { before: texts(ex.tiles), after: text(ex.canonical) };
    case "translate-type.l1-l2":
    case "listen-type":
      return { before: [], after: text(ex.canonical) };
    case "complete-translation":
      return { before: [...text(ex.before), ...text(ex.after)], after: text(ex.canonical) };
    case "gap-fill":
    case "spelling-choice":
    case "story-complete":
      return { before: [...text(ex.before), ...text(ex.after), ...texts(ex.options)], after: [] };
    case "reading-disambiguation":
      return { before: text(ex.context), after: [] };
    case "vocalize":
      // Only the vocalized option is a form of the word; the others name no lexeme.
      return { before: [...text(ex.prompt), ...texts(ex.options)], after: [] };
    case "vocalize-build":
      return { before: text(ex.prompt), after: text(ex.vocalized) };
    case "parts-whole":
      return { before: [...text(ex.before), ...text(ex.after), ...ex.wordParts.flatMap((p) => (p.text === undefined ? [] : lemma(p.id)))], after: text(ex.whole) };
    case "whole-parts":
      return { before: [...text(ex.prompt), ...ex.options.flatMap((p) => (p.text === undefined ? [] : lemma(p.id)))], after: [] };
    case "listen-speak":
      return { before: [], after: text(ex.prompt) };
    case "tone-identify":
      return { before: [], after: text(ex.syllable) };
    case "listen-select":
    case "minimal-pair":
      // The written options are on the card; only what was said is heard.
      return { before: wordOptions(ex, ex.options), after: [] };
    case "story-choose":
      return { before: [], after: [] };
  }
};

/** Each lexicon text of the orthography, by its JSON, with the lexeme it spells (null where two spell it alike). */
const lexiconTexts = new WeakMap<CourseView, { readonly byObject: WeakMap<TaggedText, LexemeId | null>; readonly byJson: Map<string, LexemeId | null> }>();

const lexemeOfText = (course: CourseView, t: TaggedText): LexemeId | undefined => {
  let index = lexiconTexts.get(course);
  if (index === undefined) {
    const byObject = new WeakMap<TaggedText, LexemeId | null>();
    const byJson = new Map<string, LexemeId | null>();
    for (const lexeme of allLexemes(course)) {
      for (const form of lexeme.forms?.[course.orthography] ?? []) {
        const key = JSON.stringify(form);
        const id = byJson.has(key) && byJson.get(key) !== lexeme.id ? null : lexeme.id;
        byJson.set(key, id);
      }
    }
    for (const lexeme of allLexemes(course)) for (const form of lexeme.forms?.[course.orthography] ?? []) byObject.set(form, byJson.get(JSON.stringify(form)) ?? null);
    index = { byObject, byJson };
    lexiconTexts.set(course, index);
  }
  const found = index.byObject.has(t) ? index.byObject.get(t) : index.byJson.get(JSON.stringify(t));
  return found ?? undefined;
};

/** A displayed pair, its feature values copied (none: no `feats`). */
const pair = (lexeme: LexemeId, feats: Readonly<Record<string, string>> | undefined): DisplayedLexeme =>
  feats === undefined || Object.keys(feats).length === 0 ? { lexeme } : { lexeme, feats: { ...feats } };

/** The pairs things shown give, in order, each once (by `lexemeFormKey`), leaving out those already in `seen`. */
const pairsOf = (course: CourseView, shown: readonly Shown[], seen: Set<string> = new Set()): DisplayedLexeme[] => {
  const out: DisplayedLexeme[] = [];
  const add = (p: DisplayedLexeme): void => {
    const key = lexemeFormKey(p.lexeme, p.feats);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(p);
  };
  for (const s of shown) {
    if ("lemma" in s) add(pair(s.lemma, undefined));
    else if ("lexiconText" in s) {
      const id = s.lexiconText.orthography === course.orthography ? lexemeOfText(course, s.lexiconText) : undefined;
      if (id !== undefined) add(pair(id, undefined));
    } else if (s.text.orthography === course.orthography) {
      for (const token of s.text.tokens) if (token.kind === "lexical") for (const l of lexemesOf(token)) add(pair(l.lexeme, l.feats));
    }
  }
  return out;
};

/** What texts display (a story line, its speaker's name): each lexeme of their tokens in the orthography being learned, in its form, once. */
export const displayedIn = (course: CourseView, shown: readonly TaggedText[]): DisplayedLexeme[] => pairsOf(course, texts(shown));

/** What a card displays as it is presented, before its answer. */
export const displayedBefore = (course: CourseView, ex: Exercise): DisplayedLexeme[] => pairsOf(course, moments(ex).before);

/** What a card's answer adds to what it displayed before: the solution, and what the answered card reveals. None it showed already. */
export const displayedWith = (course: CourseView, ex: Exercise): DisplayedLexeme[] => {
  const { before, after } = moments(ex);
  const seen = new Set(pairsOf(course, before).map((p) => lexemeFormKey(p.lexeme, p.feats)));
  return pairsOf(course, after, seen);
};
