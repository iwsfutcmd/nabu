/**
 * The review queue (gameplan §8.3, §13.2). Learner reports ("my answer should be accepted",
 * answer_reported events) and the judge's provisional accepts land here, one row per distinct
 * normalized answer to an item, with the salted hashes of the learners behind it. A row is
 * approved by a reviewer, or on its own once the judge accepted it and enough learners agree;
 * `nabu reports promote` turns approved rows into accept-set entries in a pull request.
 */
import type { AnswerReport, JudgeVerdict, ReportStatus } from "@nabu/schema";
import { profileOf } from "@nabu/core/lesson";
import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Courses } from "./ai/courses.ts";
import type { Db } from "./db/index.ts";
import { answerReports, reportVotes } from "./db/schema.ts";
import { uuidv7 } from "./ids.ts";

/** Independent learners whose same answer the judge accepted: enough to approve without a reviewer. */
export const AGREEMENTS = 3;
const MAX_NOTES = 20;

export const STATUSES: readonly ReportStatus[] = ["pending", "approved", "rejected", "promoted"];

/** The key two answers share when the grader would see them as the same: the profile's normalization and folding. */
export const normalizedAnswer = (courses: Courses, course: string, orthography: string, answer: string): string => {
  const view = courses.get(course, orthography);
  if (view === undefined) return answer.normalize("NFC").trim();
  const profile = profileOf(view, orthography);
  return profile
    .units(profile.normalize(answer))
    .map((u) => profile.fold(u))
    .join(" ");
};

export interface ReportInput {
  readonly course: string;
  readonly orthography: string;
  readonly template: string;
  readonly item: string;
  readonly answer: string;
  readonly note?: string | undefined;
  readonly subject: string;
  readonly source: "report" | "judge";
  /** accept (the default; the judge only ever accepts) or reject: "this should have been wrong" (ADR 0052). */
  readonly claim?: "accept" | "reject" | undefined;
  readonly judge?: JudgeVerdict | undefined;
}

/** Files a report or a judge accept; returns the row's id. */
export const fileReport = async (db: Db, courses: Courses, r: ReportInput, now: number): Promise<string> => {
  const normalized = normalizedAnswer(courses, r.course, r.orthography, r.answer);
  const at = new Date(now);
  const note = r.note?.normalize("NFC").trim();
  const notes = note === undefined || note === "" ? [] : [note];
  const [row] = await db
    .insert(answerReports)
    .values({
      id: uuidv7(now),
      course: r.course,
      orthography: r.orthography,
      template: r.template,
      item: r.item,
      answer: r.answer.normalize("NFC").trim(),
      normalized,
      claim: r.claim ?? "accept",
      notes,
      judge: r.judge ?? null,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [answerReports.course, answerReports.orthography, answerReports.template, answerReports.item, answerReports.normalized, answerReports.claim],
      set: {
        updatedAt: at,
        judge: sql`coalesce(excluded.judge, ${answerReports.judge})`,
        notes: sql`case when jsonb_array_length(${answerReports.notes}) < ${MAX_NOTES} then ${answerReports.notes} || excluded.notes else ${answerReports.notes} end`,
      },
    })
    .returning({ id: answerReports.id, status: answerReports.status, judge: answerReports.judge });
  if (row === undefined) throw new Error("report not stored");
  await db.insert(reportVotes).values({ reportId: row.id, subject: r.subject, source: r.source }).onConflictDoNothing();
  if (row.status === "pending" && row.judge !== null) {
    const [votes] = await db.select({ n: count() }).from(reportVotes).where(eq(reportVotes.reportId, row.id));
    if ((votes?.n ?? 0) >= AGREEMENTS) await db.update(answerReports).set({ status: "approved", updatedAt: at }).where(eq(answerReports.id, row.id));
  }
  return row.id;
};

export const listReports = async (db: Db, filter: { readonly status?: ReportStatus | undefined; readonly course?: string | undefined }): Promise<AnswerReport[]> => {
  const where = and(filter.status === undefined ? undefined : eq(answerReports.status, filter.status), filter.course === undefined ? undefined : eq(answerReports.course, filter.course));
  const rows = await db
    .select({ r: answerReports, n: count(reportVotes.subject) })
    .from(answerReports)
    .leftJoin(reportVotes, eq(reportVotes.reportId, answerReports.id))
    .where(where)
    .groupBy(answerReports.id)
    .orderBy(asc(answerReports.course), asc(answerReports.item), asc(answerReports.createdAt));
  return rows.map(({ r, n }) => ({
    id: r.id,
    course: r.course,
    orthography: r.orthography as AnswerReport["orthography"],
    template: r.template,
    item: r.item,
    answer: r.answer,
    claim: r.claim as AnswerReport["claim"],
    notes: r.notes as string[],
    ...(r.judge === null ? {} : { judge: r.judge as JudgeVerdict }),
    status: r.status as ReportStatus,
    reports: n,
    createdAt: r.createdAt.toISOString(),
  }));
};

export const setStatus = async (db: Db, id: string, status: ReportStatus, now: number): Promise<boolean> => {
  const rows = await db.update(answerReports).set({ status, updatedAt: new Date(now) }).where(eq(answerReports.id, id)).returning({ id: answerReports.id });
  return rows.length > 0;
};
