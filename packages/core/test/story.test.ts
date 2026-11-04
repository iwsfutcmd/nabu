/**
 * Phase 6: stories as the reader plays them, tap-for-gloss on story lines, and stories on the
 * path and in the learner model.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BundleManifest, LearnerEvent, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { learnerEventOf, pathOf, replay, type EventMeta, type SessionMeta } from "../src/learner/index.ts";
import { answerTextOf, assembleCourse, createGrader, gradeExercise, MEDIA_ROLES, seededRng, type CourseView, type Effect, type Exercise, type LessonEvent, type Response } from "../src/lesson/index.ts";
import { allStories, courseGlossary, glossAt, glossLine, startStory, stepStory, storyAt, storyScript, type StoryScript, type StoryState } from "../src/story/index.ts";
import { surfaceOf } from "../src/text/index.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

const loadCourse = (id: string, orthography?: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(
    manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]),
  );
  const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

const VARIANTS: readonly (readonly [string, string | undefined])[] = [
  ["fa", undefined],
  ["yue", undefined],
  ["uz", "uz-Latn/standard"],
  ["uz", "uz-Cyrl/standard"],
  ["apc", "apc-Arab/standard"],
  ["apc", "apc-Latn/arabizi"],
];

const HARAKAT_ALL = /[\u064B-\u0652\u0670]/gu;
const HARAKAT = /[ً-ْٰ]/u;

const scriptOf = (course: CourseView, seed = 3): StoryScript => {
  const [story] = allStories(course);
  if (story === undefined) throw new Error(`${course.id} has no story`);
  return storyScript(course, story, seededRng(seed));
};

const right = (ex: Exercise): Response => {
  switch (ex.template) {
    case "story-choose":
    case "story-complete":
      return { tag: "choice", index: ex.answer };
    case "story-arrange":
      return { tag: "tiles", order: ex.solution };
    default:
      throw new Error(`not a story question: ${ex.template}`);
  }
};

const wrong = (ex: Exercise): Response => {
  switch (ex.template) {
    case "story-choose":
    case "story-complete":
      return { tag: "choice", index: (ex.answer + 1) % ex.options.length };
    case "story-arrange":
      return { tag: "tiles", order: [...ex.solution].reverse() };
    default:
      throw new Error(`not a story question: ${ex.template}`);
  }
};

/** Plays a story to the end, grading through the real grader; `miss` answers wrong once first. */
const play = (course: CourseView, script: StoryScript, miss: ReadonlySet<string> = new Set()): { state: StoryState; events: LessonEvent[] } => {
  const grader = createGrader(course);
  const events: LessonEvent[] = [];
  const missed = new Set<string>();
  let state: StoryState;
  const run = (fx: readonly Effect[]): void => {
    for (const e of fx) {
      if (e.tag === "emit") events.push(e.event);
      if (e.tag === "grade") dispatch({ tag: "player", event: { tag: "graded", outcome: gradeExercise(e.ex, e.response, grader) } });
    }
  };
  const dispatch = (event: Parameters<typeof stepStory>[1]): void => {
    const [next, effects] = stepStory(state, event);
    state = next;
    run(effects);
  };
  const [first, effects] = startStory(script);
  state = first;
  run(effects);
  for (let guard = 0; state.tag !== "finished" && guard < 200; guard += 1) {
    if (state.tag === "reading") {
      dispatch({ tag: "continue" });
    } else if (state.player.tag === "presenting") {
      dispatch({ tag: "player", event: { tag: "ready" } });
    } else if (state.player.tag === "answering") {
      const ex = state.player.ex;
      const base = ex.id.split("#")[0] as string;
      const response = miss.has(ex.template) && !missed.has(base) ? (missed.add(base), wrong(ex)) : right(ex);
      const draft = response.tag === "choice" ? { tag: "choice" as const, index: response.index } : { tag: "tiles" as const, order: response.tag === "tiles" ? response.order : [] };
      dispatch({ tag: "player", event: { tag: "input", draft } });
      dispatch({ tag: "player", event: { tag: "submit" } });
    } else if (state.player.tag === "feedback") {
      dispatch({ tag: "player", event: { tag: "continue" } });
    } else {
      throw new Error(`stuck in ${state.player.tag}`);
    }
  }
  return { state, events };
};

