/**
 * Retroactive revisions (gameplan §8.3): an outcome_revised event replaces the outcome of the
 * answer it names, and every projection recomputes as if the answer had been graded that way.
 * Projections fold the log through `withRevisions`; the revisions themselves change nothing else.
 * When an answer has several revisions, the latest (device time, then id) wins.
 */
import type { AnswerSubmitted, LearnerEvent, OutcomeRevised } from "@nabu/schema";

const later = (a: OutcomeRevised, b: OutcomeRevised): boolean => {
  const t = Date.parse(a.clientTime) - Date.parse(b.clientTime);
  return t !== 0 ? t > 0 : a.id > b.id;
};

/** The revision that applies to each answer id. */
export const revisionsOf = (events: readonly LearnerEvent[]): ReadonlyMap<string, OutcomeRevised> => {
  const out = new Map<string, OutcomeRevised>();
  for (const e of events) {
    if (e.type !== "outcome_revised") continue;
    const current = out.get(e.answer);
    if (current === undefined || later(e, current)) out.set(e.answer, e);
  }
  return out;
};

/** An answer with its revision applied (a revision for another course or orthography is ignored). */
export const revised = (e: AnswerSubmitted, revisions: ReadonlyMap<string, OutcomeRevised>): AnswerSubmitted => {
  const r = revisions.get(e.id);
  return r === undefined || r.course !== e.course || r.orthography !== e.orthography ? e : { ...e, outcome: r.outcome };
};

/** The log as projections see it: answers carry their revised outcomes; revisions drop out. */
export const withRevisions = (events: readonly LearnerEvent[]): LearnerEvent[] => {
  const revisions = revisionsOf(events);
  return events.flatMap((e): LearnerEvent[] => (e.type === "outcome_revised" ? [] : e.type === "answer_submitted" ? [revised(e, revisions)] : [e]));
};
