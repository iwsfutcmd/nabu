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

export type Rating = "again" | "hard" | "good" | "easy";

/**
 * How an answer's time compares with the learner's usual for its template, per unit of length
 * (ADR 0096): much slower is "slow", much faster "fast".
 */
export type Pace = "slow" | "usual" | "fast";

/** The facet an exercise of this template exercises (§9.1). */
export const facetOf = (template: Exercise["template"]): Facet => TEMPLATES[template].facet;

/** The KCs a token carries: its sense and its morphs. */
export const kcsOfToken = (token: Token): readonly KcId[] => [
  ...(token.sense === undefined ? [] : [`sense:${token.sense}` as KcId]),
  ...(token.morphs ?? []).map((m) => m.kc),
];

const unique = <T>(xs: readonly T[]): readonly T[] => [...new Set(xs)];

const firstToken = (text: TaggedText | undefined): Token | undefined => text?.tokens[0];

/** The KCs an answer is credited to: those the exercise asks about, else all of its KCs. */
export const creditedKcs = (ex: Exercise): readonly KcId[] => askedKcs(ex) ?? ex.kcs;

/** The KCs an exercise asks the learner to produce, pick or pronounce; the rest of its KCs were given. */
export const askedKcs = (ex: Exercise): readonly KcId[] | undefined => {
  if (ex.template === "complete-translation") {
    const token = firstToken(ex.blank);
    return token === undefined ? undefined : kcsOfToken(token);
  }
  if (ex.template === "gap-fill" || ex.template === "story-complete") {
    const token = firstToken(ex.options[ex.answer]);
    return token === undefined ? undefined : kcsOfToken(token);
  }
  // A pronunciation card in context (ADR 0095, 0098) asks about one word; the sentence around it is given.
  if (ex.template === "vocalize" || ex.template === "transcribe" || (ex.template === "char-read" && ex.word !== undefined)) {
    const token = ex.word === undefined ? undefined : ex.prompt.tokens[ex.word];
    return token === undefined ? undefined : kcsOfToken(token);
  }
  return undefined;
};

/**
 * Per word of a typed answer: right when every unit of the word was matched in the alignment.
 * Units are compared without vowel marks: the displayed words carry the marks a course's
 * vocalization adds (ADR 0053), while the accept sets they are matched against may not.
 */
const wordCredit = (canonical: TaggedText, alignment: readonly AlignOp[], profile: CompiledProfile): ReadonlyMap<KcId, "right" | "wrong"> => {
  const key = (unit: string): string => profile.marks?.strip(unit) ?? unit;
  const matched = new Map<string, number>();
  for (const op of alignment) {
    if (op.op === "match" && op.kind !== "typo") matched.set(key(op.expected), (matched.get(key(op.expected)) ?? 0) + 1);
  }
  const out = new Map<KcId, "right" | "wrong">();
  for (const token of canonical.tokens) {
    if (token.kind !== "word" && token.kind !== "number") continue;
    const units = profile.units(profile.normalize(token.surface)).map(key);
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
  // Speech (Phase 9): the words said wrong are debited, the words said well credited, even when the
  // whole was only close. KCs not tied to a word follow the verdict.
  if ((ex.template === "speak" || ex.template === "listen-speak") && outcome.offTokens !== undefined && outcome.verdict !== "WRONG") {
    const off = new Set(outcome.offTokens.flatMap((i) => (ex.prompt.tokens[i] === undefined ? [] : kcsOfToken(ex.prompt.tokens[i]))));
    const said = new Set(ex.prompt.tokens.flatMap((t) => kcsOfToken(t)));
    return ex.kcs.map((kc) => ({ kc, status: off.has(kc) ? "wrong" : said.has(kc) ? "right" : right ? "right" : "wrong" }));
  }
  return ex.kcs.map((kc) => ({ kc, status: right ? "right" : "wrong" }));
};

/**
 * The rating that goes to FSRS (§9.2, ADR 0096). Learners never rate themselves, except speaking at
 * tier 0: the answer says how recall went. Right is Good; right but slow, or with a slip (typo,
 * marks, variant, provisional, IME), is Hard; right, fast and typed from memory is Easy, which the
 * fold grants only to a card already sure. A right answer after a hint (a word's meaning looked up
 * on the card before answering, D16) is Hard at best: §9.2's Good is for an answer with no hint.
 */
export const ratingOf = (
  status: KcCredit["status"],
  verdict: Verdict,
  notes: readonly string[],
  pace: Pace,
  selfRating?: SelfRating,
  typed = false,
  hinted = false,
): Rating | undefined => {
  const rating = unhintedRating(status, verdict, notes, pace, selfRating, typed);
  return hinted && (rating === "good" || rating === "easy") ? "hard" : rating;
};

const unhintedRating = (status: KcCredit["status"], verdict: Verdict, notes: readonly string[], pace: Pace, selfRating: SelfRating | undefined, typed: boolean): Rating | undefined => {
  if (status === "given") return undefined;
  if (status === "wrong") return "again";
  if (selfRating !== undefined) return selfRating === "again" ? "again" : selfRating;
  if (verdict === "CORRECT" || verdict === "CORRECT_ALT") {
    if (pace === "slow" || notes.includes("pairs-mistakes")) return "hard";
    return pace === "fast" && typed ? "easy" : "good";
  }
  return "hard";
};
