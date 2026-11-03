/**
 * Exercise instances, learner responses and outcomes (gameplan §8.1, §8.6).
 * Instances are plain data: everything a template needs to render and to
 * grade is in them, so a lesson can be serialized, replayed and tested.
 */
import type { BundleAudioItem, KcId, TaggedText } from "@nabu/schema";
import type { AlignOp, Verdict } from "../match/grade.ts";

export type TemplateId =
  | "select-image"
  | "match-pairs"
  | "choose-translation"
  | "translate-tap.l2-l1"
  | "translate-tap.l1-l2"
  | "translate-type.l1-l2"
  | "complete-translation"
  | "gap-fill"
  | "char-read"
  | "reading-disambiguation"
  | "speak.tier-0"
  | "listen-tap"
  | "listen-type"
  | "listen-select"
  | "minimal-pair";

/** Facets of a knowledge component (§9.1): each (KC, facet) pair is its own memory. */
export type Facet = "recognize" | "produce" | "listen" | "speak" | "read-script" | "write-script";

export interface FacetRef {
  readonly kc: KcId;
  readonly facet: Facet;
}

interface Common {
  /** Unique within a lesson; a retried exercise gets a new id. */
  readonly id: string;
  /** The sentence or KC the exercise is built from. */
  readonly item: string;
  /** The knowledge components it exercises. */
  readonly kcs: readonly KcId[];
  /** The orthography the learner answers in (target or support). */
  readonly orthography: string;
}

/** A support-language gloss; pick the picture and word that match it. */
export interface SelectImage extends Common {
  readonly template: "select-image";
  readonly prompt: TaggedText;
  /** `image` is a bundle path; the shell maps it to a URL. */
  readonly options: readonly { readonly text: TaggedText; readonly image: string }[];
  readonly answer: number;
}

/** Match each target word with its gloss (or a word with its reading). */
export interface MatchPairs extends Common {
  readonly template: "match-pairs";
  readonly left: readonly TaggedText[];
  readonly right: readonly TaggedText[];
  /** pairs[i] is the index in `right` that belongs with left[i]. */
  readonly pairs: readonly number[];
}

/** A target sentence; choose its translation. */
export interface ChooseTranslation extends Common {
  readonly template: "choose-translation";
  readonly prompt: TaggedText;
  readonly options: readonly TaggedText[];
  readonly answer: number;
}

/** Build the translation from word-bank tiles (§11.6), in either direction. */
export interface TranslateTap extends Common {
  readonly template: "translate-tap.l2-l1" | "translate-tap.l1-l2";
  readonly prompt: TaggedText;
  /** Answer tiles and distractors, shuffled. */
  readonly tiles: readonly TaggedText[];
  /** Tile indexes that spell the canonical answer, in order. */
  readonly solution: readonly number[];
  /** Placed tiles are joined with this before grading (" " where the script spaces words). */
  readonly joiner: string;
  readonly accept: string;
  readonly canonical: TaggedText;
}

/** Type the translation of a support-language sentence. */
export interface TranslateType extends Common {
  readonly template: "translate-type.l1-l2";
  readonly prompt: TaggedText;
  readonly accept: string;
  readonly canonical: TaggedText;
}

/** The translation with one word missing; type the missing word. */
export interface CompleteTranslation extends Common {
  readonly template: "complete-translation";
  readonly prompt: TaggedText;
  readonly before: TaggedText;
  readonly after: TaggedText;
  readonly blank: TaggedText;
  readonly accept: string;
  readonly canonical: TaggedText;
}

/** A target sentence with a gap; choose the word that fits. */
export interface GapFill extends Common {
  readonly template: "gap-fill";
  readonly hint: TaggedText;
  readonly before: TaggedText;
  readonly after: TaggedText;
  readonly options: readonly TaggedText[];
  readonly answer: number;
}

/** A word without its reading; choose the reading (Jyutping). */
export interface CharRead extends Common {
  readonly template: "char-read";
  readonly prompt: TaggedText;
  readonly options: readonly TaggedText[];
  readonly answer: number;
}

