/**
 * The lesson player as it renders each state (server-rendered: no effects run), driven through the
 * pure state machine from the committed fixture bundles.
 */
import { createGrader, gradeExercise, sampleExercise, start, step, type CourseView, type Draft, type Exercise, type PlayerState, type TemplateId } from "@nabu/core/lesson";
import { describe, expect, it } from "vitest";
import { LessonPlayer, type LessonPlayerProps } from "../src/player/LessonPlayer.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const SEED = 7;

const cardOf = (course: CourseView, template: TemplateId): Exercise => {
  const ex = sampleExercise(course, template, SEED);
  if (ex === undefined) throw new Error(`${course.id} has no ${template} card`);
  return ex;
};

/** The player answering `ex`, or showing the feedback for `draft`. */
const stateOf = (course: CourseView, ex: Exercise, draft?: Draft): PlayerState => {
  const [presenting] = start("lesson", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  if (draft === undefined) return answering;
  const [checking] = step(step(answering, { tag: "input", draft })[0], { tag: "submit" });
  if (checking.tag !== "checking") throw new Error(`not checking: ${checking.tag}`);
  return step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, createGrader(course)) })[0];
};

const play = (course: CourseView, ex: Exercise, state: PlayerState, extra: Partial<LessonPlayerProps> = {}): string =>
  render(<LessonPlayer course={course} lessonId="lesson" exercises={[ex]} grader={createGrader(course)} imageUrl={(p) => p} language="Lebanese Arabic" initialState={state} {...extra} />);

describe("the answer's play buttons (P15)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const ex = cardOf(course, "complete-translation");

  it("keep their room before the answer, hidden, and show once it is answered", () => {
    expect(course.audio[ex.item]).toBeDefined();
    const before = play(course, ex, stateOf(course, ex));
    expect(before).toMatch(/data-answer-audio="" data-hidden=""/u);
    const after = play(course, ex, stateOf(course, ex, { tag: "text", text: "?" }));
    expect(after).toContain("data-answer-audio");
    expect(after).not.toMatch(/data-answer-audio="" data-hidden=""/u);
  });
});
