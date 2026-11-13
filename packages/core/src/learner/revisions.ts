/**
 * Retroactive revisions (gameplan §8.3): a revision replaces the outcome of the answer it names,
 * and every projection recomputes as if the answer had been graded that way. Projections fold the
 * log through `withRevisions`; the revisions themselves change nothing else.
 *
 * Two kinds of event revise an answer:
 * - `outcome_revised`, which the server issues (the judge accepted the answer);
 * - `answer_reported`, the learner's own claim (ADR 0052): "my answer should have been accepted"
 *   counts the answer right, "this should have been wrong" (claim `reject`) counts it wrong. The
 *   report still goes to review for the course; for the learner, it counts at once.
 *
 * When an answer has several, the latest (device time, then id) wins.
 */
import type { AnswerReported, AnswerSubmitted, LearnerEvent, OutcomeRevised } from "@nabu/schema";
import type { Verdict } from "../match/grade.ts";

/** The verdict a learner's claim gives their answer: right, or wrong. */
const CLAIMED: Readonly<Record<"accept" | "reject", Verdict>> = { accept: "CORRECT", reject: "WRONG" };

/**
 * The verdict a revision gives the answer it names: the judge's, or the learner's claim. A session
 * still running takes it at once (ADR 0113), as the projections do.
 */
export const revisionVerdict = (e: OutcomeRevised | AnswerReported): Verdict => (e.type === "outcome_revised" ? e.outcome.kind : CLAIMED[e.claim ?? "accept"]);

/** One revision of an answer: when it was made, and the outcome it gives the answer. */
export interface Revision {
  readonly id: string;
  readonly clientTime: string;
  readonly course: string;
  readonly orthography: string;
  readonly outcome: (answer: AnswerSubmitted) => AnswerSubmitted["outcome"];
}

const later = (a: Revision, b: Revision): boolean => {
  const t = Date.parse(a.clientTime) - Date.parse(b.clientTime);
  return t !== 0 ? t > 0 : a.id > b.id;
};

/** The learner's claim as an outcome: every KC of the answer right, or every one wrong. */
const claimed = (claim: "accept" | "reject") => (answer: AnswerSubmitted): AnswerSubmitted["outcome"] => ({
  kind: CLAIMED[claim],
  notes: [...answer.outcome.notes, claim === "accept" ? "learner-accepted" : "learner-rejected"],
  kcs: answer.outcome.kcs.map((k) => ({ ...k, status: claim === "accept" ? "right" : "wrong" })),
});

const revisionOf = (e: OutcomeRevised | AnswerReported): Revision => ({
  id: e.id,
  clientTime: e.clientTime,
  course: e.course,
  orthography: e.orthography,
  outcome: e.type === "outcome_revised" ? () => e.outcome : claimed(e.claim ?? "accept"),
});

/** The revision that applies to each answer id. */
export const revisionsOf = (events: readonly LearnerEvent[]): ReadonlyMap<string, Revision> => {
  const out = new Map<string, Revision>();
  for (const e of events) {
    if (e.type !== "outcome_revised" && e.type !== "answer_reported") continue;
    const revision = revisionOf(e);
    const current = out.get(e.answer);
    if (current === undefined || later(revision, current)) out.set(e.answer, revision);
  }
  return out;
};

/** An answer with its revision applied (a revision for another course or orthography is ignored). */
export const revised = (e: AnswerSubmitted, revisions: ReadonlyMap<string, Revision>): AnswerSubmitted => {
  const r = revisions.get(e.id);
  return r === undefined || r.course !== e.course || r.orthography !== e.orthography ? e : { ...e, outcome: r.outcome(e) };
};

/** The log as projections see it: answers carry their revised outcomes; revisions drop out. */
export const withRevisions = (events: readonly LearnerEvent[]): LearnerEvent[] => {
  const revisions = revisionsOf(events);
  return events.flatMap((e): LearnerEvent[] => (e.type === "outcome_revised" ? [] : e.type === "answer_submitted" ? [revised(e, revisions)] : [e]));
};
