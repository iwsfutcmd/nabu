import type { SchemeId, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import {
  allSentences,
  cardGallery,
  countsAs,
  createGrader,
  gradeExercise,
  cameBack,
  isCorrect,
  isRetry,
  lessonNodes,
  LISTENING,
  missedOf,
  placedBy,
  progressOf,
  promptOf,
  responseOf,
  retryOf,
  runTest,
  seededRng,
  solutionOf,
  start,
  step,
  summarize,
  TEMPLATES,
  type CourseView,
  type Effect,
  type Exercise,
  type PlayerEvent,
  type PlayerState,
  type Response,
  type TemplateId,
} from "../src/lesson/index.ts";
import { pathNodes } from "../src/learner/path.ts";
import { placementTest } from "../src/learner/placement.ts";
import { makeMatchPairs, makeReadingDisambiguation, makeTapL1L2, makeTapL2L1, makeTranslateType, SENTENCE_TEMPLATES } from "../src/lesson/templates.ts";
import { closestAnswer, nearMiss } from "../src/lesson/diff.ts";
import { surfaceOf } from "../src/text/index.ts";
import { rightAnswer, wrongAnswer } from "./answers.ts";
import { loadCourse } from "./learner-fixtures.ts";
import { lessonAt, walkPath } from "./planned.ts";

const VARIANTS: readonly (readonly [string, string | undefined])[] = [
  ["fa", undefined],
  ["yue", undefined],
  ["uz", "uz-Latn/standard"],
  ["uz", "uz-Cyrl/standard"],
  ["apc", "apc-Arab/standard"],
  ["apc", "apc-Latn/arabizi"],
];

describe.each(VARIANTS)("tiles: %s %s", (id, orthography) => {
  const course = loadCourse(id, orthography);
  const grader = createGrader(course);
  // Every sentence, not a lesson's sample: tiles in their order are right in both directions,
  // also where the words are joined by a hyphen or a maqaf alone (מִן־הַגָּן).
  it("grades every sentence's tiles, put in order, as right", () => {
    const ctx = { course, rng: seededRng(3), introduced: [] };
    for (const s of course.units.flatMap((u) => u.sentences)) {
      for (const ex of [makeTapL1L2(ctx, s), makeTapL2L1(ctx, s)]) {
        if (ex === undefined) continue;
        const right = gradeExercise(ex, { tag: "tiles", order: ex.solution }, grader);
        expect(isCorrect(right.verdict), `${ex.id}: ${right.verdict} ${JSON.stringify(right.notes)}`).toBe(true);
      }
    }
  }, 60_000);
});

describe("matching pairs", () => {
  const key = (t: TaggedText): string => surfaceOf(t).normalize("NFC").toLocaleLowerCase("und").replace(/[\p{P}\s]+/gu, " ").trim();
  const distinct = (texts: readonly TaggedText[]): boolean => new Set(texts.map(key)).size === texts.length;

  it("keeps synonyms glossed alike apart: Classical Chinese 汝 and 爾 are both \"you\"", () => {
    const course = loadCourse("lzh");
    const kcs = course.units.flatMap((u) => u.kcs);
    const you = kcs.filter((k) => k.id === "sense:汝" || k.id === "sense:爾");
    expect(you.map((k) => k.gloss?.["en"] === undefined ? "" : surfaceOf(k.gloss["en"]))).toEqual(["you", "you"]);
    const others = kcs.filter((k) => ["sense:吾", "sense:其", "sense:誰", "sense:何"].includes(k.id));
    for (let seed = 1; seed <= 40; seed++) {
      const ex = makeMatchPairs({ course, rng: seededRng(seed), introduced: [] }, [...you, ...others]);
      if (ex === undefined) throw new Error("no pairs");
      expect(ex.kcs.filter((k) => k === "sense:汝" || k === "sense:爾").length).toBeLessThanOrEqual(1);
      expect(distinct(ex.right)).toBe(true);
    }
  });
});

describe("the card gallery (debug mode)", () => {
  it("has one card of every kind a course can make, story questions aside", () => {
    for (const [id, orthography] of [["yue", undefined], ["fa", undefined], ["uz", "uz-Latn/standard"], ["apc", "apc-Arab/standard"]] as const) {
      const course = loadCourse(id, orthography);
      const gallery = cardGallery(course, 3);
      expect(gallery.some((c) => c.template.startsWith("story-"))).toBe(false);
      expect(new Set(gallery.map((c) => c.template)).size).toBe(gallery.length);
      for (const card of gallery) if (card.exercise !== undefined) expect(card.exercise.template).toBe(card.template);
      const made = new Set(gallery.flatMap((c) => (c.exercise === undefined ? [] : [c.template])));
      for (const t of ["match-pairs", "choose-translation", "translate-tap.l2-l1", "translate-tap.l1-l2", "translate-type.l1-l2", "gap-fill", "speak.tier-0"]) expect(made.has(t as never), `${id} ${t}`).toBe(true);
      if (id === "yue") for (const t of ["char-read", "speak", "listen-speak"]) expect(made.has(t as never), `yue ${t}`).toBe(true);
    }
  });
});

describe("who speaks and who is spoken to (persons)", () => {
  it("goes with the exercises that write the sentence in the target language, and only those", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const words = (s: (typeof course.units)[number]["sentences"][number]): number => s.forms["apc-Arab/standard"]?.text.tokens.filter((t) => t.kind === "word").length ?? 0;
    const sentence = allSentences(course).find((s) => s.production && words(s) >= 2);
    if (sentence === undefined) throw new Error("no apc sentence");
    // The blank in complete-translation is a word the lesson introduces.
    const ctx = { course, rng: seededRng(5), introduced: sentence.kcs };
    const tagged = { ...sentence, persons: { addressee: "f" as const, speaker: "m" as const } };
    for (const template of ["translate-type.l1-l2", "translate-tap.l1-l2", "complete-translation", "gap-fill"] as const) {
      const ex = SENTENCE_TEMPLATES[template]?.(ctx, tagged);
      expect(ex && "persons" in ex ? ex.persons : undefined, template).toEqual({ addressee: "f", speaker: "m" });
    }
    // Reading the target into the support language: the target text shows it already.
    const reading = SENTENCE_TEMPLATES["translate-tap.l2-l1"]?.(ctx, tagged);
    expect(reading && "persons" in reading ? reading.persons : undefined).toBeUndefined();
    // Untagged: nothing.
    const plain = SENTENCE_TEMPLATES["translate-type.l1-l2"]?.(ctx, sentence);
    expect(plain && "persons" in plain).toBe(false);
  });

  it("tells the gap-fill which you: 'Do you want anything?' to several people is بدكن, not بدّك", () => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const s = allSentences(course).find((x) => x.id === "s.like.33");
    if (s === undefined) throw new Error("no s.like.33");
    const ex = SENTENCE_TEMPLATES["gap-fill"]?.({ course, rng: seededRng(1), introduced: s.kcs }, s);
    expect(ex?.template).toBe("gap-fill");
    expect(ex && "persons" in ex ? ex.persons : undefined).toEqual({ addressee: "pl" });
  });
});

