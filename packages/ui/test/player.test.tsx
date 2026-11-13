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

describe("a reading question's clip (W9)", () => {
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  /** The play buttons and whether they are withheld, in render order. */
  const clips = (html: string): readonly boolean[] => [...html.matchAll(/data-(?:answer|prompt)-audio=""( data-hidden="")?/gu)].map((m) => m[1] !== undefined);

  it.each(["char-read", "reading-disambiguation"] as const)("%s: no clip before the answer, the clip once answered", (template) => {
    const ex = cardOf(course, template);
    if (ex.template !== "char-read" && ex.template !== "reading-disambiguation") throw new Error(template);
    expect(course.audio[ex.item], `${ex.id} has a clip`).toBeDefined();
    const before = play(course, ex, stateOf(course, ex));
    expect(clips(before)).toEqual([true]);
    const after = play(course, ex, stateOf(course, ex, { tag: "choice", index: ex.answer }));
    expect(clips(after)).toEqual([false]);
  });

  it("a translation card still offers its prompt's clip before the answer", () => {
    const ex = cardOf(course, "choose-translation");
    expect(course.audio[ex.item]).toBeDefined();
    expect(clips(play(course, ex, stateOf(course, ex)))).toEqual([false]);
  });
});

describe("putting off listening and speaking (P13)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const actions = (html: string): readonly string[] => [...html.matchAll(/data-action="([^"]+)"/gu)].map((m) => m[1] as string);

  it("a listening card can be skipped like any other, and put off apart from that", () => {
    const ex = cardOf(course, "listen-tap");
    const html = play(course, ex, stateOf(course, ex), { onCantListen: () => undefined });
    expect(actions(html)).toEqual(expect.arrayContaining(["cant-listen", "skip", "check"]));
    // Its own row, above the footer: never in the footer, where Skip and Check are.
    const footer = html.slice(html.indexOf("<footer"));
    expect(footer).not.toContain("cant-listen");
    expect(html.indexOf('data-action="cant-listen"')).toBeLessThan(html.indexOf("<footer"));
    // Nothing is said until it is pressed.
    expect(html).not.toContain("data-put-off=");
  });

  it("a speaking card is put off, never skipped", () => {
    const ex = cardOf(course, "speak.tier-0");
    const html = play(course, ex, stateOf(course, ex), { onCantSpeak: () => undefined });
    expect(actions(html)).toContain("cant-speak");
    expect(actions(html)).not.toContain("skip");
  });
});

describe("a card back after a mistake (P4)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const ex = cardOf(course, "choose-translation");
  if (ex.template !== "choose-translation") throw new Error("not a choice");
  const grader = createGrader(course);
  const missed = (): PlayerState => {
    const [presenting] = start("lesson", [ex]);
    let s = step(presenting, { tag: "ready" })[0];
    s = step(s, { tag: "input", draft: { tag: "choice", index: (ex.answer + 1) % ex.options.length } })[0];
    const [checking] = step(s, { tag: "submit" });
    if (checking.tag !== "checking") throw new Error("not checking");
    const [feedback] = step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, grader) });
    return step(feedback, { tag: "continue" })[0];
  };

  it("says so, and the count of cards left never grows", () => {
    const first = play(course, ex, stateOf(course, ex));
    expect(first).not.toContain("data-retry-tag");
    expect(first).toContain('data-cards-left="1"');
    const again = missed();
    expect(again.tag === "presenting" && again.ex.id).toBe(`${ex.id}#2`);
    const html = play(course, ex, again);
    expect(html).toContain('data-retry-tag="missed"');
    expect(html).toContain(">Earlier mistake<");
    expect(html).toContain('data-cards-left="1"');
    expect(html).toContain(">1 left<");
    // The bar's value, for a screen reader: cards done out of the lesson's.
    expect(html).toContain('aria-valuetext="0 of 1 cards done"');
  });
});

describe("the lesson's sound switch (P6)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const ex = cardOf(course, "complete-translation");
  const toggle = (html: string): string => /<button[^>]*data-action="sound"[^>]*>/u.exec(html)?.[0] ?? "";

  it("is in the header, on unless the learner turned sound off", () => {
    const on = toggle(play(course, ex, stateOf(course, ex)));
    expect(on).toContain('data-sound="on"');
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('aria-label="Sound"');
    const off = toggle(play(course, ex, stateOf(course, ex), { sound: false }));
    expect(off).toContain('data-sound="off"');
    expect(off).toContain('aria-pressed="false"');
  });
});

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
