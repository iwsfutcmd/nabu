/**
 * Exercise instances, learner responses and outcomes (gameplan §8.1, §8.6).
 * Instances are plain data: everything a template needs to render and to
 * grade is in them, so a lesson can be serialized, replayed and tested.
 */
import type { BundleAudioItem, PartId, Persons, Question, SchemeId, Skill, TaggedText } from "@nabu/schema";
import type { AlignOp, MissLabel, Verdict } from "../match/grade.ts";
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
  | "spelling-choice"
  | "char-read"
  | "reading-feature"
  | "reading-disambiguation"
  | "vocalize"
  | "vocalize-build"
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
  | "word-write"
  // A word and its parts (ADR 0152): built from them, and taken apart.
  | "parts-whole"
  | "whole-parts";

/**
 * The ways a lexeme, a rule or a letter is known (§9.1): each pair of one with a facet is its own
 * memory. A feature value is known by the two skills beside these (ADR 0146): choosing it when
 * producing, and reading it off a word.
 */
export type Facet = "recognize" | "produce" | "listen" | "speak" | "read-script" | "write-script";

export type { Skill };

/** A part with the skill a card exercises it by: what a card of the learner's memory is keyed by. */
export interface SkillRef {
  readonly part: PartId;
  readonly skill: Skill;
}

