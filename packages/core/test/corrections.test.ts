/**
 * Corrections (ADR 0051): what a device shows of a sentence or story line, a learner's draft
 * turned into a correction (only what changed, NFC), and a device's own corrections as rows.
 */
import type { KcId, LearnerEvent, SentenceReported } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { correctable, correctablesByUnit, correctablesOf, correctionKey, correctionOf, correctionRows, draftFrom, jsonLines, latestCorrections, sentenceReportedOf, shownOf, CORRECTION_LIMITS } from "../src/corrections/index.ts";
import { replay, type EventMeta } from "../src/learner/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

const ZWNJ = "‌";
const yue = loadCourse("yue");
const uz = loadCourse("uz", "uz-Latn/standard");
const fa = loadCourse("fa");
const apc = loadCourse("apc");

const meta = (n: number, clientTime = `2026-05-0${String(n)}T10:00:00.000+02:00`): EventMeta => ({
  id: `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`,
  clientTime,
  localDate: clientTime.slice(0, 10),
  tz: "Europe/Berlin",
  device: "device-1",
  session: "00000000-0000-7000-8000-ffffffffffff",
  bundle: "0".repeat(64),
});

describe("what can be corrected", () => {
  it("lists every unit's sentences and story lines, without the generated number drills", () => {
    const units = correctablesByUnit(yue);
    expect(units.map((u) => u.unit.id)).toEqual(yue.units.map((u) => u.id));
    const sentences = units.flatMap((u) => u.sentences);
    expect(sentences.length).toBeGreaterThan(300);
    expect(sentences.some((s) => s.item.startsWith("drill."))).toBe(false);
    const lines = units.flatMap((u) => u.stories.flatMap((s) => s.lines));
    expect(lines.length).toBeGreaterThan(50);
    expect(lines.every((l) => l.step !== undefined)).toBe(true);
  });

  it("shows a sentence's text, each word's reading and the translation", () => {
    const s6 = correctable(yue, "s.6");
    if (s6 === undefined) throw new Error("yue has s.6");
    expect(shownOf(s6)).toEqual({
      forms: {
        "yue-Hant-HK/standard": {
          text: "早晨呀！",
          readings: [
            { token: 0, surface: "早晨", scheme: "jyutping", reading: "zou2 san4" },
            { token: 1, surface: "呀", scheme: "jyutping", reading: "aa3" },
          ],
        },
      },
      translation: "Good morning!",
    });
  });

  it("shows every orthography the course pins, and a story line by its step", () => {
    const story = uz.units[0]?.stories?.[0];
    if (story === undefined) throw new Error("uz has a story");
    const step = story.steps.findIndex((s) => s.line !== undefined);
    const line = correctable(uz, story.id, step);
    expect(line?.step).toBe(step);
    expect(line?.kind).toBe("line");
    expect(Object.keys(shownOf(line ?? { kind: "line", item: "", forms: {}, translation: undefined }).forms ?? {}).sort()).toEqual(["uz-Cyrl/standard", "uz-Latn/standard"]);
    expect(correctable(uz, story.id, story.steps.length)).toBeUndefined();
    expect(correctable(yue, "drill.numbers.6")).toBeUndefined();
    expect(correctable(yue, "no-such-sentence")).toBeUndefined();
  });
});

describe("a word can be corrected (ADR 0057)", () => {
  it("shows the form word exercises show, in every orthography, and its gloss as the meaning", () => {
    const salon = correctable(apc, "sense:salon");
    expect(salon?.kind).toBe("word");
    expect(shownOf(salon ?? { kind: "word", item: "", forms: {}, translation: undefined })).toEqual({
      // The lemma (ADR 0061): the bare noun, not الصّالون.
      forms: { "apc-Arab/standard": { text: "صالون" }, "apc-Latn/arabizi": { text: "salon" } },
      translation: "living room",
    });
    // A sentence id still finds the sentence; a KC with no forms (a grammar form) is not a word.
    expect(correctable(apc, "s.home.15")?.kind).toBe("sentence");
    expect(correctable(apc, "form:poss-1sg")).toBeUndefined();
  });

  it("carries Cantonese readings on a word, as its exercises show them", () => {
    const word = correctable(yue, "sense:唔該");
    expect(word === undefined ? undefined : shownOf(word).forms?.["yue-Hant-HK/standard"]?.readings).toEqual([{ token: 0, surface: "唔該", scheme: "jyutping", reading: "m4 goi1" }]);
  });

  it("an exercise offers its sentence or word; match-pairs, each pair's word", () => {
    const kcs = (...ids: string[]): KcId[] => ids as KcId[];
    expect(correctablesOf(apc, { template: "translate-tap.l1-l2", item: "s.home.15", kcs: kcs("sense:wen", "sense:7ammem") }).map((c) => c.item)).toEqual(["s.home.15"]);
    expect(correctablesOf(apc, { template: "select-image", item: "sense:salon", kcs: kcs("sense:salon") }).map((c) => c.item)).toEqual(["sense:salon"]);
    const pairs = kcs("sense:fi", "sense:ghorfe", "sense:matbakh", "sense:salon", "sense:7ammem");
    expect(correctablesOf(apc, { template: "match-pairs", item: "sense:fi", kcs: pairs }).map((c) => c.item)).toEqual(pairs);
  });
});

