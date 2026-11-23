/**
 * A card id pasted in debug mode (`parseCardId`, `cardFromId`): the card the planner planned, made again
 * from its id alone, as the course makes it. Every card the first lessons of every fixture course plan,
 * reviews and mistakes included, comes back with its id and kind, and its item and word where the id
 * names them; one id always makes the same card. What cannot be one says why.
 */
import { describe, expect, it } from "vitest";
import { cardFromId, cardGallery, cardId, parseCardId, type Exercise } from "../src/lesson/index.ts";
import { loadCourse } from "./learner-fixtures.ts";
import { walkPath } from "./planned.ts";

const COURSES: readonly (readonly [string, string])[] = [
  ["apc", "apc-Arab/standard"],
  ["chg", "chg-Arab/standard"],
  ["es", "es-Latn/standard"],
  ["fa", "fa-Arab/standard"],
  ["grc", "grc-Grek/polytonic"],
  ["hbo", "hbo-Hebr/tiberian"],
  ["lzh", "lzh-Hant/standard"],
  ["tok", "tok-Qaap/sitelen-pona"],
  ["uz", "uz-Latn/standard"],
  ["yue", "yue-Hant-HK/standard"],
];

describe.each(COURSES)("a card id of %s (%s)", (id, orthography) => {
  const course = loadCourse(id, orthography);
  const rebuilt = (ex: Exercise): Exercise => {
    const made = cardFromId(course, ex.id);
    if (!made.ok) throw new Error(`${ex.id}: ${made.error}`);
    return made.value;
  };

  it("makes every card the first lessons plan again, its id, kind and item", () => {
    const cards = walkPath(course, { lessons: 4 }).flatMap((s) => s.plan.exercises);
    expect(cards.length).toBeGreaterThan(20);
    for (const ex of cards) {
      const again = rebuilt(ex);
      expect(again.id, ex.id).toBe(ex.id.split("#")[0]);
      expect(again.template, ex.id).toBe(ex.template);
      expect(again.item, ex.id).toBe(ex.item);
    }
  });

  it("makes every kind of card in the gallery again, the same card each time", () => {
    for (const { exercise } of cardGallery(course)) {
      if (exercise === undefined) continue;
      const again = rebuilt(exercise);
      expect(again.id).toBe(exercise.id);
      expect(rebuilt(exercise)).toStrictEqual(again);
      // The id as debug mode shows it reads back as this course's.
      expect(parseCardId(cardId(course, exercise))).toEqual({ course: course.id, orthography: course.orthography, exercise: exercise.id });
    }
  });
});

describe("cardFromId", () => {
  const course = loadCourse("tok", "tok-Qaap/sitelen-pona");

  it("leaves out a retry's number: it is the same card", () => {
    const first = cardGallery(course).find((c) => c.exercise !== undefined)?.exercise as Exercise;
    const again = cardFromId(course, `${first.id}#2`);
    expect(again.ok && again.value.id).toBe(first.id);
  });

  it("says why an id is no card of the course", () => {
    expect(cardFromId(course, "no kind here")).toEqual({ ok: false, error: "unreadable" });
    expect(cardFromId(course, "no-such-kind:s.u01.1")).toEqual({ ok: false, error: "unknown-kind" });
    // Toki Pona's voice is a stopgap (ADR 0091): it has no listening cards.
    expect(cardFromId(course, "listen-tap:s.u01.1")).toEqual({ ok: false, error: "excluded" });
    expect(cardFromId(course, "choose-translation:s.no-such-sentence")).toEqual({ ok: false, error: "not-made" });
  });
});

describe("parseCardId", () => {
  it("takes a card id apart, its orthography as the course writes it", () => {
    expect(parseCardId(" tok/tok-Qaap.sitelen-pona/choose-translation:s.u03.17\n")).toEqual({ course: "tok", orthography: "tok-Qaap/sitelen-pona", exercise: "choose-translation:s.u03.17" });
    expect(parseCardId("chg/chg-Arab.standard/char-read:chg.s.01.3:چای")).toEqual({ course: "chg", orthography: "chg-Arab/standard", exercise: "char-read:chg.s.01.3:چای" });
  });

  it("finds no card id in an exercise id alone, or in other text", () => {
    expect(parseCardId("choose-translation:s.u03.17")).toBeUndefined();
    expect(parseCardId("tok/choose-translation:s.u03.17")).toBeUndefined();
    expect(parseCardId("hello")).toBeUndefined();
    expect(parseCardId("")).toBeUndefined();
  });
});
