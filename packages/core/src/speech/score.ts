/**
 * Grading speech (gameplan §10.4): what the device (tier 3, tone) and the speech service
 * (tier 1, words; tier 2, phones) heard, turned into an outcome. Scores are feedback, not
 * verdicts: phones alone never fail an answer (recognizers lean towards dictionary forms and miss
 * accepted variants), and an uncalibrated tone judgment never does either.
 */
import type { TaggedText } from "@nabu/schema";
import type { Verdict } from "../match/grade.ts";
import { CANTONESE, type ToneScore, type ToneSystem } from "./tone.ts";

/** Tone systems by the reading scheme that carries them. */
export const TONE_SYSTEMS: Readonly<Record<string, ToneSystem>> = { jyutping: CANTONESE };

/**
 * Whether the app scores a learner's tones on the device (tier 3, ADR 0046). Off (ADR 0093): on
 * natural speech the scorer is not accurate enough to tell a learner which tones were wrong, and it
 * has no native-speaker acceptance yet (evals/tones). Speaking is rated by the learner (tier 0)
 * unless a speech server scores words and phones (tiers 1–2). Tone listening (tone-identify) stays.
 */
export const DEVICE_TONE_SCORING: boolean = false;

/** The tone system a text's pinned readings use, if any. */
export const toneSystemOf = (text: TaggedText): ToneSystem | undefined =>
  Object.values(TONE_SYSTEMS).find((system) => text.tokens.some((t) => (t.readings as Readonly<Record<string, string>> | undefined)?.[system.scheme] !== undefined));

export interface WordsHeard {
  /** The grader's verdict on the transcript against the sentence's accept set. */
  readonly verdict: Verdict;
}

export interface PhonesHeard {
  /** Phone error rate against the expected surface phones (0–1+). */
  readonly errorRate: number;
  /** Tokens of the prompt with phones heard wrong. */
  readonly offTokens: readonly number[];
}

/** Everything heard in one attempt. The audio itself is not here: it is never kept. */
export interface SpeechResult {
  readonly silent: boolean;
  readonly tone?: ToneScore | undefined;
  readonly words?: WordsHeard | undefined;
  readonly phones?: PhonesHeard | undefined;
}

export interface SpeechOutcome {
  readonly verdict: Verdict;
  readonly notes: readonly string[];
  /** Tokens of the prompt said wrong: their KCs are debited, the rest credited (§8.5). */
  readonly offTokens: readonly number[];
}

/** Phone error rate above which a note appears, and above which (with nothing else) it is partial. */
export const PHONES_NOTE = 0.2;
export const PHONES_PARTIAL = 0.45;

const ORDER: readonly Verdict[] = ["CORRECT", "PARTIAL", "WRONG"];
const worst = (a: Verdict, b: Verdict): Verdict => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

export const gradeSpeech = (result: SpeechResult): SpeechOutcome => {
  if (result.silent) return { verdict: "WRONG", notes: ["speech-silent"], offTokens: [] };
  let verdict: Verdict = "CORRECT";
  const notes: string[] = [];
  const off = new Set<number>();
  if (result.words !== undefined && !result.words.verdict.startsWith("CORRECT")) {
    verdict = "WRONG";
    notes.push("speech-words");
  }
  const tone = result.tone;
  if (tone !== undefined && !tone.silent) {
    const wrong = tone.syllables.filter((s) => !s.ok);
    for (const s of wrong) off.add(s.token);
    if (wrong.length > 0) {
      notes.push(tone.calibrated ? "speech-tones" : "speech-tone-shapes");
      // A calibrated majority of wrong tones changes the words; otherwise it is close.
      verdict = worst(verdict, tone.calibrated && wrong.length * 2 > tone.syllables.length ? "WRONG" : "PARTIAL");
    }
  }
  const phones = result.phones;
  if (phones !== undefined && phones.errorRate > PHONES_NOTE) {
    notes.push("speech-phones");
    for (const t of phones.offTokens) off.add(t);
    if (phones.errorRate > PHONES_PARTIAL) verdict = worst(verdict, "PARTIAL");
  }
  return { verdict, notes, offTokens: [...off].sort((a, b) => a - b) };
};
