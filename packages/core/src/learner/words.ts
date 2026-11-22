/**
 * The words a learner has met in a course (the word list): every lexeme the course cites in the
 * orthography being learned (it has a spelling there), practised at least once. A word is
 * practised when any of its cards has a review: the language's facets (shared by every
 * orthography) or the script facets of this orthography (§6.3).
 *
 * A practised word is known once it has shown every skill the course asks of it (ADR 0100), and
 * is being learned until then. A feature value is asked skills of its own (ADR 0146: read off a
 * form, chosen), which sessions aim at as they do at a word's; it is no word, and the list leaves
 * it out until a learner is shown a rule's entry.
 *
 * A learner may turn a facet off for good: listening, in Preferences on their device (D41). No
 * session practises it then, so it is left out of the skills a word is asked for (`facetsOff`
 * here) and of what is due and slipping (`learnedWords`, the planner's `dueFacets`, the pace).
 * A break ("Can't listen now", an hour) turns nothing off: it only leaves exercises out of the
 * sessions planned meanwhile (the planner's `exclude`).
 *
 * Pure: the state is the replayed log, `now` the caller's clock.
 */
import type { PartId, SchemeId, TaggedText } from "@nabu/schema";
import { courseExclusions } from "../lesson/exclusions.ts";
import { glossOfPart, introducedAt, lexemeOf, lexemesInOrder, unitIndexOf, type CourseView } from "../lesson/course.ts";
import { kindOf } from "../lesson/lexemes.ts";
import type { Facet, Skill, TemplateId } from "../lesson/exercise.ts";
import { textMatcher } from "../lesson/search.ts";
import { TEMPLATES } from "../lesson/templates.ts";
import { chosenTraditionKey, readingTraditions } from "../lesson/traditions.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { cardKey, DESIRED_RETENTION, languageSkills, parseCardKey, retrievability, type LearnerState, type LetterMisses } from "./state.ts";
import { askable } from "./due.ts";

/**
 * A skill a part is known by (ADR 0100, 0146). A lexeme: recognizing it, producing it, hearing it.
 * A feature value: reading it off a form, choosing it.
 */
export type AskedSkill = "recognize" | "produce" | "listen" | "read-off" | "choose";

/** The skills a learner can turn off for good (D41): those that are facets of a lexeme. */
const SKILLS: readonly AskedSkill[] = ["recognize", "produce", "listen"];

/** No facet turned off: every function's default, which leaves everything as the course has it. */
export const NONE_OFF: ReadonlySet<Facet> = new Set<Facet>();

export interface WordSkill {
  readonly skill: AskedSkill;
  /** Shown: a first try right on a later day than the word was met, and not missed since. */
  readonly shown: boolean;
}

export interface LearnedWord {
  /** Its lexeme's id. */
  readonly lexeme: string;
  /** The unit that first teaches it. */
  readonly unit: string;
  /** Its lemma, as word cards show it, in the orthography being learned. */
  readonly form: TaggedText;
  /** Its meaning in the support language, where the course gives one. */
  readonly gloss: TaggedText | undefined;
  /**
   * How likely it is remembered now: the mean recall probability of its practised facets (0–1),
   * leaving out those turned off (D41) unless it was practised in nothing else.
   */
  readonly strength: number;
  /**
   * Whether it is due for review: a practised facet's recall has dropped below the target (the
   * planner's `dueFacets`, so the word list and the course page agree, W8), a facet a card the
   * course can make credits (`askable`): a review can clear it. A facet turned off for good is
   * never due (D41): no session can practise it.
   */
  readonly due: boolean;
  /** Reviews of all its facets together. */
  readonly reviews: number;
  /** Every skill the course asks of it shown (ADR 0100); until then it is being learned. */
  readonly known: boolean;
  /**
   * The skills the course asks of it, in the order recognize, produce, listen, each shown or not;
   * none the learner turned off for good (D41).
   */
  readonly skills: readonly WordSkill[];
}

