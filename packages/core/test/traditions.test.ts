/**
 * Reading traditions (ADR 0138): Classical Chinese is read in Pinyin, Jyutping or Baxter's Middle
 * Chinese. Reading cards ask the learner's tradition, name it, and keep its own progress; an
 * orthography read in one tradition keeps the cards and events it always had.
 */
import type { SchemeId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { dueFacets, emptyLearnerState, plan, readingsShown, replay } from "../src/learner/index.ts";
import { cardKey, parseCardKey } from "../src/learner/state.ts";
import { exerciseRefOf } from "../src/learner/events.ts";
import { lessonNodes, readingTradition, readingTraditions, traditionKey, type Exercise } from "../src/lesson/index.ts";
import { eventFactory, loadCourse, manifestOf } from "./learner-fixtures.ts";

const now = "2026-03-01T08:00:00.000Z";
const S = (id: string): SchemeId => id as SchemeId;
const lzh = loadCourse("lzh");
const yue = loadCourse("yue");

/** The reading cards a few lessons plan for a new learner reading in `reading`. */
const readingCards = (reading?: "pinyin" | "jyutping" | "baxter"): Exercise[] =>
  lessonNodes(lzh)
    .slice(0, 6)
    .flatMap(({ node }) => plan(lzh, emptyLearnerState(), { mode: "lesson", node: node.id }, { now, seed: 3, ...(reading === undefined ? {} : { reading: S(reading) }) }).exercises)
    .filter((ex) => ex.template === "char-read");

describe("reading traditions (ADR 0138)", () => {
  it("are an orthography's askable ruby layers, in the profile's order", () => {
    expect(readingTraditions(lzh)).toEqual(["pinyin", "jyutping", "baxter"]);
    expect(readingTraditions(yue)).toEqual(["jyutping"]);
    expect(readingTraditions(loadCourse("fa"))).toEqual([]);
    expect(readingTradition(lzh, S("baxter"))).toBe("baxter");
    // No choice, readings off, or a layer the orthography lacks: the first.
    expect(readingTradition(lzh)).toBe("pinyin");
    expect(readingTradition(lzh, false)).toBe("pinyin");
    expect(readingTradition(lzh, S("schluessel"))).toBe("pinyin");
    // Named only where there is a choice.
    expect(traditionKey(lzh, S("pinyin"))).toBe("pinyin");
    expect(traditionKey(yue, S("jyutping"))).toBeUndefined();
  });

  it("reading cards ask the learner's tradition and name it", () => {
    for (const [reading, orthography] of [
      [undefined, "zh-Latn/pinyin"],
      ["jyutping", "yue-Latn/jyutping"],
      ["baxter", "ltc-Latn/baxter"],
    ] as const) {
      const cards = readingCards(reading);
      expect(cards.length).toBeGreaterThan(0);
      for (const ex of cards) {
        if (ex.template !== "char-read") continue;
        expect(ex.tradition).toBe(reading ?? "pinyin");
        expect(new Set(ex.options.map((o) => o.orthography))).toEqual(new Set([orthography]));
        expect(exerciseRefOf(ex).reading).toBe(reading ?? "pinyin");
      }
    }
  });

  it("Pinyin's wrong options are its tones; Baxter's trade x and h", () => {
    const pinyin = readingCards().flatMap((ex) => (ex.template === "char-read" ? [ex.options.map((o) => o.tokens.map((t) => t.surface).join(""))] : []));
    const toneless = (r: string): string => r.normalize("NFD").replace(/[̀-ͯ]/gu, "");
    expect(pinyin.some((options) => new Set(options.map(toneless)).size === 1)).toBe(true);
    const baxter = readingCards("baxter").flatMap((ex) => (ex.template === "char-read" ? [ex.options.map((o) => o.tokens.map((t) => t.surface).join(""))] : []));
    expect(baxter.some((options) => options.includes("hjwang") && options.includes("xjwang"))).toBe(true);
  });

  it("a course read in one tradition names none: its cards and events are as they were", () => {
    const cards = lessonNodes(yue)
      .slice(0, 6)
      .flatMap(({ node }) => plan(yue, emptyLearnerState(), { mode: "lesson", node: node.id }, { now, seed: 3 }).exercises)
      .filter((ex) => ex.template === "char-read" || ex.template === "transcribe");
    expect(cards.length).toBeGreaterThan(0);
    for (const ex of cards) {
      expect("tradition" in ex && ex.tradition !== undefined).toBe(false);
      expect("reading" in exerciseRefOf(ex)).toBe(false);
    }
    expect(cardKey("lexeme:x", "read-script", "yue-Hant-HK/standard")).toBe("lexeme:x|read-script|yue-Hant-HK/standard");
  });

  it("each tradition keeps its own cards, fading and due dates", () => {
    const [ex] = readingCards("baxter");
    if (ex === undefined || ex.template !== "char-read") throw new Error("no Baxter reading card");
    const events = eventFactory(lzh, manifestOf("lzh").id);
    events.at("2026-03-01T08:00:00.000Z");
    const met = events.answer(ex, true, 1);
    events.at("2026-03-03T08:00:00.000Z");
    events.session();
    const log = [met, events.answer(ex, true, 1)];
    const state = replay(log);
    const keys = Object.keys(state.cards).filter((k) => parseCardKey(k).skill === "read-script");
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(parseCardKey(k)).toMatchObject({ orthography: "lzh-Hant/standard", reading: "baxter" });
    // Read in Baxter, so its Baxter ruby fades on new words only; its Pinyin does not.
    const words = keys.map((k) => parseCardKey(k).part);
    expect([...readingsShown(lzh, state, S("baxter"))].sort()).toEqual([...new Set(words)].sort());
    expect(readingsShown(lzh, state, S("pinyin")).size).toBe(0);
    expect(readingsShown(lzh, state).size).toBe(0);
    // Due in Baxter only, and only for a learner reading in Baxter.
    const later = "2027-03-01T08:00:00.000Z";
    expect(dueFacets(state, "lzh-Hant/standard", later, 0.9, new Set(), "baxter").filter((f) => parseCardKey(f.key).skill === "read-script").length).toBe(keys.length);
    expect(dueFacets(state, "lzh-Hant/standard", later, 0.9, new Set(), "pinyin").filter((f) => parseCardKey(f.key).skill === "read-script")).toEqual([]);
  });

  it("typed readings come after a choice card has shown them, in that tradition", () => {
    const typed = (reading: "pinyin" | "jyutping" | "baxter"): number =>
      lessonNodes(lzh)
        .slice(0, 6)
        .flatMap(({ node }) => plan(lzh, emptyLearnerState(), { mode: "lesson", node: node.id }, { now, seed: 3, reading: S(reading) }).exercises)
        .filter((ex) => ex.template === "transcribe").length;
    // A new learner has shown no reading yet, in any tradition.
    expect(typed("pinyin") + typed("jyutping") + typed("baxter")).toBe(0);
  });
});
