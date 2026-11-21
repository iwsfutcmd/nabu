/**
 * Credit assignment (gameplan §8.5, ADR 0146) and the outcome → FSRS rating map (§9.2).
 *
 * Each exercise exercises its parts, each by one skill (`skillOf`): a lexeme, a rule and a letter
 * by the card's facet, a feature value by being chosen or read off a form. Per part the outcome is
 * `right`, `wrong`, or `given` (the learner did not have to produce it: the rest of a gap-fill
 * sentence, what the question did not ask of the blank's word, ADR 0132, and what the card cannot
 * show). For typed answers the closest-path alignment decides per word: a lexeme whose word was
 * matched is right even when the answer as a whole was wrong.
 */
import type { PartCredit, PartId, SchemeId, TaggedText, Token } from "@nabu/schema";
import type { AlignOp, Verdict } from "../match/grade.ts";
import type { CompiledProfile } from "../profile/compile.ts";
import { isCorrect, type Exercise, type Facet, type Outcome, type SelfRating } from "../lesson/exercise.ts";
import { asksOf, formsOf, skillOf, TEMPLATES } from "../lesson/templates.ts";
import { askedOfToken, lexemeIdsOf } from "../lesson/lexemes.ts";

export type Rating = "again" | "hard" | "good" | "easy";

/**
 * How an answer's time compares with the learner's usual for its template, per unit of length
 * (ADR 0096): much slower is "slow", much faster "fast".
 */
export type Pace = "slow" | "usual" | "fast";

/** The facet an exercise of this template exercises (§9.1). */
export const facetOf = (template: Exercise["template"]): Facet => TEMPLATES[template].facet;

const unique = <T>(xs: readonly T[]): readonly T[] => [...new Set(xs)];

const firstToken = (text: TaggedText | undefined): Token | undefined => text?.tokens[0];

/** The parts an answer is credited to: those the exercise asks about, else all of its parts that a card of its kind can show. */
export const creditedParts = (ex: Exercise): readonly PartId[] => askedParts(ex) ?? ex.parts.filter((part) => asksOf(ex.template, part));

/** The reading tradition a reading card names (ADR 0138): its read-script card is that tradition's. */
export const readingOf = (ex: Exercise): SchemeId | undefined =>
  ex.template === "char-read" || ex.template === "reading-feature" || ex.template === "reading-disambiguation" || ex.template === "transcribe" ? ex.tradition : undefined;

/** The parts an exercise asks the learner to produce, pick or pronounce; the rest of its parts were given. */
export const askedParts = (ex: Exercise): readonly PartId[] | undefined => {
  if (ex.template === "complete-translation") {
    const token = firstToken(ex.blank);
    return token === undefined ? undefined : lexemeIdsOf(token);
  }
  // A fill-in asks one thing (ADR 0132): which lexeme (the token's base; every option had the form)
  // or which form (what its form credits, of what the line teaches; every option was the lexeme).
  if (ex.template === "gap-fill" || ex.template === "story-complete") {
    const token = firstToken(ex.options[ex.answer]);
    if (token === undefined) return undefined;
    return ex.asks === undefined || ex.asks === "use" ? lexemeIdsOf(token) : askedOfToken(token, ex.asks, new Set(ex.parts));
  }
  // A spelling choice (ADR 0142) asks how one word is written: the word the gap's right option is.
  if (ex.template === "spelling-choice") {
    const token = firstToken(ex.options[ex.answer]);
    return token === undefined ? undefined : lexemeIdsOf(token);
  }
  // A word and its parts (ADR 0152), built or taken apart: the word's forms, which the card names.
  // Its other lexemes (its base, a clitic, an article) are given: the card shows each as the course
  // cites it, with what it means, so the answer says nothing of them.
  if (ex.template === "parts-whole") return formsOf(ex.wordParts, new Set(ex.parts));
  if (ex.template === "whole-parts") return formsOf(ex.solution.flatMap((i) => ex.options[i] ?? []), new Set(ex.parts));
  // A pronunciation card in context (ADR 0095, 0098) asks about one word; the sentence around it is given.
  if (ex.template === "vocalize" || ex.template === "vocalize-build" || ex.template === "transcribe" || ((ex.template === "char-read" || ex.template === "reading-feature") && ex.word !== undefined)) {
    const token = ex.word === undefined ? undefined : ex.prompt.tokens[ex.word];
    return token === undefined ? undefined : lexemeIdsOf(token);
  }
  return undefined;
};

