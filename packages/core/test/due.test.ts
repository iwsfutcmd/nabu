/**
 * Due only where a card can ask it, and a review that aims at what is due (the owner's ruling of
 * 2026-11-22): whatever is counted due, a review can plan a card for, and reviews answered right
 * clear it. Every session here is one `plan()` planned (C5), answered as the player logs it.
 */
import type { LearnerEvent, SchemeId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { askable, creditedKeys, lastingExclusions } from "../src/learner/due.ts";
import { cardKey, dueFacets, emptyLearnerState, learnedWords, parseCardKey, plan, replay, type LearnerState, type SessionPlan } from "../src/learner/index.ts";
import { kindOf, lessonNodes, LISTENING, scriptNodes, TEMPLATES, type CourseView, type Exercise, type TemplateId } from "../src/lesson/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

/** Every fixture course in each of its orthographies, and Classical Chinese read in Baxter as well. */
const RUNS: readonly { readonly id: string; readonly orthography: string; readonly reading?: SchemeId }[] = [
  ...["fa", "yue", "uz", "apc", "lzh", "es", "hbo", "tok", "grc", "chg"].flatMap((id) => manifestOf(id).orthographies.map((orthography) => ({ id, orthography }))),
  { id: "lzh", orthography: "lzh-Hant/standard", reading: "baxter" as SchemeId },
];

/** The script track's own cards (ADR 0088). */
const SCRIPT_TEMPLATES: ReadonlySet<TemplateId> = new Set<TemplateId>(["letter-read", "letter-pairs", "word-read", "word-write"]);
const SESSION_MIN = 5;
const SESSION_MAX = 15;
const capOf = (ex: Exercise): number => TEMPLATES[ex.template].perSession ?? 3;

interface Learner {
  readonly course: CourseView;
  readonly log: LearnerEvent[];
  readonly reading: SchemeId | undefined;
  readonly state: () => LearnerState;
  /** Plans a session at `at` and answers it: right, but every `missEvery`-th card wrong (0: none). */
  readonly take: (request: { mode: "lesson"; node: string } | { mode: "review" }, at: string, seed: number, missEvery?: number) => SessionPlan;
}

const learner = (id: string, orthography: string, reading?: SchemeId): Learner => {
  const course = loadCourse(id, orthography);
  const events = eventFactory(course, manifestOf(id).id);
  const log: LearnerEvent[] = [];
  const state = (): LearnerState => replay(log);
  return {
    course,
    log,
    reading,
    state,
    take: (request, at, seed, missEvery = 0) => {
      events.at(at);
      events.session();
      const p = plan(course, state(), request, { now: at, today: at.slice(0, 10), seed, reading });
      log.push(events.started(request.mode, request.mode === "lesson" ? request.node : undefined, p.exercises.length));
      p.exercises.forEach((ex, i) => log.push(events.answer(ex, missEvery === 0 || (i + 1) % missEvery !== 0, 1)));
      return p;
    },
  };
};

/** The first eight lesson nodes, two a day from 1 March, every card right. */
const eightLessons = (l: Learner): void => {
  lessonNodes(l.course)
    .slice(0, 8)
    .forEach(({ node }, i) => l.take({ mode: "lesson", node: node.id }, `2026-03-0${String(1 + Math.floor(i / 2))}T${i % 2 === 0 ? "09" : "19"}:00:00.000Z`, 3 + i));
};

/** Review number k on 5 April, five minutes apart. */
const reviewAt = (k: number): string => new Date(Date.parse("2026-04-05T08:00:00.000Z") + k * 5 * 60_000).toISOString();

const dueNow = (l: Learner, at: string): readonly { readonly key: string; readonly r: number }[] => dueFacets(l.course, l.state(), at, undefined, undefined, l.reading);

const checkSession = (p: SessionPlan, label: string): void => {
  expect(p.exercises.length, `${label}: cards`).toBeGreaterThanOrEqual(SESSION_MIN);
  expect(p.exercises.length, `${label}: cards`).toBeLessThanOrEqual(SESSION_MAX);
  const by = new Map<string, number>();
  for (const ex of p.exercises) by.set(ex.template, (by.get(ex.template) ?? 0) + 1);
  for (const ex of p.exercises) expect(by.get(ex.template), `${label}: ${ex.template} within its cap`).toBeLessThanOrEqual(capOf(ex));
  expect(new Set(p.exercises.map((ex) => ex.id)).size, `${label}: no card twice`).toBe(p.exercises.length);
};

describe("letters stay out of reviews (ADR 0149)", () => {
  for (const id of ["grc", "chg"]) {
    it(`${id}: a script track's letters are never due, and no review asks a script card`, () => {
      const l = learner(id, manifestOf(id).orthographies[0] as string);
      const track = scriptNodes(l.course).slice(0, 2);
      expect(track.length).toBeGreaterThan(0);
      track.forEach(({ node }, i) => l.take({ mode: "lesson", node: node.id }, `2026-02-2${String(i)}T09:00:00.000Z`, 40 + i));
      eightLessons(l);
      const letters = Object.keys(l.state().cards).filter((k) => kindOf(parseCardKey(k).part) === "grapheme");
      expect(letters.length, "the track gave its letters cards").toBeGreaterThan(0);
      const at = reviewAt(0);
      expect(dueNow(l, at).filter((f) => kindOf(parseCardKey(f.key).part) === "grapheme")).toEqual([]);
      for (let k = 0; k < 3; k += 1) {
        const p = l.take({ mode: "review" }, reviewAt(k), 60 + k);
        expect(p.exercises.filter((ex) => SCRIPT_TEMPLATES.has(ex.template)).map((ex) => ex.template)).toEqual([]);
      }
    });
  }
});

describe("reviews clear what is due (every fixture course and orthography)", () => {
  for (const { id, orthography, reading } of RUNS) {
    it(`${id} ${orthography}${reading === undefined ? "" : ` read in ${reading}`}: each review lowers what is due, until nothing is`, () => {
      const l = learner(id, orthography, reading);
      eightLessons(l);
      const start = dueNow(l, reviewAt(0));
      expect(start.length, "something is due a month later").toBeGreaterThan(0);
      // A review has at least SESSION_MIN cards, aimed at due facets not yet exercised while it can
      // afford them, and at least one whatever it can afford: on average it clears SESSION_MIN due
      // facets or more, so one review per SESSION_MIN facets due at first is enough.
      const bound = Math.ceil(start.length / SESSION_MIN);
      let before = start.length;
      let k = 0;
      while (before > 0) {
        k += 1;
        expect(k, `nothing due within ${String(bound)} reviews (${String(start.length)} due at first)`).toBeLessThanOrEqual(bound);
        const at = reviewAt(k);
        const due = new Set(dueNow(l, at).map((f) => f.key));
        const p = l.take({ mode: "review" }, at, 20 + k);
        checkSession(p, `review ${String(k)}`);
        // Its cards credit something due.
        expect(p.exercises.some((ex) => creditedKeys(l.course, ex).some((key) => due.has(key))), `review ${String(k)} aims at what is due`).toBe(true);
        const after = dueNow(l, at).length;
        expect(after, `review ${String(k)} lowers what is due`).toBeLessThan(before);
        before = after;
      }
      expect(learnedWords(l.course, l.state(), reviewAt(k), undefined, undefined, reading).some((w) => w.due)).toBe(false);
    });
  }
});

describe("a learner who misses some cards does not loop", () => {
  for (const { id, orthography, reading } of RUNS) {
    it(`${id} ${orthography}${reading === undefined ? "" : ` read in ${reading}`}: two reviews answered right in a row are not the same cards while something is due`, () => {
      const l = learner(id, orthography, reading);
      eightLessons(l);
      let k = 0;
      for (let round = 0; round < 3; round++) {
        k += 1;
        checkSession(l.take({ mode: "review" }, reviewAt(k), 40 + k, 3), `review ${String(k)} (some missed)`);
        k += 1;
        const first = l.take({ mode: "review" }, reviewAt(k), 40 + k);
        checkSession(first, `review ${String(k)}`);
        if (dueNow(l, reviewAt(k)).length === 0) break;
        k += 1;
        const second = l.take({ mode: "review" }, reviewAt(k), 40 + k);
        checkSession(second, `review ${String(k)}`);
        expect(second.exercises.map((ex) => ex.id).sort(), `reviews ${String(k - 1)} and ${String(k)}`).not.toEqual(first.exercises.map((ex) => ex.id).sort());
      }
    });
  }
});

describe("due only where a card can ask it", () => {
  const NOW = "2026-06-01T08:00:00.000Z";
  /** A card practised once, long ago: far below any target now. */
  const old: LearnerState["cards"][string] = { due: "2026-01-02T00:00:00.000Z", stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: "2026-01-01T00:00:00.000Z" };
  const stateOf = (keys: readonly string[]): LearnerState => ({ ...emptyLearnerState(), cards: Object.fromEntries(keys.map((k) => [k, old])) });

  it("counts a facet a card can ask", () => {
    const fa = loadCourse("fa");
    const word = fa.lexicon.lexemes.find((k) => k.forms?.[fa.orthography] !== undefined && !k.id.includes("ezafe"));
    if (word === undefined) throw new Error("fa has no word");
    const key = cardKey(word.id, "recognize", fa.orthography);
    expect(dueFacets(fa, stateOf([key]), NOW).map((f) => f.key)).toEqual([key]);
  });

  it("not a part the course no longer has", () => {
    const fa = loadCourse("fa");
    const gone = ["lexeme:no-such-word|recognize", "lexeme:no-such-word|read-script|fa-Arab/standard", "rule:no-such-rule|produce"];
    expect(dueFacets(fa, stateOf(gone), NOW)).toEqual([]);
  });

  it("not listening in a course whose voice may not be relied on (hbo, tok: iffy)", () => {
    for (const id of ["hbo", "tok"]) {
      const course = loadCourse(id);
      expect(course.audioQuality).toBe("iffy");
      const words = course.lexicon.lexemes.filter((k) => k.forms?.[course.orthography] !== undefined).slice(0, 5);
      const keys = words.map((k) => cardKey(k.id, "listen", course.orthography));
      expect(dueFacets(course, stateOf(keys), NOW), id).toEqual([]);
      // Recognizing them is.
      expect(dueFacets(course, stateOf(words.map((k) => cardKey(k.id, "recognize", course.orthography))), NOW).length, id).toBeGreaterThan(0);
    }
  });

  it("not a skill the course's facets leave out (lzh: never heard, spoken or written)", () => {
    const lzh = loadCourse("lzh");
    const word = lzh.lexicon.lexemes.find((k) => k.forms?.[lzh.orthography] !== undefined);
    if (word === undefined) throw new Error("lzh has no word");
    const keys = ["listen", "speak", "write-script"].map((skill) => cardKey(word.id, skill as never, lzh.orthography));
    expect(dueFacets(lzh, stateOf(keys), NOW)).toEqual([]);
    expect(learnedWords(lzh, stateOf(keys), NOW).some((w) => w.due)).toBe(false);
  });

  it("not a facet turned off for good, nor a reading in a tradition the learner does not read; a break changes nothing", () => {
    const yue = loadCourse("yue");
    const lzh = loadCourse("lzh");
    const word = yue.lexicon.lexemes.find((k) => k.forms?.[yue.orthography] !== undefined && (askable(yue)(cardKey(k.id, "listen", yue.orthography))));
    if (word === undefined) throw new Error("yue has no word heard");
    const listen = cardKey(word.id, "listen", yue.orthography);
    expect(dueFacets(yue, stateOf([listen]), NOW).map((f) => f.key)).toEqual([listen]);
    expect(dueFacets(yue, stateOf([listen]), NOW, undefined, new Set(["listen"]))).toEqual([]);
    // A break ("can't listen now") leaves the cards out of the session, not out of what is due.
    const review = plan(yue, stateOf([listen, cardKey(word.id, "recognize", yue.orthography)]), { mode: "review" }, { now: NOW, seed: 1, exclude: LISTENING });
    expect(review.exercises.some((ex) => LISTENING.has(ex.template))).toBe(false);
    expect(dueFacets(yue, stateOf([listen]), NOW).map((f) => f.key)).toEqual([listen]);
    const read = lzh.lexicon.lexemes.find((k) => askable(lzh, undefined, "baxter" as SchemeId)(cardKey(k.id, "read-script", lzh.orthography, "baxter")));
    if (read === undefined) throw new Error("lzh has no word read in Baxter");
    const baxter = cardKey(read.id, "read-script", lzh.orthography, "baxter");
    expect(dueFacets(lzh, stateOf([baxter]), NOW, undefined, undefined, "baxter" as SchemeId).map((f) => f.key)).toEqual([baxter]);
    expect(dueFacets(lzh, stateOf([baxter]), NOW, undefined, undefined, "pinyin" as SchemeId)).toEqual([]);
  });

  it("a bound lexeme's reading that a reading card about a word carrying it credits is due, and a review clears it (fa: the ezafe)", () => {
    const l = learner("fa", "fa-Arab/standard");
    eightLessons(l);
    const key = cardKey("lexeme:ezafe", "read-script", "fa-Arab/standard");
    expect(Object.keys(l.state().cards)).toContain(key);
    expect(askable(l.course)(key)).toBe(true);
    expect(dueNow(l, reviewAt(1)).map((f) => f.key)).toContain(key);
    let k = 0;
    let asked = false;
    while (dueNow(l, reviewAt(k + 1)).some((f) => f.key === key)) {
      k += 1;
      expect(k, "a review asks the ezafe's reading").toBeLessThanOrEqual(10);
      const p = l.take({ mode: "review" }, reviewAt(k), 60 + k);
      asked ||= p.exercises.some((ex) => creditedKeys(l.course, ex).includes(key));
    }
    expect(asked).toBe(true);
  });

  it("is what a card can credit: every course's lasting exclusions leave its own templates out", () => {
    for (const id of ["hbo", "lzh"]) {
      const course = loadCourse(id);
      for (const t of LISTENING) expect(lastingExclusions(course).has(t), `${id} ${t}`).toBe(true);
    }
    expect(parseCardKey(cardKey("lexeme:x", "read-script", "o", "s")).reading).toBe("s");
  });
});
