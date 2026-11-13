import type { AlignOp } from "@nabu/core";
import type { Exercise, Outcome } from "@nabu/core/lesson";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { Feedback } from "../src/player/Feedback.tsx";
import { render } from "./render.tsx";

const JYUTPING = "jyutping" as SchemeId;
const ORTH = "yue-Hant-HK/standard";
const yue = (tokens: TaggedText["tokens"]): TaggedText => ({ lang: "yue-Hant-HK" as TaggedText["lang"], orthography: ORTH as TaggedText["orthography"], tokens });
const word = (surface: string, jyutping: string): TaggedText["tokens"][number] => {
  const syllables = jyutping.split(" ");
  return { surface, kind: "word", readings: { [JYUTPING]: jyutping }, ruby: { [JYUTPING]: [...surface].map((base, i) => ({ base, text: syllables[i] ?? "" })) } };
};
// "Where's my book?": the solution is 我嘅書呢？, and 我嘅書喺邊度呀 is accepted too.
const solution = yue([word("我", "ngo5"), word("嘅", "ge3"), word("書", "syu1"), word("呢", "ne1"), { surface: "？", kind: "punct" }]);
const course = { profiles: new Map([[ORTH, { unitKind: "grapheme" }]]) } as never;
const ex = { template: "translate-type", orthography: ORTH } as unknown as Exercise;
const m = (expected: string): AlignOp => ({ op: "match", expected, actual: expected, kind: "exact" });

describe("feedback on a wrong answer nearer another accepted wording", () => {
  // The learner wrote 我嘅書邊度呀: one character from 我嘅書喺邊度呀 (a location question takes 喺).
  const outcome: Outcome = {
    verdict: "WRONG",
    notes: [],
    solution,
    alignment: [m("我"), m("嘅"), m("書"), { op: "delete", expected: "喺" }, m("邊"), m("度"), m("呀")],
    closestIsSolution: false,
  };

  it("shows the solution with its readings, then that wording as the nearest correct version, what was left out marked", () => {
    const html = render(<Feedback ex={ex} outcome={outcome} course={course} ruby={JYUTPING} marks="show" />);
    const closest = html.slice(html.indexOf("data-closest"));
    expect(closest).toContain("Nearest correct version:");
    expect(closest).toContain('data-highlight="true">喺</span>');
    expect(html.indexOf("呢<rt>ne1</rt>")).toBeLessThan(html.indexOf("data-closest"));
    for (const ch of "我嘅書喺邊度呀？") expect(closest).toContain(`>${ch}<`);
  });

  it("shows the solution alone when the answer was nearest the solution itself", () => {
    const html = render(<Feedback ex={ex} outcome={{ ...outcome, closestIsSolution: true }} course={course} ruby={JYUTPING} marks="show" />);
    expect(html).not.toContain("data-closest");
    expect(html).toContain("呢<rt>ne1</rt>");
  });

  it("shows the solution alone when the answer is far from every wording (W3)", () => {
    // Two characters of the wording's seven: it lines up with it, but explains nothing.
    const far: Outcome = {
      ...outcome,
      alignment: [m("我"), { op: "substitute", expected: "嘅", actual: "係" }, { op: "substitute", expected: "書", actual: "貓" }, { op: "delete", expected: "喺" }, { op: "delete", expected: "邊" }, { op: "delete", expected: "度" }, m("呀")],
    };
    const html = render(<Feedback ex={ex} outcome={far} course={course} ruby={JYUTPING} marks="show" />);
    expect(html).not.toContain("data-closest");
    expect(html).toContain("呢<rt>ne1</rt>");
  });
});

describe("a note about the words an answer's marks made into others (W4)", () => {
  const ES = "es-Latn/standard";
  const es = (surfaces: readonly string[]): TaggedText => ({
    lang: "es-Latn-CU" as TaggedText["lang"],
    orthography: ES as TaggedText["orthography"],
    tokens: surfaces.map((surface) => ({ surface, kind: surface === "¿" || surface === "?" ? "punct" : surface === " " ? "space" : "word" })),
  });
  const esCourse = { profiles: new Map([[ES, { unitKind: "token" }]]) } as never;
  const card = { template: "translate-type.l1-l2", orthography: ES } as unknown as Exercise;
  // ¿Como esta usted? for ¿Cómo está usted?: both words are words of the course.
  const wrongWords: Outcome = {
    verdict: "WRONG_WORD",
    notes: ["accent-word"],
    solution: es(["¿", "Cómo", " ", "está", " ", "usted", "?"]),
    alignment: [
      { op: "match", expected: "Cómo", actual: "Como", kind: "fold", folds: ["marks"], note: "accent-word" },
      { op: "match", expected: "está", actual: "esta", kind: "fold", folds: ["marks"], note: "accent-word" },
      { op: "match", expected: "usted", actual: "usted", kind: "exact" },
    ],
    closestIsSolution: true,
  };

  it("names each pair, the words in their own language, instead of a canned example", () => {
    const html = render(<Feedback ex={card} outcome={wrongWords} course={esCourse} ruby={false} marks="show" />);
    const items = html.split('data-note="accent-word"').slice(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatch(/lang="es-Latn-CU"[^>]*>.*Cómo.*<\/span> and .*lang="es-Latn-CU"[^>]*>.*Como.*are different words/su);
    expect(items[1]).toContain("está");
    expect(items[1]).toContain("esta");
    expect(html).not.toContain("“is”");
    // The words are isolated by <T>, not by the message's own isolation marks.
    expect(html).not.toMatch(/[⁨⁩]/u);
  });

  it("says the plain note when no unit carries it", () => {
    const plain = wrongWords.alignment?.map((op): AlignOp => (op.op === "match" ? { op: "match", expected: op.expected, actual: op.actual, kind: op.kind } : op));
    const html = render(<Feedback ex={card} outcome={{ ...wrongWords, alignment: plain }} course={esCourse} ruby={false} marks="show" />);
    expect(html.split('data-note="accent-word"')).toHaveLength(2);
    expect(html).toContain("The accent mark makes it another word");
  });
});
