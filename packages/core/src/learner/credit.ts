/**
 * Credit assignment (gameplan §8.5) and the outcome → FSRS rating map (§9.2).
 *
 * Each exercise exercises one facet of its KCs. Per KC the outcome is `right`,
 * `wrong`, or `given` (the learner did not have to produce it: the rest of a
 * gap-fill sentence). For typed answers the closest-path alignment decides per
 * word: a KC whose word was matched is right even when the answer as a whole
 * was wrong.
 */
import type { KcCredit, KcId, TaggedText, Token } from "@nabu/schema";
import type { AlignOp, Verdict } from "../match/grade.ts";
import type { CompiledProfile } from "../profile/compile.ts";
import { isCorrect, type Exercise, type Facet, type Outcome, type SelfRating } from "../lesson/exercise.ts";
import { TEMPLATES } from "../lesson/templates.ts";

export type Rating = "again" | "hard" | "good";

/** The facet an exercise of this template exercises (§9.1). */
export const facetOf = (template: Exercise["template"]): Facet => TEMPLATES[template].facet;

/** The KCs a token carries: its sense and its morphs. */
export const kcsOfToken = (token: Token): readonly KcId[] => [
  ...(token.sense === undefined ? [] : [`sense:${token.sense}` as KcId]),
  ...(token.morphs ?? []).map((m) => m.kc),
];

const unique = <T>(xs: readonly T[]): readonly T[] => [...new Set(xs)];

const firstToken = (text: TaggedText | undefined): Token | undefined => text?.tokens[0];

/** The KCs an exercise asks the learner to produce or pick; the rest of its KCs were given. */
const askedKcs = (ex: Exercise): readonly KcId[] | undefined => {
  if (ex.template === "complete-translation") {
    const token = firstToken(ex.blank);
    return token === undefined ? undefined : kcsOfToken(token);
  }
  if (ex.template === "gap-fill" || ex.template === "story-complete") {
    const token = firstToken(ex.options[ex.answer]);
    return token === undefined ? undefined : kcsOfToken(token);
  }
  return undefined;
};

/** Per word of a typed answer: right when every unit of the word was matched in the alignment. */
const wordCredit = (canonical: TaggedText, alignment: readonly AlignOp[], profile: CompiledProfile): ReadonlyMap<KcId, "right" | "wrong"> => {
  const matched = new Map<string, number>();
  for (const op of alignment) {
    if (op.op === "match" && op.kind !== "typo") matched.set(op.expected, (matched.get(op.expected) ?? 0) + 1);
  }
  const out = new Map<KcId, "right" | "wrong">();
  for (const token of canonical.tokens) {
    if (token.kind !== "word" && token.kind !== "number") continue;
    const units = profile.units(profile.normalize(token.surface));
    const right = units.length > 0 && units.every((u) => (matched.get(u) ?? 0) > 0);
    for (const kc of kcsOfToken(token)) {
      // A KC is wrong if any of its words was wrong.
      if (out.get(kc) !== "wrong") out.set(kc, right ? "right" : "wrong");
    }
  }
  return out;
};

/**
 * Per-KC credit for one graded answer. `profiles` resolves the answer's
 * orthography for word-level credit on typed answers.
 */
export const creditOf = (ex: Exercise, outcome: Outcome, profiles: ReadonlyMap<string, CompiledProfile>): readonly KcCredit[] => {
  const right = isCorrect(outcome.verdict);
  const asked = askedKcs(ex);
  if (asked !== undefined) {
    const set = new Set(asked);
    return unique([...asked, ...ex.kcs]).map((kc) => ({ kc, status: set.has(kc) ? (right ? "right" : "wrong") : "given" }));
  }
  if (!right && (ex.template === "translate-type.l1-l2" || ex.template === "listen-type") && outcome.alignment !== undefined) {
    const profile = profiles.get(ex.orthography);
    if (profile !== undefined) {
      const words = wordCredit(ex.canonical, outcome.alignment, profile);
      return ex.kcs.map((kc) => ({ kc, status: words.get(kc) ?? "wrong" }));
    }
  }
  return ex.kcs.map((kc) => ({ kc, status: right ? "right" : "wrong" }));
};

/** The rating that goes to FSRS (§9.2). Learners never rate themselves, except speaking at tier 0. */
export const ratingOf = (
  status: KcCredit["status"],
  verdict: Verdict,
  notes: readonly string[],
  slow: boolean,
  selfRating?: SelfRating,
): Rating | undefined => {
  if (status === "given") return undefined;
  if (status === "wrong") return "again";
  if (selfRating !== undefined) return selfRating === "again" ? "again" : selfRating;
  if (verdict === "CORRECT" || verdict === "CORRECT_ALT") return slow || notes.includes("pairs-mistakes") ? "hard" : "good";
  return "hard"; // typo, marks, variant, provisional, IME slip
};
