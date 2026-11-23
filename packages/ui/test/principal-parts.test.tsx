/**
 * A verb shown as itself carries its principal parts after its lemma (docs/rules-design.md, stage 4):
 * in the word list, a card's new words and a tapped word's meaning, one run in the word's own
 * direction; what a card shows of them is logged as those forms (ADR 0146).
 */
import { lexemesById, sampleExercise, type Exercise } from "@nabu/core/lesson";
import { describe, expect, it } from "vitest";
import { besideOf, NewWordsAnswered, withBeside } from "../src/player/NewWords.tsx";
import { WordList } from "../src/words/WordList.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const latn = loadCourse("apc", "apc-Latn/arabizi");
const arab = loadCourse("apc", "apc-Arab/standard");

const wordOf = (course: typeof latn, id: string) => {
  const lexeme = lexemesById(course).get(id);
  const form = lexeme?.forms?.[course.orthography]?.[0];
  if (form === undefined) throw new Error(id);
  return { lexeme: id, unit: course.units[0]?.id ?? "", form, gloss: undefined, strength: 0.5, due: false, reviews: 1, known: false, skills: [] };
};

describe("principal parts", () => {
  it("follow a verb's lemma in the word list, in the word's own direction; an adjective has none", () => {
    const html = render(<WordList course={arab} words={[wordOf(arab, "lexeme:shereb"), wordOf(arab, "lexeme:kbir")]} url={(p) => p} />);
    expect(html.match(/data-principal-parts="1"/gu)).toHaveLength(1);
    expect(html).toMatch(/dir="rtl" data-principal-parts="1"/u);
    expect(render(<WordList course={latn} words={[wordOf(latn, "lexeme:shereb")]} url={(p) => p} />)).toContain("byeshrab");
  });

  it("follow a card's new verb once answered", () => {
    const html = render(<NewWordsAnswered course={latn} template="translate-type.l1-l2" lexemes={["lexeme:shereb"]} ruby={false} marks="show" />);
    expect(html).toContain('data-principal-parts="1"');
    expect(html).toContain("byeshrab");
  });

  it("are logged as shown: from the start where the card names its new words, else once answered", () => {
    const typed = sampleExercise(latn, "translate-type.l1-l2", 3) as Exercise;
    const after = besideOf(latn, typed, ["lexeme:shereb"]);
    expect(after.before).toEqual([]);
    expect(after.after.map((t) => t.tokens[0]?.lexemes)).toEqual([[{ lexeme: "lexeme:shereb", feats: { Aspect: "Imp", Gender: "Masc", Mood: "Ind", Number: "Sing", Person: "3" } }]]);
    const named = besideOf(latn, { ...typed, template: "choose-translation" } as unknown as Exercise, ["lexeme:shereb"]);
    expect(named.before).toHaveLength(1);
    // Nothing beside a card with no new verb: its events are as before.
    const event = { type: "exercise_presented" as const, exercise: { id: typed.id, template: typed.template, item: typed.item, parts: [...typed.parts] }, ex: typed };
    expect(withBeside(event, besideOf(latn, typed, []))).toBe(event);
    expect(withBeside(event, after)).toEqual({ ...event, beside: after });
  });
});
