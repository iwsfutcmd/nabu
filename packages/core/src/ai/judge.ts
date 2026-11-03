/**
 * The LLM judge's rules (gameplan §8.3, §13.2), kept pure so the server, the evaluation harness
 * and the tests share them. The judge only looks at free production the accept set rejected
 * outright (never dictation, choice or tiles; never a typo or a real-word slip, which the cascade
 * already grades), its accept counts only above a high confidence threshold, and for each course
 * orthography it runs only behind a gate the evaluations opened for that model and prompt.
 */
import type { AnswerSubmitted, BundleSentence, EvalGate, JudgeOutput } from "@nabu/schema";
import { parseAcceptSet } from "../accept/notation.ts";
import type { TemplateId } from "../lesson/exercise.ts";

/** Templates whose answers are free production (§8.3): the only ones the judge sees. */
export const JUDGED_TEMPLATES: ReadonlySet<TemplateId> = new Set<TemplateId>(["translate-type.l1-l2"]);

/** Accepts below this confidence are rejects: a false accept teaches an error (§8.3). */
export const JUDGE_THRESHOLD = 0.9;
/** The gate (§16 Phase 8): at most 2% false accepts on the adversarial set... */
export const GATE_MAX_FALSE_ACCEPT = 0.02;
/** ...measured on at least this many adversarial items, or the rate means nothing. */
export const GATE_MIN_ADVERSARIAL = 20;

/** Whether an answer goes to the judge: free production, graded WRONG, with text to judge. */
export const judgeable = (e: AnswerSubmitted): boolean =>
  JUDGED_TEMPLATES.has(e.exercise.template) && e.outcome.kind === "WRONG" && (e.input.raw ?? "").trim() !== "";

/** The outcome a judge accept revises an answer to (§8.3): provisional, every wrong KC now right. */
export const provisionalOutcome = (e: AnswerSubmitted): AnswerSubmitted["outcome"] => ({
  kind: "CORRECT_PROVISIONAL",
  notes: [...e.outcome.notes.filter((n) => n !== "judge"), "judge"],
  kcs: e.outcome.kcs.map((c) => (c.status === "wrong" ? { ...c, status: "right" } : c)),
});

/** Whether a verdict accepts: "accept" with confidence at or above θ. */
export const accepts = (output: JudgeOutput, theta: number = JUDGE_THRESHOLD): boolean => output.verdict === "accept" && output.confidence >= theta;

export interface JudgeModel {
  readonly provider: EvalGate["provider"];
  readonly model: string;
  readonly promptHash: string;
}

/**
 * Whether the judge runs for a course orthography with this model and prompt: only behind an
 * enabled gate evaluated for exactly this model and prompt hash. A changed prompt closes every gate.
 */
export const gateOpen = (gates: readonly EvalGate[], course: string, orthography: string, model: JudgeModel): boolean =>
  gates.some(
    (g) =>
      g.enabled &&
      g.course === course &&
      g.orthography === orthography &&
      g.provider === model.provider &&
      g.model === model.model &&
      g.promptHash === model.promptHash &&
      g.falseAccept <= GATE_MAX_FALSE_ACCEPT,
  );

export interface EvalResult {
  readonly expect: "accept" | "reject";
  /** The judge's verdict after the threshold, or undefined when it gave no valid answer (counted against it). */
  readonly accepted: boolean | undefined;
}

/**
 * The gate from evaluation results: false accepts over adversarial items (a missing verdict on
 * one counts as an accept, so an unreliable model cannot pass by failing), false rejects over
 * paraphrases. Enabled only with enough adversarial items and false accepts within the limit.
 */
export const gateOf = (results: readonly EvalResult[]): { readonly falseAccept: number; readonly falseReject: number; readonly n: number; readonly enabled: boolean } => {
  const adversarial = results.filter((r) => r.expect === "reject");
  const paraphrases = results.filter((r) => r.expect === "accept");
  const falseAccepts = adversarial.filter((r) => r.accepted !== false).length;
  const falseRejects = paraphrases.filter((r) => r.accepted !== true).length;
  const falseAccept = adversarial.length === 0 ? 1 : falseAccepts / adversarial.length;
  const falseReject = paraphrases.length === 0 ? 0 : falseRejects / paraphrases.length;
  return { falseAccept, falseReject, n: results.length, enabled: adversarial.length >= GATE_MIN_ADVERSARIAL && falseAccept <= GATE_MAX_FALSE_ACCEPT };
};

/**
 * What the judge sees of the accept set (§13.2): the canonical answer, then the most heavily
 * weighted alternatives, one per line.
 */
export const acceptForJudge = (notation: string, max = 8): readonly string[] => {
  const parsed = parseAcceptSet(notation);
  if (!parsed.ok) return [];
  // Expansions keep the spaces around a dropped optional part; the grader normalizes them away.
  const tidy = (text: string): string => text.replace(/\s+/gu, " ").trim();
  const [canonical, ...rest] = [...parsed.value.alternatives].sort((a, b) => Number(b.canonical) - Number(a.canonical));
  if (canonical === undefined) return [];
  const others = rest.sort((a, b) => b.weight - a.weight || a.line - b.line).map((a) => tidy(a.text));
  return [...new Set([tidy(canonical.text), ...others])].slice(0, max);
};

/** The accept set a production template grades against: the target form's `reverse` (L1→L2). */
export const productionAccept = (sentence: BundleSentence, orthography: string): string | undefined => sentence.forms[orthography]?.reverse;
