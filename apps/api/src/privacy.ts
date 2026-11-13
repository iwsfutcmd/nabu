/**
 * A learner's data on the server (gameplan §14.4): all of it as one export, and deleting it.
 *
 * Most of it hangs off the user row and goes with it (sessions, events, profile, leagues and a "no"
 * to them, push, the reminder time).
 * What a learner filed for review (reports, corrections, explanation ratings, AI usage) carries
 * only a salted hash of their id, the subject (ADR 0045), so it is found through that.
 */
import type { GameConfig, GameState } from "@nabu/core/game";
import type { LearnerEvent } from "@nabu/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import type { Db } from "./db/index.ts";
import {
  answerReports,
  correctionVotes,
  events,
  explanationRatings,
  leagueMembers,
  leagueOptOuts,
  leagueResults,
  llmUsage,
  nativePushTokens,
  pushSubscriptions,
  reportVotes,
  sentenceCorrections,
  users,
} from "./db/schema.ts";
import { gameStateOf, MAX_BATCH, since, stateOf } from "./log.ts";
import { getProfile } from "./profiles.ts";
import { chosenMinute, timeOf } from "./reminders.ts";
import { reviewerExport } from "./review.ts";

export interface AccountExport {
  readonly exportedAt: string;
  readonly user: { readonly id: string; readonly email: string; readonly createdAt: string };
  readonly profile: Awaited<ReturnType<typeof getProfile>>;
  /** The whole log, in the order the server received it. */
  readonly events: readonly LearnerEvent[];
  /** Each course's replayed projection, as GET /v1/state gives it. */
  readonly courses: readonly ({ readonly course: string } & Awaited<ReturnType<typeof stateOf>>)[];
  readonly game: GameState;
  /** League weeks joined and how they ended, and when the learner said no to leagues (null: they take part, ADR 0122). */
  readonly leagues: { readonly memberships: readonly Record<string, unknown>[]; readonly results: readonly Record<string, unknown>[]; readonly optedOut: string | null };
  /**
   * Reminder registrations by platform (the endpoints and tokens themselves are left out), and the
   * time chosen for them ("HH:MM"; null: automatic, ADR 0103).
   */
  readonly reminders: { readonly web: number; readonly android: number; readonly ios: number; readonly time: string | null };
  /** What the learner filed for review, found through their subject; empty without AI features. */
  readonly reports: readonly Record<string, unknown>[];
  readonly corrections: readonly Record<string, unknown>[];
  readonly explanationRatings: readonly Record<string, unknown>[];
  readonly aiUsage: readonly Record<string, unknown>[];
  /** The reviewer role (ADR 0074), if the account has it, and the sign-offs it has not had applied yet. */
  readonly review: Awaited<ReturnType<typeof reviewerExport>>;
}

const allEvents = async (db: Db, user: string): Promise<LearnerEvent[]> => {
  const out: LearnerEvent[] = [];
  let cursor = 0;
  for (;;) {
    const page = await since(db, user, cursor, MAX_BATCH);
    out.push(...page.events);
    cursor = page.cursor;
    if (!page.more) return out;
  }
};

