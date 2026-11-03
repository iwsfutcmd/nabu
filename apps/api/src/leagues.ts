/**
 * Leagues on the server (gameplan §12.4): opt-in per instance (NABU_LEAGUES=1), weekly cohorts of
 * about 30 per tier, no bots.
 *
 * - A learner joins a cohort of their tier with their first league XP of the week (on upload).
 * - Standings are computed from the log, never stored, until the week rolls over.
 * - The rollover writes each member's final rank and next tier once: the week's row in
 *   `league_weeks` is inserted in the same transaction, so running it twice, or twice at once,
 *   changes nothing.
 */
import { DEFAULT_GAME, DEFAULT_LEAGUE, leagueWeek, leagueXp, rankCohort, weekById, type GameInput, type LeagueConfig, type Ranked } from "@nabu/core/game";
import type { LearnerEvent } from "@nabu/schema";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "./db/index.ts";
import { events, leagueMembers, leagueResults, leagueWeeks, profiles } from "./db/schema.ts";

const HOUR = 3_600_000;

/** League XP per user for a week, from the log. */
const weekXp = async (db: Db, users: readonly string[], week: { start: number; end: number }, config: LeagueConfig): Promise<Map<string, number>> => {
  const out = new Map<string, number>(users.map((u) => [u, 0]));
  if (users.length === 0) return out;
  const rows = await db
    .select({ userId: events.userId, payload: events.payload, serverTime: events.serverTime })
    .from(events)
    .where(and(inArray(events.userId, [...users]), gte(events.clientTime, new Date(week.start)), lt(events.clientTime, new Date(week.end))));
  const byUser = new Map<string, GameInput[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), { event: r.payload as LearnerEvent, receivedAt: r.serverTime.toISOString() }]);
  for (const [user, inputs] of byUser) out.set(user, leagueXp(inputs, week.start, week.end, DEFAULT_GAME, config));
  return out;
};

/** The tier a user plays this week: where last rollover left them, else the first. */
const tierOf = async (db: Db, user: string): Promise<number> => {
  const [last] = await db.select({ nextTier: leagueResults.nextTier }).from(leagueResults).where(eq(leagueResults.userId, user)).orderBy(desc(leagueResults.week)).limit(1);
  return last?.nextTier ?? 1;
};

/** After an upload: a learner with league XP this week and no cohort joins one of their tier. */
export const joinIfActive = async (db: Db, user: string, now: number, config: LeagueConfig = DEFAULT_LEAGUE): Promise<void> => {
  const week = leagueWeek(now, config);
  const [member] = await db.select({ userId: leagueMembers.userId }).from(leagueMembers).where(and(eq(leagueMembers.week, week.id), eq(leagueMembers.userId, user)));
  if (member !== undefined) return;
  if (((await weekXp(db, [user], week, config)).get(user) ?? 0) === 0) return;
  const tier = await tierOf(db, user);
  await db.transaction(async (tx) => {
    // One assignment at a time per (week, tier), so cohorts fill up to their size.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${week.id}:${tier}`}))`);
    const sizes = await tx
      .select({ cohort: leagueMembers.cohort, n: sql<number>`count(*)::int` })
      .from(leagueMembers)
      .where(and(eq(leagueMembers.week, week.id), eq(leagueMembers.tier, tier)))
      .groupBy(leagueMembers.cohort)
      .orderBy(asc(leagueMembers.cohort));
    const open = sizes.find((s) => s.n < config.cohortSize);
    const cohort = open?.cohort ?? (sizes.at(-1)?.cohort ?? 0) + 1;
    await tx.insert(leagueMembers).values({ week: week.id, userId: user, tier, cohort, joinedAt: new Date(now) }).onConflictDoNothing();
  });
};

export interface StandingRow {
  readonly rank: number;
  readonly xp: number;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly you: boolean;
  readonly outcome: Ranked["outcome"];
}

export type LeagueView =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly week: string; readonly endsAt: string; readonly member: false }
  | {
      readonly enabled: true;
      readonly week: string;
      readonly endsAt: string;
      readonly member: true;
      readonly tier: number;
      readonly cohort: number;
      readonly zones: { readonly promote: number; readonly demote: number };
      readonly standings: readonly StandingRow[];
    };

