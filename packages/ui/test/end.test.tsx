/**
 * The end of a session (P9 in the 2026-11 review, ADR 0113), server-rendered: what it taught and what
 * to go over before the points, how the learner's progress moved, and the next step.
 */
import { buildLesson, createGrader, gradeExercise, lessonNodes, seededRng, start, step, type CourseView, type Exercise, type Grader, type PlayerEvent, type PlayerState, type Response } from "@nabu/core/lesson";
import { allStories, startStory, stepStory, storyScript, type StoryEvent, type StoryScript, type StoryState } from "@nabu/core/story";
import { surfaceOf } from "@nabu/core/text";
import { describe, expect, it } from "vitest";
import { LessonPlayer, type LessonPlayerProps } from "../src/player/LessonPlayer.tsx";
import type { NextStep, SessionProgress } from "../src/player/SessionEnd.tsx";
import { StoryReader } from "../src/story/StoryReader.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

/** A wrong answer by choice, or typed. */
const wrongOf = (ex: Exercise): Response | undefined =>
  "options" in ex && "answer" in ex && typeof ex.answer === "number" ? { tag: "choice", index: (ex.answer + 1) % ex.options.length } : ex.template === "translate-type.l1-l2" ? { tag: "text", text: "qqqq" } : undefined;

/** The right answer, where the test can give one. */
const rightOf = (ex: Exercise): Response => {
  if ("options" in ex && "answer" in ex && typeof ex.answer === "number") return { tag: "choice", index: ex.answer };
  if ("solution" in ex && "tiles" in ex) return { tag: "tiles", order: ex.solution };
  if (ex.template === "match-pairs" || ex.template === "letter-pairs") return { tag: "pairs", mistakes: 0 };
  if (ex.template === "speak.tier-0" || ex.template === "speak" || ex.template === "listen-speak") return { tag: "self-rating", rating: "good" };
  if (ex.template === "translate-type.l1-l2" || ex.template === "listen-type") return { tag: "text", text: surfaceOf(ex.canonical) };
  if (ex.template === "complete-translation") return { tag: "text", text: surfaceOf(ex.blank) };
  if (ex.template === "transcribe") return { tag: "text", text: surfaceOf(ex.reading) };
  return { tag: "choice", index: 0 };
};

const draftOf = (ex: Exercise, r: Response): PlayerEvent => {
  switch (r.tag) {
    case "choice":
      return { tag: "input", draft: { tag: "choice", index: r.index } };
    case "tiles":
      return { tag: "input", draft: { tag: "tiles", order: r.order } };
    case "text":
      return { tag: "input", draft: { tag: "text", text: r.text } };
    case "pairs":
      return { tag: "input", draft: { tag: "pairs", matched: ex.template === "match-pairs" || ex.template === "letter-pairs" ? ex.left.map((_, i) => i) : [], mistakes: 0 } };
    case "self-rating":
      return { tag: "input", draft: { tag: "self-rating", rating: r.rating } };
    case "speech":
      return { tag: "input", draft: { tag: "speech", result: r.result } };
  }
};

/** Plays a lesson to its end: the cards in `miss` wrong the first time, `skip` skipped, the rest as rightOf answers them. */
const playTo = (course: CourseView, grader: Grader, lesson: string, cards: readonly Exercise[], miss: ReadonlySet<string>, skip: ReadonlySet<string> = new Set()): PlayerState => {
  let state = start(lesson, cards)[0];
  const send = (event: PlayerEvent): void => {
    const [next, effects] = step(state, event);
    state = next;
    for (const e of effects) if (e.tag === "grade") send({ tag: "graded", outcome: gradeExercise(e.ex, e.response, grader) });
  };
  for (let guard = 0; guard < 300 && state.tag !== "finished"; guard += 1) {
    if (state.tag !== "presenting") throw new Error(state.tag);
    const ex = state.ex;
    send({ tag: "ready" });
    if (skip.has(ex.id)) send({ tag: "skip", reason: "skip" });
    else {
      send(draftOf(ex, (miss.has(ex.id) ? wrongOf(ex) : undefined) ?? rightOf(ex)));
      send({ tag: "submit" });
    }
    // send changes the state behind TypeScript's narrowing.
    if ((state as PlayerState).tag === "feedback") send({ tag: "continue" });
  }
  return state;
};

