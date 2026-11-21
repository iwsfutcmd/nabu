/**
 * Feedback names every label of a miss (ADR 0148): one line a label, the worst first, each with the
 * words it is about; a profile note about the same words says it instead; the headline says "a
 * different word" only of a miss that is one; and while the judge may still accept the answer,
 * lexical, grammatical and order wait.
 */
import type { AlignOp } from "@nabu/core";
import { allSentences, createGrader, gradeExercise, profileOf, type Outcome, type TranslateType } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { Feedback, labelLines } from "../src/player/Feedback.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const es = loadCourse("es");
const grader = createGrader(es);
const ES = "es-Latn/standard";

/** A translate-type card for a sentence of the course, as the planner makes one. */
const typedCard = (pick: (id: string, text: string) => boolean): TranslateType => {
  const s = allSentences(es).find((x) => {
    const form = x.forms[es.orthography];
    return x.production && form?.reverse !== undefined && pick(x.id, surfaceOf(form.text));
  });
  const form = s?.forms[es.orthography];
  const translation = s?.translations[es.supportKey];
  if (s === undefined || form?.reverse === undefined || translation === undefined) throw new Error("es has no such sentence");
  return { template: "translate-type.l1-l2", id: `translate-type.l1-l2:${s.id}`, item: s.id, parts: s.parts, orthography: es.orthography, prompt: translation.text, accept: form.reverse, canonical: form.text };
};

const feedbackOf = (ex: TranslateType, text: string, held = false): { html: string; outcome: Outcome } => {
  const outcome = gradeExercise(ex, { tag: "text", text }, grader);
  return { outcome, html: render(<Feedback ex={ex} outcome={outcome} response={{ tag: "text", text }} course={es} ruby={false} marks="show" held={held} />) };
};

/** Each label line of the feedback: its label and its text. */
const linesOf = (html: string): { label: string; text: string }[] =>
  [...html.matchAll(/<li data-label="([a-z]+)">(.*?)<\/li>/gsu)].map((m) => ({ label: m[1] ?? "", text: (m[2] ?? "").replace(/<[^>]+>/gu, "") }));

const headlineOf = (html: string): string => (/<p class="[^"]*">(?:<span[^>]*>.*?<\/span><\/span>|<span[^>]*><svg.*?<\/svg><\/span>)?([^<]*)<\/p>/su.exec(html)?.[1] ?? "").trim();

describe("a word with the right sound and the wrong letter (bolber for volver)", () => {
  // The first typed sentence with a word the profile could spell otherwise, with the same sounds.
  const projection = profileOf(es, ES).projection;
  if (projection?.from !== "spelling") throw new Error("es reads its sound off its spelling");
  const found = allSentences(es).flatMap((s) => {
    const form = s.forms[es.orthography];
    if (!s.production || form?.reverse === undefined) return [];
    return form.text.tokens.filter((tk) => tk.kind === "lexical").flatMap((tk) => projection.spellings(tk.surface).map((other) => ({ id: s.id, word: tk.surface, other })));
  });
  const pick = found.find(({ id, word, other }) => {
    const ex = typedCard((x) => x === id);
    const o = gradeExercise(ex, { tag: "text", text: surfaceOf(ex.canonical).replace(word, other) }, grader);
    return o.verdict !== "CORRECT" && o.labels?.length === 1 && o.labels[0] === "orthographic" && o.notes.length === 0;
  });
  if (pick === undefined) throw new Error("es has a word spelled with the same sounds otherwise");
  const ex = typedCard((x) => x === pick.id);
  const { html, outcome } = feedbackOf(ex, surfaceOf(ex.canonical).replace(pick.word, pick.other));

  it("is not accepted, and says what the miss is, naming the two words in their own language", () => {
    expect(outcome.verdict).toBe("WRONG_WORD");
    const lines = linesOf(html);
    expect(lines.map((l) => l.label)).toEqual(["orthographic"]);
    expect(lines[0]?.text).toBe(`Right sound, wrong letter: ${pick.word}, not ${pick.other}.`);
    expect(html).toMatch(/data-label-pair="">[^<]*<span[^>]*lang="es-Latn-CU"/u);
  });

  it("says 'Not quite', not 'a different word': it is the same word, misspelled", () => {
    expect(headlineOf(html)).toBe("Not quite.");
    expect(html).not.toContain("That&#x27;s a different word.");
  });
});

