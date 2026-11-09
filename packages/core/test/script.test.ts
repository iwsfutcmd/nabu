/**
 * Script tracks (ADR 0088): alphabet nodes become sessions of their own, with letters and words,
 * beside the path and never gating it. The Greek alphabet of the grc course.
 */
import { describe, expect, it } from "vitest";
import type { LearnerEvent } from "@nabu/schema";
import { emptyLearnerState, pathOf, plan, replay, scriptPathOf } from "../src/learner/index.ts";
import { createGrader } from "../src/lesson/course.ts";
import type { Exercise, Response } from "../src/lesson/exercise.ts";
import { lessonNodes } from "../src/lesson/build.ts";
import { SCRIPT_TEMPLATES, scriptNodes } from "../src/lesson/script.ts";
import { gradeExercise, SENTENCE_TEMPLATES } from "../src/lesson/templates.ts";
import { courseGlossary } from "../src/story/story.ts";
import { surfaceOf } from "../src/text/index.ts";
import { eventFactory, loadCourse } from "./learner-fixtures.ts";

const grc = loadCourse("grc");
const NOW = "2026-03-01T09:00:00.000Z";

const right = (ex: Exercise): Response => {
  switch (ex.template) {
    case "letter-read":
    case "word-read":
      return { tag: "choice", index: ex.answer };
    case "letter-pairs":
      return { tag: "pairs", mistakes: 0 };
    case "word-write":
      return { tag: "tiles", order: ex.solution };
    default:
      throw new Error(`not a script template: ${ex.template}`);
  }
};

describe("script track: the Greek alphabet (grc)", () => {
  const track = scriptNodes(grc);

  it("has eight alphabet nodes, apart from the path", () => {
    expect(track.map((n) => n.node.id)).toEqual([
      "grc.abc.letters-1",
      "grc.abc.letters-2",
      "grc.abc.letters-3",
      "grc.abc.letters-4",
      "grc.abc.letters-5",
      "grc.abc.letters-6",
      "grc.abc.diphthongs",
      "grc.abc.breathings",
    ]);
    const lessons = new Set(lessonNodes(grc).map((n) => n.node.id));
    for (const n of track) expect(lessons.has(n.node.id)).toBe(false);
  });

  it("spells words in Latin letters as the scheme does", () => {
    const first = track[0]?.node.alphabet;
    expect(first?.letters.map((l) => [surfaceOf(l.text), surfaceOf(l.latin)])).toEqual([
      ["α", "a"],
      ["ε", "e"],
      ["ι", "i"],
      ["ο", "o"],
      ["τ", "t"],
      ["ν", "n"],
    ]);
    const words = track.flatMap((n) => n.node.alphabet.words);
    const latin = new Map(words.map((w) => [surfaceOf(w.text), surfaceOf(w.latin)]));
    expect(latin.get("Σωκράτης")).toBe("Sōkratēs");
    expect(latin.get("ὁδός")).toBe("hodos");
    expect(latin.get("πρῴ")).toBe("prōi");
  });

  it("plans each node from its letters and words, presents every new letter, and grades its own answers right", () => {
    const grader = createGrader(grc);
    const factory = eventFactory(grc, "test");
    const events: LearnerEvent[] = [];
    let state = emptyLearnerState();
    for (const [i, n] of track.entries()) {
      const session = plan(grc, state, { mode: "lesson", node: n.node.id }, { now: NOW, seed: 3 + i });
      expect(session.exercises.length).toBeGreaterThan(5);
      for (const ex of session.exercises) {
        expect(SCRIPT_TEMPLATES.has(ex.template)).toBe(true);
        expect(gradeExercise(ex, right(ex), grader).verdict).toBe("CORRECT");
      }
      const presented = new Set(session.exercises.flatMap((ex) => ex.kcs));
      for (const kc of n.node.introduces) expect(presented, `${n.node.id}: ${kc}`).toContain(kc);
      // Words are read before they are written.
      const firstWrite = session.exercises.findIndex((ex) => ex.template === "word-write");
      if (firstWrite >= 0) expect(session.exercises.slice(0, firstWrite).some((ex) => ex.template !== "word-write")).toBe(true);
      // Played through, every answer right: the next node builds on these letters.
      factory.session();
      events.push(factory.started("lesson", n.node.id, session.exercises.length));
      for (const ex of session.exercises) events.push(factory.answer(ex, true, 1));
      events.push(factory.completed("lesson", n.node.id, { exercises: session.exercises.length, correctFirstTry: session.exercises.length, retries: 0 }));
      state = replay(events);
    }
  });

  it("offers only letters and words taught by then", () => {
    for (const [i, n] of track.entries()) {
      const allowed = new Set(track.slice(0, i + 1).flatMap((t) => [...t.node.alphabet.letters, ...t.node.alphabet.words]).map((x) => surfaceOf(x.latin)));
      const session = plan(grc, emptyLearnerState(), { mode: "lesson", node: n.node.id }, { now: NOW, seed: 11 });
      for (const ex of session.exercises) {
        if (ex.template === "letter-read" || ex.template === "word-read") for (const o of ex.options) expect(allowed).toContain(surfaceOf(o));
      }
    }
  });

  it("is a row of its own: the first node is open, the rest wait for it, and the path does not wait for the row", () => {
    const row = scriptPathOf(grc, emptyLearnerState());
    expect(row[0]?.status).toBe("available");
    expect(row.slice(1).every((n) => n.status === "locked")).toBe(true);
    expect(pathOf(grc, emptyLearnerState())[0]?.status).toBe("available");
  });

  it("keeps letters out of the glossary and the sentence templates", () => {
    expect(courseGlossary(grc).compiled.entries.some((e) => e.kc.startsWith("grapheme:"))).toBe(false);
    for (const t of SCRIPT_TEMPLATES) expect(SENTENCE_TEMPLATES[t]).toBeUndefined();
  });
});
