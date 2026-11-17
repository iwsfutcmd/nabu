/**
 * The Phase 3 template catalog (gameplan §8.1–8.2). Each template is data plus
 * pure functions: `make` instantiates it from a sentence or KC (undefined when
 * not eligible), `grade` turns a response into an outcome. Randomness comes
 * from the injected seeded Rng only.
 */
import type { Asks, BundleKc, BundleSentence, KcId, Persons, SchemeId, TaggedText, Token } from "@nabu/schema";
import { literalAccept } from "../accept/notation.ts";
import { glossUnits } from "../match/gloss.ts";
import { compileAcceptSet, grade, type CompiledAcceptSet } from "../match/grade.ts";
import { readingTag } from "../profile/schemes.ts";
import { attestedMarks, gradeReading, gradeVowels, hasVowelMarks, letterVariants, toneVariants, transcribable, typedByProfile, vocalizationVariants, withoutMarks, type VowelMarks } from "../match/pronounce.ts";
import { graphemes } from "../text/graphemes.ts";
import { surfaceOf } from "../text/tagged-text.ts";
import { tilesOf } from "./tiles.ts";
import { readingTradition, traditionKey } from "./traditions.ts";
import { allKcs, allSentences, lexiconOf, profileOf, type CourseView, type Grader } from "./course.ts";
import { askedOfToken, formSignature, senseKcOf, sameKind } from "./signature.ts";
import type {
  CharRead,
  ChooseTranslation,
  CompleteTranslation,
  Exercise,
  Facet,
  FacetRef,
  GapFill,
  ListenSelect,
  ListenSpeak,
  ListenTap,
  ListenType,
  MatchPairs,
  MinimalPair,
  Outcome,
  ReadingDisambiguation,
  Transcribe,
  Vocalize,
  VocalizeBuild,
  Response,
  SelectImage,
  Speak,
  SpeakScored,
  TemplateId,
  ToneIdentify,
  TranslateTap,
  TranslateType,
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
  /** It can present a word for the first time: a new KC is recognized before it is produced or read. */
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
  "gap-fill": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.2, wordOptions: true },
  "char-read": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.4 },
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
};

/** Templates that play audio: "can't listen now" leaves them out (§10, §11.5). */
export const LISTENING: ReadonlySet<TemplateId> = new Set(
  (Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].modality.audioOut),
);

/** Templates that need the microphone: "can't speak now" leaves them out. */
export const SPEAKING: ReadonlySet<TemplateId> = new Set((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].modality.mic));

/** Which (KC, facet) pairs an instance exercises (§8.5 credit assignment). */
export const facets = (ex: Exercise): readonly FacetRef[] => ex.kcs.map((kc) => ({ kc, facet: TEMPLATES[ex.template].facet }));

// ------------------------------------------------------------------------------------ context

export interface MakeContext {
  readonly course: CourseView;
  readonly rng: Rng;
  /** KCs the current node introduces: new words get the recognition templates first. */
  readonly introduced: readonly KcId[];
  /**
   * Words the session wants typed (ADR 0101): a sentence's blank is one of them where it has one,
   * before a word the node introduces.
   */
  readonly focus?: ReadonlySet<string> | undefined;
  /**
   * A mistake's word (its KCs, sorted, as its answer credited them): a card about one word of its
   * sentence asks that word again, before any other.
   */
  readonly ask?: readonly string[] | undefined;
  /**
   * What a fill-in mistake asked of its word (ADR 0132): which word (`ask` is its sense) or which
   * form (`ask` is its form signature). It is asked again as the same question. Absent for other
   * cards, and for a fill-in's mistake from before ADR 0132 (`ask` is all of the word's KCs).
   */
  readonly asks?: Asks | undefined;
  /**
   * The reading tradition the learner reads in (ADR 0138: the ruby layer they last chose), where
   * the orthography has several: reading cards ask it. Absent or not one of them: the first.
   */
  readonly reading?: SchemeId | undefined;
}

/**
 * Whether a token is the word a mistake asks again (`MakeContext.ask`): exactly its KCs, or, for a
 * fill-in's mistake (`MakeContext.asks`), exactly what that question credits of it.
 */