const rankedCohort = async (db: Db, weekId: string, tier: number, cohort: number, config: LeagueConfig): Promise<readonly Ranked[]> => {
  const members = await db
    .select({ userId: leagueMembers.userId, joinedAt: leagueMembers.joinedAt })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.week, weekId), eq(leagueMembers.tier, tier), eq(leagueMembers.cohort, cohort)));
  const xp = await weekXp(
    db,
    members.map((m) => m.userId),
    weekById(weekId, config),
    config,
  );
  return rankCohort(
    members.map((m) => ({ user: m.userId, xp: xp.get(m.userId) ?? 0, joinedAt: m.joinedAt.getTime() })),
    tier,
    config,
  );
};

/** The user's cohort this week, ranked live. */
export const leagueView = async (db: Db, user: string, now: number, config: LeagueConfig = DEFAULT_LEAGUE): Promise<LeagueView> => {
  const week = leagueWeek(now, config);
  const base = { enabled: true as const, week: week.id, endsAt: new Date(week.end).toISOString() };
  const [me] = await db.select().from(leagueMembers).where(and(eq(leagueMembers.week, week.id), eq(leagueMembers.userId, user)));
  if (me === undefined) return { ...base, member: false };
  const ranked = await rankedCohort(db, week.id, me.tier, me.cohort, config);
  const names = new Map(
    (
      await db
        .select({ userId: profiles.userId, username: profiles.username, displayName: profiles.displayName })
        .from(profiles)
        .where(
          inArray(
            profiles.userId,
            ranked.map((r) => r.user),
          ),
        )
    ).map((p) => [p.userId, p]),
  );
  return {
    ...base,
    member: true,
    tier: me.tier,
    cohort: me.cohort,
    zones: { promote: config.promote[me.tier - 1] ?? 0, demote: config.demote[me.tier - 1] ?? 0 },
    standings: ranked.map((r) => ({
      rank: r.rank,
      xp: r.xp,
      username: names.get(r.user)?.username ?? null,
      displayName: names.get(r.user)?.displayName ?? null,
      you: r.user === user,
      outcome: r.outcome,
    })),
  };
};

/**
 * Rolls over every week that has ended (plus the upload grace) and has not been rolled: final
 * ranks and next tiers, written once. Returns the weeks it rolled.
 */
export const rollover = async (db: Db, now: number, config: LeagueConfig = DEFAULT_LEAGUE): Promise<readonly string[]> => {
  const weeks = (await db.selectDistinct({ week: leagueMembers.week }).from(leagueMembers)).map((w) => w.week).sort();
  const rolled: string[] = [];
  for (const id of weeks) {
    const week = weekById(id, config);
    if (week.end + config.graceHours * HOUR > now) continue;
    const done = await db.transaction(async (tx) => {
      const claimed = await tx.insert(leagueWeeks).values({ week: id }).onConflictDoNothing().returning({ week: leagueWeeks.week });
      if (claimed.length === 0) return false; // already rolled (or being rolled by another run, which wins)
      const cohorts = await tx.selectDistinct({ tier: leagueMembers.tier, cohort: leagueMembers.cohort }).from(leagueMembers).where(eq(leagueMembers.week, id));
      for (const { tier, cohort } of cohorts) {
        const ranked = await rankedCohort(tx, id, tier, cohort, config);
        if (ranked.length === 0) continue;
        await tx
          .insert(leagueResults)
          .values(ranked.map((r) => ({ week: id, userId: r.user, tier, cohort, xp: r.xp, rank: r.rank, outcome: r.outcome, nextTier: r.nextTier })))
          .onConflictDoNothing();
      }
      return true;
    });
    if (done) rolled.push(id);
  }
  return rolled;
};

/** Last week's result for a user, if they played. */
export const lastResult = async (db: Db, user: string): Promise<{ readonly week: string; readonly rank: number; readonly outcome: string; readonly nextTier: number } | undefined> => {
  const [r] = await db
    .select({ week: leagueResults.week, rank: leagueResults.rank, outcome: leagueResults.outcome, nextTier: leagueResults.nextTier })
    .from(leagueResults)
    .where(eq(leagueResults.userId, user))
    .orderBy(desc(leagueResults.week))
    .limit(1);
  return r;
};
