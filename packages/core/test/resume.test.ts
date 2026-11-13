/**
 * A session picked up again after a reload (S3 in the 2026-11 review): folding the answers its log
 * holds through the player gives the state the live session had at that point, with retries, put-off
 * cards and an adaptive test's choices, and nothing graded again.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BundleManifest, LearnerEvent, OrthographyId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { placementTest } from "../src/learner/placement.ts";
import {
  assembleCourse,
  buildLesson,
  createGrader,
  doneOf,
  firstTriesOf,
  gradeExercise,
  isCorrect,
  lessonNodes,
  MEDIA_ROLES,
  missedOf,
  resume,
  runTest,
  start,
  step,
  type CourseView,
  type Done,
  type Effect,
  type Exercise,
  type PlayerEvent,
  type PlayerState,
  type Response,
  type StartOptions,
} from "../src/lesson/index.ts";
import { surfaceOf } from "../src/text/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

const loadCourse = (id: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]));
  const course = assembleCourse({ manifest, files, numberingSystems });
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

/** A right answer, or a wrong one where the card can be got wrong by a choice. */
const responseTo = (ex: Exercise, right: boolean): Response | undefined => {
  if ("answer" in ex && "options" in ex && typeof ex.answer === "number") return { tag: "choice", index: right ? ex.answer : (ex.answer + 1) % ex.options.length };
  if (!right) return undefined;
  switch (ex.template) {
    case "match-pairs":
    case "letter-pairs":
      return { tag: "pairs", mistakes: 0 };
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
    case "story-arrange":
    case "word-write":
      return { tag: "tiles", order: ex.solution };
    case "translate-type.l1-l2":
    case "listen-type":
      return { tag: "text", text: surfaceOf(ex.canonical) };
    case "complete-translation":
      return { tag: "text", text: surfaceOf(ex.blank) };
    case "transcribe":
      return { tag: "text", text: surfaceOf(ex.reading) };
    case "speak.tier-0":
      return { tag: "self-rating", rating: "good" };
    case "speak":
    case "listen-speak":
      return { tag: "speech", result: { silent: false } };
    default:
      return undefined;
  }
};

const draftOf = (ex: Exercise, response: Response): PlayerEvent => {
  switch (response.tag) {
    case "choice":
      return { tag: "input", draft: { tag: "choice", index: response.index } };
    case "tiles":
      return { tag: "input", draft: { tag: "tiles", order: response.order } };
    case "text":
      return { tag: "input", draft: { tag: "text", text: response.text } };
    case "pairs":
      return { tag: "input", draft: { tag: "pairs", matched: ex.template === "match-pairs" || ex.template === "letter-pairs" ? ex.left.map((_, i) => i) : [], mistakes: response.mistakes } };
    case "self-rating":
      return { tag: "input", draft: { tag: "self-rating", rating: response.rating } };
    case "speech":
      return { tag: "input", draft: { tag: "speech", result: response.result } };
  }
};

/**
 * Plays a session live, as the app's shell does, and notes after each exercise (once Continue is
 * pressed) the state, what the log has by then, and what opens that state.
 */
