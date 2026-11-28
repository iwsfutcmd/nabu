/**
 * What was seen is logged (ADR 0146): what each card displays, before its answer and with it; the
 * story lines read; the pairs seen in the fold, and the two readers of them. Cards are the planner's
 * (test/planned.ts walks a course); planned.test.ts checks every card of every fixture course's walk.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DisplayedLexeme, LearnerEvent, LearnerEventV1, OrthographyId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { gameConfig, replayGame } from "../src/game/index.ts";
import { applyEvents, emptyLearnerState, formsSeen, learnerEventOf, replay, seenIn, upgradeLog } from "../src/learner/index.ts";
import { displayedBefore, displayedWith, lexemeFormKey, seededRng, type CourseView, type Effect, type Exercise, type LessonEvent } from "../src/lesson/index.ts";
import { allStories, startStory, stepStory, storyScript, type StoryState } from "../src/story/index.ts";
import { aliasesOf, loadCourse } from "./learner-fixtures.ts";
import { plannedCards, walkPath } from "./planned.ts";
import { rightAnswer } from "./answers.ts";

const keys = (pairs: readonly { readonly lexeme: string; readonly feats?: Readonly<Record<string, string>> }[]): readonly string[] => pairs.map((p) => lexemeFormKey(p.lexeme, p.feats));

/** The first six lessons of a course's walk, with its reviews: every card, by id, as first planned. */
const cardsOf = (id: string, orthography?: string): { readonly course: CourseView; readonly card: (exercise: string) => Exercise } => {
  const course = loadCourse(id, orthography);
  // A card planned again later (a review) may draw other distractors: the first time it was planned.
  const cards = new Map<string, Exercise>();
  for (const { ex } of plannedCards(walkPath(course, { lessons: 6 }))) if (!cards.has(ex.id)) cards.set(ex.id, ex);
  return {
    course,
    card: (exercise) => {
      const ex = cards.get(exercise);
      if (ex === undefined) throw new Error(`no card ${exercise} on the walk of ${id}`);
      return ex;
    },
  };
};

const ESTAR_2S = "lexeme:estar|form:Mood=Ind;Number=Sing;Person=2;Tense=Pres;VerbForm=Fin";
const SER_1S = "lexeme:ser|form:Mood=Ind;Number=Sing;Person=1;Tense=Pres;VerbForm=Fin";

