/**
 * Leagues on the server (gameplan §12.4): opt-in per instance (NABU_LEAGUES=1), weekly cohorts of
 * about 30 per tier, no bots.
 *
 * - A learner joins a cohort of their tier with their first league XP of the week (on upload),
 *   unless they said no to leagues (ADR 0122): then they join none, and leave the standings of
 *   every week not rolled over yet, until they take part again.
 * - League XP is the deployment's game XP (its game.json, NABU_GAME) within the week.
 * - Standings are computed from the log, never stored, until the week rolls over.
 * - The rollover writes each member's final rank and next tier once: the week's row in
 *   `league_weeks` is inserted in the same transaction, so running it twice, or twice at once,
 *   changes nothing. The week after, the league says how it ended (`last`).
 */
import { DEFAULT_GAME, DEFAULT_LEAGUE, leagueWeek, leagueXp, rankCohort, weekById, type GameConfig, type GameInput, type LeagueConfig, type Ranked } from "@nabu/core/game";
import type { LearnerEvent } from "@nabu/schema";
import { and, asc, count, desc, eq, gte, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { Db } from "./db/index.ts";
import { events, leagueMembers, leagueOptOuts, leagueResults, leagueWeeks, profiles } from "./db/schema.ts";

const HOUR = 3_600_000;

/**
 * League XP per user for a week, from the log: the week's events, and the earlier finished sessions
 * and starts over, which say which of the week's lessons replay one done before (ADR 0107). The XP
 * is the deployment's (`game`), as its app shows it.
 */
const weekXp = async (db: Db, users: readonly string[], week: { start: number; end: number }, config: LeagueConfig, game: GameConfig): Promise<Map<string, number>> => {
  const out = new Map<string, number>(users.map((u) => [u, 0]));
  if (users.length === 0) return out;
  const columns = { userId: events.userId, payload: events.payload, serverTime: events.serverTime };
  const during = await db
    .select(columns)
    .from(events)
    .where(and(inArray(events.userId, [...users]), gte(events.clientTime, new Date(week.start)), lt(events.clientTime, new Date(week.end))));
  const earlier = await db
    .select(columns)
    .from(events)
    .where(and(inArray(events.userId, [...users]), lt(events.clientTime, new Date(week.start)), inArray(events.type, ["session_completed", "progress_reset"])));
  const rows = [...earlier, ...during];
  const byUser = new Map<string, GameInput[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), { event: r.payload as LearnerEvent, receivedAt: r.serverTime.toISOString() }]);
  for (const [user, inputs] of byUser) out.set(user, leagueXp(inputs, week.start, week.end, game, config));
  return out;
};

/** The tier a user plays this week: where last rollover left them, else the first. */
const tierOf = async (db: Db, user: string): Promise<number> => {
  const [last] = await db.select({ nextTier: leagueResults.nextTier }).from(leagueResults).where(eq(leagueResults.userId, user)).orderBy(desc(leagueResults.week)).limit(1);
  return last?.nextTier ?? 1;
};

/** The learners among `users` who said no to leagues (ADR 0122). */
const optedOutOf = async (db: Db, users: readonly string[]): Promise<ReadonlySet<string>> =>
  users.length === 0
    ? new Set()
    : new Set(
        (
          await db
            .select({ userId: leagueOptOuts.userId })
            .from(leagueOptOuts)
            .where(inArray(leagueOptOuts.userId, [...users]))
        ).map((r) => r.userId),
      );