describe("rng", () => {
  it("is seeded and uniform-ish", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const xs = Array.from({ length: 1000 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length - 0.5)).toBeLessThan(0.05);
  });
});

// ------------------------------------------------------------------------------------ player

/** Runs a shell: executes grade effects with the real grader, collects the rest. */
const run = (course: CourseView, state: PlayerState, events: readonly PlayerEvent[]) => {
  const grader = createGrader(course);
  const effects: Effect[] = [];
  let s = state;
  const dispatch = (e: PlayerEvent): void => {
    const [next, fx] = step(s, e);
    s = next;
    for (const f of fx) {
      effects.push(f);
      if (f.tag === "grade") dispatch({ tag: "graded", outcome: gradeExercise(f.ex, f.response, grader) });
    }
  };
  for (const e of events) dispatch(e);
  return { state: s, effects, dispatch, get: () => s };
};

const answer = (ex: Exercise, response: Response): PlayerEvent[] => {
  switch (response.tag) {
    case "choice":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "choice", index: response.index } }, { tag: "submit" }];
    case "tiles":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "tiles", order: response.order } }, { tag: "submit" }];
    case "text":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "text", text: response.text } }, { tag: "submit" }];
    case "pairs":
      return [
        { tag: "ready" },
        { tag: "input", draft: { tag: "pairs", matched: ex.template === "match-pairs" ? ex.left.map((_, i) => i) : [], mistakes: response.mistakes } },
        { tag: "submit" },
      ];
    case "self-rating":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "self-rating", rating: response.rating } }, { tag: "submit" }];
    case "speech":
      return [{ tag: "ready" }, { tag: "input", draft: { tag: "speech", result: response.result } }, { tag: "submit" }];
  }
};

/**
 * Persian's first four lessons as plan() plans them for a learner who takes them in order: the player
 * plays the third, and the end of a session goes over cards of all four.
 */
const faWalk = walkPath(loadCourse("fa"), { lessons: 4 });

