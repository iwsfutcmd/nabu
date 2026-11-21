/** A fill-in's instruction says what it asks (ADR 0132): which word, or which form. */
import type { Exercise } from "@nabu/core/lesson";
import type { Question } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { instructionOf, INSTRUCTIONS } from "../src/player/ExerciseView.tsx";

const card = (template: "gap-fill" | "story-complete", asks?: Question): Exercise =>
  ({ template, id: template, item: "s.1", parts: [], orthography: "es-Latn/standard", options: [], answer: 0, ...(asks === undefined ? {} : { asks }) }) as unknown as Exercise;

describe("a fill-in's instruction", () => {
  it("says which word or which form it asks", () => {
    expect(instructionOf(card("gap-fill", "lexeme"))).toBe("player.instruction.gap-fill-word");
    expect(instructionOf(card("gap-fill", "form"))).toBe("player.instruction.gap-fill-form");
    expect(instructionOf(card("story-complete", "lexeme"))).toBe("player.instruction.story-complete-word");
    expect(instructionOf(card("story-complete", "form"))).toBe("player.instruction.story-complete-form");
  });

  it("keeps its template's on a card planned before ADR 0132", () => {
    expect(instructionOf(card("gap-fill"))).toBe(INSTRUCTIONS["gap-fill"]);
    expect(instructionOf(card("story-complete"))).toBe(INSTRUCTIONS["story-complete"]);
  });
});