/** Named cards, one per family, each with what it displays before its answer and what the answer adds. */
const NAMED: readonly (readonly [string, string | undefined, string, readonly string[], readonly string[]])[] = [
  // Word cards: the words as the lexicon spells them, the wrong ones too; the glosses are English.
  ["es", undefined, "match-pairs:lexeme:buenas-tardes+lexeme:gracias+lexeme:sí+lexeme:no+lexeme:buenos-días", ["lexeme:buenas-tardes", "lexeme:gracias", "lexeme:sí", "lexeme:no", "lexeme:buenos-días"], []],
  ["es", undefined, "select-image:lexeme:hola", ["lexeme:buenos-días", "lexeme:hola", "lexeme:bien"], []],
  // ¿Tú estás bien? with its gap, and the options (estás among él, tú, me).
  ["es", undefined, "gap-fill:s.u01.20", [ESTAR_2S, "lexeme:bien", "lexeme:él", "lexeme:tú", "lexeme:me"], []],
  // A spelling card: only the right spelling is a form of the word (No, gracias).
  ["es", undefined, "spelling-choice:s.u01.6:gracias", ["lexeme:no", "lexeme:gracias"], []],
  // Soy Daniel., and the parts offered as the lexicon spells them.
  ["es", undefined, "whole-parts:s.u01.21", [SER_1S, "lexeme:daniel", "lexeme:estar", "lexeme:ser"], []],
  // No, gracias. with "no" left out: the word comes with the answer.
  ["es", undefined, "complete-translation:s.u01.6", ["lexeme:gracias"], ["lexeme:no"]],
  // Dictation: nothing before the answer, the sentence with it (Gracias.).
  ["es", undefined, "listen-type:s.u01.4", [], ["lexeme:gracias"]],
  // نه، ممنون. without its marks: the vocalized option is the word, the others no form of it.
  ["fa", undefined, "vocalize:s.5", ["lexeme:na", "lexeme:mamnun"], []],
  // Typed into Persian: the sentence only once answered.
  ["fa", undefined, "translate-type.l1-l2:s.5", [], ["lexeme:na", "lexeme:mamnun"]],
  // هستم writes the copula and its ending: a pair each.
  ["fa", undefined, "whole-parts:s.26", ["lexeme:mamnun", "lexeme:khub", "lexeme:budan", "lexeme:1sg"], []],
  ["fa", undefined, "translate-tap.l1-l2:s.6", ["lexeme:budan", "lexeme:1sg", "lexeme:va", "lexeme:kheyli", "lexeme:maryam", "lexeme:salam"], []],
  // Malika mening opam. with opam left out: opa is shown as its lemma, the answer adds its ending. A word in the
  // nominative is seen in that form since uz merges (its zero is folded into its values: docs/rules/uz.md).
  ["uz", "uz-Latn/standard", "parts-whole:s.family.9", ["lexeme:malika|form:Case=Nom", "lexeme:men", "lexeme:gen", "lexeme:opa"], ["lexeme:opa|form:Case=Nom", "lexeme:poss-1sg"]],
  ["uz", "uz-Latn/standard", "whole-parts:s.family.2", ["lexeme:bu|form:Case=Nom", "lexeme:ota|form:Case=Nom", "lexeme:poss-1sg", "lexeme:oqituvchi", "lexeme:ota", "lexeme:oila"], []],
  // A heard word's written options are on the card.
  ["uz", "uz-Latn/standard", "listen-select:lexeme:ha", ["lexeme:oqituvchi", "lexeme:salom", "lexeme:ha"], []],
  ["uz", "uz-Latn/standard", "complete-translation:s.5", ["lexeme:rahmat"], ["lexeme:yoq"]],
  // Reading cards: the sentence; its options are readings, never displayed.
  ["yue", undefined, "char-read:s.5:拜拜", ["lexeme:拜拜"], []],
  ["yue", undefined, "reading-feature:s.19:老師", ["lexeme:你", "lexeme:pl", "lexeme:係", "lexeme:唔", "lexeme:老師", "lexeme:呀"], []],
  ["yue", undefined, "transcribe:s.2", ["lexeme:你好"], []],
  // 我唔係學生。 with 我 left out.
  ["yue", undefined, "complete-translation:s.13", ["lexeme:唔", "lexeme:係", "lexeme:學生"], ["lexeme:我"]],
  ["yue", undefined, "gap-fill:s.17", ["lexeme:係", "lexeme:學生", "lexeme:佢", "lexeme:pl", "lexeme:我", "lexeme:你"], []],
];

describe("what a card displays (ADR 0146)", () => {
  const courses = new Map<string, ReturnType<typeof cardsOf>>();
  const of = (id: string, orthography: string | undefined): ReturnType<typeof cardsOf> => {
    const key = `${id} ${orthography ?? ""}`;
    const found = courses.get(key) ?? cardsOf(id, orthography);
    courses.set(key, found);
    return found;
  };

  it.each(NAMED)("%s %s %s", (id, orthography, exercise, before, after) => {
    const { course, card } = of(id, orthography);
    const ex = card(exercise);
    expect(keys(displayedBefore(course, ex))).toEqual(before);
    expect(keys(displayedWith(course, ex))).toEqual(after);
  });

  it("is the same for a card kept on the device (its JSON) as for the card planned", () => {
    for (const [id, orthography, exercise] of NAMED) {
      const { course, card } = of(id, orthography);
      const kept = JSON.parse(JSON.stringify(card(exercise))) as Exercise;
      expect(displayedBefore(course, kept), exercise).toEqual(displayedBefore(course, card(exercise)));
      expect(displayedWith(course, kept), exercise).toEqual(displayedWith(course, card(exercise)));
    }
  });

  it("logs it on the presentation and the answer, an empty list where a card shows nothing", () => {
    const { course, card } = of("es", undefined);
    const ex = card("listen-type:s.u01.4");
    const meta = { id: "00000000-0000-7000-8000-000000000001", clientTime: "2026-01-01T09:00:00.000Z", localDate: "2026-01-01", tz: "UTC", device: "d", session: "00000000-0000-7000-8000-000000000002", bundle: "0".repeat(64) };
    const session = { mode: "lesson" as const, node: "es.u01.hola", seed: 1, planner: "test" };
    const presented = learnerEventOf({ type: "exercise_presented", exercise: { id: ex.id, template: ex.template, item: ex.item }, ex }, course, meta, session);
    expect(presented?.type === "exercise_presented" ? presented.displayed : undefined).toEqual([]);
    const response = rightAnswer(ex);
    const answered = learnerEventOf(
      { type: "answer_submitted", exercise: { id: ex.id, template: ex.template, item: ex.item }, response, outcome: { kind: "CORRECT", notes: [] }, ex, graded: { verdict: "CORRECT", notes: [] } },
      course,
      meta,
      session,
    );
    expect(answered?.type === "answer_submitted" ? answered.displayed : undefined).toEqual([{ lexeme: "lexeme:gracias" }]);
  });
});