const asked = (ctx: MakeContext, token: Token): boolean => {
  if (ctx.ask === undefined) return false;
  const kcs = [...new Set((ctx.asks === undefined ? tokenKcs(token) : askedOfToken(token, ctx.asks)).map(String))].sort();
  return kcs.length > 0 && kcs.length === ctx.ask.length && kcs.every((kc, i) => kc === ctx.ask?.[i]);
};

const id = (template: TemplateId, item: string): string => `${template}:${item}`;

const words = (text: TaggedText): readonly number[] =>
  text.tokens.flatMap((t, i) => (t.kind === "word" || t.kind === "number" ? [i] : []));

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
const personsOf = (s: BundleSentence): { readonly persons?: Persons } => (s.persons === undefined ? {} : { persons: s.persons });

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

const wordSurfaces = (course: CourseView, text: TaggedText): readonly string[] => text.tokens.filter((t) => t.kind === "word").map((t) => lowerIn(course, text.lang, t.surface));

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
  const word = text.tokens.find((t) => t.kind === "word")?.surface ?? "";
  return word !== lowerIn(course, text.lang, word);
};

/** Places `answer` among `others` at a random position. */
const withAnswer = <T>(ctx: MakeContext, answer: T, others: readonly T[]): { readonly options: readonly T[]; readonly answer: number } => {
  const at = ctx.rng.int(others.length + 1);
  return { options: [...others.slice(0, at), answer, ...others.slice(at)], answer: at };
};

/** Each sentence's and KC's unit, by position in the course (built once per course). */
const unitIndex = new WeakMap<CourseView, ReadonlyMap<string, number>>();

