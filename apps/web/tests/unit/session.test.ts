/**
 * The recorder's placement (S5 in the 2026-11 review): a placement test stopped part-way places by
 * the answers so far, and is recorded complete over the questions answered; stopped before its
 * answers place anything, it stays stopped. A session picked up again (S3) keeps its id and counts
 * the first tries it had before.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { emptyLearnerState, placementOf, plan, replay } from "@nabu/core/learner";
import { assembleCourse, createGrader, gradeExercise, MEDIA_ROLES, runTest, start, step, type CourseView, type Effect, type Exercise, type PlayerEvent, type PlayerState } from "@nabu/core/lesson";
import type { BundleManifest, LearnerEvent, SessionCompleted } from "@nabu/schema";
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
const placementPlan = plan(course, emptyLearnerState(), { mode: "placement" }, { now: "2026-11-12T09:00:00.000Z", seed: 5 });
const test = placementPlan.placement;
if (test === undefined) throw new Error("no placement test");
const unitOf = new Map(course.units.flatMap((u) => u.sentences.map((s) => [s.id, u.id] as const)));
const units = test.test.blocks.map((b) => b.id);

/** A right response, or a wrong one by choice (placement's recognition probes are choices). */
const respond = (ex: Exercise, right: boolean): PlayerEvent[] => {
  if ("answer" in ex && "options" in ex && typeof ex.answer === "number") return [{ tag: "input", draft: { tag: "choice", index: right ? ex.answer : (ex.answer + 1) % ex.options.length } }, { tag: "submit" }];
  if ((ex.template === "translate-tap.l1-l2" || ex.template === "translate-tap.l2-l1") && right) return [{ tag: "input", draft: { tag: "tiles", order: ex.solution } }, { tag: "submit" }];
  return [{ tag: "skip", reason: "skip" }];
};

/** Plays the placement test through the player, recording as the app does, and stops after `count` questions. */
const playAndStop = (count: number, knows: (ex: Exercise) => boolean): { readonly logged: LearnerEvent[]; readonly answers: ReadonlyMap<string, boolean> } => {
  const logged: LearnerEvent[] = [];
  const onEvent = recorder({ course, bundle: "0".repeat(64), device: "unit", plan: placementPlan, seed: 5, record: (e) => logged.push(e) });
  const [first, effects]: readonly [PlayerState, readonly Effect[]] = start("placement", placementPlan.exercises, { retries: false, adaptive: test.test });
  let state = first;
  const run = (fx: readonly Effect[]): void => {
    for (const f of fx) {
      if (f.tag === "emit") onEvent(f.event);
      else if (f.tag === "grade") {
        const [next, more] = step(state, { tag: "graded", outcome: gradeExercise(f.ex, f.response, grader) });
        state = next;
        run(more);
      }
    }
  };
  const dispatch = (e: PlayerEvent): void => {
    const [next, fx] = step(state, e);
    state = next;
    run(fx);
  };
  run(effects);
  const answers = new Map<string, boolean>();
  for (let n = 0; n < count && state.tag === "presenting"; n++) {
    const ex = state.ex;
    const right = knows(ex);
    dispatch({ tag: "ready" });
    for (const e of respond(ex, right)) dispatch(e);
    const s = state as PlayerState;
    if (s.tag === "feedback") answers.set(ex.id, s.outcome.verdict.startsWith("CORRECT"));
    dispatch({ tag: "continue" });
  }
  dispatch({ tag: "interrupt", reason: "quit-confirm" });
  dispatch({ tag: "quit" });
  return { logged, answers };
};

const completedOf = (logged: readonly LearnerEvent[]): SessionCompleted => {
  const done = logged.filter((e): e is SessionCompleted => e.type === "session_completed");
  expect(done).toHaveLength(1);
  return done[0] as SessionCompleted;
};

describe("a placement test stopped part-way (S5)", () => {
  it("places by the answers so far, as a stopped session without the session's XP (D9)", () => {
    // Knows the first two units; stops once their blocks are passed.
    const knows = (ex: Exercise): boolean => units.indexOf(unitOf.get(ex.item) ?? "") < 2;
    let questions = 0;
    const answers = new Map<string, boolean>();
    for (let r = runTest(test.test, answers); r.passed < 1 && r.next.length > 0; r = runTest(test.test, answers)) {
      const ex = r.next[0] as Exercise;
      answers.set(ex.id, knows(ex));
      questions++;
    }
    const { logged } = playAndStop(questions, knows);
    const done = completedOf(logged);
    expect(done.summary.completed).toBe(false);
    expect(done.placed).toEqual(placementOf(test, answers));
    expect(done.placed?.length).toBeGreaterThan(0);
    // The fold marks them done, as for a test run to its end; XP is the answers' only.
    const state = replay(logged);
    expect(state.completedNodes).toEqual(done.placed);
    expect(state.xp.total).toBe([...answers.values()].filter(Boolean).length);
  });

  it("stopped before its answers place anything, it stays stopped and places nothing", () => {
    const { logged } = playAndStop(2, () => false);
    const done = completedOf(logged);
    expect(done.summary.completed).toBe(false);
    expect(done.placed).toBeUndefined();
    expect(replay(logged).completedNodes).toEqual([]);
  });

  it("a session picked up again keeps its id and the first tries it had", () => {
    const logged: LearnerEvent[] = [];
    const onEvent = recorder({ course, bundle: "0".repeat(64), device: "unit", plan: placementPlan, seed: 5, record: (e) => logged.push(e), session: "00000000-0000-7000-a000-00000000cafe", firstTries: new Map(test.test.blocks[0]?.exercises.map((ex) => [ex.id, true]) ?? []) });
    const [, opening] = start("placement", placementPlan.exercises, { retries: false, adaptive: test.test });
    for (const f of opening) if (f.tag === "emit") onEvent(f.event);
    onEvent({ type: "session_completed", lesson: "placement", summary: { completed: false, exercises: 9, correctFirstTry: 4, retries: 0, skipped: 0 } });
    expect(new Set(logged.map((e) => e.session))).toEqual(new Set(["00000000-0000-7000-a000-00000000cafe"]));
    // The first block's answers, from before the reload, place its unit.
    expect(completedOf(logged).placed).toEqual(test.test.blocks[0]?.places);
  });
});
