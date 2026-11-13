/**
 * Looking up a word before answering is a hint (D16 in the 2026-11 review). A lesson card that
 * shows a tapped word's meaning while it is being answered marks its answer `hinted`; the learner
 * fold then rates a right answer Hard at best and shows no skill by it (ADR 0043's amendment). Once
 * the answer is checked, looking words up is learning, never a hint.
 */
import type { LessonEvent, PlayerState } from "@nabu/core/lesson";

/** Whether a lookup now is a hint: the card on screen is not answered yet. */
export const lookupIsHint = (state: PlayerState): boolean => {
  if (state.tag === "finished") return false;
  const active = state.tag === "interrupted" ? state.resume : state;
  return active.tag === "presenting" || active.tag === "answering";
};

/** A card's answer, marked hinted where a word's meaning was looked up on the card before it was checked. */
export const withHint = (event: LessonEvent, hinted: ReadonlySet<string>): LessonEvent =>
  event.type === "answer_submitted" && hinted.has(event.ex.id) ? { ...event, hinted: true } : event;
