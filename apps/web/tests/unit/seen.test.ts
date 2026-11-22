/**
 * What was seen is logged (ADR 0146), as the app records it: a lesson's presentations and answers say
 * what each card displayed, a story's lines are logged once each, and a session picked up again
 * (S3) logs no presentation a second time. Every event is valid against the schema the server checks.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { emptyLearnerState, plan, replay } from "@nabu/core/learner";
import { assembleCourse, createGrader, doneOf, gradeExercise, MEDIA_ROLES, resume, seededRng, start, step, type CourseView, type Effect, type PlayerState } from "@nabu/core/lesson";
import { allStories, startStory, stepStory, storyScript, type StoryState } from "@nabu/core/story";
import type { BundleManifest, LearnerEvent } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { rightAnswer } from "../../../../packages/core/test/answers.ts";
import { validEvent } from "../../src/event-schema.ts";
import { presentedIn, recorder, storyRecorder } from "../../src/session.ts";

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

const course = loadCourse("es");
const grader = createGrader(course);
const node = "es.u01.hola";
const lesson = plan(course, emptyLearnerState(), { mode: "lesson", node }, { now: "2026-11-12T09:00:00.000Z", seed: 9 });
const SESSION = "00000000-0000-7000-a000-00000000beef";

/** Plays a lesson's cards, each answered right, through the player and the recorder; stops after `count`, or at its end. */
const play = (count: number, from?: readonly [PlayerState, readonly Effect[]], presented?: ReadonlySet<string>): LearnerEvent[] => {
  const logged: LearnerEvent[] = [];
  const onEvent = recorder({ course, bundle: "0".repeat(64), device: "unit", plan: lesson, seed: 9, record: (e) => logged.push(e), session: SESSION, presented });
  const [first, effects] = from ?? start(node, lesson.exercises);
  let state: PlayerState = first;
  const run = (fx: readonly Effect[]): void => {
    for (const f of fx) if (f.tag === "emit") onEvent(f.event);
  };
  run(effects);
  for (let n = 0; n < count && state.tag === "presenting"; n++) {
    const [answering] = step(state, { tag: "ready" });
    if (answering.tag !== "answering") throw new Error(answering.tag);
    const response = rightAnswer(answering.ex);
    const [graded, fx] = step({ tag: "checking", session: answering.session, ex: answering.ex, response }, { tag: "graded", outcome: gradeExercise(answering.ex, response, grader) });
    run(fx);
    const [next, more] = step(graded, { tag: "continue" });
    run(more);
    state = next;
  }
  return logged;
};

describe("a lesson logs what its cards displayed (ADR 0146)", () => {
  it("each presentation and each answer carries `displayed`, and the fold keeps the pairs", () => {
    const logged = play(Number.MAX_SAFE_INTEGER);
    const presented = logged.filter((e) => e.type === "exercise_presented");
    const answered = logged.filter((e) => e.type === "answer_submitted");
    expect(presented.length).toBe(lesson.exercises.length);
    expect(answered.length).toBe(lesson.exercises.length);
    for (const e of [...presented, ...answered]) {
      expect(validEvent(e), JSON.stringify(e)).toBe(true);
      expect(Array.isArray((e as { displayed?: unknown }).displayed), e.type).toBe(true);
    }
    expect(presented.some((e) => e.type === "exercise_presented" && (e.displayed?.length ?? 0) > 0)).toBe(true);
    // The lesson's own words are seen once it is played.
    expect(replay(logged).seen["lexeme:hola"]).toBeDefined();
  });

  it("a session picked up again logs no card a second time", () => {
    const before = play(3);
    expect(before.filter((e) => e.type === "exercise_presented")).toHaveLength(4);
    const from = resume(node, lesson.exercises, {}, doneOf(before, SESSION));
    if (from === undefined) throw new Error("no resume");
    const after = play(Number.MAX_SAFE_INTEGER, from, presentedIn(before, SESSION));
    const ids = [...before, ...after].flatMap((e) => (e.type === "exercise_presented" ? [e.exercise.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(lesson.exercises.map((ex) => ex.id));
  });
});

describe("a story logs the lines read (ADR 0146)", () => {
  it("one story_line_read a line, valid, however often the reader says it was read", () => {
    const story = allStories(course)[0];
    if (story === undefined) throw new Error("no story");
    const script = storyScript(course, story, seededRng(4));
    const logged: LearnerEvent[] = [];
    const onEvent = storyRecorder({ course, bundle: "0".repeat(64), device: "unit", node: script.node, seed: 4, record: (e) => logged.push(e), session: SESSION });
    const emit = (fx: readonly Effect[]): void => {
      for (const f of fx) if (f.tag === "emit") onEvent(f.event);
    };
    const opened: readonly [StoryState, readonly Effect[]] = startStory(script);
    let state = opened[0];
    emit(opened[1]);
    const dispatch = (event: Parameters<typeof stepStory>[1]): void => {
      const [next, fx] = stepStory(state, event);
      state = next;
      for (const f of fx) {
        if (f.tag === "emit") {
          onEvent(f.event);
          // A shell that says a line was read twice logs it once.
          if (f.event.type === "story_line_read") onEvent(f.event);
        } else if (f.tag === "grade") {
          const [graded, more] = stepStory(state, { tag: "player", event: { tag: "graded", outcome: gradeExercise(f.ex, f.response, createGrader(course)) } });
          state = graded;
          emit(more);
        }
      }
    };
    for (let guard = 0; state.tag !== "finished" && guard < 500; guard++) {
      if (state.tag === "reading") dispatch({ tag: "continue" });
      else if (state.player.tag === "presenting") dispatch({ tag: "player", event: { tag: "ready" } });
      else if (state.player.tag === "answering") {
        const response = rightAnswer(state.ex);
        const draft = response.tag === "tiles" ? { tag: "tiles" as const, order: response.order } : response.tag === "choice" ? { tag: "choice" as const, index: response.index } : undefined;
        if (draft === undefined) throw new Error(response.tag);
        dispatch({ tag: "player", event: { tag: "input", draft } });
        dispatch({ tag: "player", event: { tag: "submit" } });
      } else if (state.player.tag === "feedback") dispatch({ tag: "player", event: { tag: "continue" } });
    }
    expect(state.tag).toBe("finished");
    const lines = logged.flatMap((e) => (e.type === "story_line_read" ? [e] : []));
    expect(lines.map((l) => l.line)).toEqual(script.lines.map((l) => l.step));
    for (const e of lines) expect(validEvent(e), JSON.stringify(e)).toBe(true);
    expect(lines.every((l) => l.session === SESSION && l.story === script.id)).toBe(true);
    expect(lines.some((l) => l.displayed.length > 0)).toBe(true);
  });
});
