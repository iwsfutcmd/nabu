/**
 * The Phase 3 template catalog (gameplan §8.1–8.2). Each template is data plus
 * pure functions: `make` instantiates it from a sentence or lexeme (undefined when
 * not eligible), `grade` turns a response into an outcome. Randomness comes
 * from the injected seeded Rng only.
 */
import type { BundleLabel, BundleLexeme, BundleSentence, PartId, Persons, Question, SchemeId, Skill, TaggedText, Token, UdFeatures } from "@nabu/schema";
import { literalAccept } from "../accept/notation.ts";
import { glossUnits } from "../match/gloss.ts";
import { compileAcceptSet, grade, type CompiledAcceptSet } from "../match/grade.ts";
import { readingProjection, readingTag } from "../profile/schemes.ts";
import { attestedMarks, gradeReading, gradeVowels, hasVowelMarks, letterVariants, readingFeatures, schemeSpelling, toneVariants, transcribable, typedByProfile, vocalizationVariants, withoutMarks, type OptionalBefore, type VowelMarks } from "../match/pronounce.ts";
import { graphemes } from "../text/graphemes.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { tilesOf } from "./tiles.ts";
import { courseHomophones, otherSpellings } from "./spellings.ts";
import { readingTradition, traditionKey } from "./traditions.ts";
import { allSentences, labelOf, lexemesById, lexemesInOrder, marked, profileOf, spellingsIn, unitIndexOf, type CourseView, type Grader } from "./course.ts";
import { askedOfToken, baseIdOf, baseOf, bound, effectiveFeats, featureId, formPartsOf, formSignature, kindOf, lexemeIdsOf, lexemesOf, sameKind, sentencePersons } from "./lexemes.ts";
import type {
  CharRead,
  ChooseTranslation,
  CompleteTranslation,
  Exercise,
  Facet,
  GapFill,
  ListenSelect,
  ListenSpeak,
  ListenTap,
  ListenType,
  MatchPairs,
  MinimalPair,
  Outcome,
  PartsWhole,
  ReadingDisambiguation,
  SkillRef,
  Transcribe,
  Vocalize,
  VocalizeBuild,
  OptionalBeforeRule,
  Response,
  SelectImage,
  Speak,
  SpeakScored,
  TemplateId,
  ToneIdentify,
  TranslateTap,
  TranslateType,
  WholeParts,
  WordPart,
} from "./exercise.ts";
import { isCorrect } from "./exercise.ts";
import type { Rng } from "./rng.ts";
import { gradeSpeech, toneSystemOf } from "../speech/score.ts";
import { expectedSyllables } from "../speech/tone.ts";

/**
 * Everything about a template in one place (C11): what it exercises, how it is answered, and what the
 * planner and the performance model need to know of it.
 */
export interface TemplateInfo {
  readonly facet: Facet;
  readonly modality: {
    readonly audioOut: boolean;
    readonly mic: boolean;
    readonly input: "choice" | "pairs" | "tiles" | "text" | "voice";
  };
  /**
   * The performance model's cold-start difficulty (§9.3): choosing among three is easier than
   * building from tiles, which is easier than typing; hearing is harder than reading the same item.
   * Tuned on the 30-day simulation (test/simulation.test.ts), to be replaced by fitted values.
   */
  readonly prior: number;
  /** At most this many a session (§9.4 variety); three where unset. */
  readonly perSession?: number;
  /** It can present a word for the first time: a new lexeme is recognized before it is produced or read. */
  readonly presents?: true;
  /** The learner rates it themselves (tier-0 speaking): no verdict, never a filler (P5, L6). */
  readonly selfRated?: true;
  /** Explain My Answer covers it (§13.3): a translation, typed or built from tiles. */
  readonly explained?: true;
  /**
   * Its options are words of the course, in the orthography being learned: the feedback on a wrong
   * one says what it means (P3, ADR 0121). Not a word's vocalizations or readings.
   */
  readonly wordOptions?: true;
}

export const TEMPLATES: Readonly<Record<TemplateId, TemplateInfo>> = {
  "select-image": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -1.6, perSession: 2, presents: true, wordOptions: true },
  "match-pairs": { facet: "recognize", modality: { audioOut: false, mic: false, input: "pairs" }, prior: -1.4, perSession: 1, presents: true },
  "choose-translation": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -1.0, presents: true },
  "translate-tap.l2-l1": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" }, prior: -0.4, presents: true, explained: true },
  // The tiles are handed to the learner, so no production credit (§8.5).
  "translate-tap.l1-l2": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" }, prior: 0.0, presents: true, explained: true },
  "translate-type.l1-l2": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" }, prior: 1.0, explained: true },
  "complete-translation": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" }, prior: 0.6 },
  // Picking the missing word among options is recognizing it, as tiles are (D4 in the 2026-11 review,
  // ADR 0100): producing a word means supplying it.
  "spelling-choice": { facet: "write-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: 0, perSession: 1 },
  "gap-fill": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.2, wordOptions: true },
  "char-read": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.4 },
  "reading-feature": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: 0, perSession: 1 },
  "reading-disambiguation": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: 0.4 },
  // A word's pronunciation as its script leaves it out (ADR 0054). Its vowel marks, chosen among other
  // vocalizations of its letters, are like a reading among a few (ADR 0098); its reading typed is all
  // or nothing, every tone counting.
  vocalize: { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.4, perSession: 1 },
  // Marks put on a word's letters (ADR 0137): harder than choosing them, easier than typing them.
  "vocalize-build": { facet: "read-script", modality: { audioOut: false, mic: false, input: "text" }, prior: 0.4, perSession: 1 },
  transcribe: { facet: "read-script", modality: { audioOut: false, mic: false, input: "text" }, prior: 0.8, perSession: 1 },
  // Self-rated speaking checks nothing (P5): one card a session, never a filler (L6).
  "speak.tier-0": { facet: "speak", modality: { audioOut: false, mic: true, input: "voice" }, prior: -1.5, perSession: 1, selfRated: true },
  // Phase 9: scored speaking (tiers 1–3) and hearing tones.
  // Scored speaking: saying it well is harder than rating yourself; repeating a clip is a little harder
  // again (no text). Naming one of six tones is hard for beginners.
  speak: { facet: "speak", modality: { audioOut: false, mic: true, input: "voice" }, prior: 0.2, perSession: 2 },
  "listen-speak": { facet: "speak", modality: { audioOut: true, mic: true, input: "voice" }, prior: 0.4, perSession: 2 },
  "tone-identify": { facet: "listen", modality: { audioOut: true, mic: false, input: "choice" }, prior: 0.6 },
  // Hearing is harder than reading the same item: the listening priors sit above their reading twins.
  "listen-tap": { facet: "listen", modality: { audioOut: true, mic: false, input: "tiles" }, prior: 0.3, perSession: 2 },
  "listen-type": { facet: "listen", modality: { audioOut: true, mic: false, input: "text" }, prior: 1.2, perSession: 2 },
  "listen-select": { facet: "listen", modality: { audioOut: true, mic: false, input: "choice" }, prior: -0.6, perSession: 2, wordOptions: true },
  "minimal-pair": { facet: "listen", modality: { audioOut: true, mic: false, input: "choice" }, prior: -0.2, perSession: 1, wordOptions: true },
  // Stories (Phase 6): reading comprehension exercises recognition of the line's words.
  "story-choose": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -1.0 },
  "story-complete": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.6, wordOptions: true },
  "story-arrange": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" }, prior: -0.2 },
  // Script tracks (ADR 0088): built only for script nodes (lesson/script.ts), never for sentences.
  "letter-read": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: -1.4, perSession: 4, presents: true },
  "letter-pairs": { facet: "read-script", modality: { audioOut: false, mic: false, input: "pairs" }, prior: -1.4, perSession: 1, presents: true },
  "word-read": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.8, presents: true },
  "word-write": { facet: "write-script", modality: { audioOut: false, mic: false, input: "tiles" }, prior: -0.2 },
  // A word and its parts (ADR 0152). Built from them and typed: its own word given and its forms
  // named, so midway between a blank chosen (gap-fill) and a blank typed (complete-translation).
  // Taken apart: several picks among a few, as hard as a sentence arranged from tiles. Guesses, until
  // answers say otherwise (REVIEW on real logs). One of each a session.
  "parts-whole": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" }, prior: 0.2, perSession: 1 },
  "whole-parts": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" }, prior: 0.0, perSession: 1 },
};

/** Templates that play audio: "can't listen now" leaves them out (§10, §11.5). */
export const LISTENING: ReadonlySet<TemplateId> = new Set(
  (Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].modality.audioOut),
);

/** Templates that need the microphone: "can't speak now" leaves them out. */
export const SPEAKING: ReadonlySet<TemplateId> = new Set((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].modality.mic));

/**
 * The skill a card of a template exercises a part by (ADR 0146). A lexeme, a rule and a letter: the
 * template's facet. A feature value: chosen where the card is typed, said or written, read off a
 * form where it is read or heard.
 */
export const skillOf = (template: TemplateId, part: PartId): Skill => {
  const facet = TEMPLATES[template].facet;
  if (kindOf(part) !== "feature") return facet;
  return facet === "produce" || facet === "speak" || facet === "write-script" ? "choose" : "read-off";
};

/**
 * Whether a card of a template can give evidence of a part. Something of a lexeme
 * (lexeme:mano|Gender) is asked by no card yet: it is listed, and given. A card about a script
 * reads and writes letters: it shows nothing of a feature value.
 */
export const asksOf = (template: TemplateId, part: PartId): boolean => {
  if (part.includes("|")) return false;
  const facet = TEMPLATES[template].facet;
  return !(kindOf(part) === "feature" && (facet === "read-script" || facet === "write-script"));
};

/** Which parts an instance exercises, each by which skill (§8.5 credit assignment). */
export const skills = (ex: Exercise): readonly SkillRef[] => ex.parts.filter((part) => asksOf(ex.template, part)).map((part) => ({ part, skill: skillOf(ex.template, part) }));

// ------------------------------------------------------------------------------------ context

export interface MakeContext {
  readonly course: CourseView;
  readonly rng: Rng;
  /** What the current node introduces (lexemes, feature values, rules, letters): new words get the recognition templates first. */
  readonly introduced: readonly string[];
  /**
   * Words the session wants typed (ADR 0101): a sentence's blank is one of them where it has one,
   * before a word the node introduces.
   */
  readonly focus?: ReadonlySet<string> | undefined;
  /**
   * A mistake's word (its parts, sorted, as its answer credited them): a card about one word of its
   * sentence asks that word again, before any other.
   */
  readonly ask?: readonly string[] | undefined;
  /**
   * What a fill-in mistake asked of its word (ADR 0132): which lexeme (`ask` is its base) or which
   * form (`ask` is what its form credits). It is asked again as the same question. Absent for other
   * cards (`ask` is the word's lexemes).
   */
  readonly asks?: Question | undefined;
  /**
   * The reading tradition the learner reads in (ADR 0138: the ruby layer they last chose), where
   * the orthography has several: reading cards ask it. Absent or not one of them: the first.
   */
  readonly reading?: SchemeId | undefined;
}

const partSets = new WeakMap<BundleSentence, ReadonlySet<PartId>>();

/** A sentence's parts as a set: what its tokens' feature values are checked against (those the course teaches by then). */
const taughtIn = (s: BundleSentence): ReadonlySet<PartId> => {
  let set = partSets.get(s);
  if (set === undefined) {
    set = new Set(s.parts);
    partSets.set(s, set);
  }
  return set;
};

/**
 * Whether a token is the word a mistake asks again (`MakeContext.ask`): exactly its lexemes, or, for
 * a fill-in's mistake (`MakeContext.asks`), exactly what that question credits of it in its sentence.
 */
const asked = (ctx: MakeContext, s: BundleSentence, token: Token): boolean => {
  if (ctx.ask === undefined) return false;
  const parts = [...new Set((ctx.asks === undefined ? lexemeIdsOf(token) : askedOfToken(token, ctx.asks, taughtIn(s))).map(String))].sort();
  return parts.length > 0 && parts.length === ctx.ask.length && parts.every((part, i) => part === ctx.ask?.[i]);
};

/** Whether a token's base is a lexeme the current node introduces. */
const introduces = (ctx: MakeContext, token: Token): boolean => {
  const base = baseIdOf(token);
  return base !== undefined && ctx.introduced.includes(base);
};

const id = (template: TemplateId, item: string): string => `${template}:${item}`;

const words = (text: TaggedText): readonly number[] =>
  text.tokens.flatMap((t, i) => (t.kind === "lexical" || t.kind === "number" ? [i] : []));

/**
 * " " where the orthography spaces its words, "" where it does not (Han): by the profile, not by
 * the text, whose words may be joined by a hyphen or a maqaf alone (מִן־הַגָּן), which answers
 * may write as a space.
 */
const joinerOf = (course: CourseView, text: TaggedText): string =>
  profileOf(course, text.orthography).unitKind === "token" || text.tokens.some((t) => t.kind === "space") ? " " : "";

/** What separates each tile of a text from the next in it (a space, a hyphen, a maqaf): the tokens no tile holds. */
const separatorsOf = (text: TaggedText): readonly string[] => {
  const separators: string[] = [];
  let current: number | undefined;
  let between = "";
  for (const t of text.tokens) {
    if (t.tileGroup === undefined) {
      between += t.surface;
      continue;
    }
    if (current !== undefined && t.tileGroup !== current) separators.push(between);
    current = t.tileGroup;
    between = "";
  }
  return separators;
};

/**
 * Placed tiles as text. Two tiles that follow each other as they do in the answer keep what
 * separates them there (מִן־הַגָּן, Bye-bye), so the answer's own order is its own text; tiles in
 * another order take the joiner.
 */
export const tilesText = (
  ex: { readonly tiles: readonly TaggedText[]; readonly solution: readonly number[]; readonly joiner: string; readonly canonical: TaggedText },
  order: readonly number[],
): string => {
  const separators = separatorsOf(ex.canonical);
  const rank = new Map(ex.solution.map((tile, k) => [tile, k]));
  return order
    .map((tile, i) => {
      const text = surfaceOf(ex.tiles[tile] as TaggedText);
      if (i === 0) return text;
      const before = rank.get(order[i - 1] as number);
      const here = rank.get(tile);
      return (before !== undefined && here === before + 1 ? (separators[before] ?? ex.joiner) : ex.joiner) + text;
    })
    .join("");
};

const slice = (text: TaggedText, from: number, to: number): TaggedText => ({ ...text, tokens: text.tokens.slice(from, to) });

