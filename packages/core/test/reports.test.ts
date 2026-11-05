/**
 * Reports on their way to the reviewers (ADR 0055): what leaves the device, the intake document,
 * and the GitHub issue.
 */
import type { AnswerReported, OrthographyId, SentenceReported } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { code, correctionRowOf, intakeDocumentOf, issueKeyOf, issueOf, labelsOf, reportSection, submissionOf } from "../src/reports/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

const BUNDLE = "a".repeat(64);
const meta = {
  schema: 1 as const,
  device: "device-123",
  user: "user-456",
  session: "00000000-0000-7000-8000-00000000abcd",
  clientTime: "2026-11-04T15:08:00.000+02:00",
  localDate: "2026-11-04",
  tz: "Asia/Beirut",
  bundle: BUNDLE,
};

const correction: SentenceReported = {
  ...meta,
  id: "00000000-0000-7000-8000-000000000001",
  type: "sentence_reported",
  course: "fa",
  orthography: "fa-Arab/standard" as OrthographyId,
  support: "en",
  item: "s.6",
  shown: { forms: { "fa-Arab/standard": { text: "سلام مریم!" } }, translation: "Hello, Maryam!" },
  correction: { forms: { "fa-Arab/standard": { text: "سلام، مریم!" } } },
  note: "@octocat a comma #12",
};

const claim: AnswerReported = {
  ...meta,
  id: "00000000-0000-7000-8000-000000000002",
  type: "answer_reported",
  course: "apc",
  orthography: "apc-Latn/arabizi" as OrthographyId,
  support: "en",
  answer: "00000000-0000-7000-8000-000000000003",
  exercise: { id: "translate-type.l1-l2:s.home.10", template: "translate-type.l1-l2", item: "s.home.10", kcs: [] },
  text: "men wen enta",
};

describe("what leaves the device", () => {
  it("carries no device, user or session id, and only the local date", () => {
    for (const event of [correction, claim]) {
      const s = submissionOf(event);
      const json = JSON.stringify(s);
      for (const secret of ["device-123", "user-456", meta.session, meta.clientTime, "Asia/Beirut"]) expect(json).not.toContain(secret);
      expect(s).toMatchObject({ v: 1, id: event.id, reportedOn: "2026-11-04", bundle: BUNDLE });
    }
  });

  it("a correction keeps what was shown and what changed; a claim its text and template", () => {
    expect(submissionOf(correction)).toMatchObject({ kind: "correction", item: "s.6", shown: correction.shown, correction: correction.correction, note: correction.note });
    expect(submissionOf(claim)).toMatchObject({ kind: "accept", item: "s.home.10", template: "translate-type.l1-l2", text: "men wen enta" });
    expect(submissionOf({ ...claim, claim: "reject" }).kind).toBe("reject");
  });

  it("the intake document names the report and holds it whole", () => {
    const s = submissionOf(correction);
    const doc = intakeDocumentOf(s, "2026-11-04T13:08:00.000Z");
    expect(doc.fields).toMatchObject({ v: { integerValue: "1" }, status: { stringValue: "new" }, kind: { stringValue: "correction" }, course: { stringValue: "fa" }, createdAt: { timestampValue: "2026-11-04T13:08:00.000Z" } });
    expect(JSON.parse((doc.fields["payload"] as { stringValue: string }).stringValue)).toEqual(s);
  });
});

describe("the GitHub issue", () => {
  it("learner text is a code span: no mentions, links or markup; right-to-left text is isolated", () => {
    expect(code("@octocat #12 <b>x</b>")).toBe("`\u2068@octocat #12 <b>x</b>\u2069`");
    expect(code("a `tick` here")).toBe("``\u2068a `tick` here\u2069``");
    expect(code("`edge`")).toBe("`` \u2068`edge`\u2069 ``");
    expect(code("two\nlines")).toBe("`\u2068two lines\u2069`");
  });

  it("one issue per sentence or story line, labelled by course and kind", () => {
    expect(issueKeyOf(submissionOf(correction))).toBe("fa/s.6");
    expect(issueKeyOf(submissionOf({ ...correction, item: "fa.story.tea", step: 3 }))).toBe("fa/fa.story.tea#3");
    expect(labelsOf(submissionOf(correction))).toEqual(["report", "course:fa", "correction"]);
    expect(labelsOf(submissionOf({ ...claim, claim: "reject" }))).toEqual(["report", "course:apc", "should-reject"]);
  });

  it("quotes the item from the bundle with its accept sets, then the report", () => {
    const s = submissionOf(correction);
    const issue = issueOf(s, loadCourse("fa"));
    expect(issue.title).toMatch(/^\[fa\] s\.6 · \u2068/u);
    expect(issue.body).toContain("<!-- nabu-report: fa/s.6 -->");
    expect(issue.body).toContain("Accepted answers in fa-Arab/standard");
    expect(issue.body).toContain("Accepted translations");
    expect(issue.body).toContain(reportSection(s));
    // The note's @mention and #ref stay inside a code span.
    expect(issue.body).toContain("`\u2068@octocat a comma #12\u2069`");
    // Outside code spans and fenced blocks (where GitHub links nothing), the mention never appears.
    const outsideCode = issue.body.replace(/```[^]*?```/gu, "").replace(/(`+)[^]*?\1/gu, "");
    expect(outsideCode).not.toContain("@octocat");
  });

  it("a word's issue quotes its forms and its meaning", () => {
    const word = submissionOf({ ...correction, course: "apc", orthography: "apc-Arab/standard" as OrthographyId, item: "sense:salon", shown: { forms: { "apc-Arab/standard": { text: "الصّالون" } }, translation: "living room" }, correction: { translation: "the living room" } });
    const issue = issueOf(word, loadCourse("apc"));
    expect(issueKeyOf(word)).toBe("apc/sense:salon");
    expect(issue.body).toContain("- meaning: `\u2068living room\u2069`");
    expect(issue.body).not.toContain("Accepted answers");
  });

  it("says so when the bundle no longer has the item", () => {
    const issue = issueOf(submissionOf({ ...correction, item: "s.gone" }), loadCourse("fa"));
    expect(issue.body).toContain("The current bundle has no s.gone in fa");
  });

  it("a correction carries the row `nabu corrections apply` reads", () => {
    const s = submissionOf(correction);
    if (s.kind !== "correction") throw new Error("not a correction");
    expect(correctionRowOf(s)).toMatchObject({ id: s.id, item: "s.6", status: "pending", reports: 1, notes: [correction.note], createdAt: "2026-11-04T00:00:00.000Z" });
    expect(reportSection(s)).toContain(JSON.stringify(correctionRowOf(s)));
  });

  it("a claim shows the answer and its template", () => {
    const section = reportSection(submissionOf(claim));
    expect(section).toContain("### Should have been accepted · 2026-11-04");
    expect(section).toContain("`\u2068men wen enta\u2069`");
    expect(section).toContain("`translate-type.l1-l2`");
  });
});