describe("story scripts", () => {
  it.each(VARIANTS)("%s (%s): every line, three kinds of question, in the learner's orthography", (id, orthography) => {
    const course = loadCourse(id, orthography);
    const script = scriptOf(course);
    expect(script.lines.length).toBeGreaterThanOrEqual(5);
    expect(new Set(script.lines.map((l) => l.text.orthography))).toEqual(new Set([course.orthography]));
    const templates = script.steps.flatMap((s) => (s.tag === "question" ? [s.ex.template] : []));
    expect(new Set(templates)).toEqual(new Set(["story-choose", "story-complete", "story-arrange"]));
    for (const step of script.steps) {
      if (step.tag !== "question") continue;
      if (step.ex.template === "story-choose") expect(step.ex.orthography).toBe(course.support);
      else expect(step.reveals).toBeDefined();
    }
    // Every line appears exactly once: on its own step or revealed by its question.
    const appearing = script.steps.map((s) => (s.tag === "line" ? s.line : s.reveals)).filter((x) => x !== undefined);
    expect([...appearing].sort((a, b) => a - b)).toEqual(script.lines.map((l) => l.index));
  });

  it("shuffles options with the seed only", () => {
    const course = loadCourse("fa");
    const a = scriptOf(course, 1);
    expect(scriptOf(course, 1)).toEqual(a);
    const answers = (s: StoryScript): number[] => s.steps.flatMap((st) => (st.tag === "question" && "answer" in st.ex ? [st.ex.answer] : []));
    const seen = new Set([1, 2, 3, 4, 5, 6].flatMap((seed) => answers(scriptOf(course, seed))));
    expect(seen.size).toBeGreaterThan(1); // the right option is not always first
  });

  it("a completed line keeps its gap token's sense and the distractors' forms", () => {
    const course = loadCourse("uz", "uz-Cyrl/standard");
    const q = scriptOf(course).steps.find((s) => s.tag === "question" && s.ex.template === "story-complete");
    if (q?.tag !== "question" || q.ex.template !== "story-complete") throw new Error("no complete question");
    expect(q.ex.options.map(surfaceOf).sort()).toEqual(["китоб", "талабаман"]);
    expect(surfaceOf(q.ex.options[q.ex.answer] as TaggedText)).toBe("талабаман");
    expect(surfaceOf(q.ex.before)).toBe("Ҳа, мен ");
  });
});

describe("a story answer as text, for a report", () => {
  it("is the line as the learner built it, or with the word they chose in its gap", () => {
    const course = loadCourse("yue");
    const questions = allStories(course).flatMap((st) => storyScript(course, st, seededRng(3)).steps.flatMap((s) => (s.tag === "question" ? [s.ex] : [])));
    const arrange = questions.find((q) => q.template === "story-arrange");
    const complete = questions.find((q) => q.template === "story-complete");
    if (arrange?.template !== "story-arrange" || complete?.template !== "story-complete") throw new Error("yue asks both kinds");
    const reversed = [...arrange.solution].reverse();
    expect(answerTextOf(arrange, { tag: "tiles", order: reversed })).toBe(reversed.map((i) => surfaceOf(arrange.tiles[i] as TaggedText)).join(arrange.joiner));
    const wrong = complete.answer === 0 ? 1 : 0;
    const chosen = complete.options[wrong] as TaggedText;
    expect(answerTextOf(complete, { tag: "choice", index: wrong })).toBe(`${surfaceOf(complete.before)}${surfaceOf(chosen)}${surfaceOf(complete.after)}`);
    expect(answerTextOf(complete, { tag: "choice", index: 99 })).toBeUndefined();
    expect(answerTextOf(complete, { tag: "text", text: "我" })).toBe("我");
  });
});