const single = (text: TaggedText, token: Token): TaggedText => {
  const { tileGroup: _tile, ...rest } = token;
  return { ...text, tokens: [rest] };
};

/** One token of a text as text of its own, readings and all (an option, a blank; a word on the Data page). */
export const tokenText = single;

/** Texts' comparison keys, per course: distractor picking asks for the same texts again and again. */
const keys = new WeakMap<CourseView, WeakMap<TaggedText, string>>();

/** Normalized, folded, mark-insensitive comparison key: two options must never collide on it. */
const keyOf = (course: CourseView, text: TaggedText): string => {
  let byText = keys.get(course);
  if (byText === undefined) {
    byText = new WeakMap();
    keys.set(course, byText);
  }
  let key = byText.get(text);
  if (key === undefined) {
    key = glossUnits(profileOf(course, text.orthography), surfaceOf(text)).join(" ");
    byText.set(text, key);
  }
  return key;
};

const formOf = (course: CourseView, s: BundleSentence): { readonly text: TaggedText; readonly reverse?: string | undefined } | undefined =>
  s.forms[course.orthography];

const translationOf = (course: CourseView, s: BundleSentence): { readonly text: TaggedText; readonly accept: string } | undefined =>
  s.translations[course.supportKey];

/** The sentence's speaker and addressee, for an exercise that writes it in the target language. */
const personsOf = (s: BundleSentence): { readonly persons?: Persons } => {
  const persons = sentencePersons(s);
  return persons === undefined ? {} : { persons };
};

const producible = (course: CourseView, s: BundleSentence): string | undefined => (s.production ? formOf(course, s)?.reverse : undefined);

/** Up to `n` distractors from `pool`, none colliding with `taken` or each other (by key). */
const pickDistinct = (ctx: MakeContext, pool: readonly TaggedText[], taken: readonly TaggedText[], n: number): readonly TaggedText[] => {
  const seen = new Set(taken.map((t) => keyOf(ctx.course, t)));
  const out: TaggedText[] = [];
  for (const candidate of ctx.rng.shuffle(pool)) {
    if (out.length === n) break;
    const key = keyOf(ctx.course, candidate);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
};

/**
 * Up to `n` distractors from `pool`, the best-matched first (P2): `score` ranks candidates, ties in a
 * random order, and none collides with `taken` or each other (by key).
 */
const pickRanked = (ctx: MakeContext, pool: readonly TaggedText[], taken: readonly TaggedText[], n: number, score: (t: TaggedText) => number): readonly TaggedText[] => {
  const shuffled = ctx.rng.shuffle(pool).map((t) => ({ t, s: score(t) }));
  return pickDistinctInOrder(ctx, [...shuffled].sort((a, b) => b.s - a.s).map((x) => x.t), taken, n);
};

/** Up to `n` of `ordered`, in that order, none colliding with `taken` or each other (by key). */
const pickDistinctInOrder = (ctx: MakeContext, ordered: readonly TaggedText[], taken: readonly TaggedText[], n: number): readonly TaggedText[] => {
  const seen = new Set(taken.map((t) => keyOf(ctx.course, t)));
  const out: TaggedText[] = [];
  for (const candidate of ordered) {
    if (out.length === n) break;
    const key = keyOf(ctx.course, candidate);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
};

/** A text's last punctuation (its sentence type: "?", "!", "."), or "" if it ends without one. */
const finalPunct = (text: TaggedText): string => {
  const last = [...text.tokens].reverse().find((t) => t.kind !== "space");
  return last?.kind === "punct" ? last.surface : "";
};

/**
 * Words as their language lowercases them, per course and language. Ranking distractors asks this
 * of every word in the earlier units for each card a plan considers, and lowercasing for a tag with
 * a script (es-Latn) takes V8 microseconds a call: most of a review's planning with a year of
 * history, before it was remembered.
 */
const lowered = new WeakMap<CourseView, Map<string, Map<string, string>>>();

const lowerIn = (course: CourseView, lang: string, surface: string): string => {
  let byLang = lowered.get(course);
  if (byLang === undefined) {
    byLang = new Map();
    lowered.set(course, byLang);
  }
  let bySurface = byLang.get(lang);
  if (bySurface === undefined) {
    bySurface = new Map();
    byLang.set(lang, bySurface);
  }
  let lower = bySurface.get(surface);
  if (lower === undefined) {
    lower = surface.toLocaleLowerCase(lang);
    bySurface.set(surface, lower);
  }
  return lower;
};

const wordSurfaces = (course: CourseView, text: TaggedText): readonly string[] => text.tokens.filter((t) => t.kind === "lexical").map((t) => lowerIn(course, text.lang, t.surface));

/**
 * How well a distractor sentence matches the answer's shape (P2): the same final punctuation, about
 * as many words, and words in common, so neither punctuation nor length gives the answer away.
 */
const shapeScore = (course: CourseView, answer: TaggedText): ((t: TaggedText) => number) => {
  const end = finalPunct(answer);
  const words = wordSurfaces(course, answer);
  const own = new Set(words);
  return (t) => {
    const theirs = wordSurfaces(course, t);
    const shared = theirs.filter((w) => own.has(w)).length;
    return (finalPunct(t) === end ? 3 : 0) - Math.min(3, Math.abs(theirs.length - words.length)) * 0.5 + Math.min(2, shared) * 0.5;
  };
};

/**
 * Whether a text's first word has a capital (in its own language's case; never in a caseless script):
 * what a sentence-initial word, a name or a sentence's first tile shows.
 */
const capitalized = (course: CourseView, text: TaggedText): boolean => {
  const word = text.tokens.find((t) => t.kind === "lexical")?.surface ?? "";
  return word !== lowerIn(course, text.lang, word);
};

/** Places `answer` among `others` at a random position. */
const withAnswer = <T>(ctx: MakeContext, answer: T, others: readonly T[]): { readonly options: readonly T[]; readonly answer: number } => {
  const at = ctx.rng.int(others.length + 1);
  return { options: [...others.slice(0, at), answer, ...others.slice(at)], answer: at };
};

/**
 * Each sentence's unit, and the unit that first teaches each lexeme, rule, feature value and letter,
 * by position in the course (built once per course).
 */
const unitIndex = new WeakMap<CourseView, ReadonlyMap<string, number>>();

const unitOf = (course: CourseView, id: string): number => {
  let index = unitIndex.get(course);
  if (index === undefined) {
    const built = new Map<string, number>(unitIndexOf(course));
    for (const [i, u] of course.units.entries()) {
      for (const s of u.sentences) if (!built.has(s.id)) built.set(s.id, i);
    }
    index = built;
    unitIndex.set(course, index);
  }
  return index.get(id) ?? course.units.length;
};

/**
 * Distractors come from the item's own unit or an earlier one, so a word bank in the first lesson
 * never offers a word from the tenth unit (until the confusion log of §8.1 can choose them).
 */
const known = (course: CourseView, item: string): ((other: string) => boolean) => {
  const at = unitOf(course, item);
  return (other) => unitOf(course, other) <= at;
};

/** The sentences a distractor may come from, by the unit they reach up to (built once per course and unit). */
const sentencesUpTo = new WeakMap<CourseView, Map<number, readonly BundleSentence[]>>();

/** The sentences of unit `at` and earlier ones, drills left out, that have the course's orthography. */
const sentencesThrough = (course: CourseView, at: number): readonly BundleSentence[] => {
  let byUnit = sentencesUpTo.get(course);
  if (byUnit === undefined) {
    byUnit = new Map();
    sentencesUpTo.set(course, byUnit);
  }
  let pool = byUnit.get(at);
  if (pool === undefined) {
    pool = allSentences(course).filter((o) => !o.id.startsWith("drill.") && unitOf(course, o.id) <= at && formOf(course, o) !== undefined);
    byUnit.set(at, pool);
  }
  return pool;
};

const otherSentences = (ctx: MakeContext, s: BundleSentence): readonly BundleSentence[] => sentencesThrough(ctx.course, unitOf(ctx.course, s.id)).filter((o) => o.id !== s.id);

/** The other lexemes of a lexeme's unit and earlier ones, in the order the course teaches them. */
const otherLexemes = (ctx: MakeContext, lexeme: BundleLexeme): readonly BundleLexeme[] => {
  const before = known(ctx.course, lexeme.id);
  return lexemesInOrder(ctx.course).filter((k) => k.id !== lexeme.id && before(k.id));
};

// ------------------------------------------------------------------------------------ lexeme templates

const pictured = (ctx: MakeContext, lexeme: BundleLexeme): boolean =>
  lexeme.image !== undefined && (lexeme.forms?.[ctx.course.orthography]?.length ?? 0) > 0 && lexeme.gloss?.[ctx.course.supportKey] !== undefined;

export const makeSelectImage = (ctx: MakeContext, lexeme: BundleLexeme): SelectImage | undefined => {
  if (!pictured(ctx, lexeme)) return undefined;
  const { orthography, supportKey } = ctx.course;
  const option = (k: BundleLexeme) => ({ text: k.forms?.[orthography]?.[0] as TaggedText, image: k.image as string });
  const pool = otherLexemes(ctx, lexeme).filter((k) => pictured(ctx, k) && k.image !== lexeme.image);
  const others = pickDistinct(ctx, pool.map((k) => option(k).text), [option(lexeme).text], 2);
  if (others.length < 2) return undefined;
  const otherOptions = others.map((t) => option(pool.find((k) => k.forms?.[orthography]?.[0] === t) as BundleLexeme));
  const { options, answer } = withAnswer(ctx, option(lexeme), otherOptions);
  return {
    template: "select-image",
    id: id("select-image", lexeme.id),
    item: lexeme.id,
    parts: [lexeme.id],
    orthography,
    prompt: lexeme.gloss?.[supportKey] as TaggedText,
    options,
    answer,
  };
};

const OPENING = /^[(（[]$/u;
const CLOSING = /^[)）\]]$/u;
const SENSE_BREAK = /^[;；]$/u;
const DANGLING = /^[,:;，：；]$/u;

/**
 * A gloss short enough for a card (W7): its first sense, without notes in parentheses. A course's
 * full gloss can run to a grammar note (yue 呀), and one that names the word's reading gives the
 * match away; tap-for-gloss shows it whole. A gloss with nothing left keeps its full text.
 */
export const cardGloss = (text: TaggedText): TaggedText => {
  const out: Token[] = [];
  let depth = 0;
  for (const t of text.tokens) {
    if (depth === 0 && ((t.kind === "punct" && SENSE_BREAK.test(t.surface)) || (t.kind === "space" && t.surface.includes("\n")))) break;
    if (t.kind === "punct" && OPENING.test(t.surface)) depth += 1;
    else if (t.kind === "punct" && CLOSING.test(t.surface)) depth = Math.max(0, depth - 1);
    else if (depth === 0 && !(t.kind === "space" && out.at(-1)?.kind === "space")) out.push(t);
  }
  while (out.length > 0 && (out.at(-1)?.kind === "space" || (out.at(-1)?.kind === "punct" && DANGLING.test(out.at(-1)?.surface ?? "")))) out.pop();
  return out.some((t) => t.kind === "lexical") ? { ...text, tokens: out } : text;
};

export const makeMatchPairs = (ctx: MakeContext, lexemes: readonly BundleLexeme[]): MatchPairs | undefined => {
  const { orthography, supportKey } = ctx.course;
  const usable = lexemes.filter((k) => (k.forms?.[orthography]?.length ?? 0) > 0 && k.gloss?.[supportKey] !== undefined);
  const byText = (t: TaggedText) => usable.find((k) => k.forms?.[orthography]?.[0] === t) as BundleLexeme;
  // Distinct in both columns. Two words alike, or two meanings alike (synonyms glossed alike, as
  // Classical Chinese 汝 and 爾 are both "you"), would make either pairing right, and the card
  // accepts only one. The draws are pickDistinct's, so cards without such a pair are unchanged.
  const words = new Set<string>();
  const meanings = new Set<string>();
  const chosen: TaggedText[] = [];
  for (const candidate of ctx.rng.shuffle(usable.map((k) => k.forms?.[orthography]?.[0] as TaggedText))) {
    if (chosen.length === 5) break;
    const word = keyOf(ctx.course, candidate);
    const meaning = keyOf(ctx.course, cardGloss(byText(candidate).gloss?.[supportKey] as TaggedText));
    if (word === "" || words.has(word) || meanings.has(meaning)) continue;
    words.add(word);
    meanings.add(meaning);
    chosen.push(candidate);
  }
  if (chosen.length < 3) return undefined;
  // Short card glosses (W7): the first sense, without notes.
  const glosses = chosen.map((t) => cardGloss(byText(t).gloss?.[supportKey] as TaggedText));
  const order = ctx.rng.shuffle(glosses.map((_, i) => i));
  return {
    template: "match-pairs",
    id: id("match-pairs", chosen.map((t) => byText(t).id).join("+")),
    item: byText(chosen[0] as TaggedText).id,
    parts: chosen.map((t) => byText(t).id),
    orthography,
    left: chosen,
    right: order.map((i) => glosses[i] as TaggedText),
    pairs: chosen.map((_, i) => order.indexOf(i)),
  };
};

// ------------------------------------------------------------------------------------ sentence templates

export const makeChooseTranslation = (ctx: MakeContext, s: BundleSentence): ChooseTranslation | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  const pool = otherSentences(ctx, s).flatMap((o) => translationOf(ctx.course, o)?.text ?? []);
  const others = pickRanked(ctx, pool, [translation.text], 2, shapeScore(ctx.course, translation.text));
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, translation.text, others);
  return {
    template: "choose-translation",
    id: id("choose-translation", s.id),
    item: s.id,
    parts: s.parts,
    orthography: ctx.course.support,
    prompt: form.text,
    options,
    answer,
  };
};

const makeTap = (
  ctx: MakeContext,
  s: BundleSentence,
  template: "translate-tap.l2-l1" | "translate-tap.l1-l2",
  prompt: TaggedText,
  answer: TaggedText,
  accept: string,
  pool: readonly TaggedText[],
): TranslateTap | undefined => {
  // Tiles in lower case but for words that must be capitalized (ADR 0130): a capital that only
  // marks a sentence's start would mark the answer's first tile, and every distractor that was
  // another sentence's first word.
  const tiles = tilesOf(ctx.course, answer);
  if (tiles.length === 0) return undefined;
  // Three or four distractors (P2).
  const bank = pool.flatMap((t) => tilesOf(ctx.course, t));
  const count = Math.min(4, Math.max(3, tiles.length));
  const distractors = pickDistinct(ctx, bank, tiles, count);
  const all = [...tiles, ...distractors];
  const order = ctx.rng.shuffle(all.map((_, i) => i));
  return {
    template,
    id: id(template, s.id),
    item: s.id,
    parts: s.parts,
    orthography: answer.orthography,
    prompt,
    tiles: order.map((i) => all[i] as TaggedText),
    solution: tiles.map((_, i) => order.indexOf(i)),
    joiner: joinerOf(ctx.course, answer),
    accept,
    canonical: answer,
    // Writing into the target: who speaks and who is spoken to, where the prompt cannot say.
    ...(template === "translate-tap.l1-l2" ? personsOf(s) : {}),
  };
};