describe("the end of a lesson (P9)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const grader = createGrader(course);
  const node = lessonNodes(course)[1]?.node.id as string;
  const lesson = buildLesson(course, node, { seed: 7 });
  const choice = lesson.find((e) => wrongOf(e)?.tag === "choice" && e.template !== "speak.tier-0");
  const skipped = lesson.find((e) => e !== choice && wrongOf(e)?.tag === "choice" && e.template !== "speak.tier-0");
  if (choice === undefined || skipped === undefined) throw new Error("the lesson needs two choice cards");
  const end = playTo(course, grader, node, lesson, new Set([choice.id]), new Set([skipped.id]));
  const show = (state: PlayerState, extra: Partial<LessonPlayerProps> = {}): string =>
    render(<LessonPlayer course={course} lessonId={node} exercises={lesson} grader={grader} imageUrl={(p) => p} language="Lebanese Arabic" initialState={state} sound={false} onExit={() => undefined} {...extra} />);

  it("says what ended and the score, then the lesson's new words with their meanings and play buttons", () => {
    expect(end.tag).toBe("finished");
    const html = show(end);
    expect(html).toContain(">Lesson complete!<");
    expect(html).toMatch(/data-summary="">\d+ of \d+ right the first time</u);
    const introduced = lessonNodes(course)[1]?.node.introduces ?? [];
    const words = [...html.matchAll(/data-end-word="([^"]+)"/gu)].map((m) => m[1]);
    expect(words.length).toBeGreaterThan(0);
    expect(words.every((kc) => introduced.includes(kc as never))).toBe(true);
    // A play button where the word has a clip; nothing that plays by itself.
    const clipped = words.filter((kc) => course.audio[kc as string] !== undefined);
    expect(clipped.length).toBeGreaterThan(0);
    expect(html.match(/data-action="play"/gu)?.length).toBe(clipped.length);
    expect(html).not.toContain("autoplay");
  });

  it("lists the cards missed the first time: what they asked, the right answer, and the learner's", () => {
    const html = show(end);
    expect(html).toContain(">Missed the first time<");
    const missed = [...html.matchAll(/data-missed="([^"]+)" data-verdict="([^"]+)"/gu)].map((m) => [m[1], m[2]]);
    expect(missed).toEqual([
      ...[choice, skipped].sort((a, b) => lesson.indexOf(a) - lesson.indexOf(b)).map((e) => [e.id, e === choice ? "WRONG" : "SKIPPED"]),
    ]);
    const item = (id: string): string => html.slice(html.indexOf(`data-missed="${id}"`), html.indexOf("</li>", html.indexOf(`data-missed="${id}"`)));
    expect(item(choice.id)).toContain("Correct answer:");
    expect(item(choice.id)).toContain("Your answer:");
    expect(item(skipped.id)).toContain("You skipped this one.");
    expect(item(skipped.id)).not.toContain("Your answer:");
  });

  it("leaves out a card claimed right, and new words on a lesson done before", () => {
    // The same lesson with the miss claimed right in its feedback (ADR 0113).
    let state = start(node, lesson)[0];
    const send = (event: PlayerEvent): void => {
      const [next, effects] = step(state, event);
      state = next;
      for (const e of effects) if (e.tag === "grade") send({ tag: "graded", outcome: gradeExercise(e.ex, e.response, grader) });
    };
    for (let guard = 0; guard < 300 && state.tag !== "finished"; guard += 1) {
      if (state.tag !== "presenting") throw new Error(state.tag);
      const ex = state.ex;
      send({ tag: "ready" });
      send(draftOf(ex, (ex.id === choice.id ? wrongOf(ex) : undefined) ?? rightOf(ex)));
      send({ tag: "submit" });
      if (ex.id === choice.id) send({ tag: "revise", exercise: ex.id, verdict: "CORRECT" });
      // send changes the state behind TypeScript's narrowing.
      if ((state as PlayerState).tag === "feedback") send({ tag: "continue" });
    }
    const html = show(state, { replay: true });
    expect(html).not.toContain(`data-missed="${choice.id}"`);
    expect(html).not.toContain("data-end-words");
  });

  it("puts the learning first, then progress, then the points", () => {
    const progress: SessionProgress = {
      known: { words: lessonNodes(course)[0]?.node.introduces.slice(0, 2) ?? [], total: 12 },
      unit: { number: 1, title: course.units[0]?.title?.[course.supportKey] },
      streak: 4,
      week: { done: 3, goal: 3, met: true },
      quests: [{ id: "right-20", label: "Get 20 answers right" }],
      achievements: [{ id: "sessions-10", label: "10 sessions finished" }],
    };
    const html = show(end, { progress, xpEarned: 17 });
    expect(html).toContain('data-known-now="2" data-known-total="12"');
    expect(html).toContain(">2 more words you know<");
    expect(html).toContain(">12 words known in all<");
    expect(html).toContain(">Unit 1 finished<");
    expect(html).toContain(">4 days in a row, today included.<");
    expect(html).toContain(">This week: 3 of 3 days<");
    expect(html).toContain(">Goal met. Well done!<");
    // The names are placeholders: MF2 isolates them (FSI … PDI).
    expect(html).toContain(">Quest done: \u2068Get 20 answers right\u2069<");
    expect(html).toContain(">New achievement: \u206810 sessions finished\u2069<");
    expect(html).toContain('data-xp-earned="17"');
    const at = (marker: string): number => html.indexOf(marker);
    expect(at("data-end-words")).toBeLessThan(at("data-end-missed"));
    expect(at("data-end-missed")).toBeLessThan(at("data-end-progress"));
    expect(at("data-known-now")).toBeLessThan(at("data-xp-earned"));
    expect(at("data-end-progress")).toBeLessThan(at("<footer"));
  });

  it("offers the next step, as the course page's Continue does, beside the way back", () => {
    const next: NextStep = { to: { kind: "lesson", number: 3 }, go: () => undefined };
    const html = show(end, { next });
    const footer = html.slice(html.indexOf("<footer"));
    expect(footer).toContain('data-action="exit"');
    expect(footer).toContain(">Back to the course<");
    expect(footer).toMatch(/data-action="next" data-next="lesson 3"[^>]*>Next: Lesson 3/u);
    // The next step comes last, at the inline end, and is described by the title and the score.
    expect(footer.indexOf('data-action="exit"')).toBeLessThan(footer.indexOf('data-action="next"'));
    expect(footer).toMatch(/data-action="next"[^>]*aria-describedby="[^"]+-title [^"]+-score"/u);
    // Practice first: why, and a new lesson all the same (D6).
    const practice: NextStep = { to: { kind: "practice" }, go: () => undefined, why: "12 words are slipping.", beside: { to: { kind: "story" }, go: () => undefined } };
    const first = show(end, { next: practice });
    expect(first).toContain('data-end-why="">12 words are slipping.<');
    expect(first).toMatch(/data-action="next-anyway" data-next="story"[^>]*>New lesson anyway</u);
    expect(first).toMatch(/data-action="next" data-next="practice"[^>]*>Practise first/u);
    expect(first).not.toContain('data-action="more-practice"');
    // Right after practice: the next lesson first, more practice beside it, and no why (D34).
    const practised: NextStep = { to: { kind: "lesson", number: 4 }, go: () => undefined, beside: { to: { kind: "practice" }, go: () => undefined } };
    const after = show(end, { next: practised });
    expect(after).toMatch(/data-action="more-practice" data-next="practice"[^>]*>Keep practising</u);
    expect(after).toMatch(/data-action="next" data-next="lesson 4"[^>]*>Next: Lesson 4/u);
    expect(after).not.toContain("data-end-why");
    expect(after).not.toContain('data-action="next-anyway"');
    // The next step is still the screen's primary action, last in the footer, after the way back.
    const afterFooter = after.slice(after.indexOf("<footer"));
    expect(afterFooter).not.toContain('data-action="more-practice"');
    expect(afterFooter.indexOf('data-action="exit"')).toBeLessThan(afterFooter.indexOf('data-action="next"'));
    // No next step (the path done, nothing due): Continue goes back, as before.
    const done = show(end).slice(show(end).indexOf("<footer"));
    expect(done).toMatch(/data-action="exit"[^>]*>Continue/u);
    expect(done).not.toContain('data-action="next"');
  });

  it("a placement test says where it placed, and lists no misses", () => {
    const html = show(end, { mode: "placement", summary: () => <p data-placement-result="">placed</p> });
    expect(html).toContain("data-placement-result");
    expect(html).not.toContain("data-summary");
    expect(html).not.toContain("data-end-missed");
  });
});