describe("the story player", () => {
  it.each(VARIANTS)("%s (%s): read to the end, every question right first time", (id, orthography) => {
    const course = loadCourse(id, orthography);
    const script = scriptOf(course);
    const { state, events } = play(course, script);
    expect(state.tag).toBe("finished");
    if (state.tag !== "finished") return;
    const questions = script.steps.filter((s) => s.tag === "question").length;
    expect(state.summary).toEqual({ completed: true, exercises: questions, correctFirstTry: questions, retries: 0, skipped: 0 });
    expect(state.shown).toEqual(script.lines.map((l) => l.index));
    expect(events.map((e) => e.type)).toEqual([
      "session_started",
      ...Array.from({ length: questions }, () => ["exercise_presented", "answer_submitted"]).flat(),
      "session_completed",
    ]);
    expect(events[0]).toMatchObject({ type: "session_started", lesson: script.node, exercises: questions });
  });

  it("asks a wrong answer again until it is right", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const script = scriptOf(course);
    const { state, events } = play(course, script, new Set(["story-arrange", "story-choose"]));
    if (state.tag !== "finished") throw new Error("not finished");
    const choose = script.steps.filter((s) => s.tag === "question" && s.ex.template === "story-choose").length;
    expect(state.summary.retries).toBe(1 + choose);
    expect(state.summary.correctFirstTry).toBe(state.summary.exercises - 1 - choose);
    const answers = events.filter((e) => e.type === "answer_submitted");
    expect(answers.some((e) => e.exercise.id.endsWith("#2"))).toBe(true);
  });

  it("quitting ends the session uncompleted", () => {
    const course = loadCourse("yue");
    const [state] = startStory(scriptOf(course));
    const [quit, effects] = stepStory(state, { tag: "quit" });
    expect(quit.tag).toBe("finished");
    expect(effects.map((e) => (e.tag === "emit" ? [e.event.type, e.event.type === "session_completed" && e.event.summary.completed] : [e.tag]))).toEqual([["session_completed", false]]);
  });

  it("arranging accepts tiles that read the same in either order", () => {
    const course = loadCourse("yue");
    const story = storyAt(course, "yue.story");
    if (story === undefined) throw new Error("no story");
    // 係，我係學生: the two 係 are interchangeable once tiled.
    const line = story.steps.find((s) => s.line !== undefined && surfaceOf(s.line.forms["yue-Hant-HK/standard"] as TaggedText) === "係，我係學生。");
    expect(line).toBeDefined();
    const ex: Exercise = {
      template: "story-arrange",
      id: "x",
      item: "x",
      kcs: [],
      orthography: "yue-Hant-HK/standard",
      prompt: line?.line?.translations["en"] as TaggedText,
      tiles: ["係", "我", "係", "學生"].map((surface) => ({ lang: "yue-Hant-HK", orthography: "yue-Hant-HK/standard", tokens: [{ surface, kind: "word" }] }) as unknown as TaggedText),
      solution: [0, 1, 2, 3],
      joiner: "",
      canonical: line?.line?.forms["yue-Hant-HK/standard"] as TaggedText,
    };
    const grader = createGrader(course);
    expect(gradeExercise(ex, { tag: "tiles", order: [2, 1, 0, 3] }, grader).verdict).toBe("CORRECT");
    expect(gradeExercise(ex, { tag: "tiles", order: [1, 0, 2, 3] }, grader).verdict).toBe("WRONG");
  });
});

