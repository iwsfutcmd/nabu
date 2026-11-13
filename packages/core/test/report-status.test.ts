/**
 * What came of a device's reports (ADR 0115): each compared, on the device, with the course as the
 * bundle has it now. A correction is in the course, still as the learner saw it, changed some other
 * way, or gone; a claimed answer is graded again against its accept set.
 */
import type { AnswerReported, CorrectionFields, OrthographyId, SentenceReported } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { correctable, correctionKey, correctionStatus, openCorrection, shownOf } from "../src/corrections/index.ts";
import { createGrader, type CourseView } from "../src/lesson/index.ts";
import { claimStatus, reportsOf, takenUp } from "../src/reports/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

const fa = loadCourse("fa");
const yue = loadCourse("yue");
const FA = "fa-Arab/standard";
const YUE = "yue-Hant-HK/standard";
/** fa's s.6 as the app shows it: with the vowel marks the course's vocalization adds (ADR 0053). */
const SHOWN = "سَلام مَریَم!";
/** Its letters alone, as the course source has them. */
const LETTERS = "سلام مریم!";

const meta = (n: number) => ({
  id: `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`,
  schema: 1 as const,
  device: "device-1",
  session: "00000000-0000-7000-8000-ffffffffffff",
  clientTime: `2026-11-${String(n).padStart(2, "0")}T10:00:00.000+02:00`,
  localDate: `2026-11-${String(n).padStart(2, "0")}`,
  tz: "Asia/Tehran",
  bundle: "0".repeat(64),
});

const correction = (n: number, course: CourseView, item: string, shown: CorrectionFields, fix: CorrectionFields, extra: Partial<SentenceReported> = {}): SentenceReported => ({
  ...meta(n),
  type: "sentence_reported",
  course: course.id,
  orthography: course.orthography as OrthographyId,
  support: course.supportKey,
  item,
  shown,
  correction: fix,
  ...extra,
});

const shownNow = (course: CourseView, item: string): CorrectionFields => {
  const target = correctable(course, item);
  if (target === undefined) throw new Error(`${course.id} has ${item}`);
  return shownOf(target);
};