interface Common {
  /** Unique within a lesson; a retried exercise gets a new id. */
  readonly id: string;
  /** The sentence, lexeme or letter the exercise is built from. */
  readonly item: string;
  /** The parts it exercises (ADR 0146): lexemes, feature values, rules and letters. */
  readonly parts: readonly PartId[];
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
  /** The words: left[i] is the spelling of parts[i], so its clip is the course's audio of parts[i]. */
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

/**
 * A target sentence with a gap; choose what fits. It asks one thing (ADR 0132): which word (every
 * option in the answer's form and part of speech) or which form (the answer's own word in other
 * forms the course writes).
 */
/**
 * A sentence with a gap: choose the word that fills it. A spelling choice (`spelling-choice`, ADR
 * 0142) asks the same of one word's spelling: its options are the word and the word with a letter
 * (or character) traded for one that sounds alike, the sound given (`reading`) where a scheme writes it.
 */
export interface GapFill extends Common {
  readonly template: "gap-fill" | "spelling-choice";
  readonly hint: TaggedText;
  readonly before: TaggedText;
  readonly after: TaggedText;
  readonly options: readonly TaggedText[];
  readonly answer: number;
  /**
   * Which lexeme or which form (ADR 0132); it decides the instruction, what the answer credits and
   * what feedback says. Absent on a spelling-choice, which asks neither.
   */
  readonly asks?: Question | undefined;
  /**
   * Who speaks and who is spoken to: the options are often the word in other persons (بدّك, بدكن),
   * which the hint alone cannot choose between.
   */
  readonly persons?: Persons | undefined;
  /** A spelling choice's word as read (its Jyutping), where the course's first reading scheme writes it. */
  readonly reading?: TaggedText | undefined;
}

/**
 * A word without its reading; choose the reading (Jyutping). On a script track (ADR 0088): a letter
 * or a word, and its Latin spelling to choose. A feature card (`reading-feature`, ADR 0139) asks the
 * same in one place only: its options differ there alone, in every way the script leaves open.
 */
export interface CharRead extends Common {
  readonly template: "char-read" | "reading-feature" | "letter-read" | "word-read";
  /** A char-read card's sentence without ruby (ADR 0098); a script track's letter or word. */
  readonly prompt: TaggedText;
  /** char-read: the word asked about, its token in the prompt, and what the sentence means. */
  readonly word?: number | undefined;
  readonly translation?: TaggedText | undefined;
  readonly options: readonly TaggedText[];
  readonly answer: number;
  /**
   * The reading tradition asked (ADR 0138), where the orthography is read in more than one (lzh:
   * pinyin, jyutping, baxter): its read-script card is that tradition's. Absent otherwise.
   */
  readonly tradition?: SchemeId | undefined;
}

/** A polyphonic character in a word; choose the reading it has there (行 in 銀行 vs 行路). */
export interface ReadingDisambiguation extends Common {
  readonly template: "reading-disambiguation";
  /** The word, with `focus` the ruby segment (character) asked about. */
  readonly context: TaggedText;
  readonly focus: { readonly token: number; readonly segment: number };
  readonly options: readonly TaggedText[];
  readonly answer: number;
  /**
   * The reading tradition asked (ADR 0138), where the orthography is read in more than one (lzh:
   * pinyin, jyutping, baxter): its read-script card is that tradition's. Absent otherwise.
   */
  readonly tradition?: SchemeId | undefined;
}

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

/**
 * Vowel marks put on a word's letters (ADR 0137): the sentence without marks, one word marked; its
 * letters are given and the learner puts the profile's marks on them from buttons, once a vocalize
 * card has shown the word's marks. The answer is the word with its marks, as text.
 */
export interface VocalizeBuild extends Common {
  readonly template: "vocalize-build";
  /** The sentence without vowel marks, as a reader of the script sees it. */
  readonly prompt: TaggedText;
  /** The word asked about: its token in the prompt. */
  readonly word: number;
  /** What the sentence means. */
  readonly translation: TaggedText;
  /** The word with its vowel marks (the course's vocalization): the answer. */
  readonly vocalized: TaggedText;
  /** The word's letters without marks, grapheme by grapheme: what the marks go on. */
  readonly letters: readonly string[];
  /** The marks the learner may put on them: the profile's mark set, in its order. */
  readonly marks: readonly string[];
  /** Marks of the set a word may have or not (sukun, ADR 0054): never counted either way. */
  readonly optional: readonly string[];
  /**
   * Marks a letter may have or not before the letter keyed (the fatha before an alif, ADR 0054 as
   * amended): never counted either way there. Absent where the profile has none.
   */
  readonly optionalBefore?: Readonly<Record<string, readonly string[]>> | undefined;
  /**
   * For each letter, the marks the course's words give that letter where it stands (attested, as
   * the vocalize card's variants are; ADR 0098): while a letter's marks are part of a longer one,
   * it stays the letter being marked (a dagesh, then its vowel).
   */
  readonly combos: readonly (readonly string[])[];
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
  /**
   * The reading tradition asked (ADR 0138), where the orthography is read in more than one (lzh:
   * pinyin, jyutping, baxter): its read-script card is that tradition's. Absent otherwise.
   */
  readonly tradition?: SchemeId | undefined;
}

/**
 * A part of a word a learner is shown (ADR 0152): a lexeme (the word's own, a clitic or a particle
 * written with it), shown as the course cites it, or a form the word takes there, named by its
 * label. The cards ask the forms and are credited to them; the lexemes are given.
 */
export interface WordPart {
  /** What tells it from every other part offered: a lexeme's id, or a named form's (its values, and its part of speech where the name is one's). */
  readonly id: string;
  /**
   * What it is credited to: a lexeme, or the feature values a form's label names (each a part; a
   * label of several values is one thing to pick and several to credit).
   */
  readonly parts: readonly PartId[];
  /** A lexeme: its first spelling in the orthography being learned. Absent for a form, which is named, not written. */
  readonly text?: TaggedText | undefined;
  /** What the lexeme means, or which form it is, in the support language. */
  readonly gloss: TaggedText;
  /** The word's base lexeme, which the other parts are added to. */
  readonly base?: true | undefined;
}

/**
 * Parts to whole (ADR 0152): a sentence with one word left out, what the sentence means, and that
 * word's parts (its base lexeme, and the form and other lexemes it carries here). The learner types the word.
 * The parts say which form it is; putting them together is what is asked.
 */
export interface PartsWhole extends Common {
  readonly template: "parts-whole";
  /** What the sentence means. */
  readonly hint: TaggedText;
  readonly before: TaggedText;
  readonly after: TaggedText;
  /** The word's parts, in the word's order. */
  readonly wordParts: readonly WordPart[];
  /** The word itself: the answer. */
  readonly whole: TaggedText;
  /** The word, and the spellings of it the course accepts (a token's variants), as an accept set. */
  readonly accept: string;
  /** Who speaks and who is spoken to, where the target marks it and the hint cannot. */
  readonly persons?: Persons | undefined;
}

/**
 * Whole to parts (ADR 0152): a sentence with one word marked. The learner picks that word's parts
 * (its base lexeme, and the form and other lexemes it carries here) among others; every part, and no other.
 * What the sentence means is shown once the card is answered: before, it would name the parts.
 */
export interface WholeParts extends Common {
  readonly template: "whole-parts";
  /** The sentence. */
  readonly prompt: TaggedText;
  /** The word asked about: its token in the prompt. */
  readonly word: number;
  /** What the sentence means. */
  readonly translation: TaggedText;
  /** The word's parts among others: other words of its kind, and other forms the course's words take. */
  readonly options: readonly WordPart[];
  /** The options that are the word's parts, in the word's order. */
  readonly solution: readonly number[];
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

/** The next line of a story with one word missing: choose the word, or its form (ADR 0132). */
export interface StoryComplete extends Common {
  readonly template: "story-complete";
  readonly before: TaggedText;
  readonly after: TaggedText;
  readonly options: readonly TaggedText[];
  readonly answer: number;
  /** As GapFill's: which lexeme, or which form. */
  readonly asks?: Question | undefined;
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
  | VocalizeBuild
  | Transcribe
  | PartsWhole
  | WholeParts
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
  /** For answers graded through an accept set: what the miss is (ADR 0148), worst first; none for an answer accepted as it is. */
  readonly labels?: readonly MissLabel[] | undefined;
  /** The fixed correspondences an orthographic miss differed by (`<orthography id>:<id>`). */
  readonly correspondences?: readonly string[] | undefined;
  readonly skipped?: SkipReason | undefined;
  /**
   * The learner rated their own speaking (tier 0, or no microphone for scored speaking): nothing was
   * checked, so it is no verdict. It goes to scheduling (Again for "Couldn't say it") but not to the
   * score, the perfect bonus or the gate, and the feedback is neutral.
   */
  readonly selfRated?: true | undefined;
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
