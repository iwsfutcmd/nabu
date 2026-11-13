/**
 * The Phase 3 template catalog (gameplan §8.1–8.2). Each template is data plus
 * pure functions: `make` instantiates it from a sentence or KC (undefined when
 * not eligible), `grade` turns a response into an outcome. Randomness comes
 * from the injected seeded Rng only.
 */
import type { BundleKc, BundleSentence, KcId, Persons, SchemeId, TaggedText, Token } from "@nabu/schema";
import { literalAccept } from "../accept/notation.ts";
import { glossUnits } from "../match/gloss.ts";
import { readingTag } from "../profile/schemes.ts";
import { attestedMarks, gradeReading, gradeVowels, hasVowelMarks, toneVariants, transcribable, vocalizationVariants, withoutMarks, type VowelMarks } from "../match/pronounce.ts";
import { surfaceOf, tileGroups } from "../text/tagged-text.ts";
import { allKcs, allSentences, profileOf, type CourseView, type Grader } from "./course.ts";
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
  Response,
  SelectImage,
  Speak,
  SpeakScored,
  TemplateId,
  ToneIdentify,
  TranslateTap,
  TranslateType,
} from "./exercise.ts";
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
}

export const TEMPLATES: Readonly<Record<TemplateId, TemplateInfo>> = {
  "select-image": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -1.6, perSession: 2, presents: true },
  "match-pairs": { facet: "recognize", modality: { audioOut: false, mic: false, input: "pairs" }, prior: -1.4, perSession: 1, presents: true },
  "choose-translation": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -1.0, presents: true },
  "translate-tap.l2-l1": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" }, prior: -0.4, presents: true, explained: true },
  // The tiles are handed to the learner, so no production credit (§8.5).
  "translate-tap.l1-l2": { facet: "recognize", modality: { audioOut: false, mic: false, input: "tiles" }, prior: 0.0, presents: true, explained: true },
  "translate-type.l1-l2": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" }, prior: 1.0, explained: true },
  "complete-translation": { facet: "produce", modality: { audioOut: false, mic: false, input: "text" }, prior: 0.6 },
  // Picking the missing word among options is recognizing it, as tiles are (D4 in the 2026-11 review,
  // ADR 0100): producing a word means supplying it.
  "gap-fill": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.2 },
  "char-read": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.4 },
  "reading-disambiguation": { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: 0.4 },
  // A word's pronunciation as its script leaves it out (ADR 0054). Its vowel marks, chosen among other
  // vocalizations of its letters, are like a reading among a few (ADR 0098); its reading typed is all
  // or nothing, every tone counting.
  vocalize: { facet: "read-script", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.4, perSession: 1 },
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
  "listen-select": { facet: "listen", modality: { audioOut: true, mic: false, input: "choice" }, prior: -0.6, perSession: 2 },
  "minimal-pair": { facet: "listen", modality: { audioOut: true, mic: false, input: "choice" }, prior: -0.2, perSession: 1 },
  // Stories (Phase 6): reading comprehension exercises recognition of the line's words.
  "story-choose": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -1.0 },
  "story-complete": { facet: "recognize", modality: { audioOut: false, mic: false, input: "choice" }, prior: -0.6 },
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
}

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

const wordSurfaces = (text: TaggedText): readonly string[] => text.tokens.filter((t) => t.kind === "word").map((t) => t.surface.toLocaleLowerCase(text.lang));

/**
 * How well a distractor sentence matches the answer's shape (P2): the same final punctuation, about
 * as many words, and words in common, so neither punctuation nor length gives the answer away.
 */
const shapeScore = (answer: TaggedText): ((t: TaggedText) => number) => {
  const end = finalPunct(answer);
  const words = wordSurfaces(answer);
  const own = new Set(words);
  return (t) => {
    const theirs = wordSurfaces(t);
    const shared = theirs.filter((w) => own.has(w)).length;
    return (finalPunct(t) === end ? 3 : 0) - Math.min(3, Math.abs(theirs.length - words.length)) * 0.5 + Math.min(2, shared) * 0.5;
  };
};

/**
 * Whether a text's first word has a capital (in its own language's case; never in a caseless script):
 * what a sentence-initial word, a name or a sentence's first tile shows.
 */