/**
 * The skills a course asks of each of its parts (ADR 0100, 0146). Of a lexeme: recognizing it;
 * producing it where a sentence uses it (a word is produced by typing a sentence); and hearing it
 * where the course plans listening (its facets, ADR 0071; a good voice, ADR 0091) and the word can
 * be heard, in its own clip or in a sentence's. Of a feature value a sentence teaches: reading it
 * off a form, and choosing it where a sentence that has it can be typed. Of anything else (a rule,
 * a letter, something of a lexeme), none. A skill the learner turned off for good is asked of no
 * word (D41).
 */
const skillsOf = (course: CourseView, off: ReadonlySet<AskedSkill>): ((part: string) => readonly AskedSkill[]) => {
  const excluded = courseExclusions(course);
  const lexemes = new Set(course.lexicon.lexemes.map((l) => l.id));
  const plans = (skill: "recognize" | "produce" | "listen"): boolean => !off.has(skill) && (Object.keys(TEMPLATES) as TemplateId[]).some((t) => TEMPLATES[t].facet === skill && !excluded.has(t));
  const written = new Set<string>();
  const heard = new Set<string>(Object.keys(course.audio));
  for (const unit of course.units)
    for (const s of unit.sentences) {
      if (s.forms[course.orthography] === undefined) continue;
      for (const part of s.parts) written.add(part);
      if (course.audio[s.id] !== undefined) for (const part of s.parts) heard.add(part);
    }
  const recognize = plans("recognize");
  const produce = plans("produce");
  const listen = plans("listen");
  return (part) => {
    if (lexemes.has(part)) return [...(recognize ? (["recognize"] as const) : []), ...(produce && written.has(part) ? (["produce"] as const) : []), ...(listen && heard.has(part) ? (["listen"] as const) : [])];
    if (kindOf(part) === "feature" && !part.includes("|") && written.has(part)) return [...(recognize ? (["read-off"] as const) : []), ...(produce ? (["choose"] as const) : [])];
    return [];
  };
};

/** Per course, per set of skills turned off (as their names, in order: "" for none). */
const asked = new WeakMap<CourseView, Map<string, (part: string) => readonly AskedSkill[]>>();

/**
 * The same, memoised per course and per skills turned off: planning asks it on every plan. Only the
 * skills among `facetsOff` count here (a facet such as speak is no skill a word is known by).
 */
export const skillsAsked = (course: CourseView, facetsOff: ReadonlySet<Facet> = NONE_OFF): ((part: string) => readonly AskedSkill[]) => {
  const off = SKILLS.filter((s) => (facetsOff as ReadonlySet<string>).has(s));
  const key = off.join(" ");
  let byOff = asked.get(course);
  if (byOff === undefined) {
    byOff = new Map();
    asked.set(course, byOff);
  }
  const cached = byOff.get(key);
  if (cached !== undefined) return cached;
  const made = skillsOf(course, new Set(off));
  byOff.set(key, made);
  return made;
};

interface Practised {
  readonly key: string;
  readonly skill: Skill;
  readonly reading: string | undefined;
  readonly reps: number;
}

/**
 * Every practised word of the course, in the order the course teaches them; due where
 * a facet's recall at `now` is below `desired` (the learner's target retention) and a card the
 * course can make credits it (`dueFacets`). `facetsOff`: the facets the learner turned off for good
 * (D41), asked of no word and never due; `reading`: the tradition the learner reads in (ADR 0138),
 * the only one whose readings are due.
 */
