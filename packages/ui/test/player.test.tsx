/**
 * The lesson player as it renders each state (server-rendered: no effects run), driven through the
 * pure state machine from the committed fixture bundles.
 */
import { cardGallery, createGrader, gradeExercise, sampleExercise, start, step, type CourseView, type Draft, type Exercise, type PlayerState, type TemplateId } from "@nabu/core/lesson";
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

describe("one set of play buttons a card", () => {
  /** How many sets of play buttons the card shows. */
  const sets = (html: string): number => [...html.matchAll(/data-audio-buttons=""/gu)].length;

  it("a self-rated speaking card plays its model from the sentence, once", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const ex = cardOf(course, "speak.tier-0");
    expect(course.audio[ex.item], `${ex.id} has a clip`).toBeDefined();
    const html = play(course, ex, stateOf(course, ex));
    expect(sets(html)).toBe(1);
    // Beside the sentence, whose words it lights up as it plays.
    expect(html).toMatch(/data-prompt-audio=""[^>]*>\s*<div[^>]*data-audio-buttons=""/u);
  });

  it.each([["apc", "apc-Arab/standard"], ["yue", "yue-Hant-HK/standard"], ["fa", "fa-Arab/standard"]] as const)("no card in %s's gallery shows two", (id, orthography) => {
    const course = loadCourse(id, orthography);
    for (const { exercise: ex } of cardGallery(course, SEED)) {
      if (ex === undefined || ex.template === "match-pairs") continue;
      expect(sets(play(course, ex, stateOf(course, ex))), ex.id).toBeLessThanOrEqual(1);
    }
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

describe("what a screen reader hears as a card opens (P10)", () => {
  const ids = (html: string): ReadonlySet<string> => new Set([...html.matchAll(/ id="([^"]+)"/gu)].map((m) => m[1] as string));
  const described = (html: string): readonly string[] => [...html.matchAll(/aria-describedby="([^"]+)"/gu)].flatMap((m) => (m[1] as string).split(" "));

  it.each([
    ["fa", "fa-Arab/standard"],
    ["yue", "yue-Hant-HK/standard"],
    ["apc", "apc-Arab/standard"],
    ["grc", "grc-Grek/polytonic"],
  ] as const)("%s: every card's first control is described by its instruction and prompt, all there", (id, orthography) => {
    const course = loadCourse(id, orthography);
    let cards = 0;
    for (const { exercise: ex } of cardGallery(course, SEED)) {
      if (ex === undefined) continue;
      const html = play(course, ex, stateOf(course, ex));
      // React Aria's own slots (a field's description) are pruned in the browser, where they are missing.
      const refs = described(html).filter((ref) => !ref.startsWith("react-aria-"));
      const present = ids(html);
      expect(refs.length, ex.template).toBeGreaterThan(0);
      for (const ref of refs) expect(present.has(ref), `${ex.template}: #${ref}`).toBe(true);
      // The instruction is always among them.
      const heading = /<h2[^>]* id="([^"]+)"/u.exec(html)?.[1];
      expect(refs, ex.template).toContain(heading);
      cards++;
    }
    expect(cards).toBeGreaterThan(8);
  });

  it("names each prompt for what it is", () => {
    const course = loadCourse("yue", "yue-Hant-HK/standard");
    const label = (template: TemplateId): string | undefined => {
      const ex = cardOf(course, template);
      return /data-ink-container="prompt"/u.test(play(course, ex, stateOf(course, ex))) ? /role="group" aria-label="([^"]+)" id="[^"]+-prompt"/u.exec(play(course, ex, stateOf(course, ex)))?.[1] : undefined;
    };
    expect(label("choose-translation")).toBe("Sentence to translate");
    expect(label("speak.tier-0")).toBe("Sentence to say");
    expect(label("reading-disambiguation")).toBe("Text to read");
  });

  it("numbers the bank's tiles for their keys, and says a placed tile can be taken back", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const ex = cardOf(course, "translate-tap.l1-l2");
    if (ex.template !== "translate-tap.l1-l2") throw new Error("not tiles");
    const fresh = play(course, ex, stateOf(course, ex));
    expect([...fresh.matchAll(/data-tile-key="(\d)"/gu)].map((m) => Number(m[1]))).toEqual(ex.tiles.slice(0, 9).map((_, i) => i + 1));
    // One placed: the bank's numbers close up, and the placed tile is described by "take it back".
    const [presenting] = start("lesson", [ex]);
    const placed = step(step(presenting, { tag: "ready" })[0], { tag: "input", draft: { tag: "tiles", order: [0] } })[0];
    const html = play(course, ex, placed);
    expect([...html.matchAll(/data-tile-key="(\d)"/gu)].map((m) => Number(m[1]))).toEqual(ex.tiles.slice(1, 10).map((_, i) => i + 1));
    const hint = /<button[^>]*aria-describedby="([^"]+)"[^>]*data-placed-tile="0"/u.exec(html)?.[1];
    expect(hint).toBeDefined();
    expect(html).toContain(`id="${hint ?? ""}" hidden="">Press to take it back out of your answer.</span>`);
  });
});

describe("an answer claimed right in its feedback (P14, ADR 0113)", () => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const ex = cardOf(course, "choose-translation");
  if (ex.template !== "choose-translation") throw new Error("not a choice");
  const continueOf = (html: string): string => /<button[^>]*data-action="continue"[^>]*>/u.exec(html)?.[0] ?? "";

  it("turns Continue from wrong to right, the feedback still showing the grading", () => {
    const missed = stateOf(course, ex, { tag: "choice", index: (ex.answer + 1) % ex.options.length });
    const before = play(course, ex, missed);
    expect(continueOf(before)).toContain('data-counts-as="WRONG"');
    expect(continueOf(before)).toContain("primaryWrong");
    const [claimed] = step(missed, { tag: "revise", exercise: ex.id, verdict: "CORRECT" });
    const after = play(course, ex, claimed);
    expect(continueOf(after)).toContain('data-counts-as="CORRECT"');
    expect(continueOf(after)).not.toContain("primaryWrong");
    expect(after).toContain('data-verdict="WRONG"');
  });

  it("hands the feedback's extras a way to revise the answer", () => {
    const missed = stateOf(course, ex, { tag: "choice", index: (ex.answer + 1) % ex.options.length });
    const seen: unknown[] = [];
    play(course, ex, missed, {
      feedbackExtra: (_ex, _outcome, _response, revise) => {
        seen.push(typeof revise);
        return null;
      },
    });
    expect(seen).toEqual(["function"]);
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