export const makeTapL2L1 = (ctx: MakeContext, s: BundleSentence): TranslateTap | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  const pool = otherSentences(ctx, s).flatMap((o) => translationOf(ctx.course, o)?.text ?? []);
  return makeTap(ctx, s, "translate-tap.l2-l1", form.text, translation.text, translation.accept, pool);
};

export const makeTapL1L2 = (ctx: MakeContext, s: BundleSentence): TranslateTap | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  const accept = producible(ctx.course, s);
  if (form === undefined || translation === undefined || accept === undefined) return undefined;
  const pool = otherSentences(ctx, s).flatMap((o) => formOf(ctx.course, o)?.text ?? []);
  return makeTap(ctx, s, "translate-tap.l1-l2", translation.text, form.text, accept, pool);
};

export const makeTranslateType = (ctx: MakeContext, s: BundleSentence): TranslateType | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  const accept = producible(ctx.course, s);
  if (form === undefined || translation === undefined || accept === undefined) return undefined;
  return {
    template: "translate-type.l1-l2",
    id: id("translate-type.l1-l2", s.id),
    item: s.id,
    parts: s.parts,
    orthography: ctx.course.orthography,
    prompt: translation.text,
    accept,
    canonical: form.text,
    ...personsOf(s),
  };
};

/**
 * The word to blank out: one the session wants typed (ADR 0101), else one writing a lexeme this node
 * introduces, else the last word.
 */
const blankIndex = (ctx: MakeContext, s: BundleSentence, text: TaggedText): number | undefined => {
  const indexes = words(text);
  if (indexes.length < 2) return undefined;
  const lexemesAt = (i: number): readonly string[] => lexemeIdsOf(text.tokens[i] as Token);
  const again = indexes.find((i) => asked(ctx, s, text.tokens[i] as Token));
  const focus = ctx.focus === undefined ? undefined : indexes.find((i) => lexemesAt(i).some((k) => ctx.focus?.has(k) === true));
  const fresh = indexes.find((i) => lexemesAt(i).some((k) => ctx.introduced.includes(k)));
  return again ?? focus ?? fresh ?? indexes[indexes.length - 1];
};

export const makeCompleteTranslation = (ctx: MakeContext, s: BundleSentence): CompleteTranslation | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  const accept = producible(ctx.course, s);
  if (form === undefined || translation === undefined || accept === undefined) return undefined;
  const at = blankIndex(ctx, s, form.text);
  if (at === undefined) return undefined;
  return {
    template: "complete-translation",
    id: id("complete-translation", s.id),
    item: s.id,
    parts: s.parts,
    orthography: ctx.course.orthography,
    prompt: translation.text,
    before: slice(form.text, 0, at),
    after: slice(form.text, at + 1, form.text.tokens.length),
    blank: single(form.text, form.text.tokens[at] as Token),
    accept,
    canonical: form.text,
    ...personsOf(s),
  };
};

// ------------------------------------------------------------------------------------ gap-fill (ADR 0132)

/** A word a fill-in may offer: a lexical token of a sentence of the course, as an option, with its base lexeme and form signature. */
interface Attested {
  readonly option: TaggedText;
  readonly sentence: string;
  readonly lexeme: string;
  readonly signature: readonly string[];
  readonly signatureKey: string;
  /** What it carries beside its base (ADR 0152): what a parts card may offer of it. */
  readonly carried: Carried;
}

interface AttestedWords {
  readonly bySignature: ReadonlyMap<string, readonly Attested[]>;
  readonly byLexeme: ReadonlyMap<string, readonly Attested[]>;
}

const attestedUpTo = new WeakMap<CourseView, Map<number, AttestedWords>>();

/**
 * The words a sentence's fill-in may offer: those of the sentences of its unit and earlier ones (ADR
 * 0050), by form signature (a lexeme question's options) and by lexeme (a form question's). Built
 * once per course and unit; options are made once, so their keys are computed once.
 */
const attestedFor = (ctx: MakeContext, s: BundleSentence): AttestedWords => {
  const at = unitOf(ctx.course, s.id);
  let byUnit = attestedUpTo.get(ctx.course);
  if (byUnit === undefined) {
    byUnit = new Map();
    attestedUpTo.set(ctx.course, byUnit);
  }
  let built = byUnit.get(at);
  if (built === undefined) {
    const bySignature = new Map<string, Attested[]>();
    const byLexeme = new Map<string, Attested[]>();
    const lexemes = lexemesById(ctx.course);
    for (const o of sentencesThrough(ctx.course, at)) {
      const text = formOf(ctx.course, o)?.text;
      if (text === undefined) continue;
      for (const i of alone(text)) {
        const token = text.tokens[i] as Token;
        const lexeme = baseIdOf(token);
        if (lexeme === undefined) continue;
        const signature = formSignature(token, lexemes.get(lexeme));
        const word: Attested = { option: single(text, token), sentence: o.id, lexeme, signature, signatureKey: signature.join(" "), carried: carriedOf(ctx.course, token) };
        bySignature.set(word.signatureKey, [...(bySignature.get(word.signatureKey) ?? []), word]);
        byLexeme.set(lexeme, [...(byLexeme.get(lexeme) ?? []), word]);
      }
    }
    built = { bySignature, byLexeme };
    byUnit.set(at, built);
  }
  return built;
};

/**
 * A text's words that are a lexeme on their own: not a word of a lexeme written as several (por of
 * por favor, مع of مع السلامة), whose words stand next to each other with it as their base, and
 * alone are only part of it. Only these are blanked or offered (ADR 0132). A word the text repeats
 * apart (este … esta) is its own.
 */
const alone = (text: TaggedText): readonly number[] => {
  const all = words(text);
  const baseAt = (k: number): string | undefined => (all[k] === undefined ? undefined : baseIdOf(text.tokens[all[k]] as Token));
  return all.filter((_, k) => {
    const base = baseAt(k);
    return base !== undefined && baseAt(k - 1) !== base && baseAt(k + 1) !== base;
  });
};

const MEANING_BREAK = /^[;；,，/、]$/u;
const meaningSets = new WeakMap<CourseView, Map<string, ReadonlySet<string>>>();

/**
 * A lexeme's meanings in the support language: its gloss split where it lists meanings (; , /), notes
 * in parentheses left out, each meaning's words in its language's lower case. ay- "to say" and de-
 * "to say, tell" share "to say".
 */
const meaningsOf = (course: CourseView, lexeme: string): ReadonlySet<string> => {
  let byLexeme = meaningSets.get(course);
  if (byLexeme === undefined) {
    byLexeme = new Map();
    meaningSets.set(course, byLexeme);
  }
  let meanings = byLexeme.get(lexeme);
  if (meanings === undefined) {
    const gloss = lexemesById(course).get(lexeme)?.gloss?.[course.supportKey];
    const found = new Set<string>();
    let current: string[] = [];
    let depth = 0;
    const close = (): void => {
      if (current.length > 0) found.add(current.join(" "));
      current = [];
    };
    for (const t of gloss?.tokens ?? []) {
      if (t.kind === "punct" && OPENING.test(t.surface)) depth += 1;
      else if (t.kind === "punct" && CLOSING.test(t.surface)) depth = Math.max(0, depth - 1);
      else if (depth > 0) continue;
      else if ((t.kind === "punct" && MEANING_BREAK.test(t.surface)) || (t.kind === "space" && t.surface.includes("\n"))) close();
      else if (t.kind === "lexical" || t.kind === "number") current.push(lowerIn(course, gloss?.lang ?? course.support, t.surface));
    }
    close();
    meanings = found;
    byLexeme.set(lexeme, meanings);
  }
  return meanings;
};

const sharesMeaning = (course: CourseView, a: string, b: string): boolean => {
  const theirs = meaningsOf(course, b);
  return [...meaningsOf(course, a)].some((m) => theirs.has(m));
};

const acceptSets = new WeakMap<CourseView, Map<string, CompiledAcceptSet | null>>();

/** A sentence's accept set in the orthography being learned, compiled once (null: it has none, or it does not parse). */
const acceptSetOf = (course: CourseView, s: BundleSentence): CompiledAcceptSet | undefined => {
  let bySentence = acceptSets.get(course);
  if (bySentence === undefined) {
    bySentence = new Map();
    acceptSets.set(course, bySentence);
  }
  let set = bySentence.get(s.id);
  if (set === undefined) {
    const source = formOf(course, s)?.reverse;
    const compiled = source === undefined ? undefined : compileAcceptSet(source, profileOf(course, course.orthography));
    set = compiled?.ok === true ? compiled.value : null;
    bySentence.set(s.id, set);
  }
  return set ?? undefined;
};

/**
 * Whether the sentence with `option` in its gap is one its accept set takes (ADR 0085): what the
 * prompt leaves open the learner may choose, so such an option is right too and never offered.
 */
const takes = (course: CourseView, s: BundleSentence, before: TaggedText, option: TaggedText, after: TaggedText): boolean => {
  const set = acceptSetOf(course, s);
  if (set === undefined) return false;
  const { words: lexicon, inflected, forms } = spellingsIn(course, course.orthography);
  return isCorrect(grade(set, `${surfaceOf(before)}${surfaceOf(option)}${surfaceOf(after)}`, { lexicon, inflected, forms }).verdict);
};

/**
 * Two options from `ordered`, in order: none spelled as the answer or as another option (by key), none
 * of a `group` already taken, each one `admit`s (checked last: it may grade). Undefined without two.
 */
const pickTwo = (ctx: MakeContext, ordered: readonly Attested[], answer: TaggedText, group: (c: Attested) => string, admit: (c: Attested) => boolean): readonly TaggedText[] | undefined => {
  const keys = new Set([keyOf(ctx.course, answer)]);
  const groups = new Set<string>();
  const out: TaggedText[] = [];
  for (const c of ordered) {
    if (out.length === 2) break;
    const key = keyOf(ctx.course, c.option);
    if (key === "" || keys.has(key) || groups.has(group(c)) || !admit(c)) continue;
    keys.add(key);
    groups.add(group(c));
    out.push(c.option);
  }
  return out.length === 2 ? out : undefined;
};

/** Candidates shuffled, then the best-scored first (ties stay shuffled). */
const ranked = (ctx: MakeContext, pool: readonly Attested[], score: (c: Attested) => number): readonly Attested[] =>
  ctx.rng
    .shuffle(pool)
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);

interface GapParts {
  readonly s: BundleSentence;
  readonly target: Token;
  readonly correct: TaggedText;
  readonly before: TaggedText;
  readonly after: TaggedText;
}

/**
 * Which lexeme (ADR 0132): two other words in the answer's form (its form signature) and of its part
 * of speech, from the unit or earlier; never one whose meaning the answer's gloss shares, or one the
 * sentence's accept set takes in the gap. Each with the answer's case (P2): a capital that only
 * marks the sentence's first word must not mark the answer.
 */
const lexemeQuestion = (ctx: MakeContext, gap: GapParts): readonly TaggedText[] | undefined => {
  const lexeme = baseIdOf(gap.target);
  if (lexeme === undefined) return undefined;
  const lexemes = lexemesById(ctx.course);
  const own = lexemes.get(lexeme);
  const signature = formSignature(gap.target, own).join(" ");
  const pool = (attestedFor(ctx, gap.s).bySignature.get(signature) ?? []).filter(
    (c) => c.sentence !== gap.s.id && c.lexeme !== lexeme && sameKind(own, lexemes.get(c.lexeme)) && !sharesMeaning(ctx.course, lexeme, c.lexeme),
  );
  const capital = capitalized(ctx.course, gap.correct);
  const order = ranked(ctx, pool, (c) => (capitalized(ctx.course, c.option) === capital ? 1 : 0));
  return pickTwo(ctx, order, gap.correct, (c) => c.lexeme, (c) => !takes(ctx.course, gap.s, gap.before, c.option, gap.after));
};

/**
 * Which form (ADR 0132): the answer's own lexeme in two other forms the course writes in the unit or
 * earlier, the forms nearest the answer's first (most of its signature shared); never one the
 * sentence's accept set takes in the gap. The answer must have a form to credit (`formPartsOf`: a
 * lexeme written with it, or a feature value chosen on it that the course teaches by then): a word
 * with none asks which lexeme only.
 */
const formQuestion = (ctx: MakeContext, gap: GapParts): readonly TaggedText[] | undefined => {
  const lexeme = baseIdOf(gap.target);
  if (lexeme === undefined || formPartsOf(gap.target, taughtIn(gap.s)).length === 0) return undefined;
  const signature = formSignature(gap.target, lexemesById(ctx.course).get(lexeme));
  const key = signature.join(" ");
  const own = new Set<string>(signature);
  const pool = (attestedFor(ctx, gap.s).byLexeme.get(lexeme) ?? []).filter((c) => c.sentence !== gap.s.id && c.signatureKey !== key);
  const capital = capitalized(ctx.course, gap.correct);
  const order = ranked(ctx, pool, (c) => (capitalized(ctx.course, c.option) === capital ? 4 : 0) + c.signature.filter((k) => own.has(k)).length - Math.abs(c.signature.length - signature.length) * 0.5);
  return pickTwo(ctx, order, gap.correct, (c) => c.signatureKey, (c) => !takes(ctx.course, gap.s, gap.before, c.option, gap.after));
};

const LEXEME_FIRST: readonly Question[] = ["lexeme", "form"];
const FORM_FIRST: readonly Question[] = ["form", "lexeme"];

/** A word a fill-in may blank, and the questions to try on it, in order. */
interface Blank {
  readonly at: number;
  readonly asks: readonly Question[];
}

/**
 * The words a fill-in may blank, best first, each with what to ask of it (ADR 0132). A mistake's word
 * is asked again as the question it was (`MakeContext.ask`, `asks`), and nothing else. Otherwise the
 * words the session wants typed (ADR 0101), then words carrying something the node introduces, each
 * asked about what made it the choice: its base lexeme, which lexeme; a part of its form, which form.
 * Then the rest, from the last word, which lexeme first. A word needs a lexeme of its own (`alone`):
 * what a question credits.
 */