/**
 * Per word of a typed answer: right when every unit of the word was matched in the alignment.
 * Units are compared without vowel marks: the displayed words carry the marks a course's
 * vocalization adds (ADR 0053), while the accept sets they are matched against may not.
 */
const wordCredit = (canonical: TaggedText, alignment: readonly AlignOp[], profile: CompiledProfile): ReadonlyMap<PartId, "right" | "wrong"> => {
  const key = (unit: string): string => profile.marks?.strip(unit) ?? unit;
  const matched = new Map<string, number>();
  for (const op of alignment) {
    if (op.op === "match" && op.kind !== "typo") matched.set(key(op.expected), (matched.get(key(op.expected)) ?? 0) + 1);
  }
  const out = new Map<PartId, "right" | "wrong">();
  for (const token of canonical.tokens) {
    if (token.kind !== "lexical" && token.kind !== "number") continue;
    const units = profile.units(profile.normalize(token.surface)).map(key);
    const right = units.length > 0 && units.every((u) => (matched.get(u) ?? 0) > 0);
    for (const lexeme of lexemeIdsOf(token)) {
      // A lexeme is wrong if any of its words was wrong.
      if (out.get(lexeme) !== "wrong") out.set(lexeme, right ? "right" : "wrong");
    }
  }
  return out;
};

/**
 * Per-part credit for one graded answer, each part with the skill the card exercises it by.
 * `profiles` resolves the answer's orthography for word-level credit on typed answers. A part the
 * card cannot show (`asksOf`) is given, whatever the answer.
 */
export const creditOf = (ex: Exercise, outcome: Outcome, profiles: ReadonlyMap<string, CompiledProfile>): readonly PartCredit[] => {
  const right = isCorrect(outcome.verdict);
  const credit = (part: PartId, status: PartCredit["status"]): PartCredit => ({ part, skill: skillOf(ex.template, part), status: asksOf(ex.template, part) ? status : "given" });
  const asked = askedParts(ex);
  if (asked !== undefined) {
    const set = new Set(asked);
    return unique([...asked, ...ex.parts]).map((part) => credit(part, set.has(part) ? (right ? "right" : "wrong") : "given"));
  }
  if (!right && (ex.template === "translate-type.l1-l2" || ex.template === "listen-type") && outcome.alignment !== undefined) {
    const profile = profiles.get(ex.orthography);
    if (profile !== undefined) {
      const words = wordCredit(ex.canonical, outcome.alignment, profile);
      return ex.parts.map((part) => credit(part, words.get(part) ?? "wrong"));
    }
  }
  // Speech (Phase 9): the words said wrong are debited, the words said well credited, even when the
  // whole was only close. Parts not tied to a word follow the verdict.
  if ((ex.template === "speak" || ex.template === "listen-speak") && outcome.offTokens !== undefined && outcome.verdict !== "WRONG") {
    const off = new Set(outcome.offTokens.flatMap((i) => (ex.prompt.tokens[i] === undefined ? [] : lexemeIdsOf(ex.prompt.tokens[i]))));
    const said = new Set(ex.prompt.tokens.flatMap((t) => lexemeIdsOf(t)));
    return ex.parts.map((part) => credit(part, off.has(part) ? "wrong" : said.has(part) ? "right" : right ? "right" : "wrong"));
  }
  return ex.parts.map((part) => credit(part, right ? "right" : "wrong"));
};

/**
 * The rating that goes to FSRS (§9.2, ADR 0096). Learners never rate themselves, except speaking at
 * tier 0: the answer says how recall went. Right is Good; right but slow, or with a slip (typo,
 * marks, variant, provisional, IME), is Hard; right, fast and typed from memory is Easy, which the
 * fold grants only to a card already sure. A right answer after a hint (a word's meaning looked up
 * on the card before answering, D16) is Hard at best: §9.2's Good is for an answer with no hint.
 */
export const ratingOf = (
  status: PartCredit["status"],
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

const unhintedRating = (status: PartCredit["status"], verdict: Verdict, notes: readonly string[], pace: Pace, selfRating: SelfRating | undefined, typed: boolean): Rating | undefined => {
  if (status === "given") return undefined;
  if (status === "wrong") return "again";
  if (selfRating !== undefined) return selfRating === "again" ? "again" : selfRating;
  if (verdict === "CORRECT" || verdict === "CORRECT_ALT") {
    if (pace === "slow" || notes.includes("pairs-mistakes")) return "hard";
    return pace === "fast" && typed ? "easy" : "good";
  }
  return "hard";
};