const playLive = (course: CourseView, lesson: string, exercises: readonly Exercise[], options: StartOptions, choose: (ex: Exercise, i: number) => "right" | "wrong" | "skip" | "cant-listen") => {
  const grader = createGrader(course);
  const done: Done[] = [];
  let [state] = start(lesson, exercises, options);
  let last: readonly Effect[] = [];
  const dispatch = (event: PlayerEvent): void => {
    const [next, effects] = step(state, event);
    state = next;
    last = effects;
    for (const f of effects) {
      if (f.tag === "grade") dispatch({ tag: "graded", outcome: gradeExercise(f.ex, f.response, grader) });
      else if (f.tag === "emit" && f.event.type === "answer_submitted")
        done.push({ tag: "answer", exercise: f.event.ex.id, verdict: f.event.graded.verdict, selfRated: f.event.graded.selfRated === true, response: f.event.response });
      else if (f.tag === "emit" && f.event.type === "exercise_skipped") done.push({ tag: "skip", exercise: f.event.ex.id, reason: f.event.reason });
    }
  };
  // The state as it is now: dispatch changes it behind TypeScript's narrowing.
  const now = (): PlayerState => state;
  const points: { readonly state: PlayerState; readonly done: readonly Done[]; readonly opened: readonly Effect[] }[] = [{ state, done: [], opened: [] }];
  for (let i = 0; now().tag !== "finished" && i < 200; i++) {
    const shown = now();
    if (shown.tag !== "presenting") throw new Error(`unexpected ${shown.tag}`);
    const ex = shown.ex;
    dispatch({ tag: "ready" });
    const how = choose(ex, i);
    const response = how === "right" || how === "wrong" ? responseTo(ex, how === "right") : undefined;
    if (how === "skip" || how === "cant-listen" || response === undefined) dispatch({ tag: "skip", reason: how === "cant-listen" ? "cant-listen" : "skip" });
    else {
      dispatch(draftOf(ex, response));
      dispatch({ tag: "submit" });
    }
    if (now().tag === "feedback") dispatch({ tag: "continue" });
    points.push({ state: now(), done: [...done], opened: last.filter((e) => e.tag === "emit" && (e.event.type === "exercise_presented" || e.event.type === "session_completed")) });
  }
  return points;
};

