/**
 * The review workspace (ADR 0074): reviewer accounts, and what they do from the app.
 *
 * An instance's admin grants a reviewer an account they already have (PUT /admin/v1/reviewers):
 * a handle, which provenance names them by (human:<handle>), and the courses they review (["*"]:
 * all). Signed in, a reviewer then works from #/review in the app:
 *
 *   GET    /v1/review/me                                  → {handle, courses} (403 not-a-reviewer)
 *   GET    /v1/review/reports?course=&status=             the course's answer reports
 *   POST   /v1/review/reports/:id                         {status: approved | rejected}
 *   GET    /v1/review/corrections?course=&status=         the course's corrections (ADR 0051)
 *   POST   /v1/review/corrections/:id                     {status: approved | rejected}
 *   GET    /v1/review/signoffs?course=                    their sign-offs, as the file `nabu review apply` reads
 *   PUT    /v1/review/signoffs                            {course, signoffs: SignOff[]} → {stored}
 *   DELETE /v1/review/signoffs/:course/:kind/:item        takes one back
 *   POST   /v1/review/accepts                             {course, orthography, item, answer, note?}: an accepted
 *                                                         answer, approved, for `nabu reports promote`
 *
 * Every route checks the course is one of the reviewer's. Sign-offs wait here until the admin
 * exports them (GET /admin/v1/signoffs) and `nabu review apply` writes them into the source, which
 * still checks each against what the source compiles to now.
 */
import type { CorrectionStatus, ReportStatus, SignOff, SignOffs } from "@nabu/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Context, Hono } from "hono";
import type { Courses } from "./ai/courses.ts";
import { normalizeEmail, type Result } from "./accounts.ts";
import type { Env } from "./app.ts";
import { CORRECTION_STATUSES, listCorrections, setCorrectionStatus } from "./corrections.ts";
import type { Db } from "./db/index.ts";
import { answerReports, reviewers, sentenceCorrections, signoffs, users } from "./db/schema.ts";
import { addAccepted, listReports, setStatus, STATUSES } from "./reports.ts";

/** A reviewer who reviews every course. */
export const ALL = "*";

export interface Reviewer {
  readonly user: string;
  readonly handle: string;
  /** Course ids, or [ALL]. */
  readonly courses: readonly string[];
  readonly grantedAt: string;
}

/** Letters and digits, then also `.`, `_` and `-`: no spaces or `@`, as provenance's human:<id> needs. */
const HANDLE = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;
const MAX_HANDLE_BYTES = 64;
const COURSE = /^[a-z][a-z0-9-]*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/u;
const MAX_ITEM_BYTES = 200;
const MAX_ANSWER_BYTES = 1000;
const MAX_SIGNOFFS = 1000;
/** What a reviewer may decide in the queue; promoted and applied are for the CLIs that do it. */
const DECISIONS = ["approved", "rejected"] as const;

/** The handle as stored: NFC, and valid, or undefined. */
export const handleOf = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const h = value.normalize("NFC").trim();
  return HANDLE.test(h) && Buffer.byteLength(h) <= MAX_HANDLE_BYTES ? h : undefined;
};

export const covers = (r: Reviewer, course: string): boolean => r.courses.includes(ALL) || r.courses.includes(course);

const coursesOf = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out = new Set<string>();
  for (const c of value) {
    if (typeof c !== "string" || !(c === ALL || COURSE.test(c))) return undefined;
    out.add(c);
  }
  return out.has(ALL) ? [ALL] : [...out].sort();
};

const rowOf = (r: typeof reviewers.$inferSelect): Reviewer => ({ user: r.userId, handle: r.handle, courses: r.courses as string[], grantedAt: r.grantedAt.toISOString() });

export const reviewerOf = async (db: Db, user: string): Promise<Reviewer | undefined> => {
  const [row] = await db.select().from(reviewers).where(eq(reviewers.userId, user));
  return row === undefined ? undefined : rowOf(row);
};