export const exportOf = async (db: Db, user: string, subject: string | undefined, game: GameConfig, now: Date): Promise<AccountExport | undefined> => {
  const [account] = await db.select({ id: users.id, email: users.email, createdAt: users.createdAt }).from(users).where(eq(users.id, user));
  if (account === undefined) return undefined;
  const log = await allEvents(db, user);
  // Every course the log names; the account's own events (the weekly goal) name none.
  const courseIds = [...new Set(log.flatMap((e) => (e.type === "goal_set" ? [] : [e.course])))].sort();
  const courses = await Promise.all(courseIds.map(async (course) => ({ course, ...(await stateOf(db, user, course)) })));
  const [web] = await db.select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user));
  const native = await db.select({ platform: nativePushTokens.platform, n: count() }).from(nativePushTokens).where(eq(nativePushTokens.userId, user)).groupBy(nativePushTokens.platform);
  const nativeOf = (platform: string): number => Number(native.find((r) => r.platform === platform)?.n ?? 0);
  const minute = await chosenMinute(db, user);
  const [optOut] = await db.select({ at: leagueOptOuts.optedOutAt }).from(leagueOptOuts).where(eq(leagueOptOuts.userId, user));
  const filed =
    subject === undefined
      ? { reports: [], corrections: [], explanationRatings: [], aiUsage: [] }
      : {
          reports: await db
            .select({ course: answerReports.course, orthography: answerReports.orthography, item: answerReports.item, answer: answerReports.answer, claim: answerReports.claim, status: answerReports.status, createdAt: answerReports.createdAt })
            .from(reportVotes)
            .innerJoin(answerReports, eq(answerReports.id, reportVotes.reportId))
            .where(eq(reportVotes.subject, subject)),
          corrections: await db
            .select({ course: sentenceCorrections.course, item: sentenceCorrections.item, step: sentenceCorrections.step, shown: sentenceCorrections.shown, correction: sentenceCorrections.correction, status: sentenceCorrections.status, createdAt: sentenceCorrections.createdAt })
            .from(correctionVotes)
            .innerJoin(sentenceCorrections, eq(sentenceCorrections.id, correctionVotes.correctionId))
            .where(eq(correctionVotes.subject, subject)),
          explanationRatings: await db.select({ key: explanationRatings.key, rating: explanationRatings.rating, ratedAt: explanationRatings.ratedAt }).from(explanationRatings).where(eq(explanationRatings.subject, subject)),
          aiUsage: await db.select({ day: llmUsage.day, feature: llmUsage.feature, calls: llmUsage.calls }).from(llmUsage).where(eq(llmUsage.subject, subject)),
        };
  return {
    exportedAt: now.toISOString(),
    user: { id: account.id, email: account.email, createdAt: account.createdAt.toISOString() },
    profile: await getProfile(db, user),
    events: log,
    courses,
    game: await gameStateOf(db, user, game, { now: now.toISOString() }),
    leagues: {
      memberships: await db.select().from(leagueMembers).where(eq(leagueMembers.userId, user)),
      results: await db.select().from(leagueResults).where(eq(leagueResults.userId, user)),
      optedOut: optOut === undefined ? null : optOut.at.toISOString(),
    },
    reminders: { web: Number(web?.n ?? 0), android: nativeOf("android"), ios: nativeOf("ios"), time: minute === undefined ? null : timeOf(minute) },
    ...filed,
    review: await reviewerExport(db, user),
  };
};

/**
 * Deletes an account and everything it holds. The user row takes its sessions, events, profile,
 * league rows (a "no" to leagues too), push registrations, reminder time, reviewer role and unapplied sign-offs with it. Through the subject: the learner's votes on reports
 * and corrections go, and so does a pending report or correction no one else backs (it holds
 * their words); one a reviewer already decided stays, no longer linked to anyone. Their
 * explanation ratings and AI usage go too. A league's standings are computed from its members,
 * so they recompute without the learner.
 */
export const deleteAccount = async (db: Db, user: string, subject: string | undefined): Promise<boolean> =>
  db.transaction(async (tx) => {
    if (subject !== undefined) {
      const reports = (await tx.select({ id: reportVotes.reportId }).from(reportVotes).where(eq(reportVotes.subject, subject))).map((r) => r.id);
      await tx.delete(reportVotes).where(eq(reportVotes.subject, subject));
      if (reports.length > 0) {
        const backed = new Set((await tx.select({ id: reportVotes.reportId }).from(reportVotes).where(inArray(reportVotes.reportId, reports))).map((r) => r.id));
        const orphans = reports.filter((id) => !backed.has(id));
        if (orphans.length > 0) await tx.delete(answerReports).where(and(inArray(answerReports.id, orphans), eq(answerReports.status, "pending")));
      }
      const corrections = (await tx.select({ id: correctionVotes.correctionId }).from(correctionVotes).where(eq(correctionVotes.subject, subject))).map((r) => r.id);
      await tx.delete(correctionVotes).where(eq(correctionVotes.subject, subject));
      if (corrections.length > 0) {
        const backed = new Set((await tx.select({ id: correctionVotes.correctionId }).from(correctionVotes).where(inArray(correctionVotes.correctionId, corrections))).map((r) => r.id));
        const orphans = corrections.filter((id) => !backed.has(id));
        if (orphans.length > 0) await tx.delete(sentenceCorrections).where(and(inArray(sentenceCorrections.id, orphans), eq(sentenceCorrections.status, "pending")));
      }
      await tx.delete(explanationRatings).where(eq(explanationRatings.subject, subject));
      await tx.delete(llmUsage).where(eq(llmUsage.subject, subject));
    }
    const gone = await tx.delete(users).where(eq(users.id, user)).returning({ id: users.id });
    // The log's rows go by cascade; this is a check, not a second delete.
    const [left] = await tx.select({ n: count() }).from(events).where(eq(events.userId, user));
    if (Number(left?.n ?? 0) > 0) throw new Error("events outlived their account");
    return gone.length > 0;
  });