/** A polyphonic character in a word; choose the reading it has there (行 in 銀行 vs 行路). */
export interface ReadingDisambiguation extends Common {
  readonly template: "reading-disambiguation";
  /** The word, with `focus` the ruby segment (character) asked about. */
  readonly context: TaggedText;
  readonly focus: { readonly token: number; readonly segment: number };
  readonly options: readonly TaggedText[];
  readonly answer: number;
}

/** Speak tier 0 (§10.4): say it, record it, compare, rate yourself. */
export interface Speak extends Common {
  readonly template: "speak.tier-0";
  readonly prompt: TaggedText;
  readonly translation: TaggedText;
}

/** A clip to play: normal and slow speed, token timings for karaoke (bundle paths; the shell maps them to URLs). */
export type AudioRef = BundleAudioItem;

/** Hear a target sentence; build what you heard from tiles (§8.1 listen-tap). */
export interface ListenTap extends Common {
  readonly template: "listen-tap";
  readonly audio: AudioRef;
  readonly tiles: readonly TaggedText[];
  readonly solution: readonly number[];
  readonly joiner: string;
  readonly accept: string;
  /** What was said: shown with the feedback, highlighted as the clip plays. */
  readonly canonical: TaggedText;
  /** The sentence's support-language translation, shown with the feedback. */
  readonly translation: TaggedText;
}

/** Hear a target sentence; type what you heard (§8.1 listen-type). */
export interface ListenType extends Common {
  readonly template: "listen-type";
  readonly audio: AudioRef;
  readonly accept: string;
  readonly canonical: TaggedText;
  readonly translation: TaggedText;
}

/** Hear a word; choose how it is written (§8.1 listen-select). */
export interface ListenSelect extends Common {
  readonly template: "listen-select";
  readonly audio: AudioRef;
  readonly options: readonly TaggedText[];
  readonly answer: number;
}

/** Hear one of two words that differ in a single sound or tone; choose which (§8.1 minimal-pair). */
export interface MinimalPair extends Common {
  readonly template: "minimal-pair";
  readonly audio: AudioRef;
  readonly options: readonly TaggedText[];
  readonly answer: number;
}

export type Exercise =
  | SelectImage
  | MatchPairs
  | ChooseTranslation
  | TranslateTap
  | TranslateType
  | CompleteTranslation
  | GapFill
  | CharRead
  | ReadingDisambiguation
  | Speak
  | ListenTap
  | ListenType
  | ListenSelect
  | MinimalPair;

export type SelfRating = "good" | "hard" | "again";

/** What the learner submits. Text is the settled text, after compositionend. */
export type Response =
  | { readonly tag: "choice"; readonly index: number }
  | { readonly tag: "tiles"; readonly order: readonly number[] }
  | { readonly tag: "text"; readonly text: string }
  | { readonly tag: "pairs"; readonly mistakes: number }
  | { readonly tag: "self-rating"; readonly rating: SelfRating };

export type SkipReason = "skip" | "cant-listen" | "cant-speak";

export interface Outcome {
  readonly verdict: Verdict;
  /** Feedback note ids (MF2 feedback.note.<id>). */
  readonly notes: readonly string[];
  /** The answer to show: the canonical one, or the right option. */
  readonly solution?: TaggedText | undefined;
  /** For typed and tiled answers: how the answer lines up with the closest accepted one (§11.6). */
  readonly alignment?: readonly AlignOp[] | undefined;
  readonly skipped?: SkipReason | undefined;
}

/** Correct verdicts move on; the rest bring the exercise back later in the lesson. */
export const isCorrect = (verdict: Verdict): boolean =>
  verdict === "CORRECT" ||
  verdict === "CORRECT_ALT" ||
  verdict === "CORRECT_MARKS" ||
  verdict === "CORRECT_VARIANT" ||
  verdict === "CORRECT_WITH_TYPO" ||
  verdict === "CORRECT_PROVISIONAL";