describe("player", () => {
  const course = loadCourse("fa");
  const node = lessonNodes(course)[2]?.node.id as string;
  const lesson = lessonAt(faWalk, node);

  it("plays a lesson of right answers to the end", () => {
    const [s0, fx0] = start(node, lesson);
    const shell = run(course, s0, []);
    for (const ex of lesson) {
      for (const e of [...answer(ex, rightAnswer(ex)), { tag: "continue" } as const]) shell.dispatch(e);
    }
    const end = shell.get();
    expect(end.tag).toBe("finished");
    if (end.tag !== "finished") return;
    // A self-rating is no verdict (ADR 0099): the score leaves a self-rated speaking card out.
    const graded = lesson.filter((e) => TEMPLATES[e.template].selfRated !== true).length;
    expect(end.summary).toEqual({ completed: true, exercises: graded, correctFirstTry: graded, retries: 0, skipped: 0 });
    const types = [...fx0, ...shell.effects].flatMap((f) => (f.tag === "emit" ? [f.event.type] : []));
    expect(types[0]).toBe("session_started");
    expect(types.filter((t) => t === "answer_submitted")).toHaveLength(lesson.length);
    expect(types.at(-1)).toBe("session_completed");
  });

  it("brings a mistake back at the end of the lesson", () => {
    const first = lesson.find((e) => e.template !== "speak.tier-0" && e.template !== "match-pairs" && wrongAnswer(e)?.tag === "choice") as Exercise;
    const [s0] = start(node, [first]);
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "continue" }]);
    const s = shell.get();
    expect(s.tag).toBe("presenting");
    if (s.tag !== "presenting") return;
    expect(s.ex.id).toBe(`${first.id}#2`);
    // It comes back in a new order (P4), and says why.
    expect(s.ex).toEqual(retryOf(first, 2));
    expect(isRetry(s.ex)).toBe(true);
    expect(isRetry(first)).toBe(false);
    expect(cameBack(s.session, s.ex)).toBe("missed");
    expect(cameBack(s.session, first)).toBeUndefined();
    for (const e of [...answer(s.ex, rightAnswer(s.ex)), { tag: "continue" } as const]) shell.dispatch(e);
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 1, correctFirstTry: 0, retries: 1, skipped: 0 });
  });

  it("brings a skipped card back as skipped, not as a mistake", () => {
    const first = lesson.find((e) => e.template !== "speak.tier-0" && e.template !== "match-pairs") as Exercise;
    const [s0] = start(node, [first]);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "skip", reason: "skip" }, { tag: "continue" }]);
    const s = shell.get();
    expect(s.tag === "presenting" && cameBack(s.session, s.ex)).toBe("skipped");
  });

  describe("a card that comes back (P4)", () => {
    const shown = (texts: readonly TaggedText[]): readonly string[] => texts.map((t) => surfaceOf(t));
    const cards = [...VARIANTS.map(([id, orthography]) => loadCourse(id, orthography)), loadCourse("es")].flatMap((c) =>
      cardGallery(c, 7).flatMap((g) => (g.exercise === undefined ? [] : [g.exercise])),
    );

    it("has its options in a new order, the answer elsewhere, and is the same every time", () => {
      let checked = 0;
      for (const ex of cards) {
        if (!("options" in ex) || !("answer" in ex) || ex.options.length < 2) continue;
        const again = retryOf(ex, 2);
        if (!("options" in again) || !("answer" in again)) throw new Error(ex.id);
        const text = (o: (typeof ex.options)[number]): string => surfaceOf("image" in o ? o.text : o);
        expect(again.id, ex.id).toBe(`${ex.id}#2`);
        expect([...again.options.map(text)].sort(), ex.id).toEqual([...ex.options.map(text)].sort());
        expect(text(again.options[again.answer] as (typeof ex.options)[number]), ex.id).toBe(text(ex.options[ex.answer] as (typeof ex.options)[number]));
        expect(again.answer, ex.id).not.toBe(ex.answer);
        expect(retryOf(ex, 2), ex.id).toEqual(again);
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
    });

    it("has its tiles in a new order that spells the same answer", () => {
      let checked = 0;
      for (const ex of cards) {
        if (!("tiles" in ex) || ex.tiles.length < 2) continue;
        const again = retryOf(ex, 3);
        if (!("tiles" in again)) throw new Error(ex.id);
        expect(again.id, ex.id).toBe(`${ex.id}#3`);
        expect([...shown(again.tiles)].sort(), ex.id).toEqual([...shown(ex.tiles)].sort());
        expect(shown(again.tiles), ex.id).not.toEqual(shown(ex.tiles));
        expect(again.solution.map((i) => surfaceOf(again.tiles[i] as TaggedText)), ex.id).toEqual(ex.solution.map((i) => surfaceOf(ex.tiles[i] as TaggedText)));
        checked++;
      }
      expect(checked).toBeGreaterThan(10);
    });

    it("keeps a typed question as it was, under its new id", () => {
      const typed = cards.find((e) => e.template === "translate-type.l1-l2") as Exercise;
      expect(retryOf(typed, 2)).toEqual({ ...typed, id: `${typed.id}#2` });
    });
  });

  it("never moves the progress bar back, and counts a card done once it is right (P4)", () => {
    const misses = lesson.filter((e) => wrongAnswer(e)?.tag === "choice" && e.template !== "speak.tier-0").slice(0, 2);
    expect(misses.length).toBe(2);
    const [s0] = start(node, lesson);
    const shell = run(course, s0, []);
    const missed = new Set(misses.map((e) => e.id));
    const seen: { done: number; total: number }[] = [progressOf(shell.get())];
    for (let s = shell.get(); s.tag !== "finished"; s = shell.get()) {
      if (s.tag !== "presenting") throw new Error(`unexpected ${s.tag}`);
      const response = missed.delete(s.ex.id) ? (wrongAnswer(s.ex) as Response) : rightAnswer(s.ex);
      for (const e of answer(s.ex, response)) shell.dispatch(e);
      seen.push(progressOf(shell.get()));
      shell.dispatch({ tag: "continue" });
      seen.push(progressOf(shell.get()));
    }
    // The lesson's cards, once each, however many came back.
    expect(seen.every((p) => p.total === lesson.length)).toBe(true);
    expect(seen.map((p) => p.done)).toEqual([...seen.map((p) => p.done)].sort((a, b) => a - b));
    expect(seen.at(0)?.done).toBe(0);
    expect(seen.at(-1)).toEqual({ done: lesson.length, total: lesson.length });
    // A miss leaves the bar where it was: two of the steps answered moved nothing.
    const answered = seen.filter((_, i) => i % 2 === 1).map((p, i) => p.done - (seen[2 * i]?.done ?? 0));
    expect(answered.filter((d) => d === 0)).toHaveLength(2);
  });

  it("asks each question once when retries are off (placement)", () => {
    const first = lesson.find((e) => e.template !== "speak.tier-0" && e.template !== "match-pairs" && wrongAnswer(e)?.tag === "choice") as Exercise;
    const [s0] = start(node, [first], { retries: false });
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "continue" }]);
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 1, correctFirstTry: 0, retries: 0, skipped: 0 });
  });

  it("asks an adaptive test as its answers decide (placement, ADR 0077)", () => {
    const test = placementTest(course, 4).test;
    const units = test.blocks.map((b) => b.id);
    const unitOf = new Map(course.units.flatMap((u) => u.sentences.map((x) => [x.id, u.id] as const)));
    // A learner who knows the first two units.
    const knows = (ex: Exercise): boolean => units.indexOf(unitOf.get(ex.item) ?? "") < 2;
    const [s0] = start("placement", runTest(test, new Map()).next, { adaptive: test });
    const shell = run(course, s0, []);
    const progress: number[] = [];
    for (let s = shell.get(); s.tag !== "finished"; s = shell.get()) {
      if (s.tag !== "presenting") throw new Error(`unexpected ${s.tag}`);
      const response = knows(s.ex) ? rightAnswer(s.ex) : (wrongAnswer(s.ex) as Response);
      for (const e of [...answer(s.ex, response), { tag: "continue" } as const]) shell.dispatch(e);
      progress.push(progressOf(shell.get()).total);
    }
    const end = shell.get();
    if (end.tag !== "finished") return;
    const answers = new Map(end.session.results.map((r) => [r.exercise, isCorrect(r.verdict)]));
    expect(answers.size).toBe(end.session.queue.length);
    expect(end.summary.exercises).toBe(end.session.queue.length);
    expect(end.summary.retries).toBe(0);
    expect(placedBy(test, answers)).toEqual(pathNodes(course).filter((n) => units.indexOf(n.unit.id) < 2).map((n) => n.node.id));
    expect(progressOf(end)).toEqual({ done: end.session.queue.length, total: end.session.queue.length });
    expect(progress.every((t) => t >= 1)).toBe(true);
  });

  describe("IME composition (§6.7, ADR 0118)", () => {
    const typed = lesson.find((e) => e.template === "translate-type.l1-l2") ?? lesson.find((e) => TEMPLATES[e.template].modality.input === "text");
    const ex = typed as Exercise;
    const settled = ex.template === "complete-translation" ? surfaceOf(ex.blank) : ex.template === "translate-type.l1-l2" ? surfaceOf(ex.canonical) : "";
    /** Typing under an IME: composition begins and the field shows the text being composed. */
    const composing = (text: string): PlayerEvent[] => [{ tag: "ready" }, { tag: "compositionstart" }, { tag: "input", draft: { tag: "text", text } }];
    const graded = (effects: readonly Effect[]): Response[] => effects.flatMap((f) => (f.tag === "grade" ? [f.response] : []));
    const waiting = (s: PlayerState): boolean => s.tag === "answering" && s.queued;

    it("has a typing card to test", () => {
      expect(typed).toBeDefined();
      expect(settled).not.toBe("");
    });

    it("never submits mid-composition: Check then waits, and goes ahead with the settled text", () => {
      const [s0] = start(node, [ex]);
      const shell = run(course, s0, [...composing("ک"), { tag: "submit" }]);
      const mid = shell.get();
      expect(mid.tag === "answering" && mid.composing).toBe(true);
      expect(waiting(mid)).toBe(true);
      expect(graded(shell.effects)).toEqual([]);
      // More of the same composition (the commit's own input event) leaves the Check waiting.
      shell.dispatch({ tag: "input", draft: { tag: "text", text: settled } });
      expect(graded(shell.effects)).toEqual([]);
      // The keyboard commits: the text it settles is what is graded, once.
      shell.dispatch({ tag: "compositionend", text: settled });
      expect(graded(shell.effects)).toEqual([{ tag: "text", text: settled }]);
      const after = shell.get();
      expect(after.tag).toBe("feedback");
      expect(after.tag === "feedback" && isCorrect(after.outcome.verdict)).toBe(true);
    });

    it("submits nothing when a composition ends without a Check (an IME's Enter, a tapped candidate)", () => {
      const [s0] = start(node, [ex]);
      const shell = run(course, s0, [...composing("ngo"), { tag: "compositionend", text: settled }]);
      const s = shell.get();
      expect(s.tag === "answering" && !s.composing && s.draft).toEqual({ tag: "text", text: settled });
      expect(waiting(s)).toBe(false);
      expect(graded(shell.effects)).toEqual([]);
      // Check after the commit submits at once.
      shell.dispatch({ tag: "submit" });
      expect(graded(shell.effects)).toEqual([{ tag: "text", text: settled }]);
    });

    it("drops a waiting Check when a new composition begins, and when the settled text is empty", () => {
      const [s0] = start(node, [ex]);
      // compositionend never came for the first composition; the learner composes again.
      const again = run(course, s0, [...composing("ngo"), { tag: "submit" }, { tag: "compositionstart" }]);
      expect(again.get().tag).toBe("answering");
      expect(waiting(again.get())).toBe(false);
      again.dispatch({ tag: "compositionend", text: settled });
      expect(again.get().tag).toBe("answering");
      expect(graded(again.effects)).toEqual([]);
      // A composition cancelled to nothing: the waiting Check has nothing to check.
      const empty = run(course, s0, [...composing("n"), { tag: "submit" }, { tag: "compositionend", text: "" }]);
      expect(empty.get().tag).toBe("answering");
      expect(waiting(empty.get())).toBe(false);
      expect(graded(empty.effects)).toEqual([]);
    });

    it("never skips mid-composition", () => {
      const [s0] = start(node, [ex]);
      const shell = run(course, s0, [...composing("ngo"), { tag: "skip", reason: "skip" }]);
      expect(shell.get().tag).toBe("answering");
      expect(shell.effects).toEqual([]);
    });
  });

  it("keeps the draft exactly as typed (no normalization while answering)", () => {
    const ex = lesson.find((e) => TEMPLATES[e.template].modality.input === "text") as Exercise;
    const raw = "  كي  "; // Arabic kaf and yeh, extra spaces: the grader folds them, the draft must not
    const [s0] = start(node, [ex]);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "input", draft: { tag: "text", text: raw } }]);
    const s = shell.get();
    expect(s.tag === "answering" && s.draft).toEqual({ tag: "text", text: raw });
    expect(responseOf(ex, { tag: "text", text: "   " })).toBeUndefined();
  });

  it("drops the rest of the speaking exercises after can't speak now", () => {
    const speaking = lesson.filter((e) => e.template === "speak.tier-0");
    const other = lesson.find((e) => e.template === "choose-translation" || e.template === "gap-fill") as Exercise;
    const exercises = speaking.length > 0 ? [speaking[0] as Exercise, other, { ...(speaking[0] as Exercise), id: "speak-again" }] : [];
    if (exercises.length === 0) return;
    const [s0] = start(node, exercises);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "skip", reason: "cant-speak" }]);
    const s = shell.get();
    expect(s.tag === "presenting" && s.ex.id).toBe(other.id);
    expect(s.session.queue.map((e) => e.id)).not.toContain("speak-again");
  });

  it("asks before quitting, and can resume", () => {
    const [s0] = start(node, lesson);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "interrupt", reason: "quit-confirm" }]);
    expect(shell.get().tag).toBe("interrupted");
    shell.dispatch({ tag: "resume" });
    expect(shell.get().tag).toBe("answering");
    shell.dispatch({ tag: "interrupt", reason: "quit-confirm" });
    shell.dispatch({ tag: "quit" });
    const end = shell.get();
    expect(end.tag === "finished" && end.summary.completed).toBe(false);
  });

  it("scores a stopped lesson or test over what was answered (P8)", () => {
    const answerable = lesson.filter((e) => e.template !== "speak.tier-0" && e.template !== "match-pairs");
    const [s0] = start(node, answerable);
    const shell = run(course, s0, []);
    for (const ex of answerable.slice(0, 2)) for (const e of [...answer(ex, rightAnswer(ex)), { tag: "continue" } as const]) shell.dispatch(e);
    shell.dispatch({ tag: "interrupt", reason: "quit-confirm" });
    shell.dispatch({ tag: "quit" });
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: false, exercises: 2, correctFirstTry: 2, retries: 0, skipped: 0 });
    // An adaptive test stopped after one question: one asked, not the queue it had planned.
    const test = placementTest(course, 4).test;
    const [t0] = start("placement", runTest(test, new Map()).next, { adaptive: test });
    const placement = run(course, t0, []);
    const first = placement.get();
    if (first.tag !== "presenting") throw new Error(first.tag);
    for (const e of [...answer(first.ex, rightAnswer(first.ex)), { tag: "continue" } as const]) placement.dispatch(e);
    placement.dispatch({ tag: "interrupt", reason: "quit-confirm" });
    placement.dispatch({ tag: "quit" });
    const stopped = placement.get();
    expect(stopped.tag === "finished" && stopped.summary.exercises).toBe(1);
  });
});

