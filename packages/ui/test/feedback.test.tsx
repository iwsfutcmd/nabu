import type { AlignOp } from "@nabu/core";
import { allSentences, createGrader, gradeExercise, sampleExercise, seededRng, start, step, type Exercise, type Outcome, type PlayerEvent, type PlayerState, type Response, type TranslateType } from "@nabu/core/lesson";
import { allStories, storyScript } from "@nabu/core/story";
import { surfaceOf } from "@nabu/core/text";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { Feedback } from "../src/player/Feedback.tsx";
import { LessonPlayer } from "../src/player/LessonPlayer.tsx";
import { loadCourse } from "./course.ts";
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
const course = loadCourse("yue");
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
  const esCourse = loadCourse("es");
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
    expect(html).not.toMatch(/[\u2068\u2069]/u);
  });

  it("says the plain note when no unit carries it", () => {
    const plain = wrongWords.alignment?.map((op): AlignOp => (op.op === "match" ? { op: "match", expected: op.expected, actual: op.actual, kind: op.kind } : op));
    const html = render(<Feedback ex={card} outcome={{ ...wrongWords, alignment: plain }} course={esCourse} ruby={false} marks="show" />);
    expect(html.split('data-note="accent-word"')).toHaveLength(2);
    expect(html).toContain("The accent mark makes it another word");
  });
});

