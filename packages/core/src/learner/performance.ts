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
import { TEMPLATES } from "../lesson/templates.ts";
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

/** Cold-start difficulties by template (§9.3): each template's `prior` in `TEMPLATES` (C11). */
export const TEMPLATE_PRIORS: Readonly<Record<TemplateId, number>> = Object.fromEntries(
  (Object.keys(TEMPLATES) as TemplateId[]).map((t) => [t, TEMPLATES[t].prior]),
) as Record<TemplateId, number>;

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

/** The model as a fold changes it: its own working copy (ADR 0119), never a state's. */
export interface PerformanceDraft {
  theta: number;
  facet: Partial<Record<Facet, number>>;
  template: Partial<Record<TemplateId, number>>;
  kc: Record<string, number>;
  item: Record<string, number>;
  w: number;
}

/**
 * One online SGD step on the log loss, made in place; offsets shrink toward their priors (0). Each
 * parameter's new value depends only on its own old value and the error, which is worked out
 * first, so the step is the same as `update`'s. The fold calls it on its draft: copying the KC and
 * item maps for every first try made a replay slower with every word and item met (R2).
 */
export const learn = (m: PerformanceDraft, x: PredictionInput, correct: boolean): void => {
  const error = (correct ? 1 : 0) - predict(m, x);
  const step = (value: number, gradient: number): number => value + LEARNING_RATE * (gradient * error - L2 * value);
  for (const k of x.kcs) m.kc[k] = (m.kc[k] ?? 0) - (LEARNING_RATE * error) / x.kcs.length - LEARNING_RATE * L2 * (m.kc[k] ?? 0);
  m.facet[x.facet] = step(m.facet[x.facet] ?? 0, 1);
  m.template[x.template] = step(m.template[x.template] ?? 0, -1);
  m.item[x.item] = step(m.item[x.item] ?? 0, -1);
  m.w += LEARNING_RATE * (error * (x.r - 0.5) - L2 * (m.w - 2));
  m.theta += LEARNING_RATE * error;
};

/** One online SGD step on the log loss, as a new model: `learn` on a copy. */
export const update = (m: Performance, x: PredictionInput, correct: boolean): Performance => {
  const next: PerformanceDraft = { theta: m.theta, facet: { ...m.facet }, template: { ...m.template }, kc: { ...m.kc }, item: { ...m.item }, w: m.w };
  learn(next, x, correct);
  return next;
};