describe("an answer revised while the session runs (P14, ADR 0113)", () => {
  const course = loadCourse("fa");
  const node = lessonNodes(course)[2]?.node.id as string;
  const lesson = lessonAt(faWalk, node);
  const choices = lesson.filter((e) => e.template !== "speak.tier-0" && wrongAnswer(e)?.tag === "choice");
  const [first, second] = choices;
  if (first === undefined || second === undefined) throw new Error("the lesson needs two choice cards");
  const emitted = (effects: readonly Effect[]): readonly string[] => effects.flatMap((f) => (f.tag === "emit" ? [f.event.type] : []));

  it("a claim in the feedback counts the card right: it does not come back, and the score has it", () => {
    const [s0] = start(node, [first, second]);
    const shell = run(course, s0, answer(first, wrongAnswer(first) as Response));
    const before = shell.get();
    if (before.tag !== "feedback") throw new Error(before.tag);
    expect(progressOf(before).done).toBe(0);
    const [after, effects] = step(before, { tag: "revise", exercise: first.id, verdict: "CORRECT" });
    if (after.tag !== "feedback") throw new Error(after.tag);
    // The feedback still shows the grading; the answer counts as the claim says.
    expect(after.outcome.verdict).toBe("WRONG");
    expect(countsAs(after)).toBe("CORRECT");
    expect(progressOf(after).done).toBe(1);
    expect(effects).toEqual([{ tag: "emit", event: { type: "answer_revised", exercise: { id: first.id, template: first.template, item: first.item }, verdict: "CORRECT" } }]);
    shell.dispatch({ tag: "revise", exercise: first.id, verdict: "CORRECT" });
    for (const e of [{ tag: "continue" } as const, ...answer(second, rightAnswer(second)), { tag: "continue" } as const]) shell.dispatch(e);
    const end = shell.get();
    expect(end.tag === "finished" && end.session.queue.map((e) => e.id)).toEqual([first.id, second.id]);
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 2, correctFirstTry: 2, retries: 0, skipped: 0 });
  });

  it("this should have been wrong: the card comes back, and the score counts it wrong", () => {
    const [s0] = start(node, [first]);
    const shell = run(course, s0, [...answer(first, rightAnswer(first)), { tag: "revise", exercise: first.id, verdict: "WRONG" }]);
    const feedback = shell.get();
    expect(feedback.tag === "feedback" && countsAs(feedback)).toBe("WRONG");
    shell.dispatch({ tag: "continue" });
    const again = shell.get();
    expect(again.tag === "presenting" && again.ex.id).toBe(`${first.id}#2`);
    for (const e of [...answer(retryOf(first, 2), rightAnswer(retryOf(first, 2))), { tag: "continue" } as const]) shell.dispatch(e);
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 1, correctFirstTry: 0, retries: 1, skipped: 0 });
  });

  it("a revision after Continue takes back the retry not shown yet, and the score has it", () => {
    const [s0] = start(node, [first, second]);
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "continue" }, { tag: "ready" }]);
    const queued = shell.get();
    expect(queued.session.queue.map((e) => e.id)).toEqual([first.id, second.id, `${first.id}#2`]);
    shell.dispatch({ tag: "revise", exercise: first.id, verdict: "CORRECT_PROVISIONAL" });
    expect(shell.get().session.queue.map((e) => e.id)).toEqual([first.id, second.id]);
    for (const e of [...answer(second, rightAnswer(second)).slice(1), { tag: "continue" } as const]) shell.dispatch(e);
    const end = shell.get();
    expect(end.tag === "finished" && end.summary).toEqual({ completed: true, exercises: 2, correctFirstTry: 2, retries: 0, skipped: 0 });
  });

  it("a card back on screen stays, and is not queued twice", () => {
    const [s0] = start(node, [first]);
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "continue" }]);
    const back = shell.get();
    expect(back.tag === "presenting" && back.ex.id).toBe(`${first.id}#2`);
    shell.dispatch({ tag: "revise", exercise: first.id, verdict: "CORRECT" });
    shell.dispatch({ tag: "revise", exercise: first.id, verdict: "WRONG_WORD" });
    const still = shell.get();
    expect(still.tag === "presenting" && still.ex.id).toBe(`${first.id}#2`);
    expect(still.session.queue.map((e) => e.id)).toEqual([first.id, `${first.id}#2`]);
  });

  it("changes nothing for a skip, a self-rating, an exercise not answered, or the verdict it has", () => {
    const [s0] = start(node, [first, second]);
    const shell = run(course, s0, [{ tag: "ready" }, { tag: "skip", reason: "skip" }]);
    const skipped = shell.get();
    for (const event of [
      { tag: "revise", exercise: first.id, verdict: "CORRECT" },
      { tag: "revise", exercise: second.id, verdict: "CORRECT" },
      { tag: "revise", exercise: "elsewhere", verdict: "CORRECT" },
    ] as const) {
      expect(step(skipped, event)).toEqual([skipped, []]);
    }
    const right = run(course, start(node, [first])[0], answer(first, rightAnswer(first))).get();
    expect(step(right, { tag: "revise", exercise: first.id, verdict: "CORRECT" })).toEqual([right, []]);
    const speaking = lesson.find((e) => e.template === "speak.tier-0");
    if (speaking !== undefined) {
      const rated = run(course, start(node, [speaking])[0], answer(speaking, rightAnswer(speaking))).get();
      expect(step(rated, { tag: "revise", exercise: speaking.id, verdict: "WRONG" })).toEqual([rated, []]);
    }
  });

  it("reaches the feedback under the quit dialog", () => {
    const [s0] = start(node, [first]);
    const shell = run(course, s0, [...answer(first, wrongAnswer(first) as Response), { tag: "interrupt", reason: "quit-confirm" }]);
    const [asked, effects] = step(shell.get(), { tag: "revise", exercise: first.id, verdict: "CORRECT" });
    expect(asked.tag).toBe("interrupted");
    expect(emitted(effects)).toEqual(["answer_revised"]);
    const [resumed] = step(asked, { tag: "resume" });
    expect(resumed.tag === "feedback" && countsAs(resumed)).toBe("CORRECT");
    expect(summarize(asked.session, false).correctFirstTry).toBe(1);
  });

  it("an adaptive test asks on from what the answer counts as (placement)", () => {
    const test = placementTest(course, 4).test;
    const opening = runTest(test, new Map()).next;
    const [s0] = start("placement", opening, { adaptive: test });
    const firstAsked = s0.tag === "presenting" ? s0.ex : undefined;
    if (firstAsked === undefined) throw new Error("no question");
    const missed = run(course, s0, answer(firstAsked, wrongAnswer(firstAsked) ?? rightAnswer(firstAsked)));
    const claimed = run(course, s0, [...answer(firstAsked, wrongAnswer(firstAsked) ?? rightAnswer(firstAsked)), { tag: "revise", exercise: firstAsked.id, verdict: "CORRECT" }]);
    const right = run(course, s0, answer(firstAsked, rightAnswer(firstAsked)));
    for (const shell of [missed, claimed, right]) shell.dispatch({ tag: "continue" });
    const next = (s: PlayerState): string | undefined => (s.tag === "presenting" ? s.ex.id : undefined);
    expect(next(claimed.get())).toBe(next(right.get()));
    expect(claimed.get().session.results.map((r) => r.verdict)).toEqual(["CORRECT"]);
  });
});

