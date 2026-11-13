/**
 * A word looked up before answering is a hint (D16), from the player to the log: the lesson player
 * marks the answer of a card whose meaning was looked up while it was being answered (withHint), the
 * recorder logs it as `input.hinted`, and a lookup once the card is checked marks nothing.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { emptyLearnerState, plan } from "@nabu/core/learner";
import { assembleCourse, createGrader, gradeExercise, MEDIA_ROLES, start, step, type CourseView, type Effect, type Exercise, type PlayerState } from "@nabu/core/lesson";
import type { AnswerSubmitted, BundleManifest, LearnerEvent } from "@nabu/schema";
import { lookupIsHint, withHint } from "@nabu/ui/player";
import { describe, expect, it } from "vitest";
import { recorder } from "../../src/session.ts";

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

const loadCourse = (id: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]));
  const course = assembleCourse({ manifest, files, numberingSystems });
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

const course = loadCourse("fa");
const grader = createGrader(course);
const node = course.units[0]?.nodes.find((n) => n.kind === "lesson")?.id ?? "";
const lesson = plan(course, emptyLearnerState(), { mode: "lesson", node }, { now: "2026-11-12T09:00:00.000Z", seed: 5 });

/** The right answer's draft for the cards this test plays (choices and tiles). */
const answerOf = (ex: Exercise) =>
  "answer" in ex && typeof ex.answer === "number" ? ({ tag: "choice", index: ex.answer } as const) : "solution" in ex ? ({ tag: "tiles", order: ex.solution } as const) : undefined;

/**
 * Plays the lesson's first answerable card as the lesson player does, looking a word up at `lookAt`
 * (while answering, or once it is checked), and returns its logged answer.
 */
const playWithLookup = (lookAt: "answering" | "feedback"): AnswerSubmitted => {
  const ex = lesson.exercises.find((e) => answerOf(e) !== undefined);
  const draft = ex === undefined ? undefined : answerOf(ex);
  if (ex === undefined || draft === undefined) throw new Error("no answerable card");
  const logged: LearnerEvent[] = [];
  const hinted = new Set<string>();
  const onEvent = recorder({ course, bundle: "0".repeat(64), device: "unit", plan: lesson, seed: 5, record: (e) => logged.push(e) });
  let state: PlayerState = start(node, [ex])[0];
  const lookUp = (): void => {
    if (lookupIsHint(state, ex.template)) hinted.add(ex.id);
  };
  const run = (fx: readonly Effect[]): void => {
    for (const f of fx) {
      if (f.tag === "emit") onEvent(withHint(f.event, hinted));
      else if (f.tag === "grade") {
        const [next, more] = step(state, { tag: "graded", outcome: gradeExercise(f.ex, f.response, grader) });
        state = next;
        run(more);
      }
    }
  };
  state = step(state, { tag: "ready" })[0];
  if (lookAt === "answering") lookUp();
  state = step(state, { tag: "input", draft })[0];
  const [checking, fx] = step(state, { tag: "submit" });
  state = checking;
  run(fx);
  if (lookAt === "feedback") lookUp();
  const answer = logged.find((e): e is AnswerSubmitted => e.type === "answer_submitted");
  if (answer === undefined) throw new Error("no answer logged");
  return answer;
};

describe("a word looked up before answering (D16)", () => {
  it("is logged with the answer as a hint", () => {
    const answer = playWithLookup("answering");
    expect(answer.outcome.kind).toMatch(/^CORRECT/u);
    expect(answer.input.hinted).toBe(true);
  });

  it("once the card is checked, is learning: the answer logs no hint", () => {
    expect(playWithLookup("feedback").input.hinted).toBeUndefined();
  });
});