export type GrantError = "invalid-request" | "no-account" | "handle-taken";

/** Makes an account a reviewer, or changes their handle or courses. Their sign-offs follow a new handle. */
export const grant = async (db: Db, input: { readonly email: unknown; readonly handle: unknown; readonly courses: unknown }): Promise<Result<Reviewer, GrantError>> => {
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : undefined;
  const handle = handleOf(input.handle);
  const courses = coursesOf(input.courses);
  if (email === undefined || handle === undefined || courses === undefined) return { ok: false, error: "invalid-request" };
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (user === undefined) return { ok: false, error: "no-account" };
  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ user: reviewers.userId }).from(reviewers).where(eq(reviewers.handle, handle));
    if (taken !== undefined && taken.user !== user.id) return { ok: false, error: "handle-taken" } as const;
    const [row] = await tx
      .insert(reviewers)
      .values({ userId: user.id, handle, courses })
      .onConflictDoUpdate({ target: reviewers.userId, set: { handle, courses } })
      .returning();
    if (row === undefined) throw new Error("reviewer not stored");
    await tx.update(signoffs).set({ handle }).where(eq(signoffs.userId, user.id));
    return { ok: true, value: rowOf(row) } as const;
  });
};

/** Takes the role away. Their sign-offs stay, under the handle they were made with. */
export const revoke = async (db: Db, handle: string): Promise<boolean> => (await db.delete(reviewers).where(eq(reviewers.handle, handle)).returning({ user: reviewers.userId })).length > 0;

export const listReviewers = async (db: Db): Promise<(Reviewer & { readonly email: string })[]> => {
  const rows = await db.select({ r: reviewers, email: users.email }).from(reviewers).innerJoin(users, eq(users.id, reviewers.userId)).orderBy(asc(reviewers.handle));
  return rows.map(({ r, email }) => ({ ...rowOf(r), email }));
};

/** The SQL `excluded.<column>` an upsert sets from (Drizzle has no helper for it). */
const sqlExcluded = (column: string): ReturnType<typeof sql.raw> => sql.raw(`excluded.${column}`);

/** A sign-off as the API takes it, or undefined. */
export const signOffOf = (value: unknown): SignOff | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const { item, kind, shown, at } = value as Record<string, unknown>;
  if (typeof item !== "string" || item === "" || Buffer.byteLength(item) > MAX_ITEM_BYTES) return undefined;
  if (kind !== "sentence" && kind !== "story") return undefined;
  if (typeof shown !== "string" || !SHA256.test(shown)) return undefined;
  if (typeof at !== "string" || !RFC3339.test(at) || Number.isNaN(Date.parse(at))) return undefined;
  return { item: item.normalize("NFC"), kind, shown, at };
};

export const putSignOffs = async (db: Db, r: Reviewer, course: string, list: readonly SignOff[]): Promise<number> => {
  if (list.length === 0) return 0;
  await db
    .insert(signoffs)
    .values(list.map((s) => ({ userId: r.user, handle: r.handle, course, kind: s.kind, item: s.item, shown: s.shown, signedAt: new Date(s.at) })))
    .onConflictDoUpdate({ target: [signoffs.userId, signoffs.course, signoffs.kind, signoffs.item], set: { shown: sqlExcluded("shown"), signedAt: sqlExcluded("signed_at"), handle: r.handle } });
  return list.length;
};

export const removeSignOff = async (db: Db, user: string, course: string, kind: string, item: string): Promise<boolean> =>
  (await db
    .delete(signoffs)
    .where(and(eq(signoffs.userId, user), eq(signoffs.course, course), eq(signoffs.kind, kind), eq(signoffs.item, item)))
    .returning({ item: signoffs.item })).length > 0;

type SignOffRow = typeof signoffs.$inferSelect;
const fileOf = (course: string, handle: string, rows: readonly SignOffRow[]): SignOffs => ({
  course,
  reviewer: `human:${handle}`,
  signoffs: rows.map((s) => ({ item: s.item, kind: s.kind as SignOff["kind"], shown: s.shown, at: s.signedAt.toISOString() })),
});