describe("the cards the end of a session goes over (P9)", () => {
  const course = loadCourse("fa");
  const node = lessonNodes(course)[2]?.node.id as string;
  const lesson = lessonAt(faWalk, node);
  // Cards from the course's first lessons, each once: a session of any of them.
  const cards = [...new Map(lessonNodes(course).slice(0, 4).flatMap((n) => lessonAt(faWalk, n.node.id)).map((e) => [e.id, e] as const)).values()];
  const choices = cards.filter((e) => e.template !== "speak.tier-0" && wrongAnswer(e)?.tag === "choice");
  const [missed, skipped, claimed, right] = choices;
  const typed = cards.find((e) => e.template === "translate-type.l1-l2");
  if (missed === undefined || skipped === undefined || claimed === undefined || right === undefined || typed === undefined) throw new Error("the lesson needs four choice cards and a typed one");

  it("are the first tries the score counts wrong, in order, with what was answered", () => {
    const [s0] = start(node, [missed, typed, skipped, claimed, right]);
    const shell = run(course, s0, []);
    const wrongTyped = wrongAnswer(typed) as Response;
    for (const e of [
      ...answer(missed, wrongAnswer(missed) as Response),
      { tag: "continue" },
      ...answer(typed, wrongTyped),
      { tag: "continue" },
      { tag: "ready" },
      { tag: "skip", reason: "skip" },
      { tag: "continue" },
      ...answer(claimed, wrongAnswer(claimed) as Response),
      { tag: "revise", exercise: claimed.id, verdict: "CORRECT" },
      { tag: "continue" },
      ...answer(right, rightAnswer(right)),
      { tag: "continue" },
    ] as const satisfies readonly PlayerEvent[])
      shell.dispatch(e);
    // The cards back at the end, answered right this time.
    for (let s = shell.get(); s.tag !== "finished"; s = shell.get()) {
      if (s.tag !== "presenting") throw new Error(s.tag);
      for (const e of [...answer(s.ex, rightAnswer(s.ex)), { tag: "continue" } as const]) shell.dispatch(e);
    }
    const end = shell.get();
    if (end.tag !== "finished") throw new Error(end.tag);
    expect(missedOf(end.session)).toEqual([
      { ex: missed, verdict: "WRONG", response: wrongAnswer(missed) },
      { ex: typed, verdict: expect.stringMatching(/^(WRONG|WRONG_WORD|PARTIAL)$/u) as unknown as string, response: wrongTyped },
      { ex: skipped, verdict: "SKIPPED" },
    ]);
    expect(end.summary.correctFirstTry).toBe(2);
  });

  it("leave out what was never checked: a self-rating, a card put off", () => {
    const speaking = lesson.find((e) => e.template === "speak.tier-0");
    const listening = lesson.find((e) => LISTENING.has(e.template));
    const cards = [speaking, listening].filter((e): e is Exercise => e !== undefined);
    if (cards.length === 0) return;
    const [s0] = start(node, cards);
    const shell = run(course, s0, []);
    for (let s = shell.get(); s.tag !== "finished"; s = shell.get()) {
      if (s.tag !== "presenting") throw new Error(s.tag);
      const events: readonly PlayerEvent[] =
        s.ex.template === "speak.tier-0" ? [...answer(s.ex, { tag: "self-rating", rating: "again" }), { tag: "continue" }] : [{ tag: "ready" }, { tag: "skip", reason: "cant-listen" }];
      for (const e of events) shell.dispatch(e);
    }
    const end = shell.get();
    expect(end.tag === "finished" && missedOf(end.session)).toEqual([]);
  });

  it("each shows what it asked, where that was text other than its answer", () => {
    const gallery = cardGallery(loadCourse("yue"), 7).flatMap((g) => (g.exercise === undefined ? [] : [g.exercise]));
    for (const ex of gallery) {
      const prompt = promptOf(ex);
      if (prompt !== undefined) expect(prompt, ex.template).not.toBe(solutionOf(ex));
    }
    const byTemplate = (t: TemplateId): Exercise | undefined => gallery.find((e) => e.template === t);
    const choose = byTemplate("choose-translation");
    expect(choose !== undefined && promptOf(choose)).toBe(choose?.template === "choose-translation" ? choose.prompt : undefined);
    const gap = byTemplate("gap-fill");
    expect(gap !== undefined && promptOf(gap)).toBe(gap?.template === "gap-fill" ? gap.hint : undefined);
    for (const t of ["listen-select", "speak.tier-0", "match-pairs"] as const) {
      const ex = byTemplate(t);
      if (ex !== undefined) expect(promptOf(ex), t).toBeUndefined();
    }
  });
});

