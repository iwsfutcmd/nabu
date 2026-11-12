/**
 * Exercise instances, learner responses and outcomes (gameplan §8.1, §8.6).
 * Instances are plain data: everything a template needs to render and to
 * grade is in them, so a lesson can be serialized, replayed and tested.
 */
import type { BundleAudioItem, KcId, Persons, TaggedText } from "@nabu/schema";
import type { AlignOp, Verdict } from "../match/grade.ts";
import type { SpeechResult } from "../speech/score.ts";

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
  | "vocalize"
  | "transcribe"
  | "speak.tier-0"
  | "speak"
  | "listen-speak"
  | "tone-identify"
  | "listen-tap"
  | "listen-type"
  | "listen-select"
  | "minimal-pair"
  | "story-choose"
  | "story-complete"
  | "story-arrange"
  // Script tracks (ADR 0088): reading and writing an alphabet.
  | "letter-read"
  | "letter-pairs"
  | "word-read"
  | "word-write";

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
  /** Older material a lesson brings back because it is due (ADR 0097): the player marks the card. */
  readonly review?: true | undefined;
}

/** A support-language gloss; pick the picture and word that match it. */
export interface SelectImage extends Common {
  readonly template: "select-image";
  readonly prompt: TaggedText;
  /** `image` is a bundle path; the shell maps it to a URL. */
  readonly options: readonly { readonly text: TaggedText; readonly image: string }[];
  readonly answer: number;
}