const unitOf = (course: CourseView, id: string): number => {
  let index = unitIndex.get(course);
  if (index === undefined) {
    const built = new Map<string, number>();
    for (const [i, u] of course.units.entries()) {
      for (const s of u.sentences) if (!built.has(s.id)) built.set(s.id, i);
      for (const k of u.kcs) if (!built.has(k.id)) built.set(k.id, i);
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

const otherKcs = (ctx: MakeContext, kc: BundleKc): readonly BundleKc[] => {
  const before = known(ctx.course, kc.id);
  return allKcs(ctx.course).filter((k) => k.id !== kc.id && before(k.id));
};

// ------------------------------------------------------------------------------------ KC templates

const pictured = (ctx: MakeContext, kc: BundleKc): boolean =>
  kc.image !== undefined && (kc.forms?.[ctx.course.orthography]?.length ?? 0) > 0 && kc.gloss?.[ctx.course.supportKey] !== undefined;

export const makeSelectImage = (ctx: MakeContext, kc: BundleKc): SelectImage | undefined => {
  if (!pictured(ctx, kc)) return undefined;
  const { orthography, supportKey } = ctx.course;
  const option = (k: BundleKc) => ({ text: k.forms?.[orthography]?.[0] as TaggedText, image: k.image as string });
  const pool = otherKcs(ctx, kc).filter((k) => pictured(ctx, k) && k.image !== kc.image);
  const others = pickDistinct(ctx, pool.map((k) => option(k).text), [option(kc).text], 2);
  if (others.length < 2) return undefined;
  const otherOptions = others.map((t) => option(pool.find((k) => k.forms?.[orthography]?.[0] === t) as BundleKc));
  const { options, answer } = withAnswer(ctx, option(kc), otherOptions);
  return {
    template: "select-image",
    id: id("select-image", kc.id),
    item: kc.id,
    kcs: [kc.id],
    orthography,
    prompt: kc.gloss?.[supportKey] as TaggedText,
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
  return out.some((t) => t.kind === "word") ? { ...text, tokens: out } : text;
};

export const makeMatchPairs = (ctx: MakeContext, kcs: readonly BundleKc[]): MatchPairs | undefined => {
  const { orthography, supportKey } = ctx.course;
  const usable = kcs.filter((k) => k.kind === "sense" && (k.forms?.[orthography]?.length ?? 0) > 0 && k.gloss?.[supportKey] !== undefined);
  const byText = (t: TaggedText) => usable.find((k) => k.forms?.[orthography]?.[0] === t) as BundleKc;
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
    kcs: chosen.map((t) => byText(t).id),
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
    kcs: s.kcs,
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
    kcs: s.kcs,
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
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    prompt: translation.text,
    accept,
    canonical: form.text,
    ...personsOf(s),
  };
};

/**
 * The word to blank out: one the session wants typed (ADR 0101), else one carrying a KC this node
 * introduces, else the last word.
 */
const blankIndex = (ctx: MakeContext, text: TaggedText): number | undefined => {
  const indexes = words(text);
  if (indexes.length < 2) return undefined;
  const kcsAt = (i: number): readonly string[] => tokenKcs(text.tokens[i] as Token);
  const again = indexes.find((i) => asked(ctx, text.tokens[i] as Token));
  const focus = ctx.focus === undefined ? undefined : indexes.find((i) => kcsAt(i).some((k) => ctx.focus?.has(k) === true));
  const fresh = indexes.find((i) => kcsAt(i).some((k) => ctx.introduced.includes(k as KcId)));
  return again ?? focus ?? fresh ?? indexes[indexes.length - 1];
};

export const makeCompleteTranslation = (ctx: MakeContext, s: BundleSentence): CompleteTranslation | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  const accept = producible(ctx.course, s);
  if (form === undefined || translation === undefined || accept === undefined) return undefined;
  const at = blankIndex(ctx, form.text);
  if (at === undefined) return undefined;
  return {
    template: "complete-translation",
    id: id("complete-translation", s.id),
    item: s.id,
    kcs: s.kcs,
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

/** A word a fill-in may offer: a word token of a sentence of the course, as an option, with its sense and form signature. */
interface Attested {
  readonly option: TaggedText;
  readonly sentence: string;
  readonly sense: string;
  readonly signature: readonly KcId[];
  readonly signatureKey: string;
}

interface AttestedWords {
  readonly bySignature: ReadonlyMap<string, readonly Attested[]>;
  readonly bySense: ReadonlyMap<string, readonly Attested[]>;
}

const attestedUpTo = new WeakMap<CourseView, Map<number, AttestedWords>>();

/**
 * The words a sentence's fill-in may offer: those of the sentences of its unit and earlier ones (ADR
 * 0050), by form signature (a word question's options) and by sense (a form question's). Built once
 * per course and unit; options are made once, so their keys are computed once.
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
    const bySense = new Map<string, Attested[]>();
    for (const o of sentencesThrough(ctx.course, at)) {
      const text = formOf(ctx.course, o)?.text;
      if (text === undefined) continue;
      for (const i of alone(text)) {
        const token = text.tokens[i] as Token;
        const sense = senseKcOf(token);
        if (sense === undefined) continue;
        const signature = formSignature(token);
        const word: Attested = { option: single(text, token), sentence: o.id, sense, signature, signatureKey: signature.join(" ") };
        bySignature.set(word.signatureKey, [...(bySignature.get(word.signatureKey) ?? []), word]);
        bySense.set(sense, [...(bySense.get(sense) ?? []), word]);
      }
    }
    built = { bySignature, bySense };
    byUnit.set(at, built);
  }
  return built;
};

/**
 * A text's words that are a sense on their own: not a word of a phrase KC (por of por favor, مع of
 * مع السلامة, which alone is only part of its sense) and not a word the text repeats. Only these
 * are blanked or offered (ADR 0132).
 */
const alone = (text: TaggedText): readonly number[] => {
  const all = words(text);
  const senses = all.map((i) => (text.tokens[i] as Token).sense);
  return all.filter((i) => {
    const sense = (text.tokens[i] as Token).sense;
    return sense !== undefined && senses.filter((x) => x === sense).length === 1;
  });
};

const kcMaps = new WeakMap<CourseView, ReadonlyMap<string, BundleKc>>();

const kcById = (course: CourseView): ReadonlyMap<string, BundleKc> => {
  let map = kcMaps.get(course);
  if (map === undefined) {
    map = new Map(allKcs(course).map((k) => [k.id as string, k]));
    kcMaps.set(course, map);
  }
  return map;
};

const MEANING_BREAK = /^[;；,，/、]$/u;
const meaningSets = new WeakMap<CourseView, Map<string, ReadonlySet<string>>>();

/**
 * A KC's meanings in the support language: its gloss split where it lists meanings (; , /), notes in
 * parentheses left out, each meaning's words in its language's lower case. ay- "to say" and de- "to
 * say, tell" share "to say".
 */
const meaningsOf = (course: CourseView, kc: string): ReadonlySet<string> => {
  let byKc = meaningSets.get(course);
  if (byKc === undefined) {
    byKc = new Map();
    meaningSets.set(course, byKc);
  }
  let meanings = byKc.get(kc);
  if (meanings === undefined) {
    const gloss = kcById(course).get(kc)?.gloss?.[course.supportKey];
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
      else if (t.kind === "word" || t.kind === "number") current.push(lowerIn(course, gloss?.lang ?? course.support, t.surface));
    }
    close();
    meanings = found;
    byKc.set(kc, meanings);
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
  const { words: lexicon, inflected, forms } = lexiconOf(course, course.orthography);
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
 * Which word (ADR 0132): two other words in the answer's form (its form signature) and of its part
 * of speech and features, from the unit or earlier; never one whose meaning the answer's gloss
 * shares, or one the sentence's accept set takes in the gap. Each with the answer's case (P2): a
 * capital that only marks the sentence's first word must not mark the answer.
 */
const wordQuestion = (ctx: MakeContext, gap: GapParts): readonly TaggedText[] | undefined => {
  const sense = senseKcOf(gap.target);
  if (sense === undefined) return undefined;
  const kcs = kcById(ctx.course);
  const own = kcs.get(sense);
  const signature = formSignature(gap.target).join(" ");
  const pool = (attestedFor(ctx, gap.s).bySignature.get(signature) ?? []).filter(
    (c) => c.sentence !== gap.s.id && c.sense !== sense && sameKind(own, kcs.get(c.sense)) && !sharesMeaning(ctx.course, sense, c.sense),
  );
  const capital = capitalized(ctx.course, gap.correct);
  const order = ranked(ctx, pool, (c) => (capitalized(ctx.course, c.option) === capital ? 1 : 0));
  return pickTwo(ctx, order, gap.correct, (c) => c.sense, (c) => !takes(ctx.course, gap.s, gap.before, c.option, gap.after));
};

/**
 * Which form (ADR 0132): the answer's own word (its sense) in two other forms the course writes in the
 * unit or earlier, the forms nearest the answer's first (most of its form KCs shared); never one the
 * sentence's accept set takes in the gap. The answer must have a form to credit: a bare word asks
 * which word only.
 */
const formQuestion = (ctx: MakeContext, gap: GapParts): readonly TaggedText[] | undefined => {
  const sense = senseKcOf(gap.target);
  const signature = formSignature(gap.target);
  if (sense === undefined || signature.length === 0) return undefined;
  const key = signature.join(" ");
  const own = new Set<string>(signature);
  const pool = (attestedFor(ctx, gap.s).bySense.get(sense) ?? []).filter((c) => c.sentence !== gap.s.id && c.signatureKey !== key);
  const capital = capitalized(ctx.course, gap.correct);
  const order = ranked(ctx, pool, (c) => (capitalized(ctx.course, c.option) === capital ? 4 : 0) + c.signature.filter((k) => own.has(k)).length - Math.abs(c.signature.length - signature.length) * 0.5);
  return pickTwo(ctx, order, gap.correct, (c) => c.signatureKey, (c) => !takes(ctx.course, gap.s, gap.before, c.option, gap.after));
};

const WORD_FIRST: readonly Asks[] = ["word", "form"];
const FORM_FIRST: readonly Asks[] = ["form", "word"];

/** A word a fill-in may blank, and the questions to try on it, in order. */
interface Blank {
  readonly at: number;
  readonly asks: readonly Asks[];
}

/**
 * The words a fill-in may blank, best first, each with what to ask of it (ADR 0132). A mistake's word
 * is asked again as the question it was (`MakeContext.ask`, `asks`), and nothing else. Otherwise the
 * words the session wants typed (ADR 0101), then words carrying a KC the node introduces, each asked
 * about what made it the choice: its sense, which word; a KC of its form, which form. Then the rest,
 * from the last word, which word first. A word needs a sense of its own (`alone`): what a question
 * credits.
 */
const blanksOf = (ctx: MakeContext, text: TaggedText): readonly Blank[] => {
  if (words(text).length < 2) return [];
  const indexes = alone(text);
  if (ctx.ask !== undefined) {
    const again = indexes.find((i) => asked(ctx, text.tokens[i] as Token));
    return again === undefined ? [] : [{ at: again, asks: ctx.asks === undefined ? WORD_FIRST : [ctx.asks] }];
  }
  const by = (has: (kc: string) => boolean): readonly Blank[] =>
    indexes.flatMap((at) => {
      const token = text.tokens[at] as Token;
      if (has(senseKcOf(token) as string)) return [{ at, asks: WORD_FIRST }];
      return formSignature(token).some(has) ? [{ at, asks: FORM_FIRST }] : [];
    });
  const focus = ctx.focus === undefined ? [] : by((kc) => ctx.focus?.has(kc) === true);
  const fresh = by((kc) => ctx.introduced.includes(kc as KcId));
  const rest = [...indexes].reverse().map((at) => ({ at, asks: WORD_FIRST }));
  const out: Blank[] = [];
  for (const b of [...focus, ...fresh, ...rest]) if (!out.some((o) => o.at === b.at)) out.push(b);
  return out;
};

/**
 * A target sentence with a gap; choose what fits (ADR 0132). The card asks one thing: which word, or
 * which form. The first blank (blanksOf) whose question can be built is asked; none, no card.
 */
export const makeGapFill = (ctx: MakeContext, s: BundleSentence): GapFill | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  for (const blank of blanksOf(ctx, form.text)) {
    const target = form.text.tokens[blank.at] as Token;
    const gap: GapParts = {
      s,
      target,
      correct: single(form.text, target),
      before: slice(form.text, 0, blank.at),
      after: slice(form.text, blank.at + 1, form.text.tokens.length),
    };
    for (const asks of blank.asks) {
      const others = asks === "word" ? wordQuestion(ctx, gap) : formQuestion(ctx, gap);
      if (others === undefined) continue;
      const { options, answer } = withAnswer(ctx, gap.correct, others);
      return {
        template: "gap-fill",
        id: id("gap-fill", s.id),
        item: s.id,
        kcs: s.kcs,
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
    { surface: syllable, kind: "word" as const },
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
        const r = t.kind === "word" ? t.readings?.[scheme] : undefined;
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
  const readable = (t: Token): boolean => t.kind === "word" && t.readings?.[scheme] !== undefined;
  const again = form.text.tokens.findIndex((t) => readable(t) && asked(ctx, t));
  const fresh = form.text.tokens.findIndex((t) => readable(t) && ctx.introduced.some((k) => k === `sense:${t.sense}`));
  const word = again >= 0 ? again : fresh >= 0 ? fresh : form.text.tokens.findIndex(readable);
  const target = form.text.tokens[word];
  if (target === undefined) return undefined;
  const reading = target.readings?.[scheme] as string;
  const syllables = reading.split(" ").length;
  const tones = ctx.rng.shuffle([...toneVariants(scheme, reading, courseSyllables(ctx.course, scheme))]).slice(0, 2);
  // Where the script writes some of the scheme's letters alike (its `variants`, ADR 0131: Chaghatay's
  // unwritten vowels), the course's other readings of the word's spelling come first, then the
  // reading with one such letter traded, every option in the answer's case: what the script leaves open.
  const traded = letterVariants(scheme, reading);
  const lang = readingTag(scheme)?.lang;
  const same = (a: string, b: string): boolean => a.toLocaleLowerCase(lang) === b.toLocaleLowerCase(lang);
  const cased = traded.length === 0 ? (r: string): string => r : (r: string): string => likeCase(r, reading, lang);
  const alike =
    traded.length === 0 ? [] : [...ctx.rng.shuffle(spellingReadings(ctx.course, scheme, target.surface).map(cased)), ...ctx.rng.shuffle([...traded])];
  const close = [...tones, ...alike].filter((r, i, all) => !same(r, reading) && all.findIndex((x) => same(x, r)) === i);
  const pool = otherSentences(ctx, s)
    .flatMap((o) => formOf(ctx.course, o)?.text.tokens ?? [])
    .flatMap((t) => (readable(t) ? [cased(t.readings?.[scheme] as string)] : []))
    .filter((r) => r.split(" ").length === syllables && r !== reading && !close.includes(r) && (traded.length === 0 || !same(r, reading)));
  const others = [...new Set([...close, ...ctx.rng.shuffle(pool)])].slice(0, 3);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, readingText(scheme, reading), others.map((r) => readingText(scheme, r)));
  const translation = translationOf(ctx.course, s);
  const tradition = traditionKey(ctx.course, scheme);
  return {
    template: "char-read",
    id: id("char-read", `${s.id}:${target.surface}`),
    item: s.id,
    kcs: s.kcs,
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
        kcs: token.sense === undefined ? s.kcs : [`sense:${token.sense}` as KcId],
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
    kcs: s.kcs,
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
    kcs: s.kcs,
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
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    audio,
    accept: heardAccept(form.text),
    canonical: form.text,
    translation: translation.text,
  };
};

const writtenForm = (ctx: MakeContext, kc: BundleKc): TaggedText | undefined => kc.forms?.[ctx.course.orthography]?.[0];

/** A heard word's meaning (its gloss in the support language), for the feedback; nothing if the KC has none. */
const meaningOf = (ctx: MakeContext, kc: BundleKc): { readonly translation?: TaggedText } => {
  const gloss = kc.gloss?.[ctx.course.supportKey];
  return gloss === undefined ? {} : { translation: gloss };
};

export const makeListenSelect = (ctx: MakeContext, kc: BundleKc): ListenSelect | undefined => {
  const audio = audioOf(ctx, kc.id);
  const word = writtenForm(ctx, kc);
  if (audio === undefined || word === undefined) return undefined;
  const pool = otherKcs(ctx, kc).flatMap((k) => writtenForm(ctx, k) ?? []);
  const others = pickDistinct(ctx, pool, [word], 2);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, word, others);
  return { template: "listen-select", id: id("listen-select", kc.id), item: kc.id, kcs: [kc.id], orthography: ctx.course.orthography, audio, options, answer, ...meaningOf(ctx, kc) };
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
 * A word's pinned reading in a scheme: its words' readings, as the compiler pins them on a KC's
 * forms (ADR 0117), the reading its card shows and its clip was read from; undefined where a word
 * has none.
 */
const pinnedReading = (text: TaggedText, scheme: SchemeId): string | undefined => {
  const readings = text.tokens.filter((t) => t.kind === "word" || t.kind === "number").map((t) => t.readings?.[scheme]);
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
 * The earlier words minimally apart from each KC's word, per course: they depend on the course
 * alone, and finding them compares the word with every earlier word's letters, which a plan did
 * for every word card it considered.
 */
const rivalsOf = new WeakMap<CourseView, Map<string, readonly TaggedText[]>>();

const rivals = (ctx: MakeContext, kc: BundleKc, word: TaggedText): readonly TaggedText[] => {
  let byKc = rivalsOf.get(ctx.course);
  if (byKc === undefined) {
    byKc = new Map();
    rivalsOf.set(ctx.course, byKc);
  }
  let found = byKc.get(kc.id);
  if (found === undefined) {
    found = otherKcs(ctx, kc).flatMap((k) => {
      const other = writtenForm(ctx, k);
      return other !== undefined && keyOf(ctx.course, other) !== keyOf(ctx.course, word) && minimallyApart(ctx, word, other) ? [other] : [];
    });
    byKc.set(kc.id, found);
  }
  return found;
};

export const makeMinimalPair = (ctx: MakeContext, kc: BundleKc): MinimalPair | undefined => {
  const audio = audioOf(ctx, kc.id);
  const word = writtenForm(ctx, kc);
  if (audio === undefined || word === undefined) return undefined;
  const rival = ctx.rng.shuffle(rivals(ctx, kc, word))[0];
  if (rival === undefined) return undefined;
  const { options, answer } = withAnswer(ctx, word, [rival]);
  return { template: "minimal-pair", id: id("minimal-pair", kc.id), item: kc.id, kcs: [kc.id], orthography: ctx.course.orthography, audio, options, answer, ...meaningOf(ctx, kc) };
};

// ------------------------------------------------------------------------------------ pronunciation in context (ADR 0054, 0095)

/** The KCs a token carries: its sense and its morphs. */
const tokenKcs = (t: Token): readonly string[] => [...(t.sense === undefined ? [] : [`sense:${t.sense}`]), ...(t.morphs ?? []).map((m) => m.kc as string)];

/**
 * The word of a sentence a pronunciation card asks about, among those that qualify: the first the
 * lesson introduces, else the sentence's last. Words `preferred` says yes to come first in each.
 */
const pronouncedWord = (ctx: MakeContext, text: TaggedText, qualifies: (t: Token, index: number) => boolean, preferred: (index: number) => boolean = () => true): number | undefined => {
  const all = text.tokens.flatMap((t, i) => (t.kind === "word" && tokenKcs(t).length > 0 && qualifies(t, i) ? [i] : []));
  const pick = (pool: readonly number[]): number | undefined => {
    const fresh = pool.find((i) => tokenKcs(text.tokens[i] as Token).some((k) => ctx.introduced.includes(k as KcId)));
    return fresh ?? pool.at(-1);
  };
  // A mistake's word is asked again wherever it qualifies, preferred or not.
  return all.find((i) => asked(ctx, text.tokens[i] as Token)) ?? pick(all.filter(preferred)) ?? pick(all);
};

/**
 * The same word in another orthography of the sentence: the token with the same sense and morphs,
 * at the same occurrence. Undefined where the orthographies split the sentence into other words.
 */
const twinOf = (s: BundleSentence, text: TaggedText, index: number, orthography: string): TaggedText | undefined => {
  const other = s.forms[orthography]?.text;
  const target = text.tokens[index];
  if (other === undefined || target === undefined) return undefined;
  const key = (t: Token): string => JSON.stringify(tokenKcs(t));
  const occurrence = text.tokens.slice(0, index).filter((t) => t.kind === "word" && key(t) === key(target)).length;
  const twin = other.tokens.filter((t) => t.kind === "word" && key(t) === key(target))[occurrence];
  return twin === undefined ? undefined : single(other, twin);
};

/** Which marks each letter takes in the course's words, by its place in the word (ADR 0098). Per course and orthography. */
const attestedOf = new WeakMap<CourseView, Map<string, ReturnType<typeof attestedMarks>>>();
const attestedIn = (course: CourseView, marks: VowelMarks): ReturnType<typeof attestedMarks> => {
  const byOrthography = attestedOf.get(course) ?? new Map<string, ReturnType<typeof attestedMarks>>();
  attestedOf.set(course, byOrthography);
  const known = byOrthography.get(course.orthography);
  if (known !== undefined) return known;
  const words = allSentences(course).flatMap((s) => (formOf(course, s)?.text.tokens ?? []).flatMap((t) => (t.kind === "word" ? [t.surface] : [])));
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
        if (t.kind !== "word") continue;
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
  if (marks === undefined || marks.policy !== "ignore" || form === undefined || translation === undefined) return undefined;
  const spelledIn = (profile.source.match?.marks?.spelledIn ?? []).filter((o) => o !== ctx.course.orthography);
  const spelledAt = (i: number): TaggedText | undefined => spelledIn.map((o) => twinOf(s, form.text, i, o)).find((t) => t !== undefined);
  const word = pronouncedWord(ctx, form.text, (t) => hasVowelMarks(marks, t.surface), (i) => spelledAt(i) !== undefined);
  if (word === undefined) return undefined;
  const bare = (t: Token): Token => {
    const { ruby: _ruby, ...rest } = t;
    return {
      ...rest,
      surface: withoutMarks(marks, t.surface),
      ...(t.morphs === undefined ? {} : { morphs: t.morphs.map((m) => ({ ...m, surface: withoutMarks(marks, m.surface) })) }),
    };
  };
  const token = form.text.tokens[word] as Token;
  const vocalized = single(form.text, token);
  const real = homographs(ctx.course, marks, token.surface);
  const made = ctx.rng.shuffle([...vocalizationVariants(marks, token.surface, attestedIn(ctx.course, marks))]).filter((v) => !real.includes(v));
  const others = [...real, ...made].slice(0, 3);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, vocalized, others.map((v) => single(form.text, { surface: v, kind: "word" })));
  const spelled = spelledAt(word);
  return {
    template: "vocalize",
    id: id("vocalize", s.id),
    item: s.id,
    kcs: s.kcs,
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
  if (profile.source.input?.markBuilder !== true || marks === undefined || marks.policy !== "ignore" || form === undefined || translation === undefined) return undefined;
  const word = pronouncedWord(ctx, form.text, (t) => hasVowelMarks(marks, t.surface));
  if (word === undefined) return undefined;
  const token = form.text.tokens[word] as Token;
  const bare = (t: Token): Token => {
    const { ruby: _ruby, ...rest } = t;
    return {
      ...rest,
      surface: withoutMarks(marks, t.surface),
      ...(t.morphs === undefined ? {} : { morphs: t.morphs.map((m) => ({ ...m, surface: withoutMarks(marks, m.surface) })) }),
    };
  };
  const letters = graphemes(withoutMarks(marks, token.surface));
  const attested = attestedIn(ctx.course, marks);
  return {
    template: "vocalize-build",
    id: id("vocalize-build", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    prompt: { ...form.text, tokens: form.text.tokens.map(bare) },
    word,
    translation: translation.text,
    vocalized: single(form.text, token),
    letters,
    marks: [...marks.set],
    optional: [...marks.optional],
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
  const word = pronouncedWord(ctx, form.text, (t) => t.readings?.[scheme] !== undefined);
  if (word === undefined) return undefined;
  const reading = readingText(scheme, (form.text.tokens[word] as Token).readings?.[scheme] as string);
  const tradition = traditionKey(ctx.course, scheme);
  return {
    template: "transcribe",
    id: id("transcribe", s.id),
    item: s.id,
    kcs: s.kcs,
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

/** KC templates that need a clip of the word. */
export const KC_LISTENING: readonly ((ctx: MakeContext, kc: BundleKc) => Exercise | undefined)[] = [makeListenSelect, makeMinimalPair];

/** Templates built from one KC, by id: mistakes mode rebuilds a missed one. */
export const KC_TEMPLATES: Readonly<Partial<Record<TemplateId, (ctx: MakeContext, kc: BundleKc) => Exercise | undefined>>> = {
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
  "char-read": makeCharRead,
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
  return { verdict, notes: g.notes, solution, alignment: g.alignment, closestIsSolution: onShown };
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
  if (response.tag !== "choice" || !("options" in ex)) return undefined;
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
  if (response?.tag !== "choice" || TEMPLATES[ex.template].wordOptions !== true || !("options" in ex) || !("answer" in ex) || response.index === ex.answer) return undefined;
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
    case "char-read":
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
      // Letter by letter (ADR 0137): the marks each letter has, optional ones (sukun) not counted.
      const g = gradeVowels({ set: new Set(ex.marks), optional: new Set(ex.optional) }, surfaceOf(ex.vocalized), response.text);
      return { verdict: g.verdict, notes: g.notes, solution: ex.vocalized };
    }
    case "transcribe": {
      if (response.tag !== "text") return mismatch(ex, response);
      // A reading typed as text (Schluessel, ADR 0131): its answer orthography's profile grades it, so a
      // mark left out is noted unless it spells another word.
      if (typedByProfile(ex.scheme)) {
        const g = grader.grade(ex.reading.orthography, literalAccept(surfaceOf(ex.reading)), response.text);
        return { verdict: g.verdict, notes: g.notes, solution: ex.reading, alignment: g.alignment };
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
    case "char-read":
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
    case "letter-read":
    case "word-read":
    case "vocalize":
    case "vocalize-build":
    case "transcribe":
    case "story-choose":
    case "story-arrange":
      return ex.prompt;
    case "gap-fill":
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
