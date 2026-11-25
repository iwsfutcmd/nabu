/**
 * Words in lessons (P1): tap-for-gloss on a card's target text where its meaning gives nothing away,
 * and a first look at the lesson's new words, on the card that first presents them.
 */
import { createGrader, gradeExercise, isLexeme, lessonNodes, lexemesById, sampleExercise, start, step, type CourseView, type Draft, type Exercise, type PlayerState, type TemplateId } from "@nabu/core/lesson";
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
    const options = html.slice(html.indexOf("data-options"), html.indexOf("data-live-region"));
    expect(options).not.toMatch(/<button[^>]*data-index=/u);
    // No dialog until a word is tapped (ADR 0157).
    expect(html).not.toContain("data-gloss-panel");
  });

  it("taps an answered choice's words: its options and the word in its gap, never before (P1)", () => {
    const ex = card(course, "gap-fill");
    if (ex.template !== "gap-fill") throw new Error("not a gap-fill");
    const options = (html: string): string => html.slice(html.indexOf("data-options"), html.indexOf("data-live-region"));
    // Before: radios, nothing to tap.
    expect(options(play(course, ex, stateOf(course, ex)))).not.toMatch(/<button[^>]*data-index=/u);
    // Answered: a list of options whose words are taps, and the word now in the gap is one too.
    const html = play(course, ex, stateOf(course, ex, { tag: "choice", index: ex.answer }));
    expect(html).toContain("data-look-up");
    expect([...options(html).matchAll(/<button[^>]*data-index=/gu)].length).toBeGreaterThanOrEqual(ex.options.length);
    expect(tappable(html, "data-gap-sentence")).toBeGreaterThan(tappable(play(course, ex, stateOf(course, ex)), "data-gap-sentence"));
    // Options in the learner's own language have nothing to look up: they stay radios.
    const meaning = card(course, "choose-translation");
    if (meaning.template !== "choose-translation") throw new Error("not a choice");
    expect(play(course, meaning, stateOf(course, meaning, { tag: "choice", index: meaning.answer }))).not.toContain("data-look-up");
  });

  it("taps what a sentence means only once it is answered", () => {
    const ex = card(course, "choose-translation");
    if (ex.template !== "choose-translation") throw new Error("not a choice");
    expect(tappable(play(course, ex, stateOf(course, ex)), 'data-ink-container="prompt"')).toBe(0);
    expect(tappable(play(course, ex, stateOf(course, ex, { tag: "choice", index: ex.answer })), 'data-ink-container="prompt"')).toBeGreaterThan(0);
  });

  it("taps a tile once answered: placed or not, a tile of the language learned opens its gloss", () => {
    const ex = card(course, "translate-tap.l1-l2");
    if (ex.template !== "translate-tap.l1-l2") throw new Error("not a word bank");
    /** The word bank's tiles and the answer row's, as buttons: disabled, and looked up (aria-pressed). */
    const tiles = (html: string): readonly string[] => [...html.matchAll(/<button[^>]*data-(?:placed-)?tile="\d+"[^>]*>/gu)].map((m) => m[0]);
    const before = tiles(play(course, ex, stateOf(course, ex)));
    expect(before.length).toBe(ex.tiles.length);
    expect(before.some((b) => b.includes("aria-pressed"))).toBe(false);
    // Answered: no tile is disabled, and each says whether its word is the one looked up.
    const answered = tiles(play(course, ex, stateOf(course, ex, { tag: "tiles", order: ex.solution })));
    expect(answered.length).toBe(ex.tiles.length);
    expect(answered.every((b) => !b.includes("disabled") && b.includes('aria-pressed="false"'))).toBe(true);
    // Tiles in the learner's own language (into English) stay put once answered.
    const back = card(course, "translate-tap.l2-l1");
    if (back.template !== "translate-tap.l2-l1") throw new Error("not a word bank");
    const english = tiles(play(course, back, stateOf(course, back, { tag: "tiles", order: back.solution })));
    expect(english.every((b) => b.includes("disabled") && !b.includes("aria-pressed"))).toBe(true);
  });

  it("taps a sentence to say from the start: its translation is on the card", () => {
    const ex = card(course, "speak.tier-0");
    expect(tappable(play(course, ex, stateOf(course, ex)), 'data-ink-container="prompt"')).toBeGreaterThan(0);
  });
});

describe("a first look at new words (P1)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");

  it("marks a word new on the first card that presents it, and only there", () => {
    const ex = card(course, "choose-translation");
    const first = ex.parts.filter(isLexeme).slice(0, 1);
    expect(first).toHaveLength(1);
    const introduces = new Set<string>(first);
    expect(newOnCard(ex, [], introduces)).toEqual(first);
    // Shown on an earlier card, it is not new any more; a word the lesson does not teach never is.
    expect(newOnCard(ex, [ex], introduces)).toEqual([]);
    expect(newOnCard(ex, [], new Set())).toEqual([]);
  });

  it("names the new word where the card shows it anyway, and its meaning once answered", () => {
    const ex = card(course, "choose-translation");
    if (ex.template !== "choose-translation") throw new Error("not a choice");
    const node = lessonNodes(course).find((n) => n.node.introduces.some((id) => isLexeme(id) && ex.parts.includes(id)));
    if (node === undefined) throw new Error("no lesson introduces the card's words");
    const fresh = ex.parts.filter((id) => isLexeme(id) && node.node.introduces.includes(id));
    const before = play(course, ex, stateOf(course, ex), node.node.id);
    expect(before).toContain("data-new-word-tag");
    expect(before).toContain(fresh.length === 1 ? ">New word<" : ">New words<");
    // The word, from the start (the prompt shows it), but not yet what it means: that is the question.
    for (const id of fresh) expect(before).toContain(`data-new-word="${id}"`);
    expect(before).not.toContain("data-new-words-answered");
    const after = play(course, ex, stateOf(course, ex, { tag: "choice", index: ex.answer }), node.node.id);
    expect(after).toContain("data-new-words-answered");
    // Each new word with its meaning, in the support language's own tag.
    const block = after.slice(after.indexOf("data-new-words-answered"));
    const gloss = lexemesById(course).get(fresh[0] ?? "")?.gloss?.[course.supportKey];
    expect(gloss).toBeDefined();
    expect(block).toContain(`lang="${gloss?.lang ?? ""}"`);
  });

  it("says only the tag on a pairs card: its pairs are the words and their meanings", () => {
    const ex = card(course, "match-pairs");
    const node = lessonNodes(course).find((n) => n.node.introduces.some((id) => ex.parts.includes(id)));
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
