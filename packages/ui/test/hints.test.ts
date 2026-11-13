/**
 * A word looked up before answering is a hint (D16): only while the card is being answered, and only
 * the answer of the card it was looked up on.
 */
import { createGrader, gradeExercise, sampleExercise, start, step, type Exercise, type LessonEvent, type PlayerState } from "@nabu/core/lesson";
import { describe, expect, it } from "vitest";
import { lookupIsHint, withHint } from "../src/player/hints.ts";
import { loadCourse } from "./course.ts";

const course = loadCourse("apc", "apc-Arab/standard");
const ex = sampleExercise(course, "gap-fill", 7) as Exercise;
if (ex.template !== "gap-fill") throw new Error("apc has a gap-fill card");

/** The player through one card: presenting, answering, checking, feedback, then finished. */
const states = (): { readonly presenting: PlayerState; readonly answering: PlayerState; readonly feedback: PlayerState; readonly finished: PlayerState; readonly answered: LessonEvent } => {
  const [presenting] = start("lesson", [ex], { retries: false });
  const [answering] = step(presenting, { tag: "ready" });
  const [checking] = step(step(answering, { tag: "input", draft: { tag: "choice", index: ex.answer } })[0], { tag: "submit" });
  if (checking.tag !== "checking") throw new Error(checking.tag);
  const [feedback, effects] = step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, createGrader(course)) });
  const answered = effects.flatMap((f) => (f.tag === "emit" && f.event.type === "answer_submitted" ? [f.event] : []))[0];
  if (answered === undefined) throw new Error("no answer event");
  const [finished] = step(feedback, { tag: "continue" });
  return { presenting, answering, feedback, finished, answered };
};

describe("a lookup before answering is a hint (D16)", () => {
  const s = states();

  it("never counts on a speaking card, which shows what the sentence means anyway (D16c)", () => {
    for (const template of ["speak.tier-0", "speak", "listen-speak"] as const) {
      expect(lookupIsHint(s.presenting, template)).toBe(false);
      expect(lookupIsHint(s.answering, template)).toBe(false);
    }
  });

  it("counts while the card is shown and being answered, never once it is checked", () => {
    expect(lookupIsHint(s.presenting, ex.template)).toBe(true);
    expect(lookupIsHint(s.answering, ex.template)).toBe(true);
    expect(lookupIsHint(s.feedback, ex.template)).toBe(false);
    expect(lookupIsHint(s.finished, ex.template)).toBe(false);
    // The quit dialog over a card being answered is still before the answer.
    expect(lookupIsHint(step(s.answering, { tag: "interrupt", reason: "quit-confirm" })[0], ex.template)).toBe(true);
    expect(lookupIsHint(step(s.feedback, { tag: "interrupt", reason: "quit-confirm" })[0], ex.template)).toBe(false);
  });

  it("marks the answer of the card it was looked up on, and nothing else", () => {
    expect(withHint(s.answered, new Set([ex.id]))).toEqual({ ...s.answered, hinted: true });
    expect(withHint(s.answered, new Set(["another-card"]))).toBe(s.answered);
    expect(withHint(s.answered, new Set())).toBe(s.answered);
    const started: LessonEvent = { type: "session_started", lesson: "lesson", exercises: 1 };
    expect(withHint(started, new Set([ex.id]))).toBe(started);
  });
});