/** One reviewer's sign-offs on a course, as the file `nabu review apply` reads. */
export const signOffsOf = async (db: Db, r: Reviewer, course: string): Promise<SignOffs> =>
  fileOf(course, r.handle, await db.select().from(signoffs).where(and(eq(signoffs.userId, r.user), eq(signoffs.course, course))).orderBy(asc(signoffs.kind), asc(signoffs.item)));

/** Every sign-off waiting to be applied, one file per course and handle. */
export const allSignOffs = async (db: Db, course?: string): Promise<SignOffs[]> => {
  const rows = await db
    .select()
    .from(signoffs)
    .where(course === undefined ? undefined : eq(signoffs.course, course))
    .orderBy(asc(signoffs.course), asc(signoffs.handle), asc(signoffs.kind), asc(signoffs.item));
  const files = new Map<string, SignOffRow[]>();
  for (const row of rows) {
    const key = `${row.course}\t${row.handle}`;
    files.set(key, [...(files.get(key) ?? []), row]);
  }
  return [...files.values()].map((list) => fileOf(list[0]?.course ?? "", list[0]?.handle ?? "", list));
};

/** What an account's export holds of its reviewer role (§14.4). */
export const reviewerExport = async (db: Db, user: string): Promise<{ readonly reviewer: Omit<Reviewer, "user"> | null; readonly signoffs: readonly Record<string, unknown>[] }> => {
  const r = await reviewerOf(db, user);
  const rows = await db.select({ course: signoffs.course, handle: signoffs.handle, kind: signoffs.kind, item: signoffs.item, shown: signoffs.shown, signedAt: signoffs.signedAt }).from(signoffs).where(eq(signoffs.userId, user));
  return { reviewer: r === undefined ? null : { handle: r.handle, courses: r.courses, grantedAt: r.grantedAt }, signoffs: rows };
};


const body = async (c: Context): Promise<Record<string, unknown> | undefined> => {
  const value: unknown = await c.req.json().catch(() => undefined);
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
};

export interface ReviewDeps {
  readonly db: Db;
  /** The courses the instance serves: an accepted answer must name a sentence with a target-language accept set. */
  readonly courses?: Courses | undefined;
  readonly now: () => number;
}