describe("what came of a correction", () => {
  it("one the course has not taken up is pending: the item still reads as the learner saw it", () => {
    const report = correction(1, fa, "s.6", shownNow(fa, "s.6"), { translation: "Hello, Mariam!" });
    expect(correctionStatus(fa, report)).toBe("pending");
    expect(openCorrection(fa, new Map([[correctionKey("s.6"), report]]), "s.6")).toBe(report);
  });

  it("is in the course once every field it changed reads as the learner suggested", () => {
    // Seen in an older bundle, which said Mariam; the course says Maryam now, as suggested.
    const report = correction(1, fa, "s.6", { ...shownNow(fa, "s.6"), translation: "Hello, Mariam!" }, { translation: "Hello, Maryam!" });
    expect(correctionStatus(fa, report)).toBe("adopted");
    // Taken up, it is no longer open: the form starts afresh, and offers no "Change your correction".
    expect(openCorrection(fa, new Map([[correctionKey("s.6"), report]]), "s.6")).toBeUndefined();
  });

  it("changed: the course changed what it was about some other way", () => {
    const report = correction(1, fa, "s.6", { ...shownNow(fa, "s.6"), translation: "Hello, Mariam!" }, { translation: "Hi, Mariam!" });
    expect(correctionStatus(fa, report)).toBe("changed");
    expect(openCorrection(fa, new Map([[correctionKey("s.6"), report]]), "s.6")).toBeUndefined();
  });

  it("compares letters without the vowel marks the vocalization adds, as `nabu corrections apply` does", () => {
    // Seen without the exclamation mark; suggested with it, in letters alone. The course's text has
    // the marks its vocalization adds, and the letters suggested.
    const adopted = correction(1, fa, "s.6", { forms: { [FA]: { text: "سلام مریم" } } }, { forms: { [FA]: { text: LETTERS } } });
    expect(correctionStatus(fa, adopted)).toBe("adopted");
    // A comma suggested: the letters still read as seen, whatever the marks.
    const pending = correction(2, fa, "s.6", { forms: { [FA]: { text: LETTERS } } }, { forms: { [FA]: { text: "سلام، مریم!" } } });
    expect(correctionStatus(fa, pending)).toBe("pending");
  });

  it("compares a change of marks alone with the marks", () => {
    // Marks suggested where an older bundle had none: in the course once it has those marks.
    expect(correctionStatus(fa, correction(1, fa, "s.6", { forms: { [FA]: { text: LETTERS } } }, { forms: { [FA]: { text: SHOWN } } }))).toBe("adopted");
    // Another mark suggested: the letters are the same, but the course has not taken it up.
    const kasra = SHOWN.replace("مَر", "مِر");
    expect(correctionStatus(fa, correction(2, fa, "s.6", { forms: { [FA]: { text: SHOWN } } }, { forms: { [FA]: { text: kasra } } }))).toBe("pending");
  });

  it("compares a word's reading by its place among the words and its scheme", () => {
    const now = shownNow(yue, "s.6");
    const form = now.forms?.[YUE];
    if (form?.readings?.[1] === undefined) throw new Error("yue's s.6 reads its words");
    const old = { ...now, forms: { [YUE]: { ...form, readings: [form.readings[0], { ...form.readings[1], reading: "aa1" }].flatMap((r) => (r === undefined ? [] : [r])) } } };
    const fix = { forms: { [YUE]: { readings: [form.readings[1]] } } };
    expect(correctionStatus(yue, correction(1, yue, "s.6", old, fix))).toBe("adopted");
    expect(correctionStatus(yue, correction(2, yue, "s.6", now, { forms: { [YUE]: { readings: [{ ...form.readings[1], reading: "aa1" }] } } }))).toBe("pending");
  });

  it("a note alone is pending while the item reads as seen, and changed once it does not", () => {
    expect(correctionStatus(fa, correction(1, fa, "s.6", shownNow(fa, "s.6"), {}, { note: "a comma?" }))).toBe("pending");
    expect(correctionStatus(fa, correction(2, fa, "s.6", { ...shownNow(fa, "s.6"), translation: "Hello, Mariam!" }, {}, { note: "Maryam?" }))).toBe("changed");
  });

  it("a word (ADR 0057): its first form and its meaning", () => {
    const shown = shownNow(fa, "sense:salam");
    expect(correctionStatus(fa, correction(1, fa, "sense:salam", { ...shown, forms: { [FA]: { text: "سلم" } } }, { forms: { [FA]: { text: "سلام" } } }))).toBe("adopted");
    expect(correctionStatus(fa, correction(2, fa, "sense:salam", shown, { translation: "hi" }))).toBe("pending");
  });

  it("an item the course no longer has is gone", () => {
    expect(correctionStatus(fa, correction(1, fa, "s.gone", shownNow(fa, "s.6"), { translation: "Hi" }))).toBe("gone");
    expect(correctionStatus(fa, correction(2, fa, "fa.story.gone", shownNow(fa, "s.6"), { translation: "Hi" }, { step: 3 }))).toBe("gone");
  });

  it("leaves out a translation in another support language than the course's", () => {
    const report = correction(1, fa, "s.6", { ...shownNow(fa, "s.6"), translation: "Salut, Mariam !" }, { translation: "Salut, Maryam !" }, { support: "fr" });
    expect(correctionStatus(fa, report)).toBe("pending");
  });
});

const claim = (n: number, template: AnswerReported["exercise"]["template"], item: string, text: string, extra: Partial<AnswerReported> = {}): AnswerReported => ({
  ...meta(n),
  type: "answer_reported",
  course: "yue",
  orthography: YUE as OrthographyId,
  support: "en",
  answer: `00000000-0000-7000-8000-${String(100 + n).padStart(12, "0")}`,
  exercise: { id: `${template}:${item}`, template, item, kcs: [] },
  text,
  ...extra,
});

