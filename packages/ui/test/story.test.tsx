/**
 * The story reader's end (S15): the summary offers the whole story again, which shows every line
 * and asks nothing; and leaving a story says "story", never "lesson".
 */
import { createGrader, gradeExercise, sampleExercise, seededRng, start, step, type Effect, type Grader } from "@nabu/core/lesson";
import { allStories, startStory, stepStory, storyScript, type StoryEvent, type StoryScript, type StoryState } from "@nabu/core/story";
import { describe, expect, it } from "vitest";
import { LessonPlayer } from "../src/player/LessonPlayer.tsx";
import { StoryReader } from "../src/story/StoryReader.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

/** Reads the story to its end, every question right. */
const finish = (script: StoryScript, grader: Grader): StoryState => {
  let state = startStory(script)[0];
  const send = (event: StoryEvent): void => {
    const [next, effects] = stepStory(state, event);
    state = next;
    run(effects);
  };
  const run = (effects: readonly Effect[]): void => {
    for (const e of effects) if (e.tag === "grade") send({ tag: "player", event: { tag: "graded", outcome: gradeExercise(e.ex, e.response, grader) } });
  };
  for (let guard = 0; guard < 200 && state.tag !== "finished"; guard += 1) {
    if (state.tag === "reading") send({ tag: "continue" });
    else if (state.player.tag === "presenting") send({ tag: "player", event: { tag: "ready" } });
    else if (state.player.tag === "feedback") send({ tag: "player", event: { tag: "continue" } });
    else if (state.player.tag === "answering") {
      const ex = state.player.ex;
      const draft = ex.template === "story-arrange" ? { tag: "tiles" as const, order: ex.solution } : { tag: "choice" as const, index: "answer" in ex ? ex.answer : 0 };
      send({ tag: "player", event: { tag: "input", draft } });
      send({ tag: "player", event: { tag: "submit" } });
    }
  }
  return state;
};

describe("the end of a story (S15)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const [story] = allStories(course);
  if (story === undefined) throw new Error("apc has a story");
  const script = storyScript(course, story, seededRng(7));
  const grader = createGrader(course);
  const end = finish(script, grader);
  const read = (extra: { rereading?: boolean; onExit?: () => void }): string =>
    render(<StoryReader course={course} script={script} grader={grader} imageUrl={(p) => p} language="Lebanese Arabic" initialState={end} sound={false} {...extra} />);

  it("offers the whole story again", () => {
    expect(end.tag === "finished" && end.summary.completed).toBe(true);
    const html = read({ onExit: () => undefined });
    expect(html).toContain('data-state="finished"');
    expect(html).toContain('data-action="reread"');
    expect(html).toContain(">Read it again<");
    expect(html).toContain('data-action="exit"');
  });

  it("reads it again: every line, no question", () => {
    const html = read({ rereading: true, onExit: () => undefined });
    expect(html).toContain('data-state="rereading"');
    expect([...html.matchAll(/ data-line="(\d+)"/gu)].map((m) => Number(m[1]))).toEqual(script.lines.map((l) => l.index));
    expect(html).not.toContain("data-story-question");
    expect(html).toContain("data-gloss-panel");
  });

  it("asks to leave the story, not the lesson", () => {
    const html = render(<StoryReader course={course} script={script} grader={grader} imageUrl={(p) => p} language="Lebanese Arabic" sound={false} />);
    expect(html).toContain('aria-label="Leave the story"');
  });
});

describe("a story's synthetic voice is said beside its buttons (W6)", () => {
  const course = loadCourse("uz", "uz-Latn/standard");
  const [story] = allStories(course);
  if (story === undefined) throw new Error("uz has a story");
  const script = storyScript(course, story, seededRng(7));
  const grader = createGrader(course);
  const synthetic = (index: number): boolean => {
    const line = script.lines[index];
    return line !== undefined && course.audio[`${script.id}#${String(line.step)}`]?.normal.synthetic === true;
  };
  /** The lines in the markup, each with whether "Synthetic voice" is said in it. */
  const labelled = (html: string): readonly (readonly [number, boolean])[] =>
    html
      .split(/(?= data-line=")/u)
      .slice(1)
      .map((part) => [Number(/^ data-line="(\d+)"/u.exec(part)?.[1]), part.includes(">Synthetic voice<")] as const);

  it("once, beside the newest synthesized line while reading, the first when read again", () => {
    // A few lines in.
    let state = startStory(script)[0];
    for (let guard = 0; guard < 50 && (state.tag !== "reading" || state.shown.length < 3); guard += 1) {
      if (state.tag !== "reading") break;
      state = stepStory(state, { tag: "continue" })[0];
    }
    const shown = state.shown.filter(synthetic);
    expect(shown.length, "uz's story lines have synthesized clips").toBeGreaterThan(1);
    const reading = render(<StoryReader course={course} script={script} grader={grader} imageUrl={(p) => p} language="Uzbek" initialState={state} sound={false} />);
    expect(reading.split(">Synthetic voice<").length - 1).toBe(1);
    expect(labelled(reading).filter(([, said]) => said)).toEqual([[shown.at(-1), true]]);
    const again = render(<StoryReader course={course} script={script} grader={grader} imageUrl={(p) => p} language="Uzbek" initialState={finish(script, grader)} rereading sound={false} />);
    expect(again.split(">Synthetic voice<").length - 1).toBe(1);
    expect(labelled(again).filter(([, said]) => said)).toEqual([[script.lines.findIndex((l) => synthetic(l.index)), true]]);
  });
});

describe("the end of a session says what it was (S15)", () => {
  const course = loadCourse("es", "es-Latn/standard");
  const ex = sampleExercise(course, "choose-translation", 7);
  if (ex?.template !== "choose-translation") throw new Error("es has a choose-translation card");
  const grader = createGrader(course);
  const done = (() => {
    const [presenting] = start("review", [ex]);
    const chosen = step(step(presenting, { tag: "ready" })[0], { tag: "input", draft: { tag: "choice", index: ex.answer } })[0];
    const [checking] = step(chosen, { tag: "submit" });
    if (checking.tag !== "checking") throw new Error("not checking");
    const [feedback] = step(checking, { tag: "graded", outcome: gradeExercise(ex, checking.response, grader) });
    return step(feedback, { tag: "continue" })[0];
  })();

  it.each([
    ["lesson", "Lesson complete!"],
    ["review", "Review complete!"],
    ["mistakes", "Practice complete!"],
    ["placement", "Placement test complete!"],
  ] as const)("%s: %s", (mode, title) => {
    const html = render(<LessonPlayer course={course} lessonId="x" exercises={[ex]} grader={grader} imageUrl={(p) => p} language="Spanish" initialState={done} mode={mode} />);
    expect(html).toContain(`>${title}</h2>`);
  });
});