describe("listening cards say what was heard means", () => {
  for (const [id, orthography] of [
    ["fa", "fa-Arab/standard"],
    ["uz", "uz-Latn/standard"],
    ["apc", "apc-Arab/standard"],
  ] as const) {
    it(`${id}: a heard word comes with its gloss, a heard sentence with its translation`, () => {
      const course = loadCourse(id, orthography);
      const gallery = cardGallery(course, 7);
      const kcs = new Map(course.units.flatMap((u) => u.kcs).map((k) => [String(k.id), k] as const));
      const sentences = new Map(course.units.flatMap((u) => u.sentences).map((s) => [s.id, s]));
      let words = 0;
      for (const { exercise: ex } of gallery) {
        if (ex === undefined) continue;
        if (ex.template === "listen-select" || ex.template === "minimal-pair") {
          words += 1;
          expect(ex.translation, ex.id).toEqual(kcs.get(ex.item)?.gloss?.[course.supportKey]);
          expect(ex.translation, ex.id).toBeDefined();
        }
        if (ex.template === "listen-tap" || ex.template === "listen-type") {
          expect(ex.translation, ex.id).toEqual(sentences.get(ex.item)?.translations[course.supportKey]?.text);
        }
      }
      expect(words).toBeGreaterThan(0);
    });
  }
});

describe("a typo that spells another word of the course (erratum 46)", () => {
  it("is WRONG_WORD in a vocalized orthography too: the course writes نْروح, the learner types نروح", () => {
    const orthography = "apc-Arab/standard";
    const grader = createGrader(loadCourse("apc", orthography));
    // nrou7 (no indicative m-) for mnrou7 (we go); bt- (you, she) for b- (I).
    expect(grader.grade(orthography, "بعدين منروح عالشغل", "بعدين نروح عالشغل").verdict).toBe("WRONG_WORD");
    expect(grader.grade(orthography, "بشتغل ببيروت", "بتشتغل ببيروت").verdict).toBe("WRONG_WORD");
    // A slip that spells no word of the course stays a typo.
    expect(grader.grade(orthography, "بعدين منروح عالشغل", "بعدين منرح عالشغل").verdict).toBe("CORRECT_WITH_TYPO");
  });
});

describe("affixes that carry meaning on the words a course inflects (ADR 0081)", () => {
  it("makes a verb's prefix or an agreeing ending WRONG_WORD, even where the slip spells no word of the course", () => {
    const arabic = "apc-Arab/standard";
    const grader = createGrader(loadCourse("apc", arabic));
    const graded = (accept: string, answer: string): [string, readonly string[]] => {
      const g = grader.grade(arabic, accept, answer);
      return [g.verdict, g.notes];
    };
    // b- dropped (شتغل is no word of the course) and b- for bt-; the school is feminine.
    expect(graded("(بشتغل|أنا بشتغل) ببيروت", "شتغل ببيروت")).toEqual(["WRONG_WORD", ["contrast-prefix"]]);
    expect(graded("المدرسة بعيدة", "المدرسة بعيد")).toEqual(["WRONG_WORD", ["contrast-ending"]]);
    // A noun's first letter is no prefix: still a typo (يروت is no word; بيروت is not inflected).
    expect(graded("(بحبّ|أنا بحبّ) بيروت (لأنّه|لأنّو) حلوة", "بحبّ يروت لأنّه حلوة")).toEqual(["CORRECT_WITH_TYPO", []]);
  });

  it("knows a verb by the spellings its accept sets give it (Arabizi be2ra beside b2ra)", () => {
    const arabizi = "apc-Latn/arabizi";
    const grader = createGrader(loadCourse("apc", arabizi));
    expect(grader.grade(arabizi, "(el|l|il|bel|bil) (masa|masa2) (b2ra|be2ra|bi2ra|b2ara)", "el masa bt2ra").verdict).toBe("WRONG_WORD");
    // Another vowel after the same prefix is a typo.
    expect(grader.grade(arabizi, "(el|l|il|bel|bil) (masa|masa2) (b2ra|be2ra|bi2ra|b2ara)", "el masa bu2ra").verdict).toBe("CORRECT_WITH_TYPO");
  });
});