describe("what came of a claim about an answer", () => {
  const grader = createGrader(yue);

  it("should have been accepted: taken up once the course's grader accepts it", () => {
    // s.6 accepts 早晨[呀]: 早晨 alone is in it, 拜拜 is not.
    expect(claimStatus(yue, claim(1, "translate-type.l1-l2", "s.6", "早晨"), grader)).toBe("accepted");
    expect(claimStatus(yue, claim(2, "translate-type.l1-l2", "s.6", "拜拜"), grader)).toBe("pending");
    expect(claimStatus(yue, claim(3, "translate-tap.l1-l2", "s.6", "早晨呀"), grader)).toBe("accepted");
  });

  it("should have been wrong: taken up once the grader marks it wrong", () => {
    expect(claimStatus(yue, claim(1, "translate-type.l1-l2", "s.6", "拜拜", { claim: "reject" }), grader)).toBe("rejected");
    expect(claimStatus(yue, claim(2, "translate-type.l1-l2", "s.6", "早晨呀", { claim: "reject" }), grader)).toBe("pending");
  });

  it("grades each direction against its own accept set", () => {
    // Into English: the translation's accept set, (Good morning|Morning)!
    expect(claimStatus(yue, claim(1, "translate-tap.l2-l1", "s.6", "Morning!"), grader)).toBe("accepted");
    expect(claimStatus(yue, claim(2, "translate-tap.l2-l1", "s.6", "Good night!"), grader)).toBe("pending");
    // Written down from the clip: the sentence itself.
    expect(claimStatus(yue, claim(3, "listen-type", "s.6", "早晨呀！"), grader)).toBe("accepted");
    expect(claimStatus(yue, claim(4, "listen-type", "s.6", "早晨"), grader)).toBe("pending");
  });

  it("leaves unchecked what the device cannot grade again", () => {
    // A choice is graded by its place, a blank without the rest of its sentence, a story line has
    // no accept set, and "I said it right" is about the scoring.
    for (const template of ["choose-translation", "gap-fill", "complete-translation", "speak"] as const) expect(claimStatus(yue, claim(1, template, "s.6", "早晨"), grader)).toBe("unchecked");
    expect(claimStatus(yue, claim(2, "story-complete", "yue.story.yum-cha/3", "早晨"), grader)).toBe("unchecked");
    // A translation claimed in another support language than the course's.
    expect(claimStatus(yue, claim(3, "translate-tap.l2-l1", "s.6", "Bonjour !", { support: "fr" }), grader)).toBe("unchecked");
  });

  it("an item the course no longer has is gone", () => {
    expect(claimStatus(yue, claim(1, "translate-type.l1-l2", "s.gone", "早晨"), grader)).toBe("gone");
    expect(claimStatus(yue, claim(2, "story-complete", "yue.story.gone/3", "早晨"), grader)).toBe("gone");
  });
});

describe("a device's reports in a course", () => {
  it("newest first: the latest correction of each item, each claim once, and what came of each", () => {
    const shown = shownNow(yue, "s.6");
    const events = [
      correction(1, yue, "s.6", shown, { translation: "Good morning to you!" }),
      // A later correction of the same item replaces the first.
      correction(3, yue, "s.6", { ...shown, translation: "Morning!" }, { translation: "Good morning!" }),
      claim(2, "translate-type.l1-l2", "s.6", "拜拜"),
      claim(4, "translate-type.l1-l2", "s.6", "早晨"),
      // The same answer claimed again: once, the latest.
      claim(5, "translate-type.l1-l2", "s.6", "早晨"),
      // Another course's report.
      { ...claim(6, "translate-type.l1-l2", "s.6", "早晨"), course: "fa" },
    ];
    const entries = reportsOf(yue, events, createGrader(yue));
    expect(entries.map((e) => [e.kind, e.report.id.slice(-2), e.status])).toEqual([
      ["claim", "05", "accepted"],
      ["correction", "03", "adopted"],
      ["claim", "02", "pending"],
    ]);
    expect(entries.filter(takenUp)).toHaveLength(2);
  });

  it("none: an empty list", () => {
    expect(reportsOf(yue, [], createGrader(yue))).toEqual([]);
  });
});