/** A story read to its end, answering each question right; the events it emits. */
const readStory = (course: CourseView, index: number): readonly LessonEvent[] => {
  const story = allStories(course)[index];
  if (story === undefined) throw new Error("no story");
  const script = storyScript(course, story, seededRng(3));
  const emitted: LessonEvent[] = [];
  let state: StoryState = startStory(script)[0];
  const run = (effects: readonly Effect[]): void => {
    for (const f of effects) if (f.tag === "emit") emitted.push(f.event);
  };
  run(startStory(script)[1]);
  const dispatch = (event: Parameters<typeof stepStory>[1]): void => {
    const [next, effects] = stepStory(state, event);
    state = next;
    for (const f of effects) {
      if (f.tag === "emit") emitted.push(f.event);
      else if (f.tag === "grade") {
        const [graded, more] = stepStory(state, { tag: "player", event: { tag: "graded", outcome: { verdict: "CORRECT", notes: [] } } });
        state = graded;
        run(more);
      }
    }
  };
  for (let guard = 0; state.tag !== "finished" && guard < 500; guard++) {
    if (state.tag === "reading") dispatch({ tag: "continue" });
    else if (state.player.tag === "presenting") dispatch({ tag: "player", event: { tag: "ready" } });
    else if (state.player.tag === "answering") {
      dispatch({ tag: "player", event: { tag: "input", draft: state.ex.template === "story-arrange" ? { tag: "tiles", order: state.ex.solution } : { tag: "choice", index: "answer" in state.ex ? (state.ex.answer) : 0 } } });
      dispatch({ tag: "player", event: { tag: "submit" } });
    } else if (state.player.tag === "feedback") dispatch({ tag: "player", event: { tag: "continue" } });
  }
  expect(state.tag).toBe("finished");
  return emitted;
};

describe("a story records the lines read (ADR 0146)", () => {
  it.each([["es"], ["fa"], ["uz"], ["yue"], ["chg"]])("%s: every line once, as it joins the transcript, with what it displays", (id) => {
    const course = loadCourse(id);
    const story = allStories(course)[0];
    if (story === undefined) throw new Error("no story");
    const script = storyScript(course, story, seededRng(3));
    const events = readStory(course, 0);
    const lines = events.flatMap((e) => (e.type === "story_line_read" ? [e] : []));
    expect(lines.map((l) => l.line)).toEqual(script.lines.map((l) => l.step));
    expect(new Set(lines.map((l) => l.line)).size).toBe(lines.length);
    const meta = { id: "00000000-0000-7000-8000-000000000001", clientTime: "2026-01-01T09:00:00.000Z", localDate: "2026-01-01", tz: "UTC", device: "d", session: "00000000-0000-7000-8000-000000000002", bundle: "0".repeat(64) };
    for (const [i, l] of lines.entries()) {
      const e = learnerEventOf(l, course, meta, { mode: "story", node: script.node, seed: 1, planner: "story" });
      const line = script.lines[i];
      expect(e?.type, `${l.line}`).toBe("story_line_read");
      if (e?.type !== "story_line_read" || line === undefined) continue;
      expect(e.story).toBe(script.id);
      // The line's own words, each lexeme of each token in its form.
      const own = new Set(line.text.tokens.flatMap((t) => (t.kind === "lexical" ? (t.lexemes ?? []).map((k) => lexemeFormKey(k.lexeme, k.feats)) : [])));
      expect(new Set(keys(e.displayed).filter((k) => own.has(k)))).toEqual(own);
    }
    // A line comes after the session's start and before its end.
    expect(events[0]?.type).toBe("session_started");
    expect(events.at(-1)?.type).toBe("session_completed");
  });
});