const blanksOf = (ctx: MakeContext, s: BundleSentence, text: TaggedText): readonly Blank[] => {
  if (words(text).length < 2) return [];
  const indexes = alone(text);
  if (ctx.ask !== undefined) {
    const again = indexes.find((i) => asked(ctx, s, text.tokens[i] as Token));
    return again === undefined ? [] : [{ at: again, asks: ctx.asks === undefined ? LEXEME_FIRST : [ctx.asks] }];
  }
  const by = (has: (part: string) => boolean): readonly Blank[] =>
    indexes.flatMap((at) => {
      const token = text.tokens[at] as Token;
      if (has(baseIdOf(token) as string)) return [{ at, asks: LEXEME_FIRST }];
      return formPartsOf(token, taughtIn(s)).some(has) ? [{ at, asks: FORM_FIRST }] : [];
    });
  const focus = ctx.focus === undefined ? [] : by((part) => ctx.focus?.has(part) === true);
  const fresh = by((part) => ctx.introduced.includes(part));
  const rest = [...indexes].reverse().map((at) => ({ at, asks: LEXEME_FIRST }));
  const out: Blank[] = [];
  for (const b of [...focus, ...fresh, ...rest]) if (!out.some((o) => o.at === b.at)) out.push(b);
  return out;
};

/**
 * A target sentence with a gap; choose what fits (ADR 0132). The card asks one thing: which lexeme,
 * or which form. The first blank (blanksOf) whose question can be built is asked; none, no card.
 */
export const makeGapFill = (ctx: MakeContext, s: BundleSentence): GapFill | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  for (const blank of blanksOf(ctx, s, form.text)) {
    const target = form.text.tokens[blank.at] as Token;
    const gap: GapParts = {
      s,
      target,
      correct: single(form.text, target),
      before: slice(form.text, 0, blank.at),
      after: slice(form.text, blank.at + 1, form.text.tokens.length),
    };
    for (const asks of blank.asks) {
      const others = asks === "lexeme" ? lexemeQuestion(ctx, gap) : formQuestion(ctx, gap);
      if (others === undefined) continue;
      const { options, answer } = withAnswer(ctx, gap.correct, others);
      return {
        template: "gap-fill",
        id: id("gap-fill", s.id),
        item: s.id,
        parts: s.parts,
        orthography: ctx.course.orthography,
        hint: translation.text,
        before: gap.before,
        after: gap.after,
        options,
        answer,
        asks,
        ...personsOf(s),
      };
    }
  }
  return undefined;
};

// ------------------------------------------------------------------------------------ a word and its parts (ADR 0152)

/**
 * Whether two spellings are one word as the orthography grades them: the same, or apart only in what
 * its profile lets pass (case, optional marks, a grave for an acute, a variant). A typo apart is
 * another spelling: casa and casas are two.
 */
const writtenAlike = (course: CourseView, a: string, b: string): boolean => {
  if (a === b) return true;
  const set = compileAcceptSet(literalAccept(a), profileOf(course, course.orthography));
  if (!set.ok) return false;
  const { verdict } = grade(set.value, b);
  return verdict === "CORRECT" || verdict === "CORRECT_ALT" || verdict === "CORRECT_MARKS" || verdict === "CORRECT_VARIANT";
};

/** A label as something to pick: what names it apart from every other (its values, and its part of speech where it has one). */
export const labelId = (label: BundleLabel): string => `form:${label.pos ?? ""}:${featsKey(label.feats)}`;

const featsKey = (feats: UdFeatures): string =>
  Object.keys(feats)
    .sort()
    .map((name) => `${name}=${feats[name] ?? ""}`)
    .join(";");

/** The feature values a set names, each as a part (feature:Tense=Past). */
const valuesOf = (feats: UdFeatures | undefined): readonly PartId[] =>
  Object.keys(feats ?? {})
    .sort()
    .flatMap((name) => ((feats ?? {})[name] ?? "").split(",").map((value) => featureId(name, value)));

/**
 * A lexeme as a part of a word (ADR 0152). One the course cites (it has a spelling): its first
 * spelling in the orthography being learned, and its gloss cut for a card. One written only inside
 * words (an ending, a suffixed pronoun: `bound`): its gloss, whole (it names the form: "-(i)m: my").
 * Undefined where the course lacks either.
 */
const lexemePart = (course: CourseView, id: string, base: boolean): WordPart | undefined => {
  const entry = lexemesById(course).get(id);
  const gloss = entry?.gloss?.[course.supportKey];
  if (entry === undefined || gloss === undefined) return undefined;
  if (bound(entry)) return { id, parts: [id], gloss };
  const text = entry.forms?.[course.orthography]?.[0];
  return text === undefined ? undefined : { id, parts: [id], text, gloss: cardGloss(gloss), ...(base ? { base: true as const } : {}) };
};

/**
 * The form a token's base stands in, as a part of the word (ADR 0152): what the language calls its
 * feature values there (`labelOf`: those chosen on the token and its lexeme's own), credited to the
 * values chosen on the token. Undefined for a token that chooses none, or whose form has no name.
 */
export const formPart = (course: CourseView, token: Token): WordPart | undefined => {
  const base = baseOf(token);
  if (base === undefined || Object.keys(base.feats ?? {}).length === 0) return undefined;
  const entry = lexemesById(course).get(base.lexeme);
  const label = labelOf(course, effectiveFeats(token, entry), entry?.pos);
  const gloss = label?.gloss[course.supportKey];
  return label === undefined || gloss === undefined ? undefined : { id: labelId(label), parts: valuesOf(base.feats), gloss };
};

/**
 * A word's parts (ADR 0152), in the word's order: its base lexeme (as the course cites it, the
 * lemma), and what it carries here: each other lexeme its token writes (an ending, a clitic, an
 * article written with it) and the form its base stands in (es, grc, hbo), which stands next after
 * the base. A form the word has of itself is no part (`ownFormsOf`: a noun's own number): nothing is
 * built with it. Undefined for a word that carries no form (a word with nothing added, or with other
 * words alone: a clitic, an article; the cards ask forms, `formsOf`), or with a part the course has
 * no entry for.
 */
const wordPartsOf = (course: CourseView, token: Token): readonly WordPart[] | undefined => {
  let byToken = wordParts.get(course);
  if (byToken === undefined) {
    byToken = new WeakMap();
    wordParts.set(course, byToken);
  }
  let parts = byToken.get(token);
  if (parts === undefined) {
    parts = partsOfWord(course, token) ?? null;
    byToken.set(token, parts);
  }
  return parts ?? undefined;
};

/** Words' parts, per course and token: a plan asks them of every word of every sentence it considers. */
const wordParts = new WeakMap<CourseView, WeakMap<Token, readonly WordPart[] | null>>();

/** A word as its token writes it, without the lexemes beside it: its base's own letters, else the whole token. */
const ownSurface = (token: Token): string => baseOf(token)?.surface ?? token.surface;

/** Per course: each lexeme's forms (the values chosen on its tokens), each with the spellings of the word under it. */
const chosenForms = new WeakMap<CourseView, Map<string, Map<string, Set<string>>>>();
const ownForms = new WeakMap<CourseView, Map<string, ReadonlySet<string>>>();

/**
 * The forms a word has of itself (ADR 0152): the values its tokens choose where it is written as
 * its lemma. מַיִם is plural as it stands, so nothing is added to it by that, in whatever shape a
 * suffix leaves it; casa's singular likewise, while casas's plural is added. Read off the course's
 * own sentences: no list of inherent forms is written anywhere. (A noun's gender is its lexeme's,
 * and no token chooses it.)
 */
const ownFormsOf = (course: CourseView, lexeme: string, lemma: string): ReadonlySet<string> => {
  let chosen = chosenForms.get(course);
  if (chosen === undefined) {
    chosen = new Map();
    for (const s of allSentences(course)) {
      for (const token of formOf(course, s)?.text.tokens ?? []) {
        const base = baseOf(token);
        if (token.kind !== "lexical" || base === undefined || Object.keys(base.feats ?? {}).length === 0) continue;
        const forms = chosen.get(base.lexeme) ?? new Map<string, Set<string>>();
        const key = featsKey(base.feats ?? {});
        const spellings = forms.get(key) ?? new Set<string>();
        spellings.add(ownSurface(token));
        forms.set(key, spellings);
        chosen.set(base.lexeme, forms);
      }
    }
    chosenForms.set(course, chosen);
  }
  const byLexeme = ownForms.get(course) ?? new Map<string, ReadonlySet<string>>();
  ownForms.set(course, byLexeme);
  let own = byLexeme.get(lexeme);
  if (own === undefined) {
    own = new Set([...(chosen.get(lexeme) ?? [])].filter(([, spellings]) => [...spellings].some((spelling) => writtenAlike(course, spelling, lemma))).map(([form]) => form));
    byLexeme.set(lexeme, own);
  }
  return own;
};

/** A token's lexemes as parts, in the order it writes them, each once; and its base's form, whether or not the word has it of itself. */
const laidOut = (course: CourseView, token: Token): { readonly lexemes: readonly (WordPart | undefined)[]; readonly form: WordPart | undefined; readonly ofItself: boolean } | undefined => {
  const base = baseOf(token);
  if (token.kind !== "lexical" || base === undefined) return undefined;
  const lemma = lexemesById(course).get(base.lexeme)?.forms?.[course.orthography]?.[0];
  if (lemma === undefined) return undefined;
  const ids = lexemeIdsOf(token);
  const form = formPart(course, token);
  const ofItself = Object.keys(base.feats ?? {}).length > 0 && ownFormsOf(course, base.lexeme, surfaceOf(lemma)).has(featsKey(base.feats ?? {}));
  return { lexemes: ids.map((id) => lexemePart(course, id, id === base.lexeme)), form, ofItself };
};

/** Parts in the word's order: the form stands next after the base. */
const ordered = (lexemes: readonly WordPart[], form: WordPart | undefined): readonly WordPart[] => {
  if (form === undefined) return lexemes;
  const at = lexemes.findIndex((p) => p.base === true);
  return [...lexemes.slice(0, at + 1), form, ...lexemes.slice(at + 1)];
};

const partsOfWord = (course: CourseView, token: Token): readonly WordPart[] | undefined => {
  const laid = laidOut(course, token);
  if (laid === undefined || laid.lexemes.some((p) => p === undefined)) return undefined;
  const base = baseOf(token);
  // A form the token chooses and the language has no name for is a part the course has no entry for.
  const unnamed = laid.form === undefined && !laid.ofItself && Object.keys(base?.feats ?? {}).length > 0 && bareOf(course, token) === false;
  if (unnamed) return undefined;
  const parts = ordered(laid.lexemes as readonly WordPart[], laid.ofItself ? undefined : laid.form);
  return parts.length >= 2 && parts.some((p) => p.text === undefined) ? parts : undefined;
};

/**
 * Whether a token stands in the cell its lexeme is cited in, where its language names one for its
 * part of speech (the lexicon's `bare`); undefined where it names none.
 */
const bareOf = (course: CourseView, token: Token): boolean | undefined => {
  const entry = lexemesById(course).get(baseOf(token)?.lexeme ?? "");
  if (entry?.pos === undefined || course.lexicon.bare?.[entry.pos] === undefined) return undefined;
  return !marked(course.lexicon, token, entry);
};

/** What a word's token carries, laid out for reading (the Data page). */
export interface TokenParts {
  /** Its base lexeme, the lexemes written with it and its form, in the word's order, as the parts cards label them. */
  readonly parts: readonly WordPart[];
  /** The form the word has of itself (a noun always plural): listed among `parts` (by its `id`), though nothing is built with it. */
  readonly ofItself?: string | undefined;
  /** Whether the parts cards can ask this word (ADR 0152): it carries a form that is added to it. */
  readonly asked: boolean;
}

/**
 * Everything a word's token carries (ADR 0152), for browsing: `partsOfWord`'s parts, and its form
 * even where the word has it of itself, marked so. A part the course has no entry for is left out.
 * Undefined for a token that is no word of the course.
 */
export const tokenParts = (course: CourseView, token: Token): TokenParts | undefined => {
  const laid = laidOut(course, token);
  if (laid === undefined) return undefined;
  const lexemes = laid.lexemes.flatMap((p) => p ?? []);
  const withBase = lexemes.some((p) => p.base === true);
  const parts = withBase ? ordered(lexemes, laid.form) : [...lexemes, ...(laid.form === undefined ? [] : [laid.form])];
  return { parts, ofItself: laid.ofItself ? laid.form?.id : undefined, asked: wordPartsOf(course, token) !== undefined };
};

/**
 * What a parts card asks, and is credited to (ADR 0152): the word's forms, which the card names. A
 * lexeme written only inside words (an ending, a suffixed pronoun), and the feature values a named
 * form chooses that the sentence teaches (`taught`: the sentence's parts). Its other lexemes (its
 * base, a clitic, an article) are given: the card shows each as the course cites it, with what it
 * means, so an answer says nothing of them.
 */
export const formsOf = (parts: readonly WordPart[], taught: ReadonlySet<string>): readonly PartId[] => [
  ...new Set(parts.filter((p) => p.text === undefined).flatMap((p) => p.parts.filter((part) => kindOf(part) !== "feature" || taught.has(part)))),
];

const sameParts = (parts: readonly PartId[], asked: readonly string[]): boolean => {
  const sorted = [...new Set(parts.map(String))].sort();
  return sorted.length === asked.length && sorted.every((part, i) => part === asked[i]);
};

interface PartsWord {
  readonly at: number;
  readonly token: Token;
  readonly parts: readonly WordPart[];
}

/**
 * The words of a text a parts card may ask (ADR 0152), best first. A mistake's word is asked again
 * (`MakeContext.ask`: its forms, as its answer was credited), and nothing else. Otherwise a word that
 * carries a form the session wants typed (ADR 0101), then one that carries a form the node introduces,
 * then one with a lexeme the node introduces; then the rest; in each group from the last word. A word
 * needs a lexeme of its own (`alone`) and a form the card can credit (`wordPartsOf`, `formsOf`).
 */
const partsWords = (ctx: MakeContext, s: BundleSentence, text: TaggedText): readonly PartsWord[] => {
  const taught = taughtIn(s);
  const all = alone(text).flatMap((at): PartsWord[] => {
    const token = text.tokens[at] as Token;
    const parts = wordPartsOf(ctx.course, token);
    return parts === undefined || formsOf(parts, taught).length === 0 ? [] : [{ at, token, parts }];
  });
  const asked = ctx.ask;
  if (asked !== undefined) return all.filter((w) => sameParts(formsOf(w.parts, taught), asked)).slice(0, 1);
  const rank = (w: PartsWord): number => {
    const forms = formsOf(w.parts, taught);
    if (forms.some((part) => ctx.focus?.has(part) === true)) return 3;
    if (forms.some((part) => ctx.introduced.includes(part))) return 2;
    return w.parts.some((p) => p.parts.some((part) => ctx.introduced.includes(part))) ? 1 : 0;
  };
  return [...all]
    .reverse()
    .map((w) => ({ w, r: rank(w) }))
    .sort((a, b) => b.r - a.r)
    .map((x) => x.w);
};