describe("a draft becomes a correction", () => {
  const s6 = correctable(yue, "s.6");
  if (s6 === undefined) throw new Error("yue has s.6");
  const shown = shownOf(s6);
  const orth = "yue-Hant-HK/standard";
  const draft = draftFrom(shown);

  it("needs a change or a note", () => {
    expect(correctionOf(shown, draft)).toEqual({ ok: false, error: { code: "unchanged" } });
    expect(correctionOf(shown, { ...draft, note: "  sounds odd  " })).toEqual({ ok: true, value: { correction: {}, note: "sounds odd" } });
  });

  it("keeps only what changed: one reading, the text, the translation", () => {
    const form = draft.forms[orth] ?? { text: "", readings: [] };
    const edited = { ...draft, forms: { [orth]: { text: "早晨呀！", readings: [form.readings[0] ?? "", "aa4"] } } };
    expect(correctionOf(shown, edited)).toEqual({ ok: true, value: { correction: { forms: { [orth]: { readings: [{ token: 1, surface: "呀", scheme: "jyutping", reading: "aa4" }] } } } } });
    const retold = { ...draft, forms: { [orth]: { ...form, text: " 早晨！ " } }, translation: "Morning!" };
    expect(correctionOf(shown, retold)).toEqual({ ok: true, value: { correction: { forms: { [orth]: { text: "早晨！" } }, translation: "Morning!" } } });
  });

  it("normalizes to NFC and keeps ZWNJ", () => {
    const s = correctable(fa, "s.1");
    if (s === undefined) throw new Error("fa has s.1");
    const before = shownOf(s);
    const o = "fa-Arab/standard";
    const text = `می${ZWNJ}خوانم.`;
    const made = correctionOf(before, { ...draftFrom(before), forms: { [o]: { text, readings: [] } }, translation: "Café" });
    expect(made).toEqual({ ok: true, value: { correction: { forms: { [o]: { text } }, translation: "Café" } } });
  });

  it("refuses an empty field and an over-long one, by field", () => {
    const form = draft.forms[orth] ?? { text: "", readings: [] };
    expect(correctionOf(shown, { ...draft, forms: { [orth]: { ...form, text: "   " } } })).toEqual({ ok: false, error: { code: "empty", field: `text:${orth}` } });
    expect(correctionOf(shown, { ...draft, forms: { [orth]: { ...form, readings: ["", "aa3"] } } })).toEqual({ ok: false, error: { code: "empty", field: `reading:${orth}:0` } });
    expect(correctionOf(shown, { ...draft, translation: "" })).toEqual({ ok: false, error: { code: "empty", field: "translation" } });
    // Graphemes, not code points: 500 Devanagari syllables of three code points each are fine.
    expect(correctionOf(shown, { ...draft, note: "क्षि".repeat(CORRECTION_LIMITS.note / 2) }).ok).toBe(true);
    expect(correctionOf(shown, { ...draft, note: "x".repeat(CORRECTION_LIMITS.note + 1) })).toEqual({ ok: false, error: { code: "too-long", field: "note" } });
  });
});

describe("a device's corrections", () => {
  const s6 = correctable(yue, "s.6");
  const s7 = correctable(yue, "s.7");
  if (s6 === undefined || s7 === undefined) throw new Error("yue has s.6 and s.7");
  const report = (n: number, c = s6, note = `note ${String(n)}`): SentenceReported => sentenceReportedOf(yue, c, shownOf(c), { correction: {}, note }, meta(n));

  it("keeps the latest report of each item", () => {
    const events: LearnerEvent[] = [report(1), report(3, s7), report(2), { ...report(4), course: "fa" }];
    const latest = latestCorrections(events, "yue");
    expect([...latest.keys()].sort()).toEqual(["s.6", "s.7"]);
    expect(latest.get("s.6")?.note).toBe("note 2");
    expect(correctionKey("yue.story.dim-sum", 3)).toBe("yue.story.dim-sum#3");
  });

  it("exports them as pending rows, one JSON object per line", () => {
    const rows = correctionRows([report(3, s7), report(2)]);
    expect(rows.map((r) => [r.item, r.status, r.reports, r.notes])).toEqual([
      ["s.6", "pending", 1, ["note 2"]],
      ["s.7", "pending", 1, ["note 3"]],
    ]);
    expect(rows[0]?.createdAt).toBe("2026-05-02T08:00:00.000Z");
    const text = jsonLines(rows);
    expect(text.split("\n")).toHaveLength(3);
    expect(JSON.parse(text.split("\n")[0] ?? "")).toEqual(rows[0]);
  });

  it("is not part of what the learner knows", () => {
    // Replay notes every event id it has folded (`seen`); nothing else changes.
    const { seen, ...after } = replay([report(1)]);
    const { seen: _none, ...before } = replay([]);
    expect(Object.keys(seen)).toEqual([report(1).id]);
    expect(after).toEqual(before);
  });
});