describe("the pairs seen, in the fold (ADR 0146)", () => {
  const course = loadCourse("es");
  const base = { schema: 2 as const, device: "d", course: "es", orthography: "es-Latn/standard" as OrthographyId, support: "en", bundle: "0".repeat(64), session: "00000000-0000-7000-8000-0000000000aa", tz: "UTC" };
  let n = 0;
  const at = (date: string) => ({ ...base, id: `00000000-0000-7000-8000-${(++n).toString(16).padStart(12, "0")}`, clientTime: `${date}T09:00:00.000Z`, localDate: date });
  const ex = { id: "gap-fill:s.u01.20", template: "gap-fill" as const, item: "s.u01.20", parts: ["lexeme:estar"] };
  const estar2 = { lexeme: "lexeme:estar", feats: { Mood: "Ind", Number: "Sing", Person: "2", Tense: "Pres", VerbForm: "Fin" } };
  const presented = (date: string, displayed?: readonly DisplayedLexeme[]): LearnerEvent => ({ ...at(date), type: "exercise_presented", exercise: ex, ...(displayed === undefined ? {} : { displayed }) });
  const line = (date: string): LearnerEvent => ({ ...at(date), type: "story_line_read", story: "es.story.one", line: 2, displayed: [{ lexeme: "lexeme:hola" }] });
  const answer = (date: string): LearnerEvent => ({
    ...at(date),
    type: "answer_submitted",
    exercise: ex,
    attempt: 1,
    input: { method: "choice", latencyMs: 3000 },
    outcome: { kind: "CORRECT", notes: [], labels: [], parts: [] },
    displayed: [{ lexeme: "lexeme:ser", feats: { Mood: "Ind", Number: "Sing", Person: "1", Tense: "Pres", VerbForm: "Fin" } }],
  });

  it("keeps each lexeme's forms seen, by presentation, answer and story line, with the first day each was seen", () => {
    const state = replay([presented("2026-01-03", [estar2, { lexeme: "lexeme:bien" }]), answer("2026-01-04"), line("2026-01-05"), presented("2026-01-02", [estar2])]);
    expect(state.seen).toEqual({
      "lexeme:estar": { [lexemeFormKey("lexeme:estar", estar2.feats)]: "2026-01-02" },
      "lexeme:bien": { "lexeme:bien": "2026-01-03" },
      "lexeme:ser": { [SER_1S]: "2026-01-04" },
      "lexeme:hola": { "lexeme:hola": "2026-01-05" },
    });
    expect(seenIn(state, "lexeme:estar", estar2.feats)).toBe(true);
    expect(seenIn(state, "lexeme:estar", { ...estar2.feats, Person: "1" })).toBe(false);
    expect(seenIn(state, "lexeme:estar")).toBe(false);
    expect(seenIn(state, "lexeme:bien")).toBe(true);
    expect(formsSeen(state, "lexeme:estar")).toEqual([ESTAR_2S]);
    expect(formsSeen(state, "lexeme:casa")).toEqual([]);
    // Exposure, not memory: no card, nothing met.
    expect(state.cards).toEqual(emptyLearnerState().cards);
    expect(state.met).toEqual({});
  });

  it("forgets them with the rest on a reset, however the events are given", () => {
    const reset: LearnerEvent = { ...at("2026-01-06"), type: "progress_reset" };
    const before = presented("2026-01-03", [estar2]);
    const after = presented("2026-01-07", [estar2]);
    expect(replay([before, reset]).seen).toEqual({});
    expect(replay([before, reset, after]).seen).toEqual({ "lexeme:estar": { [ESTAR_2S]: "2026-01-07" } });
    // Folded as the device records them: the reset and a pair seen before it, in one batch.
    const held = replay([before]);
    expect(applyEvents(held, [reset, after]).seen).toEqual({ "lexeme:estar": { [ESTAR_2S]: "2026-01-07" } });
    // A presentation of nothing new gives the state back as it is, uncopied.
    expect(applyEvents(held, [presented("2026-01-04", [estar2])])).toBe(held);
    expect(applyEvents(held, [presented("2026-01-04")])).toBe(held);
  });

  it("counts nothing logged before seen was: an old log upgraded says nothing was displayed", () => {
    const old = readFileSync(join(import.meta.dirname, "golden/es-old-log.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as LearnerEventV1);
    const upgraded = upgradeLog(old, () => aliasesOf("es"));
    expect(upgraded.some((e) => "displayed" in e)).toBe(false);
    expect(replay(upgraded).seen).toEqual({});
    expect(course.id).toBe("es");
  });

  it("leaves the game as it was: the new event and the new field change no game state", () => {
    const log = [presented("2026-01-03", [estar2]), answer("2026-01-03"), line("2026-01-03")];
    const without = log.flatMap((e): LearnerEvent[] => {
      if (e.type === "story_line_read") return [];
      if (e.type === "exercise_presented" || e.type === "answer_submitted") {
        const { displayed: _displayed, ...rest } = e;
        return [rest];
      }
      return [e];
    });
    const config = gameConfig({});
    const clock = { today: "2026-01-03", now: "2026-01-03T12:00:00.000Z" };
    expect(replayGame(log.map((event) => ({ event })), config, clock)).toEqual(replayGame(without.map((event) => ({ event })), config, clock));
  });
});