/** A word as an accept set: itself, and the spellings of it the course accepts (a token's variants). */
const acceptOfWord = (token: Token): string => {
  const spellings = [token.surface, ...(token.variants ?? [])];
  return spellings.length === 1 ? literalAccept(token.surface) : `(${spellings.map(literalAccept).join("|")})`;
};

/**
 * Parts to whole (ADR 0152): the sentence with one word left out, what it means, and the word's parts;
 * the learner types the word. The first word (`partsWords`) the card does not give away: none whose
 * base, or a lexeme beside it, typed as the card shows it, would be accepted for it (کتابِ with its
 * unwritten ezafe).
 */
export const makePartsWhole = (ctx: MakeContext, s: BundleSentence): PartsWhole | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  const { orthography } = ctx.course;
  const { words: lexicon, inflected, forms } = spellingsIn(ctx.course, orthography);
  for (const { at, token, parts } of partsWords(ctx, s, form.text)) {
    const accept = acceptOfWord(token);
    const set = compileAcceptSet(accept, profileOf(ctx.course, orthography));
    if (!set.ok) continue;
    const given = (text: TaggedText): boolean => isCorrect(grade(set.value, surfaceOf(text), { lexicon, inflected, forms }).verdict);
    if (parts.some((p) => p.text !== undefined && given(p.text))) continue;
    return {
      template: "parts-whole",
      id: id("parts-whole", s.id),
      item: s.id,
      parts: s.parts,
      orthography,
      hint: translation.text,
      before: slice(form.text, 0, at),
      after: slice(form.text, at + 1, form.text.tokens.length),
      wordParts: parts,
      whole: single(form.text, token),
      accept,
      ...personsOf(s),
    };
  }
  return undefined;
};

/**
 * The values a named form adds to a word of a part of speech: those that are not the cell its
 * lexemes are cited in (the lexicon's `bare`; all of them where the language names no such cell).
 * "Feminine" adds the feminine; "feminine plural", the feminine and the plural.
 */
const addedBy = (course: CourseView, label: BundleLabel, pos: string | undefined): readonly string[] => {
  const cell = pos === undefined ? undefined : course.lexicon.bare?.[pos];
  return Object.keys(label.feats)
    .filter((name) => cell?.[name] !== label.feats[name])
    .map((name) => `${name}=${label.feats[name] ?? ""}`);
};

/**
 * Whether two named forms may both be true of one word (of a part of speech): everything one adds
 * the other adds too (feminine beside feminine plural; plural beside plural construct). Two that
 * each add something the other does not are apart (I beside you; the present beside the past).
 */
const overlapping = (course: CourseView, a: BundleLabel, b: BundleLabel, pos: string | undefined): boolean => {
  const x = addedBy(course, a, pos);
  const y = addedBy(course, b, pos);
  return x.every((v) => y.includes(v)) || y.every((v) => x.includes(v));
};

/** How many letters two words begin alike with, in their own lower case. */
const sharedStart = (course: CourseView, a: TaggedText, b: TaggedText): number => {
  const x = graphemes(lowerIn(course, a.lang, surfaceOf(a)));
  const y = graphemes(lowerIn(course, b.lang, surfaceOf(b)));
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n += 1;
  return n;
};

/**
 * What a bound lexeme is one of: its part of speech and the features it has or realises (a suffixed
 * pronoun of one person beside one of another; a case ending beside another case's).
 */
const familyOf = (lexeme: BundleLexeme | undefined): string =>
  `${lexeme?.pos ?? ""}|${Object.keys({ ...(lexeme?.feats ?? {}), ...(lexeme?.realises ?? {}) })
    .sort()
    .join(",")}`;

/** What a token carries beside its base (ADR 0152): the bound lexemes written with it, and the label of its base's form. */
interface Carried {
  readonly lexemes: readonly string[];
  readonly label: BundleLabel | undefined;
}

const carriedOf = (course: CourseView, token: Token): Carried => {
  const base = baseOf(token);
  const lexemes = lexemesById(course);
  const entry = lexemes.get(base?.lexeme ?? "");
  const chooses = Object.keys(base?.feats ?? {}).length > 0;
  return {
    lexemes: lexemesOf(token)
      .filter((l) => l !== base)
      .map((l) => l.lexeme),
    label: chooses ? labelOf(course, effectiveFeats(token, entry), entry?.pos) : undefined,
  };
};

/**
 * Parts a word does not have, to offer beside its own (ADR 0152), from its unit or earlier (ADR
 * 0050). Up to two other lexemes of its kind (ADR 0132's `sameKind`), those that begin most like its
 * base first: never one whose meaning its own shares, or that the course writes as this word. And up
 * to three forms or clitics the course's words carry: those this very lexeme takes elsewhere first,
 * then those of lexemes of its kind, then any; never one that may be true of this word too (a named
 * form `overlapping` the one it stands in, whether or not that is a part of it).
 */
const otherParts = (ctx: MakeContext, s: BundleSentence, token: Token, whole: TaggedText, parts: readonly WordPart[]): readonly WordPart[] => {
  const { course } = ctx;
  const lexemes = lexemesById(course);
  const lexeme = baseIdOf(token) as string;
  const kind = lexemes.get(lexeme);
  const own = new Set<string>(parts.map((p) => p.id));
  const carried = carriedOf(course, token);
  const attested = attestedFor(ctx, s);
  const before = known(course, s.id);
  const base = parts.find((p) => p.base === true)?.text;
  const wholeKey = keyOf(course, whole);

  const wordPool = lexemesInOrder(course)
    .filter(
      (k) =>
        !bound(k) &&
        !own.has(k.id) &&
        before(k.id) &&
        sameKind(kind, k) &&
        !sharesMeaning(course, lexeme, k.id) &&
        !(attested.byLexeme.get(k.id) ?? []).some((w) => keyOf(course, w.option) === wholeKey),
    )
    .flatMap((k) => lexemePart(course, k.id, false) ?? []);
  const taken = parts.flatMap((p) => p.text ?? []);
  const wordTexts = new Map(wordPool.map((p) => [p.text as TaggedText, p]));
  const words = pickRanked(ctx, [...wordTexts.keys()], taken, 2, (text) => (base === undefined ? 0 : sharedStart(course, base, text))).flatMap((text) => wordTexts.get(text) ?? []);

  // Every form and clitic the words of the unit and earlier carry, each with how near its word is to
  // this one, and as the part it would be offered as.
  const nearness = new Map<string, number>();
  const offered = new Map<string, WordPart>();
  const consider = (part: WordPart | undefined, near: number): void => {
    if (part === undefined || own.has(part.id)) return;
    offered.set(part.id, part);
    if ((nearness.get(part.id) ?? -1) < near) nearness.set(part.id, near);
  };
  for (const [other, attestedWords] of attested.byLexeme) {
    const near = other === lexeme ? 2 : sameKind(kind, lexemes.get(other)) ? 1 : 0;
    for (const w of attestedWords) {
      for (const id of w.carried.lexemes) consider(lexemePart(course, id, false), near);
      const label = w.carried.label;
      const gloss = label?.gloss[course.supportKey];
      if (label === undefined || gloss === undefined) continue;
      if (carried.label !== undefined && overlapping(course, carried.label, label, kind?.pos)) continue;
      consider({ id: labelId(label), parts: valuesOf(label.feats), gloss }, near);
    }
  }
  // A form of the kind this word carries first: one that adds a value its own adds, a bound lexeme
  // of the family of one written with it.
  const adds = new Set(carried.label === undefined ? [] : addedBy(course, carried.label, kind?.pos));
  const families = new Set(carried.lexemes.map((id) => familyOf(lexemes.get(id))));
  const labels = new Map((course.lexicon.labels ?? []).map((l) => [labelId(l), l]));
  const akin = (id: string): boolean => {
    const label = labels.get(id);
    return label === undefined ? families.has(familyOf(lexemes.get(id))) : addedBy(course, label, kind?.pos).some((v) => adds.has(v));
  };
  const order = ctx.rng
    .shuffle([...nearness.keys()].sort())
    .map((id) => ({ id, score: (nearness.get(id) ?? 0) + (akin(id) ? 0.5 : 0) }))
    .sort((a, b) => b.score - a.score);
  const formParts: WordPart[] = [];
  const shown = new Set<string>([...parts, ...words].map((p) => surfaceOf(p.text ?? p.gloss)));
  for (const { id } of order) {
    if (formParts.length === 3) break;
    const part = offered.get(id);
    const label = part === undefined ? undefined : surfaceOf(part.text ?? part.gloss);
    if (part === undefined || label === undefined || shown.has(label)) continue;
    shown.add(label);
    formParts.push(part);
  }
  return [...words, ...formParts];
};

/**
 * Whole to parts (ADR 0152): the sentence with one word marked; the learner picks that word's parts
 * among others. The first word (`partsWords`) the course has two other parts to set beside, a form
 * among them: the card asks which forms the word has, and a form offered alone would say so.
 */
export const makeWholeParts = (ctx: MakeContext, s: BundleSentence): WholeParts | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  for (const { at, token, parts } of partsWords(ctx, s, form.text)) {
    const others = otherParts(ctx, s, token, single(form.text, token), parts);
    if (others.length < 2 || !others.some((p) => p.text === undefined)) continue;
    const shuffled = ctx.rng.shuffle([...parts.map((part, own) => ({ part, own })), ...others.map((part) => ({ part, own: -1 }))]);
    return {
      template: "whole-parts",
      id: id("whole-parts", s.id),
      item: s.id,
      parts: s.parts,
      orthography: ctx.course.orthography,
      prompt: form.text,
      word: at,
      translation: translation.text,
      options: shuffled.map((x) => x.part),
      solution: parts.map((_, own) => shuffled.findIndex((x) => x.own === own)),
    };
  }
  return undefined;
};

// ------------------------------------------------------------------------------------ spelling choice

/** A word's other spellings of its sound in the course (`otherSpellings`): what a spelling card offers it among. */
const soundAlikeSpellings = (ctx: MakeContext, token: Token): readonly string[] =>
  otherSpellings(profileOf(ctx.course, ctx.course.orthography), token, courseHomophones(ctx.course));

/**
 * Which spelling of a word fits the gap (ADR 0142, 0148): the sentence with the word left out, what
 * it means, the word's reading where the course's first layer writes one, and the word among itself
 * spelled otherwise with the same sound. Asked of a word with at least one such spelling that is a
 * wrong answer (none the sentence's accept set takes in the gap), against up to three. The writing
 * side's twin of a reading card.
 *
 * The one choice card that may have two options: every other (gap-fill, char-read, reading-feature,
 * vocalize …) keeps two wrong options at least. The choice between two spellings of a sound is the
 * one a writer faces (casa or caza; ADR 0142, as amended 2026-11-22).
 */
export const makeSpellingChoice = (ctx: MakeContext, s: BundleSentence): GapFill | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  const tokens = form.text.tokens;
  const askable = (t: Token): boolean => t.kind === "lexical" && soundAlikeSpellings(ctx, t).length > 0;
  // A word asked again first, then one the lesson introduces, then any; the first whose spellings
  // leave a wrong answer once those the accept set takes are set aside.
  const candidates = [...tokens.keys()].filter((i) => askable(tokens[i] as Token));
  const order = [
    ...new Set([...candidates.filter((i) => asked(ctx, s, tokens[i] as Token)), ...candidates.filter((i) => introduces(ctx, tokens[i] as Token)), ...candidates]),
  ];
  for (const at of order) {
    const target = tokens[at] as Token;
    const before = slice(form.text, 0, at);
    const after = slice(form.text, at + 1, tokens.length);
    const wrong = soundAlikeSpellings(ctx, target)
      .map((spelling): TaggedText => ({ ...form.text, tokens: [{ surface: spelling, kind: "lexical" }] }))
      .filter((option) => !takes(ctx.course, s, before, option, after));
    if (wrong.length === 0) continue;
    // No option may show a reading: the right one would keep it, and the reading is the question's.
    const correct: TaggedText = { ...form.text, tokens: [stripRuby(target)] };
    const others = ctx.rng.shuffle(wrong).slice(0, 3);
    const { options, answer } = withAnswer(ctx, correct, others);
    const scheme = readingTradition(ctx.course);
    const reading = scheme === undefined ? undefined : target.readings?.[scheme];
    return {
      template: "spelling-choice",
      id: id("spelling-choice", `${s.id}:${target.surface}`),
      item: s.id,
      parts: s.parts,
      orthography: ctx.course.orthography,
      hint: translation.text,
      before,
      after,
      options,
      answer,
      ...(reading === undefined || scheme === undefined ? {} : { reading: readingText(scheme, reading) }),
      ...personsOf(s),
    };
  }
  return undefined;
};

// ------------------------------------------------------------------------------------ reading templates

/**
 * The scheme reading cards ask about: the learner's reading tradition (ADR 0138), else the
 * profile's first ruby layer whose scheme's data says how its readings stand as options (`answer`,
 * ADR 0109): Jyutping for yue, sitelen Lasina for sitelen pona, Pinyin for Classical Chinese.
 */
export const rubySchemeOf = (ctx: MakeContext): SchemeId | undefined => readingTradition(ctx.course, ctx.reading);

const readingText = (scheme: SchemeId, reading: string): TaggedText => {
  const tag = readingTag(scheme) as Pick<TaggedText, "lang" | "orthography">;
  const tokens: Token[] = reading.split(" ").flatMap((syllable, i) => [
    ...(i === 0 ? [] : [{ surface: " ", kind: "space" as const }]),
    { surface: syllable, kind: "lexical" as const },
  ]);
  return { lang: tag.lang, orthography: tag.orthography, tokens };
};

const stripRuby = (token: Token): Token => {
  const { ruby: _ruby, readings: _readings, tileGroup: _tile, ...rest } = token;
  return rest;
};

