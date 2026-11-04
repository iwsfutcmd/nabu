/**
 * The corrections queue (ADR 0051). A learner's sentence_reported event (a sentence or story line
 * marked incorrect, with what it should be) lands here: one row per distinct correction of an
 * item, with the salted hashes of the learners who suggested it. A learner's later suggestion
 * for the same item replaces their earlier one. Reviewers approve or reject rows at
 * /admin/v1/corrections; `nabu corrections apply` writes approved ones into the course source
 * and can mark them applied.
 */
import { createHash } from "node:crypto";
import { correctable } from "@nabu/core/corrections";
import type { CorrectionFields, CorrectionStatus, SentenceCorrection, SentenceReported } from "@nabu/schema";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import type { Courses } from "./ai/courses.ts";
import type { Db } from "./db/index.ts";
import { correctionVotes, sentenceCorrections } from "./db/schema.ts";
import { uuidv7 } from "./ids.ts";

export const CORRECTION_STATUSES: readonly CorrectionStatus[] = ["pending", "approved", "rejected", "applied"];
const MAX_NOTES = 20;
/** A sentence's step in the table (a story line has its own). */
const NO_STEP = -1;

/** JSON with sorted keys: two equal corrections give the same text. */
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value !== null && typeof value === "object"
      ? `{${Object.keys(value)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(value);

export const correctionKeyOf = (correction: CorrectionFields): string => createHash("sha256").update(canonical(correction)).digest("hex");

/**
 * Files a learner's correction; returns the row's id, or undefined when the course has no such
 * item (an unknown course, sentence or story line: nothing a reviewer could apply).
 */
export const fileCorrection = async (db: Db, courses: Courses, e: SentenceReported, subject: string, now: number): Promise<string | undefined> => {
  const view = courses.get(e.course, e.orthography);
  if (view === undefined || correctable(view, e.item, e.step) === undefined) return undefined;
  const step = e.step ?? NO_STEP;
  const at = new Date(now);
  const note = e.note?.normalize("NFC").trim();
  const notes = note === undefined || note === "" ? [] : [note];
  const [row] = await db
    .insert(sentenceCorrections)
    .values({
      id: uuidv7(now),
      course: e.course,
      orthography: e.orthography,
      support: e.support,
      bundle: e.bundle,
      item: e.item,
      step,
      key: correctionKeyOf(e.correction),
      shown: e.shown,
      correction: e.correction,
      notes,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [sentenceCorrections.course, sentenceCorrections.item, sentenceCorrections.step, sentenceCorrections.key],
      set: {
        updatedAt: at,
        notes: sql`case when jsonb_array_length(${sentenceCorrections.notes}) < ${MAX_NOTES} then ${sentenceCorrections.notes} || excluded.notes else ${sentenceCorrections.notes} end`,
      },
    })
    .returning({ id: sentenceCorrections.id });
  if (row === undefined) throw new Error("correction not stored");
  // This learner's earlier suggestions for the item, still pending, give way to this one.
  const earlier = await db
    .select({ id: sentenceCorrections.id })
    .from(sentenceCorrections)
    .innerJoin(correctionVotes, eq(correctionVotes.correctionId, sentenceCorrections.id))
    .where(
      and(
        eq(sentenceCorrections.course, e.course),
        eq(sentenceCorrections.item, e.item),
        eq(sentenceCorrections.step, step),
        eq(sentenceCorrections.status, "pending"),
        ne(sentenceCorrections.id, row.id),
        eq(correctionVotes.subject, subject),
      ),
    );
  for (const { id } of earlier) {
    await db.delete(correctionVotes).where(and(eq(correctionVotes.correctionId, id), eq(correctionVotes.subject, subject)));
    const [left] = await db.select({ n: count() }).from(correctionVotes).where(eq(correctionVotes.correctionId, id));
    if ((left?.n ?? 0) === 0) await db.delete(sentenceCorrections).where(eq(sentenceCorrections.id, id));
  }
  await db.insert(correctionVotes).values({ correctionId: row.id, subject }).onConflictDoNothing();
  return row.id;
};

export const listCorrections = async (db: Db, filter: { readonly status?: CorrectionStatus | undefined; readonly course?: string | undefined }): Promise<SentenceCorrection[]> => {
  const where = and(filter.status === undefined ? undefined : eq(sentenceCorrections.status, filter.status), filter.course === undefined ? undefined : eq(sentenceCorrections.course, filter.course));
  const rows = await db
    .select({ r: sentenceCorrections, n: count(correctionVotes.subject) })
    .from(sentenceCorrections)
    .leftJoin(correctionVotes, eq(correctionVotes.correctionId, sentenceCorrections.id))
    .where(where)
    .groupBy(sentenceCorrections.id)
    .orderBy(asc(sentenceCorrections.course), asc(sentenceCorrections.item), asc(sentenceCorrections.step), asc(sentenceCorrections.createdAt));
  return rows.map(({ r, n }) => ({
    id: r.id,
    course: r.course,
    orthography: r.orthography as SentenceCorrection["orthography"],
    support: r.support,
    ...(r.bundle === null ? {} : { bundle: r.bundle }),
    item: r.item,
    ...(r.step === NO_STEP ? {} : { step: r.step }),
    shown: r.shown as CorrectionFields,
    correction: r.correction as CorrectionFields,
    notes: r.notes as string[],
    status: r.status as CorrectionStatus,
    reports: n,
    createdAt: r.createdAt.toISOString(),
  }));
};

export const setCorrectionStatus = async (db: Db, id: string, status: CorrectionStatus, now: number): Promise<boolean> => {
  const rows = await db.update(sentenceCorrections).set({ status, updatedAt: new Date(now) }).where(eq(sentenceCorrections.id, id)).returning({ id: sentenceCorrections.id });
  return rows.length > 0;
};