export const learnedWords = (
  course: CourseView,
  state: LearnerState,
  now: string,
  desired: number = DESIRED_RETENTION,
  facetsOff: ReadonlySet<Facet> = NONE_OFF,
  reading?: SchemeId | false,
): readonly LearnedWord[] => {
  const orthography = course.orthography;
  const asked = skillsAsked(course, facetsOff);
  const can = askable(course, facetsOff, reading);
  // One pass over the cards, by part: the language's skills, and the script facets of this orthography.
  const practised = new Map<string, Practised[]>();
  for (const [key, card] of Object.entries(state.cards)) {
    const ref = parseCardKey(key);
    if (card.reps === 0 || (ref.orthography !== undefined && ref.orthography !== orthography)) continue;
    practised.set(ref.part, [...(practised.get(ref.part) ?? []), { key, skill: ref.skill, reading: ref.reading, reps: card.reps }]);
  }
  const units = unitIndexOf(course);
  const out: LearnedWord[] = [];
  for (const lexeme of lexemesInOrder(course)) {
    const skillsPractised = practised.get(lexeme.id);
    const form = lexeme.forms?.[orthography]?.[0];
    if (skillsPractised === undefined || form === undefined) continue;
    const recallOf = (of: readonly Practised[]): readonly number[] => of.map((f) => retrievability(state, lexeme.id, f.skill, orthography, now, f.reading));
    // What counts is the facets not turned off (D41). A word practised in nothing else is still
    // listed, with the strength it has, and is never due.
    const kept = skillsPractised.filter((f) => !(facetsOff as ReadonlySet<string>).has(f.skill));
    const counted = recallOf(kept);
    const recall = counted.length > 0 ? counted : recallOf(skillsPractised);
    const strength = recall.reduce((sum, r) => sum + r, 0) / recall.length;
    const skills = asked(lexeme.id).map((skill) => ({ skill, shown: state.shown[cardKey(lexeme.id, skill, orthography)] !== undefined }));
    out.push({
      lexeme: lexeme.id,
      unit: course.units[units.get(lexeme.id) ?? -1]?.id ?? "",
      form,
      gloss: lexeme.gloss?.[course.supportKey],
      strength,
      due: kept.some((f, i) => (counted[i] ?? 1) < desired && can(f.key)),
      reviews: skillsPractised.reduce((sum, f) => sum + f.reps, 0),
      known: skills.length > 0 && skills.every((s) => s.shown),
      skills,
    });
  }
  return out;
};

/** How many of the words are known, how many still being learned, and how many are due for review. */
export const wordCounts = (words: readonly LearnedWord[]): { readonly known: number; readonly learning: number; readonly due: number } => {
  const known = words.filter((w) => w.known).length;
  return { known, learning: words.length - known, due: words.filter((w) => w.due).length };
};

export type WordOrder = "course" | "alphabetical" | "weakest";

/**
 * The words in an order: the course's; alphabetical by the target language's own collation
 * (Intl.Collator for the form's tag, never code points); or weakest first (due words, then by
 * strength, course order breaking ties).
 */
export const orderWords = (words: readonly LearnedWord[], order: WordOrder): readonly LearnedWord[] => {
  if (order === "course") return words;
  const position = new Map(words.map((w, i) => [w.lexeme, i]));
  const tie = (a: LearnedWord, b: LearnedWord): number => (position.get(a.lexeme) ?? 0) - (position.get(b.lexeme) ?? 0);
  if (order === "weakest") return [...words].sort((a, b) => (a.due === b.due ? a.strength - b.strength || tie(a, b) : a.due ? -1 : 1));
  const lang = words[0]?.form.lang;
  const collator = new Intl.Collator(lang, { sensitivity: "base" });
  return [...words].sort((a, b) => collator.compare(surfaceOf(a.form), surfaceOf(b.form)) || tie(a, b));
};

/**
 * Whether a word matches what the learner typed (`textMatcher`): in its form as the orthography
 * compares letters (normalized, vowel marks stripped, variants keyed, case folded: سلام finds سَلام); in
 * its readings, with or without tone digits and marks (zousan and zou2 find 早晨 zou2 san4); or in its
 * gloss, case-folded in the gloss's own language. An empty query matches every word.
 */