/** Reads a story to its end: the first question wrong once, the rest right. */
const readTo = (script: StoryScript, grader: Grader): StoryState => {
  let state = startStory(script)[0];
  let missed = false;
  const send = (event: StoryEvent): void => {
    const [next, effects] = stepStory(state, event);
    state = next;
    for (const e of effects) if (e.tag === "grade") send({ tag: "player", event: { tag: "graded", outcome: gradeExercise(e.ex, e.response, grader) } });
  };
  for (let guard = 0; guard < 200 && state.tag !== "finished"; guard += 1) {
    if (state.tag === "reading") send({ tag: "continue" });
    else if (state.player.tag === "presenting") send({ tag: "player", event: { tag: "ready" } });
    else if (state.player.tag === "feedback") send({ tag: "player", event: { tag: "continue" } });
    else if (state.player.tag === "answering") {
      const ex = state.player.ex;
      const wrong = !missed && ex.template !== "story-arrange" ? wrongOf(ex) : undefined;
      if (wrong !== undefined) missed = true;
      send({ tag: "player", event: draftOf(ex, wrong ?? rightOf(ex)) });
      send({ tag: "player", event: { tag: "submit" } });
    }
  }
  return state;
};

describe("the end of a story (P9)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const [story] = allStories(course);
  if (story === undefined) throw new Error("apc has a story");
  const script = storyScript(course, story, seededRng(7));
  const grader = createGrader(course);
  const end = readTo(script, grader);

  it("lists the question missed, offers it again to read, and the next step", () => {
    const next: NextStep = { to: { kind: "lesson", number: 9 }, go: () => undefined };
    const html = render(<StoryReader course={course} script={script} grader={grader} imageUrl={(p) => p} language="Lebanese Arabic" initialState={end} sound={false} onExit={() => undefined} next={next} xpEarned={9} />);
    expect(html).toContain(">Story complete!<");
    expect([...html.matchAll(/data-missed="/gu)]).toHaveLength(1);
    const footer = html.slice(html.indexOf("<footer"));
    expect(footer).toContain('data-action="reread"');
    expect(footer).toContain('data-action="exit"');
    expect(footer).toMatch(/data-action="next" data-next="lesson 9"[^>]*>Next: Lesson 9/u);
    expect(html).toContain('data-xp-earned="9"');
  });
});