/** The reviewer's routes, behind /v1's sign-in. */
export const reviewRoutes = (app: Hono<Env>, { db, courses, now }: ReviewDeps): void => {
  const reviewer = async (c: Context<Env>): Promise<Reviewer | Response> => (await reviewerOf(db, c.get("user").id)) ?? c.json({ error: "not-a-reviewer" }, 403);
  /** The reviewer, when `course` is one of theirs; otherwise the response to send. */
  const forCourse = async (c: Context<Env>, course: unknown): Promise<Reviewer | Response> => {
    const r = await reviewer(c);
    if (r instanceof Response) return r;
    if (typeof course !== "string" || !COURSE.test(course)) return c.json({ error: "invalid-course" }, 400);
    return covers(r, course) ? r : c.json({ error: "not-your-course" }, 403);
  };

  app.get("/v1/review/me", async (c) => {
    const r = await reviewer(c);
    return r instanceof Response ? r : c.json({ handle: r.handle, courses: r.courses });
  });

  app.get("/v1/review/reports", async (c) => {
    const course = c.req.query("course");
    const r = await forCourse(c, course);
    if (r instanceof Response) return r;
    const status = c.req.query("status");
    if (status !== undefined && !STATUSES.includes(status as ReportStatus)) return c.json({ error: "invalid-status" }, 400);
    return c.json({ reports: await listReports(db, { course, status: status as ReportStatus | undefined }) });
  });

  app.post("/v1/review/reports/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await db.select({ course: answerReports.course }).from(answerReports).where(eq(answerReports.id, id)).catch(() => []);
    if (row === undefined) return c.json({ error: "not-found" }, 404);
    const r = await forCourse(c, row.course);
    if (r instanceof Response) return r;
    const status = (await body(c))?.["status"];
    if (!DECISIONS.includes(status as (typeof DECISIONS)[number])) return c.json({ error: "invalid-status" }, 400);
    await setStatus(db, id, status as ReportStatus, now());
    return c.body(null, 204);
  });

  app.get("/v1/review/corrections", async (c) => {
    const course = c.req.query("course");
    const r = await forCourse(c, course);
    if (r instanceof Response) return r;
    const status = c.req.query("status");
    if (status !== undefined && !CORRECTION_STATUSES.includes(status as CorrectionStatus)) return c.json({ error: "invalid-status" }, 400);
    return c.json({ corrections: await listCorrections(db, { course, status: status as CorrectionStatus | undefined }) });
  });

  app.post("/v1/review/corrections/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await db.select({ course: sentenceCorrections.course }).from(sentenceCorrections).where(eq(sentenceCorrections.id, id)).catch(() => []);
    if (row === undefined) return c.json({ error: "not-found" }, 404);
    const r = await forCourse(c, row.course);
    if (r instanceof Response) return r;
    const status = (await body(c))?.["status"];
    if (!DECISIONS.includes(status as (typeof DECISIONS)[number])) return c.json({ error: "invalid-status" }, 400);
    await setCorrectionStatus(db, id, status as CorrectionStatus, now());
    return c.body(null, 204);
  });

  app.get("/v1/review/signoffs", async (c) => {
    const course = c.req.query("course");
    const r = await forCourse(c, course);
    return r instanceof Response ? r : c.json(await signOffsOf(db, r, course as string));
  });

  app.put("/v1/review/signoffs", async (c) => {
    const b = await body(c);
    const r = await forCourse(c, b?.["course"]);
    if (r instanceof Response) return r;
    const raw = b?.["signoffs"];
    if (!Array.isArray(raw) || raw.length > MAX_SIGNOFFS) return c.json({ error: "invalid-request" }, 400);
    const list = raw.map(signOffOf);
    if (list.some((s) => s === undefined)) return c.json({ error: "invalid-signoff" }, 400);
    return c.json({ stored: await putSignOffs(db, r, b?.["course"] as string, list as SignOff[]) });
  });

  app.delete("/v1/review/signoffs/:course/:kind/:item", async (c) => {
    const course = c.req.param("course");
    const r = await forCourse(c, course);
    if (r instanceof Response) return r;
    return (await removeSignOff(db, r.user, course, c.req.param("kind"), c.req.param("item"))) ? c.body(null, 204) : c.json({ error: "not-found" }, 404);
  });

  app.post("/v1/review/accepts", async (c) => {
    const b = await body(c);
    const r = await forCourse(c, b?.["course"]);
    if (r instanceof Response) return r;
    const { course, orthography, item, answer, note } = b as Record<string, unknown>;
    if (courses === undefined) return c.json({ error: "unavailable" }, 503);
    if (typeof orthography !== "string" || typeof item !== "string" || typeof answer !== "string") return c.json({ error: "invalid-request" }, 400);
    const text = answer.normalize("NFC").trim();
    if (text === "" || Buffer.byteLength(text) > MAX_ANSWER_BYTES) return c.json({ error: "invalid-answer" }, 400);
    if (note !== undefined && (typeof note !== "string" || Buffer.byteLength(note) > MAX_ANSWER_BYTES)) return c.json({ error: "invalid-request" }, 400);
    const view = courses.get(course as string, orthography);
    const sentence = view?.units.flatMap((u) => u.sentences).find((s) => s.id === item);
    // Only target-language answers become accept-set entries (`nabu reports promote`): the form's `reverse`.
    if (sentence?.forms[orthography]?.reverse === undefined) return c.json({ error: "no-accept-set" }, 404);
    const id = await addAccepted(db, courses, { course: course as string, orthography, item, answer: text, note }, now());
    return c.json({ id }, 201);
  });
};