describe("what was wrong, and what a wrong word means (P3)", () => {
  const es = loadCourse("es");
  const grader = createGrader(es);
  /** A translate-type card for the first sentence of the course `pick` takes, as the planner makes one. */
  const typedCard = (pick: (id: string, text: string) => boolean): TranslateType => {
    const s = allSentences(es).find((x) => {
      const form = x.forms[es.orthography];
      return x.production && form?.reverse !== undefined && pick(x.id, surfaceOf(form.text));
    });
    const form = s?.forms[es.orthography];
    const translation = s?.translations[es.supportKey];
    if (s === undefined || form?.reverse === undefined || translation === undefined) throw new Error("es has no such sentence");
    return { template: "translate-type.l1-l2", id: `translate-type.l1-l2:${s.id}`, item: s.id, kcs: s.kcs, orthography: es.orthography, prompt: translation.text, accept: form.reverse, canonical: form.text };
  };
  // ¿Tú tienes hambre?
  const hungry = typedCard((id) => id === "s.u04.29");
  const feedbackOf = (ex: Exercise, response: Response): string => render(<Feedback ex={ex} outcome={gradeExercise(ex, response, grader)} response={response} course={es} ruby={false} marks="show" />);
  /** The block of the feedback that `marker` opens (a solution, the answer), up to its end. */
  const block = (html: string, marker: string): string => {
    const at = html.indexOf(marker);
    return at < 0 ? "" : html.slice(at, html.indexOf("</div>", at));
  };
  const meaningsOf = (html: string): string => (html.includes("data-meanings") ? html.slice(html.indexOf("data-meanings")) : "");

  it("a word left out: a gap in the answer where it goes, named for screen readers, and the word marked in the solution", () => {
    const html = feedbackOf(hungry, { tag: "text", text: "Tú hambre" });
    const answer = block(html, "data-answer-diff");
    expect(answer).toContain("Your answer:");
    expect(answer).toMatch(/role="img" aria-label="Left out" data-answer-gap=""/u);
    // The answer on either side of the gap, each run in its own language, in the answer's direction.
    expect(answer).toMatch(/<p dir="ltr" data-marked-answer="">/u);
    expect(answer.match(/lang="es-Latn-CU"/gu)).toHaveLength(2);
    expect(block(html, "data-solution")).toContain('data-highlight="true">tienes</span>');
  });

  it("a missing accent is marked in the answer and in the solution", () => {
    const age = typedCard((id) => id === "s.u05.25");
    const html = feedbackOf(age, { tag: "text", text: "Yasiel tambien tiene veinticuatro años" });
    expect(html).toContain('data-verdict="CORRECT_MARKS"');
    expect(block(html, "data-answer-diff")).toContain('data-highlight="true">tambien</span>');
    expect(block(html, "data-solution")).toContain('data-highlight="true">también</span>');
    expect(meaningsOf(html)).toBe("");
  });

  it("a word put in place of another: what it means, and the form it is pinned as (hablas for hablo)", () => {
    const card = typedCard((_, text) => / hablo /u.test(text));
    const html = feedbackOf(card, { tag: "text", text: surfaceOf(card.canonical).replace(" hablo ", " hablas ") });
    expect(block(html, "data-answer-diff")).toContain('data-highlight="true">hablas</span>');
    const meanings = meaningsOf(html);
    expect(meanings).toContain("What the marked word means:");
    expect(meanings).toMatch(/data-gloss-kc="sense:hablar"><dt>.*>hablas<.*<\/dt><dd>.*>speak</su);
    expect(meanings).toMatch(/data-gloss-form="form:pres-2s">.*>you<.*>tú</su);
  });

  it("marks that make another word: what that word means (Tu for Tú)", () => {
    const html = feedbackOf(hungry, { tag: "text", text: "Tu tienes hambre" });
    expect(html).toContain('data-verdict="WRONG_WORD"');
    expect(meaningsOf(html)).toMatch(/data-gloss-kc="sense:tu"><dt>.*<\/dt><dd>.*>your</su);
  });

  it("a wrong choice among words of the course: what the chosen word means; nothing for a right one", () => {
    const gap = Array.from({ length: 30 }, (_, seed) => sampleExercise(es, "gap-fill", seed + 1)).find((c) => c?.template === "gap-fill" && c.asks === "word");
    if (gap?.template !== "gap-fill") throw new Error("es has a gap-fill card that asks which word");
    const wrong = (gap.answer + 1) % gap.options.length;
    const meanings = meaningsOf(feedbackOf(gap, { tag: "choice", index: wrong }));
    expect(meanings).toContain("What you chose means:");
    expect(meanings).toContain(`>${surfaceOf(gap.options[wrong] as TaggedText)}<`);
    expect(meanings).toMatch(/data-gloss-kc="sense:/u);
    expect(meaningsOf(feedbackOf(gap, { tag: "choice", index: gap.answer }))).toBe("");
  });

  it("a wrong choice: what the right word means too, before what the chosen one means", () => {
    // A gap whose right and chosen options are words of different senses.
    const senseOf = (text: TaggedText | undefined): string | undefined => text?.tokens.find((tk) => tk.kind === "word")?.sense;
    const cards = Array.from({ length: 30 }, (_, seed) => sampleExercise(es, "gap-fill", seed + 1));
    const gap = cards.find((c) => c?.template === "gap-fill" && c.asks === "word" && senseOf(c.options[c.answer]) !== undefined && senseOf(c.options[(c.answer + 1) % c.options.length]) !== undefined && senseOf(c.options[c.answer]) !== senseOf(c.options[(c.answer + 1) % c.options.length]));
    if (gap?.template !== "gap-fill") throw new Error("es has a gap-fill card of two senses");
    const chosen = (gap.answer + 1) % gap.options.length;
    const html = feedbackOf(gap, { tag: "choice", index: chosen });
    const right = block(html, 'data-meanings="right"');
    expect(right).toContain("The right word means:");
    expect(right).toContain(`data-gloss-kc="sense:${senseOf(gap.options[gap.answer]) ?? ""}"`);
    expect(block(html, 'data-meanings="chosen"')).toContain(`data-gloss-kc="sense:${senseOf(gap.options[chosen]) ?? ""}"`);
    expect(html.indexOf('data-meanings="right"')).toBeLessThan(html.indexOf('data-meanings="chosen"'));
    // A right choice: no meanings at all.
    expect(feedbackOf(gap, { tag: "choice", index: gap.answer })).not.toContain("data-meanings");
  });

  it("a wrong form (ADR 0132): what each form says, the right one first; not the word's meaning, the same in both", () => {
    const chg = loadCourse("chg");
    const chgGrader = createGrader(chg);
    const gap = allStories(chg)
      .flatMap((story) => storyScript(chg, story, seededRng(1)).steps)
      .flatMap((st) => (st.tag === "question" && st.ex.template === "story-complete" && st.ex.asks === "form" ? [st.ex] : []))[0];
    if (gap === undefined) throw new Error("chg has a story question that asks which form");
    const chosen = (gap.answer + 1) % gap.options.length;
    const response: Response = { tag: "choice", index: chosen };
    const html = render(<Feedback ex={gap} outcome={gradeExercise(gap, response, chgGrader)} response={response} course={chg} ruby={false} marks="show" />);
    // Each form is an entry of its own (a div), so the block runs to the end of the feedback.
    const forms = meaningsOf(html);
    expect(forms.startsWith('data-meanings="forms"')).toBe(true);
    expect(forms).toContain("What each form says:");
    expect(forms).toMatch(/data-gloss-form="form:/u);
    const right = surfaceOf(gap.options[gap.answer] as TaggedText);
    const wrong = surfaceOf(gap.options[chosen] as TaggedText);
    expect(forms.indexOf(`>${right}<`)).toBeGreaterThan(-1);
    expect(forms.indexOf(`>${right}<`)).toBeLessThan(forms.indexOf(`>${wrong}<`));
    expect(html).not.toContain('data-meanings="chosen"');
    expect(html).not.toContain('data-meanings="right"');
    expect(render(<Feedback ex={gap} outcome={gradeExercise(gap, { tag: "choice", index: gap.answer }, chgGrader)} response={{ tag: "choice", index: gap.answer }} course={chg} ruby={false} marks="show" />)).not.toContain("data-meanings");
  });

  it("no meaning where the options are translations", () => {
    const choose = sampleExercise(es, "choose-translation", 1);
    if (choose?.template !== "choose-translation") throw new Error("es has a choose-translation card");
    expect(meaningsOf(feedbackOf(choose, { tag: "choice", index: (choose.answer + 1) % choose.options.length }))).toBe("");
  });

  it("the end of a session shows a missed card's answer and solution as its feedback marked them", () => {
    let state: PlayerState = start("lesson", [hungry])[0];
    const send = (event: PlayerEvent): void => {
      const [next, effects] = step(state, event);
      state = next;
      for (const e of effects) if (e.tag === "grade") send({ tag: "graded", outcome: gradeExercise(e.ex, e.response, grader) });
    };
    // Wrong the first time, a word left out; right when it comes back.
    for (const text of ["Tú hambre", surfaceOf(hungry.canonical)]) {
      send({ tag: "ready" });
      send({ tag: "input", draft: { tag: "text", text } });
      send({ tag: "submit" });
      send({ tag: "continue" });
    }
    expect(state.tag).toBe("finished");
    const html = render(<LessonPlayer course={es} lessonId="lesson" exercises={[hungry]} grader={grader} imageUrl={(p) => p} language="Spanish" initialState={state} sound={false} />);
    const missed = html.slice(html.indexOf("data-missed="));
    expect(block(missed, "data-your-answer")).toContain('data-answer-gap=""');
    expect(block(missed, "data-solution")).toContain('data-highlight="true">tienes</span>');
  });
});

describe("a right answer typed where readings are shown", () => {
  const right: Outcome = { verdict: "CORRECT", notes: [], solution, closestIsSolution: true };
  const typed: Response = { tag: "text", text: "我嘅書呢？" };

  it("shows the sentence again with its readings: the field shows only what was typed", () => {
    const html = render(<Feedback ex={ex} outcome={right} response={typed} course={course} ruby={JYUTPING} marks="show" />);
    expect(html).toContain("data-solution");
    expect(html).toContain("呢<rt>ne1</rt>");
    // No "Correct answer:" label: it is the learner's own answer.
    expect(html).not.toContain("Correct answer:");
  });

  it("shows nothing more with the readings off, or for an answer of tiles (they show their readings)", () => {
    expect(render(<Feedback ex={ex} outcome={right} response={typed} course={course} ruby={false} marks="show" />)).not.toContain("data-solution");
    const tiles: Response = { tag: "tiles", order: [0, 1, 2, 3] };
    expect(render(<Feedback ex={ex} outcome={right} response={tiles} course={course} ruby={JYUTPING} marks="show" />)).not.toContain("data-solution");
  });
});