describe("contrasts limited to the forms a word is pinned as (ADR 0084)", () => {
  it("makes a Biblical Hebrew verb's person prefix wrong, and leaves nouns and other typos alone", () => {
    const hebrew = "hbo-Hebr/tiberian";
    const grader = createGrader(loadCourse("hbo", hebrew));
    const graded = (accept: string, answer: string): [string, readonly string[]] => {
      const g = grader.grade(hebrew, accept, answer);
      return [g.verdict, g.notes];
    };
    // "and she fled" for "and he fled" (wayyiqtol, Jonah 1:3), though it spells no word of the course.
    expect(graded("ויברח", "ותברח")).toEqual(["WRONG_WORD", ["contrast-prefix"]]);
    // A slip inside the verb is a typo; so is a noun's first letter (the article is no person prefix).
    expect(graded("ויברח", "ויבברח")).toEqual(["CORRECT_WITH_TYPO", []]);
    expect(graded("השמים", "ישמים")).toEqual(["CORRECT_WITH_TYPO", []]);
    // An infinitive's -ôṯ is no perfect ending, though its verb has perfects in the course.
    expect(graded("בהיותם", "בהיוותם")).toEqual(["CORRECT_WITH_TYPO", []]);
  });

  it("accepts the other order of subject and predicate where Biblical Hebrew has it and the English is the same", () => {
    const hebrew = "hbo-Hebr/tiberian";
    const course = loadCourse("hbo", hebrew);
    const grader = createGrader(course);
    const reverse = (id: string): string => {
      const s = course.units.flatMap((u) => u.sentences).find((x) => x.id === id);
      const accept = s?.forms[hebrew]?.reverse;
      if (accept === undefined) throw new Error(`no reverse set for ${id}`);
      return accept;
    };
    // Another order is a correct alternative. A nominal clause (Joüon-Muraoka § 154f): הָאוֹר טוֹב,
    // and טוֹב הָאוֹר as Gen 1:4 has it.
    expect(grader.grade(hebrew, reverse("s.01.9"), "טוב האור").verdict).toBe("CORRECT_ALT");
    // A participle clause and a yiqtol (§ 154f, § 155k): either side of the subject.
    expect(grader.grade(hebrew, reverse("s.03.20"), "מתהלך האדם בתוך הגן").verdict).toBe("CORRECT_ALT");
    expect(grader.grade(hebrew, reverse("s.15.18"), "יהוה יסגרך בידי").verdict).toBe("CORRECT_ALT");
    // What the English does not decide (ADR 0085): "the woman said" is also X-qatal, "he fled" a
    // bare qatal with or without its pronoun.
    expect(grader.grade(hebrew, reverse("s.04.29"), "האשה אמרה").verdict).toBe("CORRECT_ALT");
    expect(grader.grade(hebrew, reverse("s.17.15"), "ברח").verdict).toBe("CORRECT_ALT");
    expect(grader.grade(hebrew, reverse("s.17.15"), "והוא ברח").verdict).toBe("CORRECT_ALT");
    const wrong = (id: string, answer: string): void =>
      expect(grader.grade(hebrew, reverse(id), answer).verdict, `${id} ${answer}`).not.toMatch(/^CORRECT/u);
    // wayyiqtol's vav never leaves its verb: a subject first would need another form (X-qatal).
    wrong("s.03.22", "האדם ויתחבא");
    // Not where the English would change: identity ("my brother is Cain"), a wish in a plain
    // yiqtol ("the LORD will bless you"), and what reads unpointed as a construct chain ("in the
    // man's garden" for בגן האדם).
    wrong("s.05.7", "אחי קין");
    wrong("s.20.25", "יהוה יברכך");
    wrong("s.03.2", "בגן האדם");
    // A vav on a qatal makes it a weqatal, "and he will flee".
    wrong("s.17.15", "וברח");
  });
});

describe("Toki Pona in sitelen pona (ADR 0086)", () => {
  const SITELEN_PONA = "tok-Qaap/sitelen-pona";

  it("grades sitelen Lasina typed into a sitelen pona answer, names against their cartouches", () => {
    const course = loadCourse("tok", SITELEN_PONA);
    const grader = createGrader(course);
    const sentence = allSentences(course).find((s) => s.id === "s.u01.12");
    const accept = sentence?.forms[SITELEN_PONA]?.reverse;
    if (accept === undefined) throw new Error("no sitelen pona accept set for s.u01.12");
    // sina jan Pita: the logographs, or the Latin words, name included.
    expect(grader.grade(SITELEN_PONA, accept, "sina jan Pita").verdict).toBe("CORRECT");
    expect(grader.grade(SITELEN_PONA, accept, surfaceOf(sentence?.forms[SITELEN_PONA]?.text as TaggedText)).verdict).toBe("CORRECT");
    // Another word is another logograph: wrong, with no typo tolerance.
    expect(isCorrect(grader.grade(SITELEN_PONA, accept, "sina jan Lina").verdict)).toBe(false);
  });

  it("accepts the Toki Pona answers an English prompt leaves open, and no other (ADR 0085)", () => {
    const LATIN = "tok-Latn/standard";
    const course = loadCourse("tok", LATIN);
    const grader = createGrader(course);
    const reverse = (text: string): string => {
      const s = allSentences(course).find((x) => surfaceOf(x.forms[LATIN]?.text as TaggedText) === text);
      const accept = s?.forms[LATIN]?.reverse;
      if (accept === undefined) throw new Error(`no sentence ${text}`);
      return accept;
    };
    const right = (text: string, answer: string): boolean => isCorrect(grader.grade(LATIN, reverse(text), answer).verdict);
    // "My mother speaks Toki Pona": mama alone is a mother too; "We're going up the hill": mi alone is we.
    expect(right("mama meli mi li toki pona.", "mama mi li toki pona")).toBe(true);
    expect(right("mi mute li tawa sewi nena.", "mi tawa sewi nena")).toBe(true);
    // A plain yes/no question either way; kule before a colour; ali, pu's other spelling of ale.
    expect(right("pilin sina li pona ala pona?", "sina pilin ala pilin pona")).toBe(true);
    expect(right("sewi li laso.", "sewi li kule laso")).toBe(true);
    expect(right("ale li pona.", "ali li pona")).toBe(true);
    // "I'm eating" decides one person: mi mute is we.
    expect(right("mi moku.", "mi mute li moku")).toBe(false);
  });
});