/** Match each target word with its gloss (or, on a script track, each letter with its Latin value). */
export interface MatchPairs extends Common {
  readonly template: "match-pairs" | "letter-pairs";
  /** The words: left[i] is the form of kcs[i], so its clip is the course's audio of kcs[i]. */
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

/**
 * Build the translation from word-bank tiles (§11.6), in either direction; or, on a script track
 * (word-write, ADR 0088), a word from its letters, given its Latin spelling.
 */
export interface TranslateTap extends Common {
  readonly template: "translate-tap.l2-l1" | "translate-tap.l1-l2" | "word-write";
  readonly prompt: TaggedText;
  /** Answer tiles and distractors, shuffled. */
  readonly tiles: readonly TaggedText[];
  /** Tile indexes that spell the canonical answer, in order. */
  readonly solution: readonly number[];
  /**
   * Placed tiles are joined with this before grading (" " where the script spaces words), except
   * two that follow each other as in the answer, which keep its separator (tilesText).
   */
  readonly joiner: string;
  readonly accept: string;
  readonly canonical: TaggedText;
  /** Who speaks and who is spoken to, where the target marks it and the prompt cannot (writing into the target). */
  readonly persons?: Persons | undefined;
}

/** Type the translation of a support-language sentence. */
export interface TranslateType extends Common {
  readonly template: "translate-type.l1-l2";
  readonly prompt: TaggedText;
  readonly accept: string;
  readonly canonical: TaggedText;
  /** Who speaks and who is spoken to, where the target marks it and the prompt cannot (writing into the target). */
  readonly persons?: Persons | undefined;
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
  /** Who speaks and who is spoken to, where the target marks it and the prompt cannot (writing into the target). */
  readonly persons?: Persons | undefined;
}

/** A target sentence with a gap; choose the word that fits. */
export interface GapFill extends Common {
  readonly template: "gap-fill";
  readonly hint: TaggedText;
  readonly before: TaggedText;
  readonly after: TaggedText;
  readonly options: readonly TaggedText[];
  readonly answer: number;
  /**
   * Who speaks and who is spoken to: the options are often the word in other persons (بدّك, بدكن),
   * which the hint alone cannot choose between.
   */
  readonly persons?: Persons | undefined;
}

/**
 * A word without its reading; choose the reading (Jyutping). On a script track (ADR 0088): a letter
 * or a word, and its Latin spelling to choose.
 */
export interface CharRead extends Common {
  readonly template: "char-read" | "letter-read" | "word-read";
  /** A char-read card's sentence without ruby (ADR 0098); a script track's letter or word. */
  readonly prompt: TaggedText;
  /** char-read: the word asked about, its token in the prompt, and what the sentence means. */
  readonly word?: number | undefined;
  readonly translation?: TaggedText | undefined;
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

/**
 * An abjad word without its vowel marks, with its meaning; write the marks in (ADR 0054). The
 * field starts from the letters. Grading compares the marks letter by letter (`gradeVowels`).
 */
/**
 * A word of a sentence, in context, without its vowel marks: choose it with its marks among wrong
 * ones (ADR 0054; in context, ADR 0095; multiple choice, ADR 0098). The sentence says which form the
 * word takes; typing an abjad's marks is a chore, and a word has few plausible vocalizations.
 */
export interface Vocalize extends Common {
  readonly template: "vocalize";
  /** The sentence without vowel marks, as a reader of the script sees it. */
  readonly prompt: TaggedText;
  /** The word asked about: its token in the prompt. */
  readonly word: number;
  /** What the sentence means. */
  readonly translation: TaggedText;
  /** The word with its vowel marks (the course's vocalization). */
  readonly vocalized: TaggedText;
  /** The vocalized word among other vocalizations of its letters; `answer` is its index. */
  readonly options: readonly TaggedText[];
  readonly answer: number;
  /**
   * The word as another orthography of the course writes it, vowels and all (the profile's
   * `marks.spelledIn`: Arabizi for Lebanese Arabic): typing it so is a vocalization too.
   */
  readonly spelled?: TaggedText | undefined;
}

/** A Han word of a sentence, in context: type its reading (Jyutping) (ADR 0054; in context, ADR 0095). */
export interface Transcribe extends Common {
  readonly template: "transcribe";
  /** The sentence without ruby: the word's reading is the answer. */
  readonly prompt: TaggedText;
  /** The word asked about: its token in the prompt. */
  readonly word: number;
  /** What the sentence means. */
  readonly translation: TaggedText;
  readonly scheme: string;
  /** The word's pinned reading, tagged as the scheme (yue-Latn-HK-jyutping). */
  readonly reading: TaggedText;
}

/** Speak tier 0 (§10.4): say it, record it, compare, rate yourself. */
export interface Speak extends Common {
  readonly template: "speak.tier-0";
  readonly prompt: TaggedText;
  readonly translation: TaggedText;
}

/**
 * Speak, scored (§10.4 tiers 1–3): say the sentence; the device judges tones where the course
 * has them, and the speech service (when there is one) the words and phones. Feedback, not verdicts.
 */
export interface SpeakScored extends Common {
  readonly template: "speak";
  readonly prompt: TaggedText;
  readonly translation: TaggedText;
  /** The sentence's clip, to compare with after answering. */
  readonly audio?: AudioRef | undefined;
}

/** Listen, then say it (§8.1 listen-speak): the transcript appears after the answer. */
export interface ListenSpeak extends Common {
  readonly template: "listen-speak";
  readonly audio: AudioRef;
  readonly prompt: TaggedText;
  readonly translation: TaggedText;
}

/** Which tone is it? (§16 Phase 9, tonal courses): hear one syllable, choose its tone. */
export interface ToneIdentify extends Common {
  readonly template: "tone-identify";
  readonly audio: AudioRef;
  /** The syllable heard, revealed after the answer. */
  readonly syllable: TaggedText;
  /** The tone system's id (yue-jyutping) and its tones, in order. */
  readonly system: string;
  readonly tones: readonly string[];
  readonly answer: number;
  /** The syllable's support-language translation, shown with it after the answer. */
  readonly translation?: TaggedText | undefined;
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
  /** The word's meaning in the support language (its gloss), shown with it after the answer. */
  readonly translation?: TaggedText | undefined;
}

/** Hear one of two words that differ in a single sound or tone; choose which (§8.1 minimal-pair). */
export interface MinimalPair extends Common {
  readonly template: "minimal-pair";
  readonly audio: AudioRef;
  readonly options: readonly TaggedText[];
  readonly answer: number;
  /** The word's meaning in the support language (its gloss), shown with it after the answer. */
  readonly translation?: TaggedText | undefined;
}

/** A comprehension question about a story, in the support language (Phase 6). */
export interface StoryChoose extends Common {
  readonly template: "story-choose";
  readonly prompt: TaggedText;
  readonly options: readonly TaggedText[];
  readonly answer: number;
}

/** The next line of a story with one word missing: choose the word. */
export interface StoryComplete extends Common {
  readonly template: "story-complete";
  readonly before: TaggedText;
  readonly after: TaggedText;
  readonly options: readonly TaggedText[];
  readonly answer: number;
}

/** The next line of a story, given its translation: build it from its tiles. */
export interface StoryArrange extends Common {
  readonly template: "story-arrange";
  readonly prompt: TaggedText;
  readonly tiles: readonly TaggedText[];
  /** Tile indexes in the line's order; tiles that read the same are interchangeable. */
  readonly solution: readonly number[];
  readonly joiner: string;
  readonly canonical: TaggedText;
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
  | Vocalize
  | Transcribe
  | Speak
  | SpeakScored
  | ListenSpeak
  | ToneIdentify
  | ListenTap
  | ListenType
  | ListenSelect
  | MinimalPair
  | StoryChoose
  | StoryComplete
  | StoryArrange;

export type SelfRating = "good" | "hard" | "again";

/** What the learner submits. Text is the settled text, after compositionend. */
export type Response =
  | { readonly tag: "choice"; readonly index: number }
  | { readonly tag: "tiles"; readonly order: readonly number[] }
  | { readonly tag: "text"; readonly text: string }
  | { readonly tag: "pairs"; readonly mistakes: number }
  | { readonly tag: "self-rating"; readonly rating: SelfRating }
  /** What the device and the speech service heard; never the audio. */
  | { readonly tag: "speech"; readonly result: SpeechResult };

export type SkipReason = "skip" | "cant-listen" | "cant-speak";

export interface Outcome {
  readonly verdict: Verdict;
  /** Feedback note ids (MF2 feedback.note.<id>). */
  readonly notes: readonly string[];
  /** The answer to show: the canonical one, or the right option. */
  readonly solution?: TaggedText | undefined;
  /** For typed and tiled answers: how the answer lines up with the closest accepted one (§11.6). */
  readonly alignment?: readonly AlignOp[] | undefined;
  /**
   * For typed and tiled answers: false when the accepted answer closest to the response is another
   * wording than the solution (我嘅書喺邊度呀 for 我嘅書呢), which the alignment then lines up with.
   */
  readonly closestIsSolution?: boolean | undefined;
  readonly skipped?: SkipReason | undefined;
  /** Speech: tokens of the prompt said wrong (their KCs are debited, the others credited). */
  readonly offTokens?: readonly number[] | undefined;
}

/** Correct verdicts move on; the rest bring the exercise back later in the lesson. */
export const isCorrect = (verdict: Verdict): boolean =>
  verdict === "CORRECT" ||
  verdict === "CORRECT_ALT" ||
  verdict === "CORRECT_MARKS" ||
  verdict === "CORRECT_VARIANT" ||
  verdict === "CORRECT_WITH_TYPO" ||
  verdict === "CORRECT_PROVISIONAL";