export const wordMatcher = (course: CourseView, query: string): ((word: LearnedWord) => boolean) => {
  const matches = textMatcher(course, query);
  return (word) => matches({ target: [word.form], support: word.gloss === undefined ? [] : [word.gloss] });
};

/**
 * Whether a rule's or a form's entry (`ruleEntries`) matches what the learner typed, as the word
 * list's search box finds words (`textMatcher`): by its label, case-folded in the label's own
 * language, or by its id (rule:used-to, feature:Tense=Past). An empty query matches every entry.
 */
export const ruleMatcher = (course: CourseView, query: string): ((entry: RuleEntry) => boolean) => {
  const matches = textMatcher(course, query);
  return (entry) => matches({ target: [], support: entry.label === undefined ? [] : [entry.label], ids: [entry.part] });
};

/**
 * The words whose reading the learner has shown in the course's orthography (ADR 0131): a reading
 * card (a word read in its sentence, or on its own) right on a first try, on a later day than the
 * word was met, and not missed since; where the orthography is read in several traditions, in the
 * one the learner reads in (`reading`, ADR 0138). Where a reading layer fades (`fade: by-facet`)
 * and the learner shows it on new words only, these words go without it.
 */
export const readingsShown = (course: CourseView, state: LearnerState, reading?: SchemeId | false): ReadonlySet<string> => {
  const out = new Set<string>();
  const tradition = chosenTraditionKey(course, reading);
  for (const key of Object.keys(state.shown)) {
    const ref = parseCardKey(key);
    if (ref.skill === "read-script" && ref.orthography === course.orthography && ref.reading === tradition) out.add(ref.part);
  }
  return out;
};

/**
 * One thing asked of a word (ADR 0146, 0148), and whether the learner has shown it: `shown` by the
 * fold's rule (a first try right on a later day than the word was met, not missed since);
 * `not-shown` while it is asked and not yet shown; `not-asked` where no card asks it yet (a
 * lexeme's own feature, `lexeme:mano|Gender`, is given on every card today).
 */
export type PartStatus = "shown" | "not-shown" | "not-asked";

export type WordPart =
  /** A skill the course asks of the word (`skillsAsked`). */
  | { readonly kind: "skill"; readonly skill: AskedSkill; readonly status: PartStatus }
  /** A lexical feature of its own that no default gives (the bundle lexeme's `parts`: la mano). */
  | { readonly kind: "feature"; readonly part: PartId; readonly status: PartStatus }
  /** Its spelling leftover in an orthography (`leftovers.spelling`): shown by a write-script card there. */
  | { readonly kind: "spelling"; readonly orthography: string; readonly status: PartStatus }
  /** Its reading leftover in a scheme (`leftovers.reading`): shown by a read-script card in that tradition. */
  | { readonly kind: "reading"; readonly orthography: string; readonly scheme: SchemeId; readonly status: PartStatus };

/**
 * Everything asked of a learned word, each with whether it is shown (ADR 0146, 0148; the word
 * list's entry): the skills the course asks of it, its own features that are parts, its spelling
 * leftover per orthography and its reading leftover per scheme. Empty for an unknown lexeme.
 * `facetsOff`: the skills turned off for good (D41), asked of no word.
 */