/** Every syllable the course's readings use in a scheme (ADR 0098): what tone distractors may be. Per course. */
const syllablesOf = new WeakMap<CourseView, Map<string, ReadonlySet<string>>>();
const courseSyllables = (course: CourseView, scheme: SchemeId): ReadonlySet<string> => {
  const byScheme = syllablesOf.get(course) ?? new Map<string, ReadonlySet<string>>();
  syllablesOf.set(course, byScheme);
  let found = byScheme.get(scheme);
  if (found === undefined) {
    found = new Set(allSentences(course).flatMap((s) => (formOf(course, s)?.text.tokens ?? []).flatMap((t) => t.readings?.[scheme]?.split(" ") ?? [])));
    byScheme.set(scheme, found);
  }
  return found;
};

/** Every reading the course pins on a spelling in its orthography (a word's homographs: bar, bär). Per course. */
const spellingsOf = new WeakMap<CourseView, Map<string, ReadonlyMap<string, readonly string[]>>>();
const spellingReadings = (course: CourseView, scheme: SchemeId, surface: string): readonly string[] => {
  const byScheme = spellingsOf.get(course) ?? new Map<string, ReadonlyMap<string, readonly string[]>>();
  spellingsOf.set(course, byScheme);
  let bySurface = byScheme.get(scheme);
  if (bySurface === undefined) {
    const found = new Map<string, string[]>();
    for (const s of allSentences(course)) {
      for (const t of formOf(course, s)?.text.tokens ?? []) {
        const r = t.kind === "lexical" ? t.readings?.[scheme] : undefined;
        if (r === undefined) continue;
        const key = t.surface.normalize("NFC");
        const readings = found.get(key) ?? [];
        if (!readings.includes(r)) found.set(key, [...readings, r]);
      }
    }
    bySurface = found;
    byScheme.set(scheme, bySurface);
  }
  return bySurface.get(surface.normalize("NFC")) ?? [];
};

/** An option in the answer's case: its first letter a capital where the answer's is (a sentence's first word, a name). */
const likeCase = (option: string, answer: string, lang: string | undefined): string => {
  const [first = "", ...rest] = graphemes(option, lang);
  const [lead = ""] = graphemes(answer, lang);
  const capital = lead !== lead.toLocaleLowerCase(lang);
  return [capital ? first.toLocaleUpperCase(lang) : first.toLocaleLowerCase(lang), ...rest].join("");
};

/**
 * How a word of a sentence is read, chosen (ADR 0098): the sentence without ruby, the word marked (a
 * word the lesson introduces where it can), and its reading among others. Where the scheme can be
 * typed, two of them are the same syllables in another tone the course uses (tones are what a
 * learner gets wrong); the rest are readings of other words with as many syllables. The typed card
 * is `transcribe`.
 */
export const makeCharRead = (ctx: MakeContext, s: BundleSentence): CharRead | undefined => {
  const scheme = rubySchemeOf(ctx);
  const form = formOf(ctx.course, s);
  if (scheme === undefined || form === undefined) return undefined;
  const readable = (t: Token): boolean => t.kind === "lexical" && t.readings?.[scheme] !== undefined;
  const again = form.text.tokens.findIndex((t) => readable(t) && asked(ctx, s, t));
  const fresh = form.text.tokens.findIndex((t) => readable(t) && introduces(ctx, t));
  const word = again >= 0 ? again : fresh >= 0 ? fresh : form.text.tokens.findIndex(readable);
  const target = form.text.tokens[word];
  if (target === undefined) return undefined;
  const reading = target.readings?.[scheme] as string;
  const syllables = reading.split(" ").length;
  const tones = ctx.rng.shuffle([...toneVariants(scheme, reading, courseSyllables(ctx.course, scheme))]).slice(0, 2);
  // Where the script writes some of the scheme's pieces alike (its correspondences, ADR 0148:
  // Chaghatay's unwritten vowels), the course's other readings of the word's spelling come first,
  // then the reading with one such piece traded for what the letter written there also writes,
  // every option in the answer's case: what the script leaves open.
  const traded = letterVariants(scheme, reading, schemeSpelling(scheme, ctx.course.orthography, target.surface));
  const lang = readingTag(scheme)?.lang;
  const same = (a: string, b: string): boolean => a.toLocaleLowerCase(lang) === b.toLocaleLowerCase(lang);
  // A scheme whose statement leaves pieces open (not the word alone: a word with nothing open still
  // takes its homographs first).
  const opens = readingProjection(scheme)?.opens === true;
  const cased = !opens ? (r: string): string => r : (r: string): string => likeCase(r, reading, lang);
  const alike = !opens ? [] : [...ctx.rng.shuffle(spellingReadings(ctx.course, scheme, target.surface).map(cased)), ...ctx.rng.shuffle([...traded])];
  const close = [...tones, ...alike].filter((r, i, all) => !same(r, reading) && all.findIndex((x) => same(x, r)) === i);
  const pool = otherSentences(ctx, s)
    .flatMap((o) => formOf(ctx.course, o)?.text.tokens ?? [])
    .flatMap((t) => (readable(t) ? [cased(t.readings?.[scheme] as string)] : []))
    .filter((r) => r.split(" ").length === syllables && r !== reading && !close.includes(r) && (!opens || !same(r, reading)));
  const others = [...new Set([...close, ...ctx.rng.shuffle(pool)])].slice(0, 3);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, readingText(scheme, reading), others.map((r) => readingText(scheme, r)));
  const translation = translationOf(ctx.course, s);
  const tradition = traditionKey(ctx.course, scheme);
  return {
    template: "char-read",
    id: id("char-read", `${s.id}:${target.surface}`),
    item: s.id,
    parts: s.parts,
    orthography: options[0]?.orthography ?? ctx.course.orthography,
    prompt: { ...form.text, tokens: form.text.tokens.map(stripRuby) },
    word,
    ...(translation === undefined ? {} : { translation: translation.text }),
    options,
    answer,
    ...(tradition === undefined ? {} : { tradition }),
  };
};

/**
 * One place of a word's reading the script leaves open (ADR 0139): the sentence without ruby, the
 * word marked as on a char-read card, and its reading among the same reading changed in that one
 * place, in every way the scheme's data allows there (a piece its correspondences write alike with
 * the letter the word has there, ADR 0148; a syllable's tone the course attests). The place is the session's pick among those open two or more ways.
 */
export const makeReadingFeature = (ctx: MakeContext, s: BundleSentence): CharRead | undefined => {
  const scheme = rubySchemeOf(ctx);
  const form = formOf(ctx.course, s);
  if (scheme === undefined || form === undefined) return undefined;
  // Each word's places open two or more ways, worked out once.
  const attested = courseSyllables(ctx.course, scheme);
  const places = form.text.tokens.map((t) =>
    t.kind === "lexical" && t.readings?.[scheme] !== undefined ? readingFeatures(scheme, t.readings[scheme], attested, schemeSpelling(scheme, ctx.course.orthography, t.surface)).filter((f) => f.length >= 2) : [],
  );
  const askable = (t: Token): boolean => (places[form.text.tokens.indexOf(t)]?.length ?? 0) > 0;
  const again = form.text.tokens.findIndex((t) => askable(t) && asked(ctx, s, t));
  const fresh = form.text.tokens.findIndex((t) => askable(t) && introduces(ctx, t));
  const word = again >= 0 ? again : fresh >= 0 ? fresh : form.text.tokens.findIndex(askable);
  const target = form.text.tokens[word];
  if (target === undefined) return undefined;
  const open = places[word] ?? [];
  const place = open[ctx.rng.int(open.length)] as readonly string[];
  const reading = target.readings?.[scheme] as string;
  const others = ctx.rng.shuffle([...place]).slice(0, 3);
  const { options, answer } = withAnswer(ctx, readingText(scheme, reading), others.map((r) => readingText(scheme, r)));
  const translation = translationOf(ctx.course, s);
  const tradition = traditionKey(ctx.course, scheme);
  return {
    template: "reading-feature",
    id: id("reading-feature", `${s.id}:${target.surface}`),
    item: s.id,
    parts: s.parts,
    orthography: options[0]?.orthography ?? ctx.course.orthography,
    prompt: { ...form.text, tokens: form.text.tokens.map(stripRuby) },
    word,
    ...(translation === undefined ? {} : { translation: translation.text }),
    options,
    answer,
    ...(tradition === undefined ? {} : { tradition }),
  };
};

/**
 * "How is the highlighted character read here?": the whole sentence, since the context is what
 * decides (呢 is ne1 at the end of 你呢？ and ni1 in 呢個). The other options are the readings the
 * same character has elsewhere in the course (the readings a learner meets), then the character
 * table's. Only a single syllable is an option: a table entry is never two readings at once.
 */
export const makeReadingDisambiguation = (ctx: MakeContext, s: BundleSentence): ReadingDisambiguation | undefined => {
  const scheme = rubySchemeOf(ctx);
  const form = formOf(ctx.course, s);
  const homophones = profileOf(ctx.course, ctx.course.orthography).homophones;
  if (scheme === undefined || form === undefined || homophones === undefined) return undefined;
  const syllable = /^[^\s,]+$/u;
  const elsewhere = new Map<string, Set<string>>();
  for (const o of otherSentences(ctx, s)) {
    for (const t of formOf(ctx.course, o)?.text.tokens ?? []) {
      for (const seg of t.ruby?.[scheme] ?? []) elsewhere.set(seg.base, (elsewhere.get(seg.base) ?? new Set()).add(seg.text));
    }
  }
  for (const [ti, token] of form.text.tokens.entries()) {
    const segments = token.ruby?.[scheme] ?? [];
    for (const [si, segment] of segments.entries()) {
      const table = homophones.readings(segment.base) ?? [];
      if (!syllable.test(segment.text) || !table.includes(segment.text)) continue;
      const met = ctx.rng.shuffle([...(elsewhere.get(segment.base) ?? [])].filter((r) => r !== segment.text && syllable.test(r)));
      const listed = ctx.rng.shuffle([...new Set(table)].filter((r) => r !== segment.text && syllable.test(r) && !met.includes(r)));
      const others = [...met, ...listed].slice(0, 2);
      if (others.length === 0) continue;
      const { options, answer } = withAnswer(ctx, readingText(scheme, segment.text), others.map((r) => readingText(scheme, r)));
      return {
        template: "reading-disambiguation",
        id: id("reading-disambiguation", `${s.id}:${ti}:${si}`),
        item: s.id,
        parts: baseIdOf(token) === undefined ? s.parts : [baseIdOf(token) as PartId],
        orthography: options[0]?.orthography ?? ctx.course.orthography,
        context: form.text,
        focus: { token: ti, segment: si },
        options,
        answer,
        ...(traditionKey(ctx.course, scheme) === undefined ? {} : { tradition: scheme }),
      };
    }
  }
  return undefined;
};

export const makeSpeak = (ctx: MakeContext, s: BundleSentence): Speak | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  return {
    template: "speak.tier-0",
    id: id("speak.tier-0", s.id),
    item: s.id,
    parts: s.parts,
    orthography: ctx.course.orthography,
    prompt: form.text,
    translation: translation.text,
  };
};

// ------------------------------------------------------------------------------------ listening templates

const audioOf = (ctx: MakeContext, item: string) => ctx.course.audio[item];

/** Speak, scored (§10.4 tiers 1–3): any sentence; its clip, when there is one, to compare with. */
export const makeSpeakScored = (ctx: MakeContext, s: BundleSentence): SpeakScored | undefined => {
  const tier0 = makeSpeak(ctx, s);
  if (tier0 === undefined) return undefined;
  const audio = audioOf(ctx, s.id);
  return { ...tier0, template: "speak", id: id("speak", s.id), ...(audio === undefined ? {} : { audio }) };
};

/** Listen, then say it: needs the sentence's clip. */
export const makeListenSpeak = (ctx: MakeContext, s: BundleSentence): ListenSpeak | undefined => {
  const audio = audioOf(ctx, s.id);
  const tier0 = makeSpeak(ctx, s);
  if (audio === undefined || tier0 === undefined) return undefined;
  return { ...tier0, template: "listen-speak", id: id("listen-speak", s.id), audio };
};

/**
 * Which tone? A sentence of one syllable in a tonal reading scheme (number drills, one-word answers),
 * with a clip a person confirmed (ADR 0125): a recording, or a synthetic clip a listener marked right.
 * A synthetic voice is not trusted with a lone syllable's tone, and the card asks nothing else.
 */
export const makeToneIdentify = (ctx: MakeContext, s: BundleSentence): ToneIdentify | undefined => {
  const audio = audioOf(ctx, s.id);
  const form = formOf(ctx.course, s);
  if (audio === undefined || form === undefined) return undefined;
  if (audio.normal.confirmed !== true || (audio.slow !== undefined && audio.slow.confirmed !== true)) return undefined;
  const system = toneSystemOf(form.text);
  if (system === undefined) return undefined;
  const syllables = expectedSyllables(form.text, system);
  const only = syllables[0];
  if (syllables.length !== 1 || only === undefined) return undefined;
  const tones = Object.keys(system.tones);
  const answer = tones.indexOf(only.tone);
  if (answer < 0) return undefined;
  const translation = translationOf(ctx.course, s);
  return {
    template: "tone-identify",
    id: id("tone-identify", s.id),
    item: s.id,
    parts: s.parts,
    orthography: ctx.course.orthography,
    audio,
    syllable: form.text,
    system: system.id,
    tones,
    answer,
    ...(translation === undefined ? {} : { translation: translation.text }),
  };
};

/**
 * Dictation is graded against what the clip says, and nothing else: the sentence's own text. Its
 * `reverse` set takes every wording that would translate the same (ADR 0085), and a learner who
 * heard "Estoy bien." has not heard "Yo estoy bien.".
 */
const heardAccept = (text: TaggedText): string => literalAccept(surfaceOf(text));

export const makeListenTap = (ctx: MakeContext, s: BundleSentence): ListenTap | undefined => {
  const audio = audioOf(ctx, s.id);
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (audio === undefined || form === undefined || translation === undefined) return undefined;
  const tap = makeTap(
    ctx,
    s,
    "translate-tap.l1-l2",
    translation.text,
    form.text,
    heardAccept(form.text),
    otherSentences(ctx, s).flatMap((o) => formOf(ctx.course, o)?.text ?? []),
  );
  if (tap === undefined) return undefined;
  const { prompt: _prompt, template: _template, id: _id, ...rest } = tap;
  return { ...rest, template: "listen-tap", id: id("listen-tap", s.id), audio, translation: translation.text };
};

export const makeListenType = (ctx: MakeContext, s: BundleSentence): ListenType | undefined => {
  const audio = audioOf(ctx, s.id);
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (audio === undefined || form === undefined || translation === undefined) return undefined;
  return {
    template: "listen-type",
    id: id("listen-type", s.id),
    item: s.id,
    parts: s.parts,
    orthography: ctx.course.orthography,
    audio,
    accept: heardAccept(form.text),
    canonical: form.text,
    translation: translation.text,
  };
};

