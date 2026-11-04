/** Phase 8, the pure parts: model text as TaggedText, explanations, and roleplay turn checks. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AnswerReported, AnswerSubmitted, BundleManifest, EvalGate, LearnerEvent, OutcomeRevised, TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { acceptForJudge, accepts, autoTokens, checkTurn, excerpt, explanationOf, gateOf, gateOpen, judgeable, knownForms, provisionalOutcome } from "../src/ai/index.ts";
import { DEFAULT_GAME, replayGame } from "../src/game/index.ts";
import { emptyLearnerState, replay } from "../src/learner/index.ts";
import { assembleCourse, buildLesson, MEDIA_ROLES, type CourseView } from "../src/lesson/index.ts";
import { surfaceOf } from "../src/text/index.ts";
import { eventFactory } from "./learner-fixtures.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;
const loadCourse = (id: string, orthography?: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]));
  const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

const ZWNJ = "\u200C";
const kinds = (t: TaggedText): string[] => t.tokens.map((x) => `${x.kind}:${x.surface}`);
const FA = { lang: "fa-Arab-IR", orthography: "fa-Arab/standard" } as Pick<TaggedText, "lang" | "orthography">;
const YUE = { lang: "yue-Hant-HK", orthography: "yue-Hant-HK/standard" } as Pick<TaggedText, "lang" | "orthography">;
const EN = { lang: "en-Latn", orthography: "en-Latn/standard" } as Pick<TaggedText, "lang" | "orthography">;
const PROVENANCE = { provider: "ollama" as const, model: "test", prompt: "explain", promptHash: "0123456789ab", createdAt: "2026-01-01T00:00:00Z" };

describe("model text as TaggedText", () => {
  it("keeps ZWNJ, modifier letters and grapheme clusters inside words", () => {
    expect(kinds(autoTokens(`کتاب${ZWNJ}های من.`, FA))).toEqual([`word:کتاب${ZWNJ}های`, "space: ", "word:من", "punct:."]);
    expect(kinds(autoTokens("Oʻqituvchi, 12!", { lang: "uz-Latn", orthography: "uz-Latn/standard" } as Pick<TaggedText, "lang" | "orthography">))).toEqual(["word:Oʻqituvchi", "punct:,", "space: ", "number:12", "punct:!"]);
    expect(kinds(autoTokens("你好！👋🏽 ok", YUE))).toEqual(["word:你", "word:好", "punct:！", "symbol:👋🏽", "space: ", "word:ok"]);
    expect(surfaceOf(autoTokens("e\u0301te\u0301", EN))).toBe("été"); // NFC
  });
});

describe("Explain My Answer", () => {
  const ctx = { support: EN, target: YUE, answer: "I am not student", answerIn: EN };
  const yue = { support: EN, target: YUE, answer: "我唔係學生", answerIn: YUE };

  it("tags each segment with its own language, and maps refs to the answer's words", () => {
    const out = explanationOf(
      {
        segments: [
          { kind: "support", text: "You wrote" },
          { kind: "ref", answerTokens: [2] },
          { kind: "support", text: ", but the sentence says" },
          { kind: "target", text: "我係學生" },
          { kind: "support", text: ": there is no 唔 in it." },
        ],
      },
      ctx,
      PROVENANCE,
    );
    if (!out.ok) throw new Error(out.error);
    const [a, ref, , quote] = out.value.segments;
    expect(a?.text?.lang).toBe("en-Latn");
    expect(quote?.text?.lang).toBe("yue-Hant-HK");
    // "not" is the third word of the answer; in TaggedText it is token 4 (spaces count).
    expect(ref?.answerTokens).toEqual([4]);
    expect(out.value.answer.tokens[4]?.surface).toBe("not");
    expect(out.value.provenance).toEqual(PROVENANCE);
  });

  it("points at single characters of an answer in Han", () => {
    const out = explanationOf({ segments: [{ kind: "support", text: "Drop" }, { kind: "ref", answerTokens: [1] }] }, yue, PROVENANCE);
    if (!out.ok) throw new Error(out.error);
    expect(out.value.answer.tokens.map((t) => t.surface)).toEqual(["我", "唔", "係", "學", "生"]);
    expect(out.value.segments[1]?.answerTokens).toEqual([1]);
    expect(excerpt(out.value.answer, [3, 0, 4]).tokens.map((t) => t.surface)).toEqual(["我", " ", "學", "生"]);
  });

  it("refuses refs past the answer, empty text, and explanations with no prose", () => {
    expect(explanationOf({ segments: [{ kind: "support", text: "x" }, { kind: "ref", answerTokens: [9] }] }, ctx, PROVENANCE)).toEqual({ ok: false, error: "bad-ref" });
    expect(explanationOf({ segments: [{ kind: "support", text: "  " }] }, ctx, PROVENANCE)).toEqual({ ok: false, error: "bad-segment" });
    expect(explanationOf({ segments: [{ kind: "target", text: "我" }] }, ctx, PROVENANCE)).toEqual({ ok: false, error: "empty" });
  });
});

describe("roleplay turn checks", () => {
  const fa = loadCourse("fa");
  const known = ["سلام", "من", "مریم", "هستم", "خوب"];

  it("passes a turn in known words, and counts new ones against the budget", () => {
    expect(checkTurn(fa, "سلام! من مریم هستم.", known, 0)).toMatchObject({ ok: true, unknown: [], words: 4 });
    const extra = checkTurn(fa, "سلام! من مریم هستم. کتاب خوب است.", known, 1);
    expect(extra.unknown).toEqual(["کتاب", "است"]);
    expect(extra.ok).toBe(false);
  });

  it("catches another script in the turn", () => {
    expect(checkTurn(fa, "سلام Maryam!", known, 5)).toMatchObject({ ok: false, outOfScript: ["M", "a", "r", "y", "m"] });
    const yue = loadCourse("yue");
    expect(checkTurn(yue, "早晨！你好呀。", ["早晨", "你好", "呀"], 0).ok).toBe(true);
    expect(checkTurn(yue, "早晨！hello", ["早晨"], 5).outOfScript).toEqual(["h", "e", "l", "o"]);
  });

  it("known vocabulary comes from the learner's recall, not from the course", () => {
    expect(knownForms(fa, emptyLearnerState(), "2026-01-01T00:00:00Z")).toEqual([]);
  });
});

describe("the judge's rules", () => {
  const fa = loadCourse("fa");
  const events = eventFactory(fa, "0".repeat(64));
  const [exercise] = buildLesson(fa, "fa.greetings", { seed: 3 }).filter((e) => e.kcs.length > 0);
  if (exercise === undefined) throw new Error("no exercise");
  const typed = (e: LearnerEvent, raw = "سلام"): AnswerSubmitted => {
    if (e.type !== "answer_submitted") throw new Error(e.type);
    return { ...e, exercise: { ...e.exercise, template: "translate-type.l1-l2" }, input: { method: "text", raw, latencyMs: 5000 } };
  };

  it("judges only free production graded WRONG", () => {
    expect(judgeable(typed(events.answer(exercise, false, 1)))).toBe(true);
    expect(judgeable(typed(events.answer(exercise, true, 1)))).toBe(false);
    expect(judgeable(typed(events.answer(exercise, false, 1), "  "))).toBe(false);
    const tiles = typed(events.answer(exercise, false, 1));
    expect(judgeable({ ...tiles, exercise: { ...tiles.exercise, template: "translate-tap.l1-l2" } })).toBe(false);
    expect(judgeable({ ...tiles, outcome: { ...tiles.outcome, kind: "WRONG_WORD" } })).toBe(false);
  });

  it("accepts only above the threshold", () => {
    expect(accepts({ verdict: "accept", confidence: 0.95, category: "paraphrase" })).toBe(true);
    expect(accepts({ verdict: "accept", confidence: 0.6, category: "paraphrase" })).toBe(false);
    expect(accepts({ verdict: "reject", confidence: 0.99, category: "meaning-change" })).toBe(false);
  });

  it("shows the judge the canonical answer first, then the heaviest alternatives", () => {
    expect(acceptForJudge("[I am] a student @0.5\nStudent here @0.2\nI'm a student @3")).toEqual(["I am a student", "I'm a student", "a student", "Student here"]);
  });

  it("opens a gate only for the model and prompt it was evaluated with", () => {
    const gate: EvalGate = { course: "fa", orthography: "fa-Arab/standard" as EvalGate["orthography"], provider: "ollama", model: "m", promptHash: "0123456789ab", falseAccept: 0.01, falseReject: 0.2, n: 60, enabled: true, evaluatedAt: "2026-01-01T00:00:00Z" };
    const model = { provider: "ollama" as const, model: "m", promptHash: "0123456789ab" };
    expect(gateOpen([gate], "fa", "fa-Arab/standard", model)).toBe(true);
    expect(gateOpen([gate], "fa", "fa-Arab/standard", { ...model, promptHash: "ffffffffffff" })).toBe(false);
    expect(gateOpen([gate], "yue", "yue-Hant-HK/standard", model)).toBe(false);
    expect(gateOpen([{ ...gate, enabled: false }], "fa", "fa-Arab/standard", model)).toBe(false);
    expect(gateOpen([], "fa", "fa-Arab/standard", model)).toBe(false);
  });

  it("gates on false accepts, counting a missing verdict as an accept", () => {
    const rejects = (n: number, accepted: boolean | undefined) => Array.from({ length: n }, () => ({ expect: "reject" as const, accepted }));
    expect(gateOf([...rejects(50, false), { expect: "accept", accepted: false }])).toEqual({ falseAccept: 0, falseReject: 1, n: 51, enabled: true });
    expect(gateOf([...rejects(49, false), ...rejects(1, undefined)]).enabled).toBe(true); // 1/50 = 2%
    expect(gateOf([...rejects(48, false), ...rejects(2, true)]).enabled).toBe(false); // 4%
    expect(gateOf(rejects(10, false)).enabled).toBe(false); // too few items to mean anything
    expect(gateOf([]).enabled).toBe(false);
  });

  it("a revision upgrades the answer retroactively, in any order", () => {
    events.at("2026-01-01T09:00:00.000Z");
    const answer = typed(events.answer(exercise, false, 1));
    events.at("2026-01-03T12:00:00.000Z");
    const { id: _id, type: _type, exercise: _exercise, attempt: _attempt, input: _input, outcome: _outcome, prediction: _prediction, ...common } = answer;
    const revision: OutcomeRevised = {
      ...common,
      id: "00000000-0000-7000-8000-ffffffffffff",
      type: "outcome_revised",
      clientTime: "2026-01-03T12:00:00.000Z",
      localDate: "2026-01-03",
      answer: answer.id,
      outcome: provisionalOutcome(answer),
      by: "judge",
      judge: { model: "m", promptHash: "0123456789ab", confidence: 0.95 },
    };
    const before = replay([answer]);
    const after = replay([revision, answer]);
    expect(before.xp.total).toBe(0);
    expect(after.xp.total).toBe(1);
    expect(after.xp.byDate["2026-01-01"]).toBe(1); // on the answer's date, not the revision's
    expect(after.mistakes).toEqual([]);
    expect(replay([answer, revision])).toEqual(after);
    expect(provisionalOutcome(answer).kcs.every((c) => c.status !== "wrong")).toBe(true);
    const clock = { now: "2026-01-04T00:00:00.000Z", today: "2026-01-04" };
    expect(replayGame([{ event: answer }, { event: revision }], DEFAULT_GAME, clock).xp.total).toBe(replayGame([{ event: answer }], DEFAULT_GAME, clock).xp.total + DEFAULT_GAME.xp.answer);
    // A revision for another course is ignored.
    expect(replay([answer, { ...revision, course: "yue" }]).xp.total).toBe(0);
  });

  it("the learner's own claim counts at once: accepted counts right, rejected counts wrong, the latest wins", () => {
    events.at("2026-01-01T09:00:00.000Z");
    const wrong = typed(events.answer(exercise, false, 1));
    const right = typed(events.answer({ ...exercise, id: `${exercise.id}#b` }, true, 1));
    const { id: _id, type: _type, exercise: _exercise, attempt: _attempt, input: _input, outcome: _outcome, prediction: _prediction, ...common } = wrong;
    const report = (answer: typeof wrong, n: number, at: string, claim?: "accept" | "reject"): AnswerReported => ({
      ...common,
      id: `00000000-0000-7000-8000-00000000000${String(n)}`,
      type: "answer_reported",
      clientTime: at,
      localDate: at.slice(0, 10),
      answer: answer.id,
      exercise: answer.exercise,
      text: "an answer",
      ...(claim === undefined ? {} : { claim }),
    });
    const clock = { now: "2026-01-04T00:00:00.000Z", today: "2026-01-04" };
    // "My answer should have been accepted": the wrong answer counts right (no claim means accept).
    const accepted = replay([wrong, report(wrong, 1, "2026-01-01T09:01:00.000Z")]);
    expect(replay([wrong]).mistakes).not.toEqual([]);
    expect(accepted.mistakes).toEqual([]);
    expect(accepted.xp.total).toBe(replay([right]).xp.total);
    expect(replayGame([{ event: wrong }, { event: report(wrong, 1, "2026-01-01T09:01:00.000Z") }], DEFAULT_GAME, clock).xp.total).toBe(DEFAULT_GAME.xp.answer);
    // "This should have been wrong": the right answer counts wrong.
    const rejected = replay([right, report(right, 2, "2026-01-01T09:02:00.000Z", "reject")]);
    expect(rejected.xp.total).toBe(0);
    expect(rejected.mistakes.map((m) => m.item)).toEqual([right.exercise.item]);
    // Changing one's mind: the latest claim wins.
    expect(replay([right, report(right, 2, "2026-01-01T09:02:00.000Z", "reject"), report(right, 3, "2026-01-01T09:03:00.000Z", "accept")]).xp.total).toBe(replay([right]).xp.total);
  });
});
