/**
 * The performance model (gameplan §9.3): an Elo/IRT logistic model in the shape
 * of Duolingo's Birdbrain v1.
 *
 *   logit p = θ + θ[facet] − (b[template] + mean b[kc] + b[item]) + w · (mean R − ½)
 *
 * R is FSRS retrievability of the exercised facets (0 for never seen). One
 * stochastic-gradient step per first-try answer, with L2 shrinkage toward the
 * priors. Parameters live in the learner state; Phase 4b's server will own the
 * shared item and KC difficulties.
 */
import type { TemplateId } from "../lesson/exercise.ts";
import type { Facet } from "../lesson/exercise.ts";

export const PERFORMANCE_MODEL = "elo@1";

export interface Performance {
  readonly theta: number;
  readonly facet: Readonly<Partial<Record<Facet, number>>>;
  readonly template: Readonly<Partial<Record<TemplateId, number>>>;
  readonly kc: Readonly<Record<string, number>>;
  readonly item: Readonly<Record<string, number>>;
  /** Weight of the memory feature. */
  readonly w: number;
}

/**
 * Cold-start difficulties by template (§9.3): choosing among three is easier
 * than building from tiles, which is easier than typing. Tuned on the 30-day
 * simulation (test/simulation.test.ts), to be replaced by fitted values.
 */
export const TEMPLATE_PRIORS: Readonly<Record<TemplateId, number>> = {
  "select-image": -1.6,
  "match-pairs": -1.4,
  "choose-translation": -1.0,
  "translate-tap.l2-l1": -0.4,
  "translate-tap.l1-l2": 0.0,
  "gap-fill": -0.2,
  "char-read": -0.4,
  "reading-disambiguation": 0.4,
  // Writing a word's pronunciation in (ADR 0054): typed, all or nothing, every mark or tone counts.
  vocalize: 0.8,
  transcribe: 0.8,
  "complete-translation": 0.6,
  "translate-type.l1-l2": 1.0,
  "speak.tier-0": -1.5,
  // Scored speaking (Phase 9): saying it well is harder than rating yourself; repeating a clip is a
  // little harder again (no text). Naming one of six tones is hard for beginners.
  speak: 0.2,
  "listen-speak": 0.4,
  "tone-identify": 0.6,
  // Hearing is harder than reading the same item: the listening priors sit above their reading twins.
  "listen-select": -0.6,
  "minimal-pair": -0.2,
  "listen-tap": 0.3,
  "listen-type": 1.2,
  // Stories: questions in context, about lines just read.
  "story-choose": -1.0,
  "story-complete": -0.6,
  "story-arrange": -0.2,
  // Script tracks (ADR 0088): a letter among four is easy, a word among four a little less;
  // building a word from its letters is like building a sentence from tiles.
  "letter-read": -1.4,
  "letter-pairs": -1.4,
  "word-read": -0.8,
  "word-write": -0.2,
};

export const initialPerformance = (): Performance => ({ theta: 1.5, facet: {}, template: {}, kc: {}, item: {}, w: 2 });

export interface PredictionInput {
  readonly template: TemplateId;
  readonly facet: Facet;
  readonly item: string;
  readonly kcs: readonly string[];
  /** Mean FSRS retrievability of the exercised (KC, facet) pairs, 0 when new. */
  readonly r: number;
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

const logit = (m: Performance, x: PredictionInput): number =>
  m.theta +
  (m.facet[x.facet] ?? 0) -
  ((m.template[x.template] ?? 0) + TEMPLATE_PRIORS[x.template] + mean(x.kcs.map((k) => m.kc[k] ?? 0)) + (m.item[x.item] ?? 0)) +
  m.w * (x.r - 0.5);

export const predict = (m: Performance, x: PredictionInput): number => sigmoid(logit(m, x));

const LEARNING_RATE = 0.15;
const L2 = 0.01;

/** One online SGD step on the log loss; offsets shrink toward their priors (0). */
export const update = (m: Performance, x: PredictionInput, correct: boolean): Performance => {
  const error = (correct ? 1 : 0) - predict(m, x);
  const step = (value: number, gradient: number): number => value + LEARNING_RATE * (gradient * error - L2 * value);
  const kc = { ...m.kc };
  for (const k of x.kcs) kc[k] = (kc[k] ?? 0) - (LEARNING_RATE * error) / x.kcs.length - LEARNING_RATE * L2 * (kc[k] ?? 0);
  return {
    theta: m.theta + LEARNING_RATE * error,
    facet: { ...m.facet, [x.facet]: step(m.facet[x.facet] ?? 0, 1) },
    template: { ...m.template, [x.template]: step(m.template[x.template] ?? 0, -1) },
    kc,
    item: { ...m.item, [x.item]: step(m.item[x.item] ?? 0, -1) },
    w: m.w + LEARNING_RATE * (error * (x.r - 0.5) - L2 * (m.w - 2)),
  };
};