const capitalized = (text: TaggedText): boolean => {
  const word = text.tokens.find((t) => t.kind === "word")?.surface ?? "";
  return word !== word.toLocaleLowerCase(text.lang);
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

const otherSentences = (ctx: MakeContext, s: BundleSentence): readonly BundleSentence[] => {
  const at = unitOf(ctx.course, s.id);
  let byUnit = sentencesUpTo.get(ctx.course);
  if (byUnit === undefined) {
    byUnit = new Map();
    sentencesUpTo.set(ctx.course, byUnit);
  }
  let pool = byUnit.get(at);
  if (pool === undefined) {
    pool = allSentences(ctx.course).filter((o) => !o.id.startsWith("drill.") && unitOf(ctx.course, o.id) <= at && formOf(ctx.course, o) !== undefined);
    byUnit.set(at, pool);
  }
  return pool.filter((o) => o.id !== s.id);
};

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
  const others = pickRanked(ctx, pool, [translation.text], 2, shapeScore(translation.text));
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
  const tiles = tileGroups(answer);
  if (tiles.length === 0) return undefined;
  // Three or four distractors (P2); where the answer starts with a capital, a capitalized one comes
  // first, so the capital doesn't mark the sentence's first tile.
  const capital = tiles[0] !== undefined && capitalized(tiles[0]);
  const bank = pool.flatMap((t) => tileGroups(t));
  const count = Math.min(4, Math.max(3, tiles.length));
  const distractors = capital ? pickRanked(ctx, bank, tiles, count, (t) => (capitalized(t) ? 1 : 0)) : pickDistinct(ctx, bank, tiles, count);
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
  const focus = ctx.focus === undefined ? undefined : indexes.find((i) => kcsAt(i).some((k) => ctx.focus?.has(k) === true));
  const fresh = indexes.find((i) => kcsAt(i).some((k) => ctx.introduced.includes(k as KcId)));
  return focus ?? fresh ?? indexes[indexes.length - 1];
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

export const makeGapFill = (ctx: MakeContext, s: BundleSentence): GapFill | undefined => {
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (form === undefined || translation === undefined) return undefined;
  const at = blankIndex(ctx, form.text);
  if (at === undefined) return undefined;
  const target = form.text.tokens[at] as Token;
  const correct = single(form.text, target);
  const candidates = otherSentences(ctx, s).flatMap((o) => {
    const text = formOf(ctx.course, o)?.text;
    return text === undefined ? [] : words(text).map((i) => ({ token: text.tokens[i] as Token, text }));
  });
  // Same lexeme in another form first (هستم / هستی / هستند), then any other word; each with the
  // answer's case (P2): a capital that only marks the sentence's first word must not mark the answer.
  const capital = capitalized(correct);
  const sameCase = (t: TaggedText): number => (capitalized(t) === capital ? 1 : 0);
  const sameSense = candidates.filter((c) => target.sense !== undefined && c.token.sense === target.sense);
  const preferred = pickRanked(ctx, sameSense.map((c) => single(c.text, c.token)), [correct], 2, sameCase);
  const rest = pickRanked(ctx, candidates.map((c) => single(c.text, c.token)), [correct, ...preferred], 2 - preferred.length, sameCase);
  const others = [...preferred, ...rest];
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, correct, others);
  return {
    template: "gap-fill",
    id: id("gap-fill", s.id),
    item: s.id,
    kcs: s.kcs,
    orthography: ctx.course.orthography,
    hint: translation.text,
    before: slice(form.text, 0, at),
    after: slice(form.text, at + 1, form.text.tokens.length),
    options,
    answer,
    ...personsOf(s),
  };
};

// ------------------------------------------------------------------------------------ reading templates

/**
 * The scheme reading cards ask about: the profile's first ruby layer, where its scheme's data says
 * how its readings stand as options (`answer`, ADR 0109): Jyutping for yue, sitelen Lasina for
 * sitelen pona; none for Classical Chinese (Pinyin first, only shown).
 */