export const partsOf = (course: CourseView, state: LearnerState, lexemeId: string, facetsOff: ReadonlySet<Facet> = NONE_OFF): readonly WordPart[] => {
  const lexeme = lexemeOf(course, lexemeId);
  if (lexeme === undefined) return [];
  const orthography = course.orthography;
  const status = (key: string): PartStatus => (state.shown[key] !== undefined ? "shown" : "not-shown");
  const skills = skillsAsked(course, facetsOff)(lexemeId).map((skill): WordPart => ({ kind: "skill", skill, status: status(cardKey(lexemeId, skill, orthography)) }));
  // A part of the lexeme is asked once a card has rated it: today none does, so each is given.
  const rated = (part: string): readonly string[] => Object.keys(state.cards).filter((key) => parseCardKey(key).part === part);
  const features = (lexeme.parts ?? [])
    .filter((part) => part.startsWith(`${lexemeId}|`))
    .map((part): WordPart => {
      const keys = rated(part);
      return { kind: "feature", part, status: keys.length === 0 ? "not-asked" : keys.some((k) => state.shown[k] !== undefined) ? "shown" : "not-shown" };
    });
  const spelling = ((lexeme.leftovers?.spelling ?? []) as readonly string[]).map((orth): WordPart => ({ kind: "spelling", orthography: orth, status: status(cardKey(lexemeId, "write-script", orth)) }));
  const reading = (lexeme.leftovers?.reading ?? []).map(({ orthography: orth, scheme }): WordPart => {
    // A read-script card names its tradition where the orthography is read in several (ADR 0138).
    const tradition = readingTraditions(course, orth).length > 1 ? scheme : undefined;
    return { kind: "reading", orthography: orth, scheme, status: status(cardKey(lexemeId, "read-script", orth, tradition)) };
  });
  return [...skills, ...features, ...spelling, ...reading];
};

/** A rule or a taught feature value the learner has met (ADR 0146): its entry in the word list. */
export interface RuleEntry {
  readonly part: PartId;
  readonly kind: "rule" | "feature";
  /** What the course calls it, in the support language: a rule's gloss, a feature value's label (`labelOf`). */
  readonly label: TaggedText | undefined;
  /**
   * The skills asked of it, each shown or not: those `skillsAsked` asks (a feature value read off and
   * chosen), and of a rule, which no skill is asked of yet, those its cards have practised.
   */
  readonly skills: readonly { readonly skill: Skill; readonly shown: boolean }[];
  /** How many of them are shown. */
  readonly shown: number;
}

/**
 * Every rule and every feature value the course teaches that the learner has met (the fold's
 * `met`), in the order the course introduces them, with its label and how many of the skills asked
 * of it are shown ("3 of 5").
 */
export const ruleEntries = (course: CourseView, state: LearnerState, facetsOff: ReadonlySet<Facet> = NONE_OFF): readonly RuleEntry[] => {
  const order = introducedAt(course);
  const asked = skillsAsked(course, facetsOff);
  const off = facetsOff as ReadonlySet<string>;
  const practised = new Map<string, Set<Skill>>();
  for (const [key, card] of Object.entries(state.cards)) {
    const ref = parseCardKey(key);
    if (card.reps > 0) (practised.get(ref.part) ?? practised.set(ref.part, new Set()).get(ref.part))?.add(ref.skill);
  }
  const out: RuleEntry[] = [];
  for (const part of Object.keys(state.met)) {
    const kind = kindOf(part);
    if ((kind !== "rule" && kind !== "feature") || part.includes("|") || !order.has(part)) continue;
    const own: readonly Skill[] = asked(part);
    const skills: readonly Skill[] =
      kind === "rule" ? [...new Set([...own, ...languageSkills(part).filter((k) => practised.get(part)?.has(k) === true && !off.has(k))])] : own;
    const shown = skills.map((skill) => ({ skill, shown: state.shown[cardKey(part, skill, course.orthography)] !== undefined }));
    out.push({ part, kind, label: glossOfPart(course, part), skills: shown, shown: shown.filter((k) => k.shown).length });
  }
  return out.sort((a, b) => (order.get(a.part) ?? 0) - (order.get(b.part) ?? 0) || (a.part < b.part ? -1 : a.part > b.part ? 1 : 0));
};

/** A correspondence the learner's answers missed (ADR 0148): its id, how often, when last. */
export interface MissedLetter extends LetterMisses {
  readonly id: string;
}

/** The correspondences the learner's answers missed (the fold's `letters`), most missed first, the latest first on a tie. */
export const missedLetters = (state: LearnerState): readonly MissedLetter[] =>
  Object.entries(state.letters)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => b.missed - a.missed || (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) || (a.id < b.id ? -1 : 1));
