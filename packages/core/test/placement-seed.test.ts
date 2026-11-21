import type { LearnerEvent } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { cardKey, learnedWords, placedParts, plan, readingSkill, replay } from "../src/learner/index.ts";
import { isLexeme, lessonNodes } from "../src/lesson/index.ts";
import { sentencesOf } from "../src/lesson/nodes.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const NOW = "2026-03-01T08:00:00.000Z";

describe("placement seeds the words of the units placed out of (ADR 0111, L9)", () => {
  const uz = loadCourse("uz", "uz-Latn/standard");
  const lessons = lessonNodes(uz);
  const at = lessons.findIndex((n) => n.unit.id === uz.units[5]?.id);
  const placed = lessons.slice(0, at).map((n) => n.node.id);
  const next = lessons[at];
  if (next === undefined) throw new Error("uz has a sixth unit");
  const placement = (seeded: boolean): LearnerEvent => {
    const events = eventFactory(uz, manifestOf("uz").id);
    events.at(NOW);
    const done = events.completed("lesson", undefined, { exercises: 20, correctFirstTry: 18, retries: 0 });
    return { ...done, mode: "placement", placed, ...(seeded ? { seeded: placedParts(uz, placed) } : {}) } as LearnerEvent;
  };

  // A lexeme, rule or letter is recognized; a feature value is read off a form.
  const key = (part: string): string => cardKey(part, readingSkill(part), uz.orthography);

  it("gives every part the placed nodes introduce a card, recalled with ease", () => {
    const state = replay([placement(true)]);
    const parts = placedParts(uz, placed);
    expect(parts.length).toBeGreaterThan(20);
    for (const part of parts) expect(state.cards[key(part)]?.reps, part).toBe(1);
    // An easy first review: days before it is due, not minutes.
    const card = state.cards[key(parts[0] ?? "")];
    expect(Date.parse(card?.due ?? NOW) - Date.parse(NOW)).toBeGreaterThan(3 * 86_400_000);
    expect(state.completedNodes).toEqual(placed);
  });

  it("lets the next lesson use its own sentences, and shows the placed words in the word list", () => {
    const own = sentencesOf(uz, next.unit, next.node);
    const used = (state: ReturnType<typeof replay>): number => {
      const items = new Set(plan(uz, state, { mode: "lesson", node: next.node.id }, { now: NOW, seed: 1 }).exercises.map((ex) => ex.item));
      return own.filter((s) => items.has(s.id)).length;
    };
    const before = replay([placement(false)]);
    const after = replay([placement(true)]);
    expect(used(after)).toBeGreaterThan(used(before));
    expect(learnedWords(uz, after, NOW).length).toBeGreaterThan(learnedWords(uz, before, NOW).length);
  });

  it("keeps a card a part already has", () => {
    const events = eventFactory(uz, manifestOf("uz").id);
    events.at("2026-02-20T08:00:00.000Z");
    const lexeme = placedParts(uz, placed).find(isLexeme);
    if (lexeme === undefined) throw new Error("placed lexemes");
    const ex = { id: `select-image:${lexeme}`, template: "select-image", item: lexeme, parts: [lexeme], orthography: uz.orthography } as never;
    const earlier = events.answer(ex, false, 1);
    const card = replay([earlier]).cards[key(lexeme)];
    expect(card).toBeDefined();
    expect(replay([earlier, placement(true)]).cards[key(lexeme)]).toEqual(card);
  });
});
