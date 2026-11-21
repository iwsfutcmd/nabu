/**
 * Old events in the new shape (docs/migration-design.md, "Old events"): `upgrade` is the only
 * reader of schema 1. Its rules on hand-made events and a small alias table; then a real old log
 * (six sessions of a simulated es learner, as the app before the switch logged them) against what
 * the fold before the switch said of it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AliasTable, AnswerSubmitted, AnswerSubmittedV1, KcId, LearnerEvent, LearnerEventV1, OutcomeRevisedV1, SessionCompletedV1 } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { dueFacets, isOld, learnedWords, replay, upgrade, upgradeLog } from "../src/learner/index.ts";
import { replayBefore } from "./fold-before-r2.ts";
import { aliasesOf, loadCourse } from "./learner-fixtures.ts";

const ALIASES: AliasTable = {
  course: "es",
  aliases: {
    "sense:casa": { part: "lexeme:casa" },
    "sense:hablar": { part: "lexeme:hablar" },
    "sense:la": { part: "lexeme:el" },
    "sense:kifak": { part: "lexeme:kif", byItem: { "s.6": ["lexeme:kif", "lexeme:poss-2ms"] } },
    "form:pres-1s": { seeds: ["feature:Tense=Pres"], byItem: { "s.1": ["feature:Tense=Pres"], "story.one#3": ["feature:Tense=Pres"] } },
    "form:pres-3s": { seeds: ["feature:Tense=Pres"], byItem: { "s.1": ["feature:Tense=Pres"] } },
    "form:fem": { seeds: ["feature:Gender=Fem"], byItem: { "s.1": ["feature:Gender=Fem"] } },
    "form:fem-pl": {},
    "form:dat-ga": { part: "lexeme:dat" },
    "construction:used-to": { part: "rule:used-to" },
    "grapheme:alif": { part: "grapheme:alif" },
  },
};

const META = {
  schema: 1 as const,
  device: "d",
  course: "es",
  orthography: "es-Latn/standard" as AnswerSubmittedV1["orthography"],
  support: "en",
  bundle: "0".repeat(64),
  session: "00000000-0000-7000-8000-00000000000a",
  clientTime: "2026-01-01T09:00:00.000Z",
  localDate: "2026-01-01",
  tz: "UTC",
};

const answered = (template: AnswerSubmittedV1["exercise"]["template"], item: string, kcs: readonly (readonly [string, "right" | "wrong" | "given"])[], more: Partial<AnswerSubmittedV1["exercise"]> = {}): AnswerSubmittedV1 => ({
  ...META,
  id: "00000000-0000-7000-8000-000000000001",
  type: "answer_submitted",
  exercise: { id: `${template}:${item}`, template, item, kcs: kcs.map(([kc]) => kc as KcId), ...more },
  attempt: 1,
  input: { method: "choice", latencyMs: 4000 },
  outcome: { kind: "CORRECT", notes: [], kcs: kcs.map(([kc, status]) => ({ kc: kc as KcId, status })) },
});

const creditsOf = (e: LearnerEvent): readonly (readonly [string, string, string])[] => (e.type === "answer_submitted" || e.type === "outcome_revised" ? e.outcome.parts.map((c) => [c.part, c.skill, c.status] as const) : []);

describe("an old event in the new shape", () => {
  it("names parts where it named KCs: a sense its lexeme, a form the values its sentence teaches", () => {
    const e = upgrade(answered("choose-translation", "s.1", [["sense:hablar", "right"], ["form:pres-1s", "right"], ["sense:la", "right"], ["form:fem", "right"]]), ALIASES);
    expect(e.schema).toBe(2);
    if (e.type !== "answer_submitted") throw new Error("not an answer");
    expect(e.exercise.parts).toEqual(["lexeme:hablar", "feature:Tense=Pres", "lexeme:el", "feature:Gender=Fem"]);
    expect(e.exercise.item).toBe("s.1");
    expect(e.outcome.labels).toEqual([]);
    // A card that is read: a lexeme recognized, a feature value read off its form.
    expect(creditsOf(e)).toEqual([
      ["lexeme:hablar", "recognize", "right"],
      ["feature:Tense=Pres", "read-off", "right"],
      ["lexeme:el", "recognize", "right"],
      ["feature:Gender=Fem", "read-off", "right"],
    ]);
  });

  it("gives each part the skill a card of the event's template exercises it by", () => {
    const kcs = [["sense:hablar", "right"], ["form:pres-1s", "right"]] as const;
    expect(creditsOf(upgrade(answered("translate-type.l1-l2", "s.1", kcs), ALIASES))).toEqual([
      ["lexeme:hablar", "produce", "right"],
      ["feature:Tense=Pres", "choose", "right"],
    ]);
    expect(creditsOf(upgrade(answered("listen-tap", "s.1", kcs), ALIASES))).toEqual([
      ["lexeme:hablar", "listen", "right"],
      ["feature:Tense=Pres", "read-off", "right"],
    ]);
    expect(creditsOf(upgrade(answered("speak.tier-0", "s.1", kcs), ALIASES))).toEqual([
      ["lexeme:hablar", "speak", "right"],
      ["feature:Tense=Pres", "choose", "right"],
    ]);
    // A card about a script reads letters: it shows nothing of a feature value, whatever the old credit said.
    expect(creditsOf(upgrade(answered("transcribe", "s.1", kcs), ALIASES))).toEqual([
      ["lexeme:hablar", "read-script", "right"],
      ["feature:Tense=Pres", "read-off", "given"],
    ]);
  });

  it("gives a form nothing where its sentence is not known or teaches none of its values", () => {
    const elsewhere = upgrade(answered("choose-translation", "s.gone", [["sense:hablar", "wrong"], ["form:pres-1s", "wrong"], ["form:fem-pl", "wrong"]]), ALIASES);
    expect(creditsOf(elsewhere)).toEqual([["lexeme:hablar", "recognize", "wrong"]]);
    if (elsewhere.type === "answer_submitted") expect(elsewhere.exercise.parts).toEqual(["lexeme:hablar"]);
  });

  it("makes one credit of two old ones that are one part now: wrong if either was, else right if either was", () => {
    const credit = (a: "right" | "wrong" | "given", b: "right" | "wrong" | "given"): string | undefined =>
      creditsOf(upgrade(answered("gap-fill", "s.1", [["form:pres-1s", a], ["form:pres-3s", b]]), ALIASES)).find(([part]) => part === "feature:Tense=Pres")?.[2];
    expect(credit("right", "wrong")).toBe("wrong");
    expect(credit("wrong", "right")).toBe("wrong");
    expect(credit("given", "right")).toBe("right");
    expect(credit("right", "given")).toBe("right");
    expect(credit("given", "given")).toBe("given");
    expect(creditsOf(upgrade(answered("gap-fill", "s.1", [["form:pres-1s", "right"], ["form:pres-3s", "right"]]), ALIASES))).toHaveLength(1);
  });

  it("splits a sense that is several lexemes in its sentence, and keeps its first elsewhere", () => {
    expect(creditsOf(upgrade(answered("choose-translation", "s.6", [["sense:kifak", "right"]]), ALIASES)).map(([part]) => part)).toEqual(["lexeme:kif", "lexeme:poss-2ms"]);
    expect(creditsOf(upgrade(answered("choose-translation", "s.9", [["sense:kifak", "right"]]), ALIASES)).map(([part]) => part)).toEqual(["lexeme:kif"]);
  });

  it("renames a word card's item, and the ids its exercise is named by", () => {
    const word = upgrade(answered("select-image", "sense:casa", [["sense:casa", "right"]]), ALIASES);
    if (word.type !== "answer_submitted") throw new Error("not an answer");
    expect(word.exercise.item).toBe("lexeme:casa");
    expect(word.exercise.id).toBe("select-image:lexeme:casa");
    const pairs = upgrade(answered("match-pairs", "sense:casa", [["sense:casa", "right"], ["sense:hablar", "right"]], { id: "match-pairs:sense:casa+sense:hablar#2" }), ALIASES);
    if (pairs.type !== "answer_submitted") throw new Error("not an answer");
    expect(pairs.exercise.id).toBe("match-pairs:lexeme:casa+lexeme:hablar#2");
    // A sentence's id is as it was, its retry number too.
    const again = upgrade(answered("gap-fill", "s.1", [["sense:hablar", "right"]], { id: "gap-fill:s.1#3" }), ALIASES);
    if (again.type === "answer_submitted") expect(again.exercise.id).toBe("gap-fill:s.1#3");
  });

  it("asks which lexeme where it asked which word", () => {
    const word = upgrade(answered("gap-fill", "s.1", [["sense:hablar", "right"], ["form:pres-1s", "given"]], { asks: "word" }), ALIASES);
    const form = upgrade(answered("gap-fill", "s.1", [["sense:hablar", "given"], ["form:pres-1s", "right"]], { asks: "form" }), ALIASES);
    if (word.type !== "answer_submitted" || form.type !== "answer_submitted") throw new Error("not an answer");
    expect(word.exercise.asks).toBe("lexeme");
    expect(form.exercise.asks).toBe("form");
    expect(creditsOf(form)).toEqual([
      ["lexeme:hablar", "recognize", "given"],
      ["feature:Tense=Pres", "read-off", "right"],
    ]);
  });

  it("finds a story line's parts by the id the table lists it by", () => {
    const e = upgrade(answered("story-complete", "story.one/3", [["sense:hablar", "right"], ["form:pres-1s", "given"]]), ALIASES);
    if (e.type !== "answer_submitted") throw new Error("not an answer");
    expect(e.exercise.item).toBe("story.one/3");
    expect(e.exercise.parts).toEqual(["lexeme:hablar", "feature:Tense=Pres"]);
  });

  it("keeps an id the table does not have by its own name, and never invents a form's part", () => {
    const e = upgrade(answered("choose-translation", "s.1", [["sense:ido", "right"], ["form:ido", "right"], ["construction:ido", "right"], ["grapheme:x", "right"]]), ALIASES);
    expect(creditsOf(e).map(([part]) => part)).toEqual(["lexeme:ido", "rule:ido", "grapheme:x"]);
    // With no table at all (a course whose bundle is not at hand), the same.
    expect(creditsOf(upgrade(answered("choose-translation", "s.1", [["sense:casa", "right"], ["form:fem", "right"]]), undefined)).map(([part]) => part)).toEqual(["lexeme:casa"]);
  });

  it("seeds what a placement's nodes introduce now", () => {
    const placed: SessionCompletedV1 = {
      ...META,
      id: "00000000-0000-7000-8000-000000000002",
      type: "session_completed",
      mode: "placement",
      summary: { completed: true, exercises: 12, correctFirstTry: 9, retries: 0, skipped: 0 },
      placed: ["n.1"],
      seeded: ["sense:casa", "form:pres-1s", "form:pres-3s", "form:fem-pl", "form:dat-ga", "construction:used-to", "grapheme:alif"] as KcId[],
    };
    const e = upgrade(placed, ALIASES);
    if (e.type !== "session_completed") throw new Error("not a session");
    expect(e.seeded).toEqual(["lexeme:casa", "feature:Tense=Pres", "lexeme:dat", "rule:used-to", "grapheme:alif"]);
    expect(e.placed).toEqual(["n.1"]);
  });

  it("revises by the answer it revises, wherever in the log that is", () => {
    const answer = answered("translate-type.l1-l2", "s.1", [["sense:hablar", "wrong"], ["form:pres-1s", "wrong"]]);
    const revision: OutcomeRevisedV1 = {
      ...META,
      id: "00000000-0000-7000-8000-000000000003",
      type: "outcome_revised",
      answer: answer.id,
      outcome: { kind: "CORRECT_PROVISIONAL", notes: ["judge"], kcs: [{ kc: "sense:hablar" as KcId, status: "right" }, { kc: "form:pres-1s" as KcId, status: "right" }] },
      by: "judge",
    };
    const [revised] = upgradeLog([revision, answer], () => ALIASES);
    expect(creditsOf(revised as LearnerEvent)).toEqual([
      ["lexeme:hablar", "produce", "right"],
      ["feature:Tense=Pres", "choose", "right"],
    ]);
    // Without its answer it revises nothing (replay passes it over): it is still an event of schema 2.
    const alone = upgrade(revision, ALIASES);
    expect(alone.schema).toBe(2);
    expect(creditsOf(alone)).toEqual([["lexeme:hablar", "recognize", "right"]]);
  });

  it("renames the word a correction is about", () => {
    const e = upgrade({ ...META, id: "00000000-0000-7000-8000-000000000004", type: "sentence_reported", item: "sense:casa", shown: {}, correction: {} }, ALIASES);
    if (e.type !== "sentence_reported") throw new Error("not a correction");
    expect(e.item).toBe("lexeme:casa");
  });

  it("leaves an event of schema 2 as it is, so a log part old and part new comes out whole", () => {
    const old = answered("choose-translation", "s.1", [["sense:casa", "right"]]);
    const now = upgrade(old, ALIASES) as AnswerSubmitted;
    expect(isOld(old)).toBe(true);
    expect(isOld(now)).toBe(false);
    expect(upgrade(now, ALIASES)).toBe(now);
    const log = upgradeLog([now, { ...old, id: "00000000-0000-7000-8000-000000000005" }], () => ALIASES);
    expect(log[0]).toBe(now);
    expect(log.every((e) => e.schema === 2)).toBe(true);
  });
});

describe("a log from before the switch (six sessions of es)", () => {
  const GOLDEN = join(import.meta.dirname, "golden");
  const old = readFileSync(join(GOLDEN, "es-old-log.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as LearnerEventV1);
  /** What the fold before the switch said of this log (the main branch's `replay`, `learnedWords`, `dueFacets`). */
  const before = JSON.parse(readFileSync(join(GOLDEN, "es-old-log.old-fold.json"), "utf8")) as {
    readonly now: string;
    readonly completedNodes: readonly string[];
    readonly xp: unknown;
    readonly words: readonly { readonly kc: string; readonly known: boolean; readonly due: boolean; readonly reviews: number }[];
    readonly mistakes: readonly { readonly item: string; readonly template: string; readonly at: string }[];
    readonly cards: readonly string[];
  };
  const aliases = aliasesOf("es");
  const upgraded = upgradeLog(old, () => aliases);
  const state = replay(upgraded);
  const course = loadCourse("es");

  it("is all of the old shape, and comes out all of the new", () => {
    expect(old.every((e) => e.schema === 1)).toBe(true);
    expect(upgraded).toHaveLength(old.length);
    expect(upgraded.every((e) => e.schema === 2)).toBe(true);
    expect(upgraded.map((e) => e.id)).toEqual(old.map((e) => e.id));
  });

  it("folds as its oracle folds it (docs/migration-design.md: the oracle folds an upgraded log)", () => {
    expect(JSON.stringify(state)).toBe(JSON.stringify(replayBefore(upgraded)));
  });

  it("keeps the lessons done, the XP and the open mistakes", () => {
    expect(state.completedNodes).toEqual(before.completedNodes);
    expect(state.xp).toEqual(before.xp);
    expect(state.mistakes.map((m) => [m.item, m.template, m.at])).toEqual(before.mistakes.map((m) => [m.item, m.template, m.at]));
  });

  it("lists every word the old fold listed, each known or learning, and due, as it was", () => {
    const words = learnedWords(course, state, before.now);
    expect(words.map((w) => [w.lexeme, w.known, w.due, w.reviews])).toEqual(before.words.map((w) => [aliases.aliases[w.kc]?.part, w.known, w.due, w.reviews]));
  });

  it("keeps a lexeme's cards as they were, and a form's as its feature values'", () => {
    const cards = new Set(Object.keys(state.cards));
    for (const key of before.cards) {
      const [kc = "", facet = "", ...rest] = key.split("|");
      const part = aliases.aliases[kc]?.part;
      if (part !== undefined) expect(cards.has([part, facet, ...rest].join("|")), key).toBe(true);
    }
    // The present tense was three KCs (I, you, he or she) with a card each; it is one value now,
    // read off a form where it was recognized, chosen where it was produced or said.
    expect(before.cards.filter((key) => key.startsWith("form:pres-"))).toEqual(["form:pres-1s|produce", "form:pres-1s|recognize", "form:pres-1s|speak", "form:pres-2s|recognize", "form:pres-3s|recognize", "form:pres-3s|speak"]);
    expect([...cards].filter((key) => key.startsWith("feature:Tense=Pres")).sort()).toEqual(["feature:Tense=Pres|choose", "feature:Tense=Pres|read-off"]);
    // The feminine was said once of a noun alone (form:fem|speak on señora, in "Encantado,
    // señora"), whose gender is its lexeme's now: no word of that sentence chooses it, so that
    // credit has no part.
    expect(before.cards.filter((key) => key.startsWith("form:fem"))).toEqual(["form:fem|recognize", "form:fem|speak"]);
    expect([...cards].filter((key) => key.startsWith("feature:")).sort()).toEqual(["feature:Gender=Fem|read-off", "feature:Tense=Pres|choose", "feature:Tense=Pres|read-off"]);
    expect([...cards].some((key) => key.startsWith("form:") || key.startsWith("sense:"))).toBe(false);
  });

  it("has nothing due that no session can practise", () => {
    const parts = new Set<string>(course.units.flatMap((u) => u.sentences.flatMap((s) => s.parts)));
    for (const lexeme of course.lexicon.lexemes) parts.add(lexeme.id);
    for (const due of dueFacets(state, course.orthography, before.now)) expect(parts.has(due.key.slice(0, due.key.lastIndexOf("|"))), due.key).toBe(true);
  });
});