describe("resuming a session (S3)", () => {
  const course = loadCourse("fa");
  const node = lessonNodes(course)[2]?.node.id as string;
  const lesson = buildLesson(course, node, { seed: 3 });

  it("a lesson picked up after any exercise goes on as the live one did: retries, skips and all", () => {
    // Every third exercise wrong (where a choice can be), the fifth skipped.
    const points = playLive(course, node, lesson, {}, (_ex, i) => (i === 4 ? "skip" : i % 3 === 1 ? "wrong" : "right"));
    expect(points.at(-1)?.state.tag).toBe("finished");
    expect(points.some((p) => p.state.tag === "presenting" && p.state.ex.id.includes("#"))).toBe(true);
    for (const [k, point] of points.entries()) {
      if (k === 0) continue;
      const resumed = resume(node, lesson, {}, point.done);
      expect(resumed, `after ${k}`).toBeDefined();
      const [state, opened] = resumed ?? [];
      expect(state, `after ${k}`).toEqual(point.state);
      expect(opened, `after ${k}`).toEqual(point.opened);
    }
  });

  it("keeps what the log has of the answers for the end of the session: typed text, never a stand-in (P9)", () => {
    const points = playLive(course, node, lesson, {}, (_ex, i) => (i % 3 === 1 ? "wrong" : "right"));
    const end = points.at(-1);
    if (end?.state.tag !== "finished") throw new Error("not finished");
    // The log keeps typed text and self-ratings, not a choice or a tile order.
    const logged = end.done.map((d) => (d.tag === "answer" && d.response !== undefined && d.response.tag !== "text" && d.response.tag !== "self-rating" ? { ...d, response: undefined } : d));
    const [state] = resume(node, lesson, {}, logged) ?? [];
    if (state?.tag !== "finished") throw new Error("not resumed to the end");
    const live = end.state.session.results;
    expect(state.session.results.map((r) => r.exercise)).toEqual(live.map((r) => r.exercise));
    for (const [i, r] of state.session.results.entries()) {
      const kept = live[i]?.response;
      expect(r.response, r.exercise).toEqual(kept?.tag === "text" || kept?.tag === "self-rating" ? kept : undefined);
    }
    // The cards missed are the live session's, each with what is known of its answer.
    const missed = missedOf(state.session);
    expect(missed.map((m) => m.ex.id)).toEqual(missedOf(end.state.session).map((m) => m.ex.id));
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((m) => m.response === undefined || m.response.tag === "text")).toBe(true);
  });

  it("a fresh start reopens with the first exercise, not a second session_started", () => {
    const [state, opened] = resume(node, lesson, {}, []) ?? [];
    expect(state).toEqual(start(node, lesson)[0]);
    expect(opened?.map((e) => (e.tag === "emit" ? e.event.type : e.tag))).toEqual(["exercise_presented"]);
  });

  it("can't-listen drops the rest of the listening, resumed too", () => {
    const listening = lesson.findIndex((e) => e.template.startsWith("listen"));
    if (listening < 0) return;
    const points = playLive(course, node, lesson, {}, (_ex, i) => (i === listening ? "cant-listen" : "right"));
    const after = points[listening + 1];
    if (after === undefined) throw new Error("no point after the listening card");
    expect(resume(node, lesson, {}, after.done)?.[0]).toEqual(after.state);
  });

  it("the last answer logged without the end: resuming completes the session", () => {
    const points = playLive(course, node, lesson, {}, () => "right");
    const end = points.at(-1);
    if (end === undefined || end.state.tag !== "finished") throw new Error("not finished");
    const [state, opened] = resume(node, lesson, {}, end.done) ?? [];
    expect(state).toEqual(end.state);
    expect(opened).toEqual([{ tag: "emit", event: { type: "session_completed", lesson: node, summary: end.state.summary } }]);
  });

  it("an adaptive test resumes with the questions its answers so far call for (placement)", () => {
    const test = placementTest(course, 4).test;
    const units = test.blocks.map((b) => b.id);
    const unitOf = new Map(course.units.flatMap((u) => u.sentences.map((x) => [x.id, u.id] as const)));
    const knows = (ex: Exercise): boolean => units.indexOf(unitOf.get(ex.item) ?? "") < 2;
    const options: StartOptions = { adaptive: test };
    const first = runTest(test, new Map()).next;
    const points = playLive(course, "placement", first, options, (ex) => (knows(ex) ? "right" : "wrong"));
    expect(points.length).toBeGreaterThan(4);
    for (const point of points.slice(1)) {
      expect(resume("placement", first, options, point.done)?.[0]).toEqual(point.state);
      // The shell's placement comes from the same first tries the player kept.
      const kept = point.state.session.results.filter((r) => !r.retry).map((r) => [r.exercise, isCorrect(r.verdict)] as const);
      expect(firstTriesOf(point.done)).toEqual(new Map(kept));
    }
  });

  it("the order the log holds them in does not matter (a clock that stood still)", () => {
    const points = playLive(course, node, lesson, {}, (_ex, i) => (i % 3 === 1 ? "wrong" : "right"));
    for (const point of points.slice(1)) expect(resume(node, lesson, {}, [...point.done].reverse())?.[0]).toEqual(point.state);
  });

  describe("with answers revised (a claim, the judge: ADR 0113)", () => {
    const grader = createGrader(course);
    const misses = lesson.filter((e) => "answer" in e && "options" in e).slice(0, 3);
    const [claimed, lateOne, kept] = misses;
    if (claimed === undefined || lateOne === undefined || kept === undefined) throw new Error("the lesson needs three choice cards");

    /**
     * The session played live: `claimed` is missed and claimed right in its feedback; `lateOne` is
     * missed, and the judge's accept comes as its retry opens; `kept` is missed and stays missed.
     * The log is noted after every exercise, revisions where they were made.
     */
    const live = () => {
      const done: Done[] = [];
      let [state] = start(node, lesson);
      const dispatch = (event: PlayerEvent): void => {
        const [next, effects] = step(state, event);
        state = next;
        for (const f of effects) {
          if (f.tag === "grade") dispatch({ tag: "graded", outcome: gradeExercise(f.ex, f.response, grader) });
          else if (f.tag === "emit" && f.event.type === "answer_submitted")
            done.push({ tag: "answer", exercise: f.event.ex.id, verdict: f.event.graded.verdict, selfRated: f.event.graded.selfRated === true, response: f.event.response });
          else if (f.tag === "emit" && f.event.type === "exercise_skipped") done.push({ tag: "skip", exercise: f.event.ex.id, reason: f.event.reason });
        }
      };
      const revise = (exercise: string, verdict: "CORRECT" | "CORRECT_PROVISIONAL"): void => {
        dispatch({ tag: "revise", exercise, verdict });
        const at = done.findIndex((d) => d.exercise === exercise);
        const d = done[at];
        if (d?.tag === "answer") done[at] = { ...d, revised: verdict };
      };
      const now = (): PlayerState => state;
      const points: { readonly state: PlayerState; readonly done: readonly Done[] }[] = [];
      for (let i = 0; now().tag !== "finished" && i < 200; i++) {
        const shown = now();
        if (shown.tag !== "presenting") throw new Error(`unexpected ${shown.tag}`);
        const ex = shown.ex;
        if (ex.id === `${lateOne.id}#2`) revise(lateOne.id, "CORRECT_PROVISIONAL");
        dispatch({ tag: "ready" });
        const miss = ex.id === claimed.id || ex.id === lateOne.id || ex.id === kept.id;
        const response = responseTo(ex, !miss);
        if (response === undefined) dispatch({ tag: "skip", reason: "skip" });
        else {
          dispatch(draftOf(ex, response));
          dispatch({ tag: "submit" });
        }
        if (ex.id === claimed.id) revise(claimed.id, "CORRECT");
        if (now().tag === "feedback") dispatch({ tag: "continue" });
        points.push({ state: now(), done: done.map((d) => ({ ...d })) });
      }
      return points;
    };

    it("the session picked up after any exercise goes on as the live one did", () => {
      const points = live();
      const end = points.at(-1)?.state;
      if (end?.tag !== "finished") throw new Error("not finished");
      const asked = end.session.queue.map((e) => e.id);
      expect(asked).not.toContain(`${claimed.id}#2`);
      expect(asked).toContain(`${lateOne.id}#2`);
      expect(asked).toContain(`${kept.id}#2`);
      // Two of the three misses count right: one claimed, one accepted by the judge.
      expect(end.summary.correctFirstTry).toBe(end.summary.exercises - 1);
      for (const [k, point] of points.entries()) expect(resume(node, lesson, {}, point.done)?.[0], `after ${k}`).toEqual(point.state);
      expect(firstTriesOf(points.at(-1)?.done ?? [])).toEqual(new Map(end.session.results.filter((r) => !r.retry).map((r) => [r.exercise, isCorrect(r.verdict)] as const)));
    });
  });

  it("a log that does not fit the plan is not resumed", () => {
    const points = playLive(course, node, lesson, {}, () => "right");
    const done = points[3]?.done ?? [];
    expect(resume(node, lesson, {}, [{ ...(done[0] as Done), exercise: "another" }, ...done.slice(1)])).toBeUndefined();
    expect(resume(node, lesson.slice(1), {}, done)).toBeUndefined();
  });
});