const writtenForm = (ctx: MakeContext, lexeme: BundleLexeme): TaggedText | undefined => lexeme.forms?.[ctx.course.orthography]?.[0];

/** A heard word's meaning (its gloss in the support language), for the feedback; nothing if the lexeme has none. */
const meaningOf = (ctx: MakeContext, lexeme: BundleLexeme): { readonly translation?: TaggedText } => {
  const gloss = lexeme.gloss?.[ctx.course.supportKey];
  return gloss === undefined ? {} : { translation: gloss };
};

export const makeListenSelect = (ctx: MakeContext, lexeme: BundleLexeme): ListenSelect | undefined => {
  const audio = audioOf(ctx, lexeme.id);
  const word = writtenForm(ctx, lexeme);
  if (audio === undefined || word === undefined) return undefined;
  const pool = otherLexemes(ctx, lexeme).flatMap((k) => writtenForm(ctx, k) ?? []);
  const others = pickDistinct(ctx, pool, [word], 2);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, word, others);
  return { template: "listen-select", id: id("listen-select", lexeme.id), item: lexeme.id, parts: [lexeme.id], orthography: ctx.course.orthography, audio, options, answer, ...meaningOf(ctx, lexeme) };
};

const distance = <T>(a: readonly T[], b: readonly T[]): number => {
  let row = b.map((_, j) => j + 1);
  for (const [i, x] of a.entries()) {
    const next = [i + 1];
    for (const [j, y] of b.entries()) next.push(Math.min((row[j] ?? 0) + 1, (next[j] ?? 0) + 1, (j === 0 ? i : (row[j - 1] ?? 0)) + (x === y ? 0 : 1)));
    row = next.slice(1);
  }
  return row[b.length - 1] ?? a.length;
};

/**
 * A word's pinned reading in a scheme: its words' readings, as the compiler pins them on a lexeme's
 * forms (ADR 0117), the reading its card shows and its clip was read from; undefined where a word
 * has none.
 */
const pinnedReading = (text: TaggedText, scheme: SchemeId): string | undefined => {
  const readings = text.tokens.filter((t) => t.kind === "lexical" || t.kind === "number").map((t) => t.readings?.[scheme]);
  return readings.length === 0 || readings.includes(undefined) ? undefined : readings.join(" ");
};

/**
 * Two words a learner must hear apart: with pinned readings (Jyutping), the same number of
 * syllables and one syllable one sound or tone off (maa1 / maa5); otherwise one letter apart
 * in writing (the profile's letters: Uzbek oʻ is one).
 */
const minimallyApart = (ctx: MakeContext, a: TaggedText, b: TaggedText): boolean => {
  // Heard apart: in the course's first tradition, whichever the learner reads in.
  const scheme = readingTradition(ctx.course);
  if (scheme !== undefined) {
    const ra = pinnedReading(a, scheme)?.split(" ");
    const rb = pinnedReading(b, scheme)?.split(" ");
    if (ra === undefined || rb === undefined || ra.length !== rb.length) return false;
    const differing = ra.flatMap((syllable, i) => (syllable === rb[i] ? [] : [[[...syllable], [...(rb[i] ?? "")]] as const]));
    const [only] = differing;
    return differing.length === 1 && only !== undefined && distance(only[0], only[1]) === 1;
  }
  const profile = profileOf(ctx.course, ctx.course.orthography);
  const la = profile.letters(surfaceOf(a));
  const lb = profile.letters(surfaceOf(b));
  return la.length >= 2 && lb.length >= 2 && distance(la, lb) === 1;
};

/**
 * The earlier words minimally apart from each lexeme's word, per course: they depend on the course
 * alone, and finding them compares the word with every earlier word's letters, which a plan did
 * for every word card it considered.
 */
const rivalsOf = new WeakMap<CourseView, Map<string, readonly TaggedText[]>>();

const rivals = (ctx: MakeContext, lexeme: BundleLexeme, word: TaggedText): readonly TaggedText[] => {
  let byLexeme = rivalsOf.get(ctx.course);
  if (byLexeme === undefined) {
    byLexeme = new Map();
    rivalsOf.set(ctx.course, byLexeme);
  }
  let found = byLexeme.get(lexeme.id);
  if (found === undefined) {
    found = otherLexemes(ctx, lexeme).flatMap((k) => {
      const other = writtenForm(ctx, k);
      return other !== undefined && keyOf(ctx.course, other) !== keyOf(ctx.course, word) && minimallyApart(ctx, word, other) ? [other] : [];
    });
    byLexeme.set(lexeme.id, found);
  }
  return found;
};

export const makeMinimalPair = (ctx: MakeContext, lexeme: BundleLexeme): MinimalPair | undefined => {
  const audio = audioOf(ctx, lexeme.id);
  const word = writtenForm(ctx, lexeme);
  if (audio === undefined || word === undefined) return undefined;
  const rival = ctx.rng.shuffle(rivals(ctx, lexeme, word))[0];
  if (rival === undefined) return undefined;
  const { options, answer } = withAnswer(ctx, word, [rival]);
  return { template: "minimal-pair", id: id("minimal-pair", lexeme.id), item: lexeme.id, parts: [lexeme.id], orthography: ctx.course.orthography, audio, options, answer, ...meaningOf(ctx, lexeme) };
};

// ------------------------------------------------------------------------------------ pronunciation in context (ADR 0054, 0095)

/**
 * The word of a sentence a pronunciation card asks about, among those that qualify: the first the
 * lesson introduces, else the sentence's last. Words `preferred` says yes to come first in each.
 */
const pronouncedWord = (ctx: MakeContext, s: BundleSentence, text: TaggedText, qualifies: (t: Token, index: number) => boolean, preferred: (index: number) => boolean = () => true): number | undefined => {
  const all = text.tokens.flatMap((t, i) => (t.kind === "lexical" && lexemeIdsOf(t).length > 0 && qualifies(t, i) ? [i] : []));
  const pick = (pool: readonly number[]): number | undefined => {
    const fresh = pool.find((i) => lexemeIdsOf(text.tokens[i] as Token).some((k) => ctx.introduced.includes(k)));
    return fresh ?? pool.at(-1);
  };
  // A mistake's word is asked again wherever it qualifies, preferred or not.
  return all.find((i) => asked(ctx, s, text.tokens[i] as Token)) ?? pick(all.filter(preferred)) ?? pick(all);
};

/**
 * The same word in another orthography of the sentence: the token that writes the same lexemes,
 * at the same occurrence. Undefined where the orthographies split the sentence into other words.
 */
const twinOf = (s: BundleSentence, text: TaggedText, index: number, orthography: string): TaggedText | undefined => {
  const other = s.forms[orthography]?.text;
  const target = text.tokens[index];
  if (other === undefined || target === undefined) return undefined;
  const key = (t: Token): string => JSON.stringify(lexemeIdsOf(t));
  const occurrence = text.tokens.slice(0, index).filter((t) => t.kind === "lexical" && key(t) === key(target)).length;
  const twin = other.tokens.filter((t) => t.kind === "lexical" && key(t) === key(target))[occurrence];
  return twin === undefined ? undefined : single(other, twin);
};

/** Which marks each letter takes in the course's words, by its place in the word (ADR 0098). Per course and orthography. */
const attestedOf = new WeakMap<CourseView, Map<string, ReturnType<typeof attestedMarks>>>();
const attestedIn = (course: CourseView, marks: VowelMarks): ReturnType<typeof attestedMarks> => {
  const byOrthography = attestedOf.get(course) ?? new Map<string, ReturnType<typeof attestedMarks>>();
  attestedOf.set(course, byOrthography);
  const known = byOrthography.get(course.orthography);
  if (known !== undefined) return known;
  const words = allSentences(course).flatMap((s) => (formOf(course, s)?.text.tokens ?? []).flatMap((t) => (t.kind === "lexical" ? [t.surface] : [])));
  const found = attestedMarks(marks, words);
  byOrthography.set(course.orthography, found);
  return found;
};

/**
 * The course's other spellings of a word's letters (homographs): the best wrong options, being real
 * words (ADR 0098). Every word the course writes, keyed by its letters.
 */
const homographsOf = new WeakMap<CourseView, Map<string, ReadonlyMap<string, readonly string[]>>>();
const homographs = (course: CourseView, marks: VowelMarks, word: string): readonly string[] => {
  const byOrthography = homographsOf.get(course) ?? new Map<string, ReadonlyMap<string, readonly string[]>>();
  homographsOf.set(course, byOrthography);
  let byLetters = byOrthography.get(course.orthography);
  if (byLetters === undefined) {
    const found = new Map<string, Set<string>>();
    for (const s of allSentences(course)) {
      for (const t of formOf(course, s)?.text.tokens ?? []) {
        if (t.kind !== "lexical") continue;
        const letters = withoutMarks(marks, t.surface);
        found.set(letters, (found.get(letters) ?? new Set()).add(t.surface.normalize("NFC")));
      }
    }
    byLetters = new Map([...found].map(([k, v]) => [k, [...v].sort()]));
    byOrthography.set(course.orthography, byLetters);
  }
  return (byLetters.get(withoutMarks(marks, word)) ?? []).filter((w) => gradeVowels(marks, word, w).verdict === "WRONG");
};

/**
 * An abjad word in its sentence, the sentence without vowel marks: choose the word with its marks
 * among other vocalizations of its letters (ADR 0098: typing an abjad's marks is a chore, and a word
 * has few plausible vocalizations). The course's homographs come first, then the word with one or
 * two letters' marks changed to marks the course writes most. Only words the vocalization marks.
 * Where the profile names an orthography of the course that spells the vowels (`marks.spelledIn`:
 * Arabizi for Lebanese), the learner may type the word in it instead, and words it can be found for
 * are asked first.
 */
export const makeVocalize = (ctx: MakeContext, s: BundleSentence): Vocalize | undefined => {
  const profile = profileOf(ctx.course, ctx.course.orthography);
  const marks = profile.marks;
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  // Only marks ordinary writing leaves out (an abjad's vowels: the profile ignores them in answers),
  // never accents that are part of the spelling (es, grc), which alphabets write anyway (ADR 0054).
  // The options trade the profile's marks: they are what an abjad's letters lose (ADR 0148 keeps
  // them as the reading side of a vowel-marked script's statement).
  if (marks === undefined || marks.policy !== "ignore" || form === undefined || translation === undefined) return undefined;
  const spelledIn = (profile.source.match?.marks?.spelledIn ?? []).filter((o) => o !== ctx.course.orthography);
  const spelledAt = (i: number): TaggedText | undefined => spelledIn.map((o) => twinOf(s, form.text, i, o)).find((t) => t !== undefined);
  const word = pronouncedWord(ctx, s, form.text, (t) => hasVowelMarks(marks, t.surface), (i) => spelledAt(i) !== undefined);
  if (word === undefined) return undefined;
  const bare = (t: Token): Token => {
    const { ruby: _ruby, ...rest } = t;
    return {
      ...rest,
      surface: withoutMarks(marks, t.surface),
      ...(t.lexemes === undefined ? {} : { lexemes: t.lexemes.map((l) => (l.surface === undefined ? l : { ...l, surface: withoutMarks(marks, l.surface) })) }),
    };
  };
  const token = form.text.tokens[word] as Token;
  const vocalized = single(form.text, token);
  const real = homographs(ctx.course, marks, token.surface);
  const made = ctx.rng.shuffle([...vocalizationVariants(marks, token.surface, attestedIn(ctx.course, marks))]).filter((v) => !real.includes(v));
  const others = [...real, ...made].slice(0, 3);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, vocalized, others.map((v) => single(form.text, { surface: v, kind: "lexical" })));
  const spelled = spelledAt(word);
  return {
    template: "vocalize",
    id: id("vocalize", s.id),
    item: s.id,
    parts: s.parts,
    orthography: ctx.course.orthography,
    prompt: { ...form.text, tokens: form.text.tokens.map(bare) },
    word,
    translation: translation.text,
    vocalized,
    options,
    answer,
    ...(spelled === undefined ? {} : { spelled }),
  };
};

/** A compiled `optionalBefore` rule as an exercise carries it (JSON). */
const ruleOf = (r: OptionalBefore): OptionalBeforeRule => ({
  marks: [...r.marks],
  letters: [...r.letters],
  ...(r.bare ? { bare: true as const } : {}),
  ...(r.unless.size === 0 ? {} : { unless: [...r.unless] }),
});

/**
 * Vowel marks put on a word's letters (ADR 0137), where the profile asks for it (`input.markBuilder`):
 * the word a vocalize card would ask, its letters given and the profile's marks on buttons. The
 * planner asks it only once a choice card has shown the word's marks (the fold's `shown`).
 */
export const makeVocalizeBuild = (ctx: MakeContext, s: BundleSentence): VocalizeBuild | undefined => {
  const profile = profileOf(ctx.course, ctx.course.orthography);
  const marks = profile.marks;
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  // The buttons are the profile's marks: what an abjad's letters lose (ADR 0148, as on vocalize).
  if (profile.source.input?.markBuilder !== true || marks === undefined || marks.policy !== "ignore" || form === undefined || translation === undefined) return undefined;
  const word = pronouncedWord(ctx, s, form.text, (t) => hasVowelMarks(marks, t.surface));
  if (word === undefined) return undefined;
  const token = form.text.tokens[word] as Token;
  const bare = (t: Token): Token => {
    const { ruby: _ruby, ...rest } = t;
    return {
      ...rest,
      surface: withoutMarks(marks, t.surface),
      ...(t.lexemes === undefined ? {} : { lexemes: t.lexemes.map((l) => (l.surface === undefined ? l : { ...l, surface: withoutMarks(marks, l.surface) })) }),
    };
  };
  const letters = graphemes(withoutMarks(marks, token.surface));
  const attested = attestedIn(ctx.course, marks);
  return {
    template: "vocalize-build",
    id: id("vocalize-build", s.id),
    item: s.id,
    parts: s.parts,
    orthography: ctx.course.orthography,
    prompt: { ...form.text, tokens: form.text.tokens.map(bare) },
    word,
    translation: translation.text,
    vocalized: single(form.text, token),
    letters,
    marks: [...marks.set],
    optional: [...marks.optional],
    ...(marks.optionalBefore.length === 0 ? {} : { optionalBefore: marks.optionalBefore.map(ruleOf) }),
    combos: letters.map((l, i) => attested(l, i === 0 ? "initial" : i === letters.length - 1 ? "final" : "medial")),
  };
};

