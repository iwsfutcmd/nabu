/**
 * Sound effects (sound.ts): what each plays, as plans of notes. A right answer's chime climbs with a
 * streak of right answers and stops climbing; a wrong answer's tone falls and is quieter; a finished
 * lesson's flourish rises. An answer's sound is over before a clip said on answering starts.
 */
import { describe, expect, it } from "vitest";
import { FEEDBACK_SOUND_MS, notesOf } from "../src/player/sound.ts";

const first = (streak: number): number => notesOf("correct", streak)[0]?.frequency ?? 0;

describe("sound effects", () => {
  it("chimes a note and the fifth above it, higher with each right answer in a row, up to a sixth", () => {
    const [a, b] = notesOf("correct");
    expect(a && b && b.frequency / a.frequency).toBeCloseTo(1.5, 5);
    expect(b && a && b.at).toBeGreaterThan(a?.at ?? 0);
    const climb = [0, 1, 2, 3, 4].map(first);
    for (let i = 1; i < climb.length; i++) expect(climb[i]).toBeGreaterThan(climb[i - 1] ?? 0);
    // It stops climbing: no shriller than a sixth above the first.
    expect(first(10)).toBe(first(4));
    expect(first(4) / first(0)).toBeCloseTo(2 ** (9 / 12), 5);
    expect(notesOf("correct").every((n) => n.bell)).toBe(true);
  });

  it("answers a wrong answer with two soft notes falling, quieter and lower than the chime", () => {
    const wrong = notesOf("wrong");
    expect(wrong).toHaveLength(2);
    expect(wrong[1]?.frequency).toBeLessThan(wrong[0]?.frequency ?? 0);
    expect(Math.max(...wrong.map((n) => n.gain))).toBeLessThan(Math.min(...notesOf("correct").map((n) => n.gain)));
    expect(Math.max(...wrong.map((n) => n.frequency))).toBeLessThan(first(0));
    expect(wrong.some((n) => n.bell)).toBe(false);
  });

  it("ends a lesson with a rising flourish", () => {
    const notes = notesOf("finished");
    expect(notes.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]?.frequency).toBeGreaterThan(notes[i - 1]?.frequency ?? 0);
      expect(notes[i]?.at).toBeGreaterThan(notes[i - 1]?.at ?? 0);
    }
  });

  it("stays gentle, and an answer's sound is over before a clip said on answering", () => {
    for (const effect of ["correct", "wrong", "finished"] as const) for (const n of notesOf(effect, 4)) expect(n.gain).toBeLessThanOrEqual(0.2);
    for (const effect of ["correct", "wrong"] as const) for (const n of notesOf(effect)) expect(n.at * 1000).toBeLessThan(FEEDBACK_SOUND_MS);
  });
});