describe("a session's log, as resuming reads it", () => {
  const base = {
    schema: 1 as const,
    device: "phone",
    course: "fa",
    orthography: "fa-Arab/standard" as OrthographyId,
    support: "en",
    bundle: "0".repeat(64),
    localDate: "2026-11-12",
    tz: "UTC",
  };
  const answer = (id: string, session: string, at: string, exercise: string, kind: "CORRECT" | "WRONG", selfRating?: "good"): LearnerEvent => ({
    ...base,
    id,
    session,
    clientTime: at,
    type: "answer_submitted",
    exercise: { id: exercise, template: "choose-translation", item: "fa.s1", kcs: [] },
    attempt: exercise.includes("#") ? 2 : 1,
    input: { method: "choice", latencyMs: 2000, ...(selfRating === undefined ? {} : { selfRating }) },
    outcome: { kind, notes: [], kcs: [] },
  });
  const S = "00000000-0000-7000-a000-000000000001";
  const OTHER = "00000000-0000-7000-a000-000000000002";

  it("takes the session's answers and skips in the order they happened", () => {
    const events: LearnerEvent[] = [
      answer("00000000-0000-7000-8000-000000000003", S, "2026-11-12T09:00:30.000+00:00", "b", "CORRECT", "good"),
      answer("00000000-0000-7000-8000-000000000001", S, "2026-11-12T09:00:10.000+00:00", "a", "WRONG"),
      answer("00000000-0000-7000-8000-000000000009", OTHER, "2026-11-12T09:00:20.000+00:00", "x", "CORRECT"),
      {
        ...base,
        id: "00000000-0000-7000-8000-000000000004",
        session: S,
        clientTime: "2026-11-12T09:00:40.000+00:00",
        type: "exercise_skipped",
        exercise: { id: "c", template: "listen-select", item: "fa.k1", kcs: [] },
        attempt: 1,
        reason: "cant-listen",
      },
      answer("00000000-0000-7000-8000-000000000002", S, "2026-11-12T09:00:20.000+00:00", "a#2", "CORRECT"),
    ];
    expect(doneOf(events, S)).toEqual([
      { tag: "answer", exercise: "a", verdict: "WRONG", selfRated: false },
      { tag: "answer", exercise: "a#2", verdict: "CORRECT", selfRated: false },
      { tag: "answer", exercise: "b", verdict: "CORRECT", selfRated: true, response: { tag: "self-rating", rating: "good" } },
      { tag: "skip", exercise: "c", reason: "cant-listen" },
    ]);
    expect(firstTriesOf(doneOf(events, S))).toEqual(
      new Map([
        ["a", false],
        ["b", true],
        ["c", false],
      ]),
    );
  });

  it("gives an answer the verdict its latest revision gives it: a claim, or the judge's (ADR 0052, 0113)", () => {
    const wrong = answer("00000000-0000-7000-8000-000000000001", S, "2026-11-12T09:00:10.000+00:00", "a", "WRONG");
    const lenient = { ...answer("00000000-0000-7000-8000-000000000002", S, "2026-11-12T09:00:20.000+00:00", "b", "CORRECT"), outcome: { kind: "CORRECT_WITH_TYPO" as const, notes: [], kcs: [] } };
    const later = answer("00000000-0000-7000-8000-000000000005", S, "2026-11-12T09:00:50.000+00:00", "d", "WRONG");
    const report = (id: string, at: string, of: LearnerEvent, claim?: "reject"): LearnerEvent => ({
      ...base,
      id,
      session: S,
      clientTime: at,
      type: "answer_reported",
      answer: of.id,
      exercise: of.type === "answer_submitted" ? of.exercise : { id: "", template: "choose-translation", item: "", kcs: [] },
      text: "…",
      ...(claim === undefined ? {} : { claim }),
    });
    const events: LearnerEvent[] = [
      wrong,
      lenient,
      later,
      report("00000000-0000-7000-8000-000000000003", "2026-11-12T09:00:12.000+00:00", wrong),
      report("00000000-0000-7000-8000-000000000004", "2026-11-12T09:00:22.000+00:00", lenient, "reject"),
      // Two revisions of the last answer, a claim and then the judge's accept: the later one stands.
      report("00000000-0000-7000-8000-000000000007", "2026-11-12T09:00:52.000+00:00", later, "reject"),
      {
        ...base,
        id: "00000000-0000-7000-8000-000000000006",
        session: S,
        clientTime: "2026-11-12T09:00:55.000+00:00",
        type: "outcome_revised",
        device: "server",
        answer: later.id,
        outcome: { kind: "CORRECT_PROVISIONAL", notes: ["judge"], kcs: [] },
        by: "judge",
      },
    ];
    expect(doneOf(events, S)).toEqual([
      { tag: "answer", exercise: "a", verdict: "WRONG", selfRated: false, revised: "CORRECT" },
      { tag: "answer", exercise: "b", verdict: "CORRECT_WITH_TYPO", selfRated: false, revised: "WRONG" },
      { tag: "answer", exercise: "d", verdict: "WRONG", selfRated: false, revised: "CORRECT_PROVISIONAL" },
    ]);
    expect(firstTriesOf(doneOf(events, S))).toEqual(
      new Map([
        ["a", true],
        ["b", false],
        ["d", true],
      ]),
    );
  });
});
