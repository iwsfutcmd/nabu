/**
 * Words in lessons (P1): tap-for-gloss on a card's target text where its meaning gives nothing away,
 * and a first look at the lesson's new words, on the card that first presents them.
 */
import { allKcs, createGrader, gradeExercise, lessonNodes, sampleExercise, start, step, type CourseView, type Draft, type Exercise, type PlayerState, type TemplateId } from "@nabu/core/lesson";
import { describe, expect, it } from "vitest";
import { LessonPlayer } from "../src/player/LessonPlayer.tsx";
import { newOnCard } from "../src/player/NewWords.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const card = (course: CourseView, template: TemplateId): Exercise => {
  const ex = sampleExercise(course, template, 7);
  if (ex === undefined) throw new Error(`${course.id} has no ${template} card`);
  return ex;
};

const stateOf = (course: CourseView, ex: Exercise, draft?: Draft): PlayerState => {
  const [presenting] = start("lesson", [ex]);
  const [answering] = step(presenting, { tag: "ready" });
  if (draft === undefined) return answering;
  const [checking] = step(step(answering, { tag: "input", draft })[0], { tag: "submit" });
  if (checking.tag !== "checking") throw new Error(checking.tag);
  return step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, createGrader(course)) })[0];
};

const play = (course: CourseView, ex: Exercise, state: PlayerState, lessonId = "lesson"): string =>
  render(<LessonPlayer course={course} lessonId={lessonId} exercises={[ex]} grader={createGrader(course)} imageUrl={(p) => p} language="Lebanese Arabic" initialState={state} sound={false} />);

/** Tappable words (tap-for-gloss) inside the first element marked `marker`. */
const tappable = (html: string, marker: string): number => {
  const from = html.indexOf(marker);
  if (from < 0) return 0;
  const end = html.indexOf("</p>", from);
  return [...html.slice(from, end).matchAll(/<button[^>]*data-index=/gu)].length;
};

describe("tap-for-gloss in a lesson (P1)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");

  it("taps the words around a gap from the start, never the options", () => {
    const ex = card(course, "gap-fill");
    const html = play(course, ex, stateOf(course, ex));
    expect(tappable(html, "data-gap-sentence")).toBeGreaterThan(0);
    const options = html.slice(html.indexOf("data-options"), html.indexOf("data-gloss-panel"));
    expect(options).not.toMatch(/<button[^>]*data-index=/u);
    // The panel waits, quiet, for a tap.
    expect(html).toMatch(/data-gloss-panel=""[^>]*data-quiet=""/u);
  });

  it("taps what a sentence means only once it is answered", () => {
    const ex = card(course, "choose-translation");
    if (ex.template !== "choose-translation") throw new Error("not a choice");
    expect(tappable(play(course, ex, stateOf(course, ex)), 'data-ink-container="prompt"')).toBe(0);
    expect(tappable(play(course, ex, stateOf(course, ex, { tag: "choice", index: ex.answer })), 'data-ink-container="prompt"')).toBeGreaterThan(0);
  });

  it("taps a sentence to say from the start: its translation is on the card", () => {
    const ex = card(course, "speak.tier-0");
    expect(tappable(play(course, ex, stateOf(course, ex)), 'data-ink-container="prompt"')).toBeGreaterThan(0);
  });
});

describe("a first look at new words (P1)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const kinds = new Map(allKcs(course).map((k) => [k.id as string, k.kind]));

  it("marks a word new on the first card that presents it, and only there", () => {
    const ex = card(course, "choose-translation");
    const introduces = new Set<string>(ex.kcs.slice(0, 1));
    expect(newOnCard(ex, [], introduces, kinds)).toEqual(ex.kcs.slice(0, 1));
    // Shown on an earlier card, it is not new any more; a word the lesson does not teach never is.
    expect(newOnCard(ex, [ex], introduces, kinds)).toEqual([]);
    expect(newOnCard(ex, [], new Set(), kinds)).toEqual([]);
  });

  it("names the new word where the card shows it anyway, and its meaning once answered", () => {
    const ex = card(course, "choose-translation");
    if (ex.template !== "choose-translation") throw new Error("not a choice");
    const node = lessonNodes(course).find((n) => n.node.introduces.some((kc) => ex.kcs.includes(kc)));
    if (node === undefined) throw new Error("no lesson introduces the card's words");
    const fresh = ex.kcs.filter((kc) => node.node.introduces.includes(kc));
    const before = play(course, ex, stateOf(course, ex), node.node.id);
    expect(before).toContain("data-new-word-tag");
    expect(before).toContain(fresh.length === 1 ? ">New word<" : ">New words<");
    // The word, from the start (the prompt shows it), but not yet what it means: that is the question.
    for (const kc of fresh) expect(before).toContain(`data-new-word="${kc}"`);
    expect(before).not.toContain("data-new-words-answered");
    const after = play(course, ex, stateOf(course, ex, { tag: "choice", index: ex.answer }), node.node.id);
    expect(after).toContain("data-new-words-answered");
    // Each new word with its meaning, in the support language's own tag.
    const block = after.slice(after.indexOf("data-new-words-answered"));
    const gloss = allKcs(course).find((k) => k.id === fresh[0])?.gloss?.[course.supportKey];
    expect(gloss).toBeDefined();
    expect(block).toContain(`lang="${gloss?.lang ?? ""}"`);
  });

  it("says only the tag on a pairs card: its pairs are the words and their meanings", () => {
    const ex = card(course, "match-pairs");
    const node = lessonNodes(course).find((n) => n.node.introduces.some((kc) => ex.kcs.includes(kc)));
    if (node === undefined) throw new Error("no lesson introduces the pairs' words");
    const html = play(course, ex, stateOf(course, ex), node.node.id);
    expect(html).toContain("data-new-word-tag");
    expect(html).not.toContain("data-new-word=");
  });

  it("says nothing in a review: no lesson introduces its words", () => {
    const ex = card(course, "choose-translation");
    expect(play(course, ex, stateOf(course, ex), "review")).not.toContain("data-new-word-tag");
  });
});
