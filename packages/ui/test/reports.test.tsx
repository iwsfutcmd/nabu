/**
 * What came of a device's reports, in the UI (ADR 0115): the sentence list says when a correction is
 * in the course now, or changed since some other way, and offers to change only one still open;
 * Your reports lists each report with what the course makes of it now.
 */
import { correctable, correctionKey, shownOf } from "@nabu/core/corrections";
import { createGrader } from "@nabu/core/lesson";
import { reportsOf } from "@nabu/core/reports";
import type { AnswerReported, CorrectionFields, OrthographyId, SentenceReported } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { ReportList } from "../src/corrections/ReportList.tsx";
import { SentenceList } from "../src/corrections/SentenceList.tsx";
import { loadCourse } from "./course.ts";
import { render } from "./render.tsx";

const yue = loadCourse("yue", "yue-Hant-HK/standard");
const YUE = "yue-Hant-HK/standard";

const stamp = (n: number) => ({
  id: `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`,
  schema: 1 as const,
  device: "device-1",
  session: "00000000-0000-7000-8000-ffffffffffff",
  clientTime: `2026-11-0${String(n)}T10:00:00.000+08:00`,
  localDate: `2026-11-0${String(n)}`,
  tz: "Asia/Hong_Kong",
  bundle: "0".repeat(64),
});

const shown = (item: string): CorrectionFields => {
  const target = correctable(yue, item);
  if (target === undefined) throw new Error(`yue has ${item}`);
  return shownOf(target);
};

const correction = (n: number, item: string, seen: CorrectionFields, fix: CorrectionFields): SentenceReported => ({
  ...stamp(n),
  type: "sentence_reported",
  course: "yue",
  orthography: YUE as OrthographyId,
  support: "en",
  item,
  shown: seen,
  correction: fix,
});

/** s.6 reads "Good morning!" now: seen as "Morning!", suggested as it reads now. */
const adopted = correction(1, "s.6", { ...shown("s.6"), translation: "Morning!" }, { translation: "Good morning!" });
const pending = (item: string): SentenceReported => correction(2, item, shown(item), { translation: "Something else" });

const listOf = (corrections: readonly SentenceReported[]): string =>
  render(<SentenceList course={yue} corrections={new Map(corrections.map((c) => [correctionKey(c.item, c.step), c]))} onUnit={() => undefined} onCorrect={() => undefined} />);

const itemIn = (html: string, item: string): string => {
  const start = html.indexOf(`data-correctable="${item}"`);
  return html.slice(start, html.indexOf("</li>", start));
};

describe("the sentence list says what came of a correction", () => {
  it("in the course now: thanks, and a new correction starts afresh", () => {
    const item = itemIn(listOf([adopted]), "s.6");
    expect(item).toContain('data-correction-status="adopted"');
    expect(item).toContain("In the course now. Thank you!");
    expect(item).not.toContain("Change your correction");
    expect(item).toContain("This sentence is wrong");
  });

  it("still open: the learner can change it", () => {
    const item = itemIn(listOf([pending("s.6")]), "s.6");
    expect(item).toContain("data-correction-pending");
    expect(item).toContain("You suggested a correction");
    expect(item).toContain("Change your correction");
  });

  it("changed since some other way", () => {
    const item = itemIn(listOf([correction(3, "s.6", { ...shown("s.6"), translation: "Morning!" }, { translation: "Morning to you!" })]), "s.6");
    expect(item).toContain('data-correction-status="changed"');
    expect(item).toContain("Changed since your correction");
    expect(item).toContain("This sentence is wrong");
  });
});

const claim = (n: number, text: string): AnswerReported => ({
  ...stamp(n),
  type: "answer_reported",
  course: "yue",
  orthography: YUE as OrthographyId,
  support: "en",
  answer: `00000000-0000-7000-8000-${String(100 + n).padStart(12, "0")}`,
  exercise: { id: "translate-type.l1-l2:s.6", template: "translate-type.l1-l2", item: "s.6", kcs: [] },
  text,
});

describe("Your reports", () => {
  const entries = reportsOf(yue, [adopted, claim(2, "拜拜"), claim(3, "早晨")], createGrader(yue));
  const html = render(<ReportList course={yue} entries={entries} />);

  it("lists each report newest first, with what came of it", () => {
    expect([...html.matchAll(/data-report-status="([^"]+)"/g)].map((m) => m[1])).toEqual(["accepted", "pending", "adopted"]);
    expect(html).toContain("The course accepts this answer now. Thank you!");
    expect(html).toContain("In the course now. Thank you!");
    // Nothing new: no status line under the answer the course still marks wrong.
    expect([...html.matchAll(/data-report-badge="([^"]+)"/g)].map((m) => m[1])).toEqual(["accepted", "adopted"]);
    expect([...html.matchAll(/data-taken-up="true"/g)]).toHaveLength(2);
  });

  it("says what the learner did, and when, in the UI's locale", () => {
    expect(html).toContain("You said this answer should have been accepted");
    expect(html).toContain("You suggested");
    expect(html).toContain('<time class="');
    expect(html).toContain('dateTime="2026-11-03"');
    expect(html).toContain("Nov 3, 2026");
  });

  it("renders each text through <T>, in its own language: the answer in Cantonese, the suggestion in English", () => {
    expect(html).toMatch(/<p[^>]*lang="yue-Hant-HK"[^>]*>(?:(?!<\/p>).)*拜拜/u);
    expect(html).toMatch(/<p[^>]*lang="en[^"]*"[^>]*>(?:(?!<\/p>).)*Good morning!/u);
  });

  it("an empty list says so", () => {
    expect(render(<ReportList course={yue} entries={[]} />)).toContain("You haven&#x27;t reported anything in this course.");
  });
});