/** After an upload: a learner with league XP this week and no cohort joins one of their tier, unless they said no to leagues. */
export const joinIfActive = async (db: Db, user: string, now: number, config: LeagueConfig = DEFAULT_LEAGUE, game: GameConfig = DEFAULT_GAME): Promise<void> => {
  const week = leagueWeek(now, config);
  const [member] = await db.select({ userId: leagueMembers.userId }).from(leagueMembers).where(and(eq(leagueMembers.week, week.id), eq(leagueMembers.userId, user)));
  if (member !== undefined) return;
  if ((await optedOutOf(db, [user])).has(user)) return;
  if (((await weekXp(db, [user], week, config, game)).get(user) ?? 0) === 0) return;
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

/** How the learner's last league week ended (M8): their place in their cohort, and where it took them. */
export interface LastResult {
  /** The week (its first date, UTC): the one before this one. */
  readonly week: string;
  readonly tier: number;
  readonly rank: number;
  /** How many the cohort ranked. */
  readonly of: number;
  readonly xp: number;
  readonly outcome: Ranked["outcome"];
  readonly nextTier: number;
}

interface WeekView {
  readonly enabled: true;
  readonly week: string;
  readonly endsAt: string;
  /** The learner said no to leagues (ADR 0122): they join none until they take part again. */
  readonly optedOut: boolean;
  /** How last week ended, if the learner played it and it has rolled over. */
  readonly last?: LastResult | undefined;
}

export type LeagueView =
  | { readonly enabled: false }
  | (WeekView & { readonly member: false })
  | (WeekView & {
      readonly member: true;
      readonly tier: number;
      readonly cohort: number;
      readonly zones: { readonly promote: number; readonly demote: number };
      readonly standings: readonly StandingRow[];
    });

/** A cohort ranked from the log: its members, but any who have said no to leagues since they joined. */
const rankedCohort = async (db: Db, weekId: string, tier: number, cohort: number, config: LeagueConfig, game: GameConfig): Promise<readonly Ranked[]> => {
  const joined = await db
    .select({ userId: leagueMembers.userId, joinedAt: leagueMembers.joinedAt })
    .from(leagueMembers)
    .where(and(eq(leagueMembers.week, weekId), eq(leagueMembers.tier, tier), eq(leagueMembers.cohort, cohort)));
  const out = await optedOutOf(
    db,
    joined.map((m) => m.userId),
  );
  const members = joined.filter((m) => !out.has(m.userId));
  const xp = await weekXp(
    db,
    members.map((m) => m.userId),
    weekById(weekId, config),
    config,
    game,
  );
  return rankCohort(
    members.map((m) => ({ user: m.userId, xp: xp.get(m.userId) ?? 0, joinedAt: m.joinedAt.getTime() })),
    tier,
    config,
  );
};

/** How the learner's league week before `week` ended, if they played it and it has rolled over (M8). */
const lastResult = async (db: Db, user: string, week: { readonly start: number }, config: LeagueConfig): Promise<LastResult | undefined> => {
  const previous = leagueWeek(week.start - 1, config).id;
  const [r] = await db
    .select()
    .from(leagueResults)
    .where(and(eq(leagueResults.userId, user), eq(leagueResults.week, previous)));
  if (r === undefined) return undefined;
  const [size] = await db
    .select({ n: count() })
    .from(leagueResults)
    .where(and(eq(leagueResults.week, r.week), eq(leagueResults.tier, r.tier), eq(leagueResults.cohort, r.cohort)));
  return { week: r.week, tier: r.tier, rank: r.rank, of: Number(size?.n ?? 0), xp: r.xp, outcome: r.outcome as Ranked["outcome"], nextTier: r.nextTier };
};

/** The user's cohort this week, ranked live, and how last week ended. */
export const leagueView = async (db: Db, user: string, now: number, config: LeagueConfig = DEFAULT_LEAGUE, game: GameConfig = DEFAULT_GAME): Promise<LeagueView> => {
  const week = leagueWeek(now, config);
  const optedOut = (await optedOutOf(db, [user])).has(user);
  const last = await lastResult(db, user, week, config);
  const base: WeekView = { enabled: true, week: week.id, endsAt: new Date(week.end).toISOString(), optedOut, ...(last === undefined ? {} : { last }) };
  const [me] = optedOut ? [] : await db.select().from(leagueMembers).where(and(eq(leagueMembers.week, week.id), eq(leagueMembers.userId, user)));
  if (me === undefined) return { ...base, member: false };
  const ranked = await rankedCohort(db, week.id, me.tier, me.cohort, config, game);
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
 * A learner says no to leagues, or takes part again (M8, ADR 0122). Saying no takes them out of
 * every week not rolled over yet, so they leave the standings at once (results written before stay
 * theirs); taking part again puts them in this week's league if they have league XP in it, as an
 * upload would.
 */
export const setOptedOut = async (db: Db, user: string, optedOut: boolean, now: number, config: LeagueConfig = DEFAULT_LEAGUE, game: GameConfig = DEFAULT_GAME): Promise<void> => {
  if (!optedOut) {
    await db.delete(leagueOptOuts).where(eq(leagueOptOuts.userId, user));
    await joinIfActive(db, user, now, config, game);
    return;
  }
  await db.transaction(async (tx) => {
    await tx.insert(leagueOptOuts).values({ userId: user, optedOutAt: new Date(now) }).onConflictDoNothing();
    await tx.delete(leagueMembers).where(and(eq(leagueMembers.userId, user), notInArray(leagueMembers.week, tx.select({ week: leagueWeeks.week }).from(leagueWeeks))));
  });
};

/**
 * Rolls over every week that has ended (plus the upload grace) and has not been rolled: final
 * ranks and next tiers, written once. Returns the weeks it rolled.
 */
export const rollover = async (db: Db, now: number, config: LeagueConfig = DEFAULT_LEAGUE, game: GameConfig = DEFAULT_GAME): Promise<readonly string[]> => {
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
        const ranked = await rankedCohort(tx, id, tier, cohort, config, game);
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