describe("tap-for-gloss on story lines", () => {
  it("a vocalized apc-Arab story glosses its words whatever marks they and the glossary carry (Phase 6 acceptance)", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const glossary = courseGlossary(course);
    const script = scriptOf(course);
    let vocalized = 0;
    let folded = 0;
    for (const line of script.lines) {
      const glosses = glossLine(course, glossary, line.text);
      for (const [i, token] of line.text.tokens.entries()) {
        if (token.kind !== "word") continue;
        const marked = HARAKAT.test(token.surface);
        if (marked) vocalized += 1;
        const [hit, ...more] = glossAt(course, glossary, glosses, line.text, i);
        expect(more).toEqual([]);
        expect(hit?.kc).toBe(`sense:${token.sense ?? ""}`);
        expect(hit?.form).toBeDefined();
        expect(hit?.meaning).toBeDefined();
        const match = glosses.find((g) => g.tokenStart <= i && i < g.tokenEnd);
        if (marked && match?.pass === "folded") folded += 1;
      }
    }
    expect(vocalized).toBeGreaterThanOrEqual(8);
    // The glossary's forms carry the course vocalization's marks (ADR 0053); a word the story marks
    // otherwise still finds its entry, by the folded pass.
    expect(folded).toBeGreaterThan(0);
  });

  it("a token two entries share is glossed in parts (我哋)", () => {
    const course = loadCourse("yue");
    const glossary = courseGlossary(course);
    const line = scriptOf(course).lines.find((l) => surfaceOf(l.text).startsWith("我哋"));
    if (line === undefined) throw new Error("no 我哋 line");
    const hits = glossAt(course, glossary, glossLine(course, glossary, line.text), line.text, 0);
    // 我哋 is a glossary form of 我 itself: the whole token, one entry.
    expect(hits.map((h) => [h.kc, h.span])).toEqual([["sense:我", "whole"]]);
  });

  it("falls back to the token's own sense when no entry reaches it", () => {
    const course = loadCourse("fa");
    const glossary = courseGlossary(course);
    // kitab-e: ketab with the ezafe kasra the story writes, and the vocalization's marks.
    const ezafe = (t: { readonly surface: string }): boolean => t.surface.replace(HARAKAT_ALL, "") === "\u06a9\u062a\u0627\u0628" && t.surface.endsWith("\u0650");
    const line = scriptOf(course).lines.find((l) => l.text.tokens.some(ezafe));
    if (line === undefined) throw new Error("no ezafe line");
    const at = line.text.tokens.findIndex(ezafe);
    const [hit] = glossAt(course, glossary, glossLine(course, glossary, line.text), line.text, at);
    expect(hit?.kc).toBe("sense:ketab");
  });
});

describe("stories on the path and in the learner model", () => {
  const meta = (n: number, script: StoryScript): EventMeta => ({
    id: `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`,
    clientTime: `2026-05-01T10:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}+04:30`,
    localDate: "2026-05-01",
    tz: "Asia/Tehran",
    device: "test",
    session: `story-${script.id}`,
    bundle: "b",
  });

  it("the story node opens after the last lesson, and reading it completes it", () => {
    const course = loadCourse("fa");
    const script = scriptOf(course);
    const path = pathOf(course, replay([]));
    const story = path.find((n) => n.kind === "story");
    expect(story?.node).toBe(script.node);
    const at = (node: string): number => path.findIndex((n) => n.node === node);
    for (const n of path.filter((p) => p.unit === story?.unit && p.kind === "lesson")) expect(at(n.node)).toBeLessThan(at(script.node));
    const { events } = play(course, script);
    const session: SessionMeta = { mode: "story", node: script.node, seed: 3, planner: "story" };
    const log = events.flatMap((e, i) => learnerEventOf(e, course, meta(i, script), session, e.type === "answer_submitted" ? { latencyMs: 2000 } : {}) ?? []) as LearnerEvent[];
    expect(log.find((e) => e.type === "session_started")).toMatchObject({ mode: "story", node: script.node });
    const state = replay(log);
    expect(state.completedNodes).toEqual([script.node]);
    expect(state.mistakes).toEqual([]);
    expect(state.xp.total).toBeGreaterThan(0);
    // Its questions credit the words of their lines.
    expect(Object.keys(state.cards).some((k) => k.startsWith("sense:man|recognize"))).toBe(true);
  });
});