describe("how a character is read here (reading-disambiguation)", () => {
  const course = loadCourse("yue");
  const JYUTPING = "jyutping" as SchemeId;
  const cards = allSentences(course).flatMap((s) => {
    const ex = makeReadingDisambiguation({ course, rng: seededRng(5), introduced: [] }, s);
    return ex === undefined ? [] : [{ s, ex }];
  });

  it("shows the whole sentence, since the context decides, with the character picked out", () => {
    expect(cards.length).toBeGreaterThan(0);
    for (const { s, ex } of cards) {
      expect(ex.context).toEqual(s.forms["yue-Hant-HK/standard"]?.text);
      const token = ex.context.tokens[ex.focus.token];
      expect(token?.ruby?.[JYUTPING]?.[ex.focus.segment]).toBeDefined();
    }
  });

  it("offers single readings, first those the character has elsewhere in the course: 呢 is ne1 in 你呢, ni1 in 呢個", () => {
    for (const { ex } of cards) for (const o of ex.options) expect(surfaceOf(o)).toMatch(/^(?:[a-z]+[1-6])+$/u);
    const ne = cards.find(({ ex }) => {
      const t = ex.context.tokens[ex.focus.token];
      return t?.ruby?.[JYUTPING]?.[ex.focus.segment]?.base === "\u5462";
    });
    expect(ne).toBeDefined();
    expect(ne?.ex.options.map(surfaceOf)).toContain("ne1");
    expect(ne?.ex.options.map(surfaceOf)).toContain("ni1");
  });
});

describe("the accepted answer closest to a wrong one (feedback)", () => {
  it("is another wording where that is nearer, with what was left out marked: 我嘅書喺邊度呀 for 我嘅書邊度呀", () => {
    const course = loadCourse("yue");
    const s = allSentences(course).find((x) => x.id === "s.u03.12");
    const ex = s === undefined ? undefined : makeTranslateType({ course, rng: seededRng(1), introduced: [] }, s);
    if (ex === undefined) throw new Error("s.u03.12 has no translate-type card");
    // 我嘅書呢？ is the solution; "where" questions about a location take 喺 (Matthews & Yip 2011, p. 378).
    const wrong = gradeExercise(ex, { tag: "text", text: "我嘅書邊度呀？" }, createGrader(course));
    expect(wrong.verdict).toBe("WRONG");
    expect(wrong.closestIsSolution).toBe(false);
    const closest = closestAnswer(wrong.alignment ?? [], ex.canonical, "");
    expect(surfaceOf(closest.text)).toBe("我嘅書喺邊度呀？");
    expect(closest.marked.map((i) => closest.text.tokens[i]?.surface)).toEqual(["\u55BA"]);
    // A slip in the solution's own wording lines up with the solution.
    expect(gradeExercise(ex, { tag: "text", text: "我嘅書尼？" }, createGrader(course)).closestIsSolution).toBe(true);
  });

  // ¿Tú tienes hambre? shows; its accept set (no punctuation) also takes Tienes [tú] hambre (W3).
  const es = loadCourse("es");
  const hungry = allSentences(es).find((x) => x.id === "s.u04.29");
  const card = hungry === undefined ? undefined : makeTranslateType({ course: es, rng: seededRng(1), introduced: [] }, hungry);
  if (card === undefined) throw new Error("s.u04.29 has no translate-type card");

  it("takes the solution's punctuation at both ends, and keeps its own casing: ¿Tienes hambre?", () => {
    const wrong = gradeExercise(card, { tag: "text", text: "Tienes hombre" }, createGrader(es));
    expect(wrong.verdict).not.toMatch(/^CORRECT/u);
    expect(wrong.closestIsSolution).toBe(false);
    expect(nearMiss(wrong.alignment ?? [])).toBe(true);
    const closest = closestAnswer(wrong.alignment ?? [], card.canonical, " ");
    expect(surfaceOf(closest.text)).toBe("¿Tienes hambre?");
    expect(closest.marked.map((i) => closest.text.tokens[i]?.surface)).toEqual(["hambre"]);
  });

  it("is no near miss for an answer that has little of any wording", () => {
    for (const text of ["perro gato casa", "Yo quiero comer arroz con pollo hambre"]) {
      const wrong = gradeExercise(card, { tag: "text", text }, createGrader(es));
      expect(wrong.verdict, text).toBe("WRONG");
      expect(nearMiss(wrong.alignment ?? []), text).toBe(false);
    }
  });
});

describe("the wording a card shows, and what a clip says", () => {
  const es = loadCourse("es");
  const grader = createGrader(es);
  const ctx = { course: es, rng: seededRng(1), introduced: [] };
  const text = (s: (typeof es.units)[number]["sentences"][number]): string => surfaceOf(s.forms[es.orthography]?.text as TaggedText);
  // Its accept set is "[Yo] estoy bien": the notation's own canonical path includes the optional Yo.
  const estoy = allSentences(es).find((s) => text(s) === "Estoy bien.");
  if (estoy === undefined) throw new Error("es needs Estoy bien.");

  it("an answer on the shown wording is CORRECT; another accepted wording is CORRECT_ALT", () => {
    const ex = makeTranslateType(ctx, estoy) as Exercise;
    expect(gradeExercise(ex, { tag: "text", text: "Estoy bien." }, grader)).toMatchObject({ verdict: "CORRECT", closestIsSolution: true });
    expect(gradeExercise(ex, { tag: "text", text: "Yo estoy bien." }, grader)).toMatchObject({ verdict: "CORRECT_ALT", closestIsSolution: false });
  });

  it("every sentence typed as the course shows it is CORRECT", () => {
    const off = allSentences(es).flatMap((s) => {
      const ex = makeTranslateType(ctx, s);
      if (ex === undefined) return [];
      const verdict = gradeExercise(ex, { tag: "text", text: text(s) }, grader).verdict;
      return verdict === "CORRECT" ? [] : [`${s.id}: ${verdict}`];
    });
    expect(off).toEqual([]);
  });

  it("dictation takes what the clip says, not another way to say the same", () => {
    const ex = SENTENCE_TEMPLATES["listen-type"]?.(ctx, estoy);
    if (ex === undefined) throw new Error("Estoy bien. needs its clip for this test");
    expect(gradeExercise(ex, { tag: "text", text: "Estoy bien." }, grader).verdict).toBe("CORRECT");
    expect(isCorrect(gradeExercise(ex, { tag: "text", text: "Yo estoy bien." }, grader).verdict)).toBe(false);
    const tap = SENTENCE_TEMPLATES["listen-tap"]?.(ctx, estoy);
    expect(tap === undefined ? undefined : tap.template === "listen-tap" ? tap.accept : undefined).toBe("Estoy bien.");
  });
});