export const rubySchemeOf = (ctx: MakeContext): SchemeId | undefined => {
  const scheme = profileOf(ctx.course, ctx.course.orthography).source.annotations?.find((a) => a.kind === "reading" && a.render === "ruby")?.scheme;
  return scheme !== undefined && readingTag(scheme) !== undefined ? scheme : undefined;
};

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
  const fresh = form.text.tokens.findIndex((t) => readable(t) && ctx.introduced.some((k) => k === `sense:${t.sense}`));
  const word = fresh >= 0 ? fresh : form.text.tokens.findIndex(readable);
  const target = form.text.tokens[word];
  if (target === undefined) return undefined;
  const reading = target.readings?.[scheme] as string;
  const syllables = reading.split(" ").length;
  const tones = ctx.rng.shuffle([...toneVariants(scheme, reading, courseSyllables(ctx.course, scheme))]).slice(0, 2);
  const pool = otherSentences(ctx, s)
    .flatMap((o) => formOf(ctx.course, o)?.text.tokens ?? [])
    .flatMap((t) => (readable(t) ? [t.readings?.[scheme] as string] : []))
    .filter((r) => r.split(" ").length === syllables && r !== reading && !tones.includes(r));
  const others = [...new Set([...tones, ...ctx.rng.shuffle(pool)])].slice(0, 3);
  if (others.length < 2) return undefined;
  const { options, answer } = withAnswer(ctx, readingText(scheme, reading), others.map((r) => readingText(scheme, r)));
  const translation = translationOf(ctx.course, s);
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

/** Which tone? A sentence of one syllable in a tonal reading scheme, with a clip (number drills, one-word answers). */
export const makeToneIdentify = (ctx: MakeContext, s: BundleSentence): ToneIdentify | undefined => {
  const audio = audioOf(ctx, s.id);
  const form = formOf(ctx.course, s);
  if (audio === undefined || form === undefined) return undefined;
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
 * Pinned readings by surface, per course view and scheme: the first sentence token (in course
 * order) that spells the word gives its reading. Indexed once, as a course has hundreds of
 * sentences and minimal pairs compare every word with every other.
 */
const readingIndex = new WeakMap<CourseView, Map<SchemeId, ReadonlyMap<string, string>>>();

/** The pinned reading of a written word, from any sentence token that spells it. */
const readingOf = (ctx: MakeContext, scheme: SchemeId, surface: string): string | undefined => {
  let byScheme = readingIndex.get(ctx.course);
  if (byScheme === undefined) {
    byScheme = new Map();
    readingIndex.set(ctx.course, byScheme);
  }
  let index = byScheme.get(scheme);
  if (index === undefined) {
    const built = new Map<string, string>();
    for (const s of allSentences(ctx.course)) {
      for (const t of formOf(ctx.course, s)?.text.tokens ?? []) {
        const reading = t.readings?.[scheme];
        if (reading !== undefined && !built.has(t.surface)) built.set(t.surface, reading);
      }
    }
    index = built;
    byScheme.set(scheme, index);
  }
  return index.get(surface);
};

/**
 * Two words a learner must hear apart: with pinned readings (Jyutping), the same number of
 * syllables and one syllable one sound or tone off (maa1 / maa5); otherwise one letter apart
 * in writing (the profile's letters: Uzbek oʻ is one).
 */
const minimallyApart = (ctx: MakeContext, a: TaggedText, b: TaggedText): boolean => {
  const scheme = rubySchemeOf(ctx);
  if (scheme !== undefined) {
    const ra = readingOf(ctx, scheme, surfaceOf(a))?.split(" ");
    const rb = readingOf(ctx, scheme, surfaceOf(b))?.split(" ");
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

export const makeMinimalPair = (ctx: MakeContext, kc: BundleKc): MinimalPair | undefined => {
  const audio = audioOf(ctx, kc.id);
  const word = writtenForm(ctx, kc);
  if (audio === undefined || word === undefined) return undefined;
  const rivals = otherKcs(ctx, kc).flatMap((k) => {
    const other = writtenForm(ctx, k);
    return other !== undefined && keyOf(ctx.course, other) !== keyOf(ctx.course, word) && minimallyApart(ctx, word, other) ? [other] : [];
  });
  const rival = ctx.rng.shuffle(rivals)[0];
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
  return pick(all.filter(preferred)) ?? pick(all);
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

/** A Han word in its sentence, the sentence without ruby: type the word's reading. Only words with a pinned reading. */
export const makeTranscribe = (ctx: MakeContext, s: BundleSentence): Transcribe | undefined => {
  const scheme = rubySchemeOf(ctx);
  const form = formOf(ctx.course, s);
  const translation = translationOf(ctx.course, s);
  if (scheme === undefined || !transcribable(scheme) || form === undefined || translation === undefined) return undefined;
  const word = pronouncedWord(ctx, form.text, (t) => t.readings?.[scheme] !== undefined);
  if (word === undefined) return undefined;
  const reading = readingText(scheme, (form.text.tokens[word] as Token).readings?.[scheme] as string);
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
    case "transcribe": {
      if (response.tag !== "text") return mismatch(ex, response);
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