describe("a note and a label about the same words", () => {
  it("the note says it, the labels of that pair get no line; the headline says another word (esta for está)", () => {
    // A sentence where esta in place of está is another word of the course (Mami está aquí).
    const ex = typedCard((id, text) => {
      if (!/ está /u.test(text)) return false;
      const o = gradeExercise(typedCard((x) => x === id), { tag: "text", text: text.replace(" está ", " esta ") }, grader);
      return o.verdict === "WRONG_WORD" && o.labels?.includes("lexical") === true;
    });
    const { html, outcome } = feedbackOf(ex, surfaceOf(ex.canonical).replace(" está ", " esta "));
    expect(outcome.verdict).toBe("WRONG_WORD");
    expect(outcome.labels).toContain("lexical");
    expect(html).toContain('data-note="accent-word"');
    expect(linesOf(html)).toEqual([]);
    expect(headlineOf(html)).toBe("That's a different word.".replace("'", "&#x27;"));
  });

  it("a label keeps its line for the words no note is about, naming only those", () => {
    const solution: TaggedText = { lang: "es-Latn-CU" as TaggedText["lang"], orthography: ES as TaggedText["orthography"], tokens: [{ surface: "está", kind: "lexical" }, { surface: " ", kind: "space" }, { surface: "casa", kind: "lexical" }] };
    const alignment: AlignOp[] = [
      { op: "match", expected: "está", actual: "esta", kind: "fold", folds: ["marks"], note: "accent-word", labels: ["lexical", "phonemic"] },
      { op: "substitute", expected: "casa", actual: "cada", labels: ["lexical"] },
    ];
    const outcome: Outcome = { verdict: "WRONG_WORD", notes: ["accent-word"], solution, alignment, closestIsSolution: true, labels: ["lexical", "phonemic"] };
    const html = render(<Feedback ex={typedCard(() => true)} outcome={outcome} course={es} ruby={false} marks="show" />);
    expect(linesOf(html)).toEqual([{ label: "lexical", text: "Another word: casa, not cada." }]);
    expect(html.indexOf('data-label="lexical"')).toBeLessThan(html.indexOf('data-note="accent-word"'));
  });
});

describe("every label, the worst first, each with its words", () => {
  const solution: TaggedText = {
    lang: "es-Latn-CU" as TaggedText["lang"],
    orthography: ES as TaggedText["orthography"],
    tokens: ["Quiero", " ", "volver", " ", "a", " ", "casa"].map((surface) => ({ surface, kind: surface === " " ? "space" : "lexical" })),
  };
  const alignment: AlignOp[] = [
    { op: "substitute", expected: "Quiero", actual: "Quieres", labels: ["grammatical"] },
    { op: "match", expected: "volver", actual: "bolber", kind: "typo", labels: ["orthographic"] },
    { op: "match", expected: "a", actual: "a", kind: "exact" },
    { op: "substitute", expected: "casa", actual: "caza", labels: ["slip", "lexical"] },
    { op: "insert", actual: "mi", labels: ["lexical"] },
  ];
  const outcome: Outcome = { verdict: "WRONG", notes: [], solution, alignment, closestIsSolution: true, labels: ["lexical", "grammatical", "orthographic", "slip"] };
  const ex = typedCard(() => true);

  it("one line a label, in the grade's order, several pairs of one label in its line", () => {
    const html = render(<Feedback ex={ex} outcome={outcome} course={es} ruby={false} marks="show" />);
    expect(linesOf(html)).toEqual([
      { label: "lexical", text: "Another word: casa, not caza." },
      { label: "grammatical", text: "Right word, another form: Quiero, not Quieres." },
      { label: "orthographic", text: "Right sound, wrong letter: volver, not bolber." },
      { label: "slip", text: "A slip of the keys." },
    ]);
    const twice: Outcome = { ...outcome, alignment: [...alignment, { op: "substitute", expected: "Quiero", actual: "Quiere", labels: ["grammatical"] }] };
    const line = render(<Feedback ex={ex} outcome={twice} course={es} ruby={false} marks="show" />).split('data-label="grammatical"')[1] ?? "";
    expect(line.slice(0, line.indexOf("</li>")).match(/data-label-pair=""/gu)).toHaveLength(2);
    expect(headlineOf(html)).toBe("Not quite.");
  });

  it("a word left out or added is said without words", () => {
    expect(labelLines({ ...outcome, alignment: [{ op: "delete", expected: "casa", labels: ["lexical"] }], labels: ["lexical"] }, () => false, false)).toEqual([{ label: "lexical", pairs: [] }]);
    const html = render(<Feedback ex={ex} outcome={{ ...outcome, alignment: [{ op: "delete", expected: "casa", labels: ["lexical"] }], labels: ["lexical"] }} course={es} ruby={false} marks="show" />);
    expect(linesOf(html)).toEqual([{ label: "lexical", text: "Another word." }]);
  });

  it("while the judge may still accept it, lexical, grammatical and order wait; the rest is said", () => {
    const held = render(<Feedback ex={ex} outcome={outcome} course={es} ruby={false} marks="show" held />);
    expect(linesOf(held).map((l) => l.label)).toEqual(["orthographic", "slip"]);
    expect(labelLines({ ...outcome, labels: ["order"], alignment: [{ op: "substitute", expected: "a", actual: "casa", labels: ["order"] }] }, () => false, true)).toEqual([]);
    expect(labelLines({ ...outcome, labels: ["order"], alignment: [{ op: "substitute", expected: "a", actual: "casa", labels: ["order"] }] }, () => false, false)).toEqual([{ label: "order", pairs: [["a", "casa"]] }]);
  });

  it("an accepted answer gets no label line: a slip is its headline's", () => {
    const typo: Outcome = { verdict: "CORRECT_WITH_TYPO", notes: [], solution, alignment: [alignment[3] as AlignOp], closestIsSolution: true, labels: ["slip"] };
    const html = render(<Feedback ex={ex} outcome={typo} course={es} ruby={false} marks="show" />);
    expect(linesOf(html)).toEqual([]);
    expect(html).toContain("Correct, but watch the typo.");
  });
});