/** A Han word in its sentence, the sentence without ruby: type the word's reading. Only words with a pinned reading. */
export const makeTranscribe = (ctx: MakeContext, s: BundleSentence): Transcribe | undefined => {
  const scheme = rubySchemeOf(ctx);
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  // Typed syllable by syllable (Jyutping), or as text its answer orthography's profile grades (ADR 0131).
  const typed = scheme !== undefined && (transcribable(scheme) || (typedByProfile(scheme) && ctx.course.profiles.has(readingTag(scheme)?.orthography ?? "")));
  if (scheme === undefined || !typed || form === undefined || translation === undefined) return undefined;
  const word = pronouncedWord(ctx, s, form.text, (t) => t.readings?.[scheme] !== undefined);
  if (word === undefined) return undefined;
  const reading = readingText(scheme, (form.text.tokens[word] as Token).readings?.[scheme] as string);
  const tradition = traditionKey(ctx.course, scheme);
  return {
    template: "transcribe",
    id: id("transcribe", s.id),
    item: s.id,
    parts: s.parts,
    orthography: reading.orthography,
    prompt: { ...form.text, tokens: form.text.tokens.map(stripRuby) },
    word,
    translation: translation.text,
    scheme,
    reading,
    ...(tradition === undefined ? {} : { tradition }),
  };
};

/** The script subtag of a language tag (apc-Latn-LB → Latn). */
const scriptSubtag = (lang: string): string | undefined => /-([A-Z][a-z]{3})(?:-|$)/u.exec(lang)?.[1];

/**
 * Whether an answer is written in `spelled`'s script rather than the word's own: some letter of
 * that script and none of the word's (Latin letters for an Arabic word: Arabizi).
 */
const writtenIn = (spelled: TaggedText, word: TaggedText, answer: string): boolean => {
  const theirs = scriptSubtag(spelled.lang);
  const ours = scriptSubtag(word.lang);
  if (theirs === undefined || ours === undefined || theirs === ours) return false;
  const letter = (script: string): RegExp => new RegExp(`\\p{Script_Extensions=${script}}`, "u");
  return letter(theirs).test(answer) && !letter(ours).test(answer);
};

/** Lexeme templates that need a clip of the word. */
export const LEXEME_LISTENING: readonly ((ctx: MakeContext, lexeme: BundleLexeme) => Exercise | undefined)[] = [makeListenSelect, makeMinimalPair];

/** Templates built from one lexeme, by id: mistakes mode rebuilds a missed one. */
export const LEXEME_TEMPLATES: Readonly<Partial<Record<TemplateId, (ctx: MakeContext, lexeme: BundleLexeme) => Exercise | undefined>>> = {
  "select-image": makeSelectImage,
  "listen-select": makeListenSelect,
  "minimal-pair": makeMinimalPair,
};

export const SENTENCE_TEMPLATES: Readonly<Partial<Record<TemplateId, (ctx: MakeContext, s: BundleSentence) => Exercise | undefined>>> = {
  "choose-translation": makeChooseTranslation,
  "translate-tap.l2-l1": makeTapL2L1,
  "translate-tap.l1-l2": makeTapL1L2,
  "translate-type.l1-l2": makeTranslateType,
  "complete-translation": makeCompleteTranslation,
  "gap-fill": makeGapFill,
  "parts-whole": makePartsWhole,
  "whole-parts": makeWholeParts,
  "spelling-choice": makeSpellingChoice,
  "char-read": makeCharRead,
  "reading-feature": makeReadingFeature,
  "reading-disambiguation": makeReadingDisambiguation,
  vocalize: makeVocalize,
  "vocalize-build": makeVocalizeBuild,
  transcribe: makeTranscribe,
  "speak.tier-0": makeSpeak,
  speak: makeSpeakScored,
  "listen-speak": makeListenSpeak,
  "tone-identify": makeToneIdentify,
  "listen-tap": makeListenTap,
  "listen-type": makeListenType,
};

// ------------------------------------------------------------------------------------ grading

const choice = (index: number, answer: number, solution: TaggedText | undefined): Outcome => ({
  verdict: index === answer ? "CORRECT" : "WRONG",
  notes: [],
  solution,
});

/**
 * Grades through the accept set. The wording the card shows as the answer is the canonical one:
 * the notation's own canonical path includes every optional part ([Yo] me llamo…), which the shown
 * text may leave out. An answer on the shown wording's path is CORRECT (not "another correct
 * solution" that repeats it); another accepted wording is CORRECT_ALT, with the shown one beside it.
 */
const graded = (grader: Grader, ex: { readonly orthography: string; readonly accept: string }, answer: string, solution: TaggedText): Outcome => {
  const g = grader.grade(ex.orthography, ex.accept, answer);
  // The accepted wording nearest the shown text: the shown text itself, which every set holds.
  const onShown = g.matched === grader.grade(ex.orthography, ex.accept, surfaceOf(solution)).matched;
  const verdict = g.verdict === "CORRECT_ALT" && onShown ? "CORRECT" : g.verdict === "CORRECT" && !onShown ? "CORRECT_ALT" : g.verdict;
  return { verdict, notes: g.notes, solution, alignment: g.alignment, closestIsSolution: onShown, labels: g.labels, correspondences: g.correspondences };
};

const mismatch = (ex: Exercise, response: Response): never => {
  throw new Error(`${ex.template} cannot take a ${response.tag} response`);
};

/**
 * What the learner answered, as text: typed, built from tiles, or the option chosen (in its
 * sentence, where the exercise fills a gap). A report of a choice or a tile order needs it,
 * since the answer event keeps typed text only.
 */
export const answerTextOf = (ex: Exercise, response: Response): string | undefined => {
  if (response.tag === "text") return response.text;
  if (response.tag === "tiles" && "tiles" in ex && "joiner" in ex) return tilesText(ex, response.order);
  if (response.tag !== "choice" || !("options" in ex) || ex.template === "whole-parts") return undefined;
  const option: TaggedText | { readonly text: TaggedText } | undefined = ex.options[response.index];
  if (option === undefined) return undefined;
  const chosen = surfaceOf("tokens" in option ? option : option.text);
  return "before" in ex && "after" in ex ? `${surfaceOf(ex.before)}${chosen}${surfaceOf(ex.after)}` : chosen;
};

/**
 * The word a wrong choice chose, on a card whose options are words of the course
 * (`TemplateInfo.wordOptions`): what the feedback says the meaning of (P3, ADR 0121). None for a
 * right choice, or another card.
 */
export const chosenWordOf = (ex: Exercise, response: Response | null | undefined): TaggedText | undefined => {
  if (response?.tag !== "choice" || TEMPLATES[ex.template].wordOptions !== true || ex.template === "whole-parts" || !("options" in ex) || !("answer" in ex) || response.index === ex.answer) return undefined;
  const option: TaggedText | { readonly text: TaggedText } | undefined = ex.options[response.index];
  return option === undefined ? undefined : "tokens" in option ? option : option.text;
};

/** Pure: the outcome of a response (§8.3). Grading of typed and tiled answers goes through the grader. */
export const gradeExercise = (ex: Exercise, response: Response, grader: Grader): Outcome => {
  switch (ex.template) {
    case "select-image":
      return response.tag === "choice" ? choice(response.index, ex.answer, ex.options[ex.answer]?.text) : mismatch(ex, response);
    case "choose-translation":
    case "gap-fill":
    case "spelling-choice":
    case "char-read":
    case "reading-feature":
    case "reading-disambiguation":
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
    case "letter-read":
    case "word-read":
      return response.tag === "choice" ? choice(response.index, ex.answer, ex.options[ex.answer]) : mismatch(ex, response);
    case "tone-identify":
      return response.tag === "choice" ? choice(response.index, ex.answer, ex.syllable) : mismatch(ex, response);
    case "vocalize": {
      if (response.tag === "choice") return choice(response.index, ex.answer, ex.options[ex.answer]);
      if (response.tag !== "text") return mismatch(ex, response);
      // Typed in an orthography that spells the vowels (Arabizi): the word as it writes it, exactly
      // as the profile compares letters, since a slip there may be a vowel. Anything else is wrong.
      if (ex.spelled !== undefined && writtenIn(ex.spelled, ex.vocalized, response.text)) {
        const verdict = grader.grade(ex.spelled.orthography, literalAccept(surfaceOf(ex.spelled)), response.text).verdict;
        const right = verdict === "CORRECT" || verdict === "CORRECT_ALT" || verdict === "CORRECT_VARIANT" || verdict === "CORRECT_MARKS";
        return { verdict: right ? "CORRECT" : "WRONG", notes: [], solution: ex.spelled };
      }
      return { verdict: "WRONG", notes: [], solution: ex.spelled ?? ex.vocalized };
    }
    case "vocalize-build": {
      if (response.tag !== "text") return mismatch(ex, response);
      // Letter by letter (ADR 0137): the marks each letter has, optional ones (sukun, a fatha before an alif) not counted.
      const optionalBefore = (ex.optionalBefore ?? []).map((r) => ({ marks: new Set(r.marks), letters: new Set(r.letters), bare: r.bare === true, unless: new Set(r.unless ?? []) }));
      const g = gradeVowels({ set: new Set(ex.marks), optional: new Set(ex.optional), optionalBefore }, surfaceOf(ex.vocalized), response.text);
      return { verdict: g.verdict, notes: g.notes, solution: ex.vocalized };
    }
    case "transcribe": {
      if (response.tag !== "text") return mismatch(ex, response);
      // A reading typed as text (Schluessel, ADR 0131): its answer orthography's profile grades it, so a
      // mark left out is noted unless it spells another word.
      if (typedByProfile(ex.scheme)) {
        const g = grader.grade(ex.reading.orthography, literalAccept(surfaceOf(ex.reading)), response.text);
        return { verdict: g.verdict, notes: g.notes, solution: ex.reading, alignment: g.alignment, labels: g.labels, correspondences: g.correspondences };
      }
      const g = gradeReading(ex.scheme, surfaceOf(ex.reading), response.text);
      return { verdict: g.verdict, notes: g.notes, solution: ex.reading };
    }
    case "speak":
    case "listen-speak": {
      // Without a microphone the learner rates themselves, as at tier 0.
      if (response.tag === "self-rating") return { verdict: response.rating === "again" ? "WRONG" : "CORRECT", notes: [], solution: ex.prompt, selfRated: true };
      if (response.tag !== "speech") return mismatch(ex, response);
      const { verdict, notes, offTokens } = gradeSpeech(response.result);
      return { verdict, notes, solution: ex.prompt, offTokens };
    }
    case "story-arrange": {
      if (response.tag !== "tiles") return mismatch(ex, response);
      // The line's own words in its order; tiles that read the same are interchangeable.
      const read = (order: readonly number[]): string => JSON.stringify(order.map((i) => surfaceOf(ex.tiles[i] as TaggedText)));
      return { verdict: read(response.order) === read(ex.solution) ? "CORRECT" : "WRONG", notes: [], solution: ex.canonical };
    }
    case "match-pairs":
    case "letter-pairs":
      return response.tag === "pairs" ? { verdict: "CORRECT", notes: response.mistakes > 0 ? ["pairs-mistakes"] : [] } : mismatch(ex, response);
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
    case "word-write":
      if (response.tag !== "tiles") return mismatch(ex, response);
      return graded(grader, ex, tilesText(ex, response.order), ex.canonical);
    case "translate-type.l1-l2":
    case "listen-type":
      return response.tag === "text" ? graded(grader, ex, response.text, ex.canonical) : mismatch(ex, response);
    case "complete-translation":
      return response.tag === "text"
        ? graded(grader, ex, `${surfaceOf(ex.before)}${response.text}${surfaceOf(ex.after)}`, ex.canonical)
        : mismatch(ex, response);
    case "parts-whole":
      return response.tag === "text" ? graded(grader, ex, response.text, ex.whole) : mismatch(ex, response);
    case "whole-parts": {
      if (response.tag !== "tiles") return mismatch(ex, response);
      // Every part, and no other: in whatever order they were picked.
      const picked = new Set(response.order);
      const right = picked.size === ex.solution.length && ex.solution.every((i) => picked.has(i));
      return { verdict: right ? "CORRECT" : "WRONG", notes: [] };
    }
    case "speak.tier-0":
      if (response.tag !== "self-rating") return mismatch(ex, response);
      return { verdict: response.rating === "again" ? "WRONG" : "CORRECT", notes: [], selfRated: true };
  }
};

/** The answer to reveal when an exercise is skipped. */
export const solutionOf = (ex: Exercise): TaggedText | undefined => {
  switch (ex.template) {
    case "select-image":
      return ex.options[ex.answer]?.text;
    case "choose-translation":
    case "gap-fill":
    case "spelling-choice":
    case "char-read":
    case "reading-feature":
    case "reading-disambiguation":
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
    case "letter-read":
    case "word-read":
      return ex.options[ex.answer];
    case "story-arrange":
      return ex.canonical;
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "translate-type.l1-l2":
    case "complete-translation":
    case "listen-tap":
    case "listen-type":
    case "word-write":
      return ex.canonical;
    case "speak.tier-0":
    case "speak":
    case "listen-speak":
      return ex.prompt;
    case "tone-identify":
      return ex.syllable;
    case "vocalize":
    case "vocalize-build":
      return ex.vocalized;
    case "transcribe":
      return ex.reading;
    case "parts-whole":
      return ex.whole;
    // A word's parts are several things, some named in the support language: the card marks them itself.
    case "whole-parts":
    case "match-pairs":
    case "letter-pairs":
      return undefined;
  }
};

/**
 * What a card showed to ask its question, where that was text other than its answer (the end of a
 * session lists a missed card with it, P9): its prompt, a gap's hint, the word in its context. None
 * for a card asked by ear, a sentence to say (its prompt is its answer), a story's gap or the pairs.
 */
export const promptOf = (ex: Exercise): TaggedText | undefined => {
  switch (ex.template) {
    case "select-image":
    case "choose-translation":
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "word-write":
    case "translate-type.l1-l2":
    case "complete-translation":
    case "char-read":
    case "reading-feature":
    case "letter-read":
    case "word-read":
    case "vocalize":
    case "vocalize-build":
    case "transcribe":
    case "story-choose":
    case "story-arrange":
    case "whole-parts":
      return ex.prompt;
    case "gap-fill":
    case "spelling-choice":
    case "parts-whole":
      return ex.hint;
    case "reading-disambiguation":
      return ex.context;
    case "speak.tier-0":
    case "speak":
    case "listen-speak":
    case "listen-tap":
    case "listen-type":
    case "listen-select":
    case "minimal-pair":
    case "tone-identify":
    case "story-complete":
    case "match-pairs":
    case "letter-pairs":
      return undefined;
  }
};
