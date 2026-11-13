/**
 * Phase 7 acceptance for streaks (gameplan §12.2, §15): property tests across the date line,
 * through DST transitions, and syncing after 48 hours offline; plus freezes, anti-gaming, quests,
 * achievements and the gate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addDays,
  canStart,
  countable,
  daysBetween,
  daysThisWeek,
  DEFAULT_GAME,
  DEFAULT_LEAGUE,
  leagueWeek,
  leagueXp,
  rankCohort,
  ENERGY,
  gameConfig,
  HEARTS,
  localDateOf,
  questsFor,
  QUEST_WINDOW,
  replayGame,
  replaysOf,
  streakOf,
  weekStart,
  type GameConfig,
  type GameInput,
} from "../src/game/index.ts";
import { replay } from "../src/learner/index.ts";

// ------------------------------------------------------------------------------------ building logs

let counter = 0;
const uuid = (): string => `00000000-0000-7000-8000-${(++counter).toString(16).padStart(12, "0")}`;

/** The UTC instant at which a zone's wall clock shows `date` `minutes` past midnight (DST gaps resolve forward). */
const instantAt = (date: string, minutes: number, tz: string): number => {
  const wall = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) + minutes * 60_000;
  const offset = (at: number): number => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(at);
    const n = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - at;
  };
  let at = wall - offset(wall);
  at = wall - offset(at);
  return at;
};

interface Practice {
  readonly at: number;
  readonly tz: string;
  /** What the device records; by default the true local date. */
  readonly localDate?: string;
  readonly right?: number;
  readonly wrong?: number;
  readonly mode?: "lesson" | "review" | "mistakes" | "story";
}

/** One session as a device logs it: start, answers, completion; local date from the device clock. */
const session = (p: Practice): LearnerEvent[] => {
  const s = uuid();
  const localDate = p.localDate ?? (localDateOf(new Date(p.at).toISOString(), p.tz));
  const mode = p.mode ?? "lesson";
  const base = (offset: number) => ({
    id: uuid(),
    schema: 1 as const,
    device: "d",
    course: "fa",
    orthography: "fa-Arab/standard" as OrthographyId,
    support: "en",
    bundle: "b",
    session: s,
    clientTime: new Date(p.at + offset * 1000).toISOString(),
    localDate,
    tz: p.tz,
  });
  const right = p.right ?? 3;
  const wrong = p.wrong ?? 0;
  const answers: LearnerEvent[] = [...Array.from({ length: right }, () => true), ...Array.from({ length: wrong }, () => false)].map((ok, i) => ({
    ...base(1 + i),
    type: "answer_submitted",
    exercise: { id: `x${i}`, template: "choose-translation", item: "s.1", kcs: ["sense:salam"] },
    attempt: 1,
    input: { method: "choice", latencyMs: 2000 },
    outcome: { kind: ok ? "CORRECT" : "WRONG", notes: [], kcs: [{ kc: "sense:salam", status: ok ? "right" : "wrong" }] },
  })) as unknown as LearnerEvent[];
  return [
    { ...base(0), type: "session_started", mode, seed: 1, exercises: right + wrong, planner: "t" },
    ...answers,
    { ...base(2 + right + wrong), type: "session_completed", mode, summary: { completed: true, exercises: right + wrong, correctFirstTry: right, retries: 0, skipped: 0 } },
  ] as unknown as LearnerEvent[];
};

/**
 * A learner practising once a day for `n` days of their own calendar, in the zone `zone(i)`:
 * each practice falls on the day after the previous one as the current zone counts days, or, if
 * that day has already ended there (the date line), on the zone's current day. Time only moves
 * forward.
 */
const travel = (start: string, n: number, zone: (i: number) => string, minute: (i: number) => number): LearnerEvent[] => {
  const out: LearnerEvent[] = [];
  let prev: { at: number; date: string } | undefined;
  for (let i = 0; i < n; i += 1) {
    const tz = zone(i);
    let at: number;
    if (prev === undefined) at = instantAt(start, minute(i), tz);
    else {
      const earliest = prev.at + 60_000;
      const target = addDays(prev.date, 1);
      const ends = instantAt(addDays(target, 1), 0, tz);
      at = ends - 60_000 > earliest ? Math.min(Math.max(instantAt(target, minute(i), tz), earliest), ends - 60_000) : earliest;
    }
    const date = localDateOf(new Date(at).toISOString(), tz) as string;
    out.push(...session({ at, tz }));
    prev = { at: Date.parse(out.at(-1)?.clientTime ?? ""), date };
  }
  return out;
};

const online = (events: readonly LearnerEvent[]): GameInput[] => events.map((event) => ({ event, receivedAt: event.clientTime }));
const device = (events: readonly LearnerEvent[]): GameInput[] => events.map((event) => ({ event }));
const clockAt = (date: string, at: number) => ({ today: date, now: new Date(at).toISOString() });
const NO_QUESTS: GameConfig = gameConfig({ quests: { daily: 0 } });

// ------------------------------------------------------------------------------------ dates

describe("local dates", () => {
  it("date arithmetic is calendar arithmetic", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sunday → Monday
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    // Weeks that start on Sunday (7) or Saturday (6), as some locales have them.
    expect(weekStart("2026-11-08", 7)).toBe("2026-11-08");
    expect(weekStart("2026-11-07", 7)).toBe("2026-11-01");
    expect(weekStart("2026-11-07", 6)).toBe("2026-11-07");
    expect(weekStart("2026-11-06", 6)).toBe("2026-10-31");
  });

  it("counts this week's practice days from the week's first day (ADR 0107)", () => {
    const days = ["2026-10-30", "2026-11-01", "2026-11-02", "2026-11-04"];
    expect(daysThisWeek(days, "2026-11-05")).toBe(2); // Monday 2 November on
    expect(daysThisWeek(days, "2026-11-05", 7)).toBe(3); // Sunday 1 November on
    expect(daysThisWeek(days, "2026-11-01", 7)).toBe(1); // a new week, practised today
    expect(daysThisWeek([], "2026-11-05")).toBe(0);
  });

  it("an instant's local date depends on the zone, across the date line", () => {
    const at = "2026-06-01T11:30:00Z";
    expect(localDateOf(at, "Pacific/Kiritimati")).toBe("2026-06-02"); // UTC+14
    expect(localDateOf(at, "Pacific/Pago_Pago")).toBe("2026-06-01"); // UTC−11
    expect(localDateOf(at, "Asia/Tehran")).toBe("2026-06-01");
    expect(localDateOf(at, "Not/AZone")).toBeUndefined();
  });
});

// ------------------------------------------------------------------------------------ properties (§15)

const ZONES = ["Pacific/Kiritimati", "Pacific/Pago_Pago", "Pacific/Auckland", "Pacific/Honolulu", "Asia/Tehran", "America/New_York", "UTC"] as const;

/**
 * Whether a timeline keeps to the cap on time-zone changes (§12.2: at most
 * `maxTzChangesPerWeek` in any seven days; past it, the new zone's days do not count, which
 * "time-zone changes are bounded" tests). Practising just before and just after midnight, or
 * crossing the date line westward, can squeeze three days' blocks into less than a week, so
 * the date-line properties keep to travellers within the cap.
 */
const withinZoneCap = (events: readonly LearnerEvent[], max = NO_QUESTS.streak.maxTzChangesPerWeek): boolean => {
  const week = 7 * 24 * 3_600_000;
  const changes: number[] = [];
  let tz: string | undefined;
  for (const e of [...events].sort((a, b) => Date.parse(a.clientTime) - Date.parse(b.clientTime))) {
    const at = Date.parse(e.clientTime);
    if (tz !== undefined && e.tz !== tz) {
      if (changes.filter((c) => at - c < week).length >= max) return false;
      changes.push(at);
    }
    tz = e.tz;
  }
  return true;
};

// Property tests generate whole timelines: give them time on slow CI runners.
describe("streak properties", { timeout: 120_000 }, () => {
  it("daily practice is one streak, whichever side of the date line each day is spent on", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 40 }),
        fc.integer({ min: 0, max: 300 }),
        fc.array(fc.constantFrom(...ZONES), { minLength: 14, maxLength: 14 }),
        fc.array(fc.integer({ min: 0, max: 24 * 60 - 1 }), { minLength: 40, maxLength: 40 }),
        (n, startOffset, zones, minutes) => {
          // A traveller who practises every day of their own calendar: the next practice is on the
          // day after the last one in the zone they are now in, unless that day already ended there
          // (they crossed the date line and it never happened for them).
          const events = travel(addDays("2026-01-01", startOffset), n, (i) => zones[Math.floor(i / 3)] as string, (i) => minutes[i] as number);
          fc.pre(withinZoneCap(events));
          const last = events.at(-1) as LearnerEvent;
          const state = replayGame(online(events), NO_QUESTS, clockAt(last.localDate, Date.parse(last.clientTime)));
          expect(state.streak.current).toBe(n);
          expect(state.streak.longest).toBe(n);
          expect(state.days).toHaveLength(n);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("back and forth over the date line every three days: every skipped date is bridged", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 7, max: 30 }),
        fc.array(fc.integer({ min: 0, max: 24 * 60 - 1 }), { minLength: 30, maxLength: 30 }),
        (n, minutes) => {
          const zones = ["Pacific/Pago_Pago", "Pacific/Kiritimati"];
          const zone = (i: number): string => zones[Math.floor(i / 3) % 2] as string;
          // Late evenings in Samoa: by then Kiritimati has already left the next date.
          const minute = (i: number): number => (zone(i) === "Pacific/Pago_Pago" ? 23 * 60 + ((minutes[i] as number) % 60) : (minutes[i] as number));
          const events = travel("2026-03-01", n, zone, minute);
          fc.pre(withinZoneCap(events));
          const days = [...new Set(events.map((e) => e.localDate))].sort();
          // Flying west from Samoa to Kiritimati skips a date at least once.
          expect(daysBetween(days[0] as string, days.at(-1) as string) + 1).toBeGreaterThan(n);
          const last = events.at(-1) as LearnerEvent;
          const state = replayGame(online(events), NO_QUESTS, clockAt(last.localDate, Date.parse(last.clientTime)));
          expect(state.streak).toMatchObject({ current: n, longest: n, frozen: [] });
        },
      ),
      { numRuns: 60 },
    );
  });

  it("a date skipped by flying west over the date line does not break the streak", () => {
    // Monday evening in American Samoa (UTC−11), then Wednesday in Kiritimati (UTC+14): Tuesday never happens.
    const samoa = session({ at: instantAt("2026-06-01", 20 * 60, "Pacific/Pago_Pago"), tz: "Pacific/Pago_Pago" });
    const kiri = session({ at: instantAt("2026-06-03", 9 * 60, "Pacific/Kiritimati"), tz: "Pacific/Kiritimati" });
    const state = replayGame(online([...samoa, ...kiri]), NO_QUESTS, clockAt("2026-06-03", Date.parse(kiri.at(-1)?.clientTime ?? "")));
    expect(state.days).toEqual(["2026-06-01", "2026-06-03"]);
    expect(state.streak).toMatchObject({ current: 2, frozen: [] });
    // Staying put and missing Tuesday is a missed day.
    const home = session({ at: instantAt("2026-06-03", 9 * 60, "Pacific/Pago_Pago"), tz: "Pacific/Pago_Pago" });
    expect(replayGame(online([...samoa, ...home]), NO_QUESTS, clockAt("2026-06-03", Date.parse(home.at(-1)?.clientTime ?? ""))).streak.current).toBe(1);
  });

  it("DST transitions neither break nor double a day", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("America/New_York", "Europe/Berlin", "Australia/Sydney", "Asia/Tehran"),
        fc.constantFrom("2026-03-05", "2026-03-26", "2026-10-22", "2026-10-29", "2026-04-02"),
        // Wall-clock times around the transitions: 00:30, 01:30 (ambiguous in autumn), 02:30 (missing in spring), 03:30.
        fc.array(fc.constantFrom(30, 90, 150, 210, 1410), { minLength: 10, maxLength: 10 }),
        (tz, start, minutes) => {
          const events = minutes.flatMap((m, i) => session({ at: instantAt(addDays(start, i), m, tz), tz }));
          const dates = new Set(events.map((e) => e.localDate));
          const last = [...dates].sort().at(-1) as string;
          const state = replayGame(online(events), NO_QUESTS, clockAt(last, Date.parse(events.at(-1)?.clientTime ?? "")));
          // Every day practised once; a gap only where a missing wall time slid onto the next day (it never does here).
          expect(dates.size).toBe(10);
          expect(state.streak.current).toBe(10);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("syncing after 48 hours offline: every day counts on the server, as on the device", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ZONES),
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 0, max: 47 * 60 }),
        fc.array(fc.integer({ min: 0, max: 24 * 60 - 1 }), { minLength: 12, maxLength: 12 }),
        (tz, n, offlineAt, minutes) => {
          const events = travel("2026-07-01", n, () => tz, (i) => minutes[i] as number);
          const last = events.at(-1) as LearnerEvent;
          // The device goes offline at some moment within the last 48 hours of practice and syncs
          // 48 hours after it went offline: everything since then reaches the server late.
          const end = Date.parse(last.clientTime);
          const offline = end - offlineAt * 60_000;
          const syncAt = offline + 48 * 3_600_000;
          const inputs = events.map((event) => ({ event, receivedAt: Date.parse(event.clientTime) < offline ? event.clientTime : new Date(syncAt).toISOString() }));
          const clock = clockAt(localDateOf(new Date(syncAt).toISOString(), tz) as string, syncAt);
          const onServer = replayGame(inputs, NO_QUESTS, clock);
          const onDevice = replayGame(device(events), NO_QUESTS, clock);
          expect(onServer.days).toEqual(onDevice.days);
          expect(onServer.streak).toEqual(onDevice.streak);
          expect(onServer.streak.longest).toBe(n);
        },
      ),
      { numRuns: 80 },
    );
  });

  it("is order-independent and idempotent", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), fc.integer(), (n, seed) => {
        const events = Array.from({ length: n }, (_, i) => session({ at: instantAt(addDays("2026-05-01", i * 2), 600, "Asia/Tehran"), tz: "Asia/Tehran" })).flat();
        const clock = clockAt("2026-06-01", Date.parse("2026-06-01T12:00:00Z"));
        const a = replayGame(online(events), DEFAULT_GAME, clock);
        const shuffled = fc.sample(fc.shuffledSubarray([...events, ...events.slice(0, 3)], { minLength: events.length + Math.min(3, events.length) }), { numRuns: 1, seed })[0] ?? [];
        expect(replayGame(online(shuffled), DEFAULT_GAME, clock)).toEqual(a);
      }),
      { numRuns: 30 },
    );
  });
});

// ------------------------------------------------------------------------------------ grace and anti-gaming

describe("what counts for a day", () => {
  const tz = "Europe/Berlin";
  const at = instantAt("2026-09-10", 18 * 60, tz);

  it("an event that reaches the server after the grace window does not count for its day", () => {
    const events = session({ at, tz });
    const inTime = events.map((event) => ({ event, receivedAt: new Date(at + 71 * 3_600_000).toISOString() }));
    const tooLate = events.map((event) => ({ event, receivedAt: new Date(at + 80 * 3_600_000).toISOString() }));
    const clock = clockAt("2026-09-13", at + 80 * 3_600_000);
    expect(replayGame(inTime, NO_QUESTS, clock).days).toEqual(["2026-09-10"]);
    expect(replayGame(tooLate, NO_QUESTS, clock).days).toEqual([]);
    // XP still counts: only the streak has a grace window.
    expect(replayGame(tooLate, NO_QUESTS, clock).xp.total).toBe(replayGame(inTime, NO_QUESTS, clock).xp.total);
  });

  it("a local date that is not the clock's date in its zone does not count", () => {
    const forged = session({ at, tz, localDate: "2026-09-11" });
    expect(replayGame(online(forged), NO_QUESTS, clockAt("2026-09-11", at)).days).toEqual([]);
  });

  it("an event from the future does not count", () => {
    const future = session({ at: at + 2 * 86_400_000, tz });
    const received = future.map((event) => ({ event, receivedAt: new Date(at).toISOString() }));
    expect(replayGame(received, NO_QUESTS, clockAt("2026-09-10", at)).days).toEqual([]);
  });

  it("time-zone changes are bounded: beyond three in a week, the new zone's days do not count", () => {
    const hops = ["Asia/Tehran", "Asia/Tokyo", "America/New_York", "Pacific/Auckland", "Europe/London", "Asia/Tehran"];
    const events = hops.flatMap((zone, i) => session({ at: instantAt(addDays("2026-09-01", i), 12 * 60, zone), tz: zone }));
    const state = replayGame(online(events), NO_QUESTS, clockAt("2026-09-06", Date.parse("2026-09-06T23:00:00Z")));
    // The first zone and three changes count; the fourth and fifth change do not.
    expect(state.days).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
  });

  /** §12.2 as written, every check on every event in time order: what the replay must agree with, whatever it puts off. */
  const countableAsWritten = (inputs: readonly GameInput[], config: GameConfig, now: string): Map<string, boolean> => {
    const byId = new Map<string, GameInput>();
    for (const input of inputs) if (input.event.type !== "outcome_revised" && !byId.has(input.event.id)) byId.set(input.event.id, input);
    const time = (e: LearnerEvent): number => Date.parse(e.clientTime);
    const sorted = [...byId.values()].sort((a, b) => time(a.event) - time(b.event) || (a.event.id < b.event.id ? -1 : a.event.id > b.event.id ? 1 : 0));
    const out = new Map<string, boolean>();
    const changes: number[] = [];
    let zone: string | undefined;
    for (const { event: e, receivedAt } of sorted) {
      const seen = Date.parse(receivedAt ?? now);
      let ok = localDateOf(e.clientTime, e.tz) === e.localDate && time(e) <= seen + 5 * 60_000;
      if (ok && receivedAt !== undefined) ok = seen - time(e) <= config.streak.graceHours * 3_600_000;
      if (ok && zone !== undefined && e.tz !== zone) {
        if (changes.filter((c) => time(e) - c < 7 * 86_400_000).length >= config.streak.maxTzChangesPerWeek) ok = false;
        else changes.push(time(e));
      }
      if (ok) zone = e.tz;
      out.set(e.id, ok);
    }
    return out;
  };

  it("checking local dates only where they matter changes nothing: forged dates, the future, late syncs, zone hops", { timeout: 120_000 }, () => {
    const practice = fc.record({
      gapMinutes: fc.integer({ min: 1, max: 3 * 24 * 60 }),
      zone: fc.constantFrom(...ZONES),
      // The device's local date: its own, a day off on the whole session, or a day off on the completion only.
      forged: fc.constantFrom("none", "none", "none", "session", "completion"),
      // When the server got it: in time, after the grace window, before it happened (the future), or never (the device).
      received: fc.constantFrom("in-time", "in-time", "late", "early", "device"),
    });
    fc.assert(
      fc.property(fc.array(practice, { minLength: 1, maxLength: 25 }), fc.integer(), (practices, seed) => {
        let at = Date.parse("2026-03-20T08:00:00Z");
        const inputs: GameInput[] = practices.flatMap((p) => {
          at += p.gapMinutes * 60_000;
          const own = localDateOf(new Date(at).toISOString(), p.zone) as string;
          const events = session({ at, tz: p.zone, ...(p.forged === "session" ? { localDate: addDays(own, 1) } : {}) }).map((e) =>
            p.forged === "completion" && e.type === "session_completed" ? { ...e, localDate: addDays(own, -1) } : e,
          );
          const receivedAt = (e: LearnerEvent): string | undefined => {
            const t = Date.parse(e.clientTime);
            if (p.received === "device") return undefined;
            return new Date(p.received === "late" ? t + 80 * 3_600_000 : p.received === "early" ? t - 3_600_000 : t + 2_000).toISOString();
          };
          return events.map((event) => ({ event, receivedAt: receivedAt(event) }));
        });
        const now = new Date(at + 3_600_000).toISOString();
        const expected = countableAsWritten(inputs, NO_QUESTS, now);
        const shuffled = fc.sample(fc.shuffledSubarray([...inputs, ...inputs.slice(0, 5)], { minLength: inputs.length + Math.min(5, inputs.length) }), { numRuns: 1, seed })[0] ?? [];
        expect([...countable(shuffled, NO_QUESTS, now)]).toEqual([...expected]);
        const counted = inputs.flatMap(({ event: e }) => (e.type === "session_completed" && expected.get(e.id) === true ? [e.localDate] : []));
        expect(replayGame(shuffled, NO_QUESTS, { today: localDateOf(now, "UTC") as string, now }).days).toEqual([...new Set(counted)].sort());
      }),
      { numRuns: 150 },
    );
  });
});

// ------------------------------------------------------------------------------------ freezes

describe("freezes", () => {
  const range = (start: string, n: number): string[] => Array.from({ length: n }, (_, i) => addDays(start, i));
  const freeze = DEFAULT_GAME.streak.freeze;

  it("seven days earn a freeze, which covers a missed day", () => {
    const days = [...range("2026-01-01", 7), ...range("2026-01-09", 2)];
    const s = streakOf(days, "2026-01-10", freeze);
    expect(s.frozen).toEqual(["2026-01-08"]);
    expect(s.current).toBe(9);
    expect(s.freezes).toBe(0);
  });

  it("without a freeze, a missed day ends the streak", () => {
    expect(streakOf([...range("2026-01-01", 5), ...range("2026-01-07", 2)], "2026-01-08", freeze).current).toBe(2);
  });

  it("today not practised yet does not break the streak; yesterday missed without a freeze does", () => {
    expect(streakOf(range("2026-01-01", 3), "2026-01-04", freeze)).toMatchObject({ current: 3, practicedToday: false });
    expect(streakOf(range("2026-01-01", 3), "2026-01-05", freeze).current).toBe(0);
  });

  it("holds at most two, and spends them on consecutive missed days", () => {
    const s = streakOf([...range("2026-01-01", 21), ...range("2026-01-25", 1)], "2026-01-25", freeze);
    expect(s.frozen).toEqual(["2026-01-22", "2026-01-23"]);
    expect(s.current).toBe(0 + 1); // the third missed day (24th) broke it; today starts again
    expect(s.longest).toBe(21);
  });
});

// ------------------------------------------------------------------------------------ quests, achievements, XP

describe("quests and achievements", () => {
  it("the day's quests are the same for everyone on a date who can do them, and rotate", () => {
    const every = new Set(DEFAULT_GAME.quests.pool.map((q) => q.id));
    const a = questsFor("2026-05-01", DEFAULT_GAME, every).map((q) => q.id);
    expect(a).toEqual(questsFor("2026-05-01", DEFAULT_GAME, every).map((q) => q.id));
    expect(new Set(a).size).toBe(3);
    const week = Array.from({ length: 7 }, (_, i) => questsFor(addDays("2026-05-01", i), DEFAULT_GAME, every).map((q) => q.id).join());
    expect(new Set(week).size).toBeGreaterThan(1);
    // Someone who can do fewer kinds of practice gets the same draw without the others.
    const some = questsFor("2026-05-01", DEFAULT_GAME).map((q) => q.id);
    expect(some).toHaveLength(3);
    expect(some.every((id) => DEFAULT_GAME.quests.pool.find((q) => q.id === id)?.requires === undefined)).toBe(true);
  });

  it("a quest needs practice the log shows in the two weeks before its day: none for listening in a reading course (ADR 0107)", () => {
    const tz = "UTC";
    const dates = Array.from({ length: 40 }, (_, i) => addDays("2026-07-01", i));
    const reading = dates.flatMap((date) => session({ at: instantAt(date, 600, tz), tz }));
    const drawn = (events: readonly LearnerEvent[], date: string): readonly string[] => replayGame(online(events), DEFAULT_GAME, clockAt(date, instantAt(date, 1200, tz))).quests.map((q) => q.id);
    // Only ever reading (choose-translation, lessons): three quests a day, none for listening, writing or a story.
    for (const date of dates) {
      const ids = drawn(reading, date);
      expect(ids, date).toHaveLength(3);
      expect(ids.filter((id) => ["listen-5", "produce-5", "story-1"].includes(id)), date).toEqual([]);
    }
    // Nothing to review on the very first day; something every day after.
    expect(drawn(reading, "2026-07-01")).not.toContain("review-1");
    expect(dates.some((date) => drawn(reading, date).includes("review-1"))).toBe(true);
    // Listening once, on 20 July, makes the listening quest possible from the next day, for two weeks.
    const listened = session({ at: instantAt("2026-07-20", 700, tz), tz }).map((e) => (e.type === "answer_submitted" ? { ...e, exercise: { ...e.exercise, template: "listen-select" } } : e)) as LearnerEvent[];
    const listening = dates.filter((date) => drawn([...reading, ...listened], date).includes("listen-5"));
    expect(listening.length).toBeGreaterThan(0);
    for (const date of listening) expect(date > "2026-07-20" && date <= addDays("2026-07-20", QUEST_WINDOW), date).toBe(true);
    // The day's own practice never changes its quests.
    expect(drawn([...reading, ...listened], "2026-07-20")).toEqual(drawn(reading, "2026-07-20"));
  });

  it("completed quests add their XP; without quests, XP matches the learner model's", () => {
    const tz = "Asia/Tehran";
    const events = [...session({ at: instantAt("2026-05-01", 600, tz), tz, right: 12 }), ...session({ at: instantAt("2026-05-01", 700, tz), tz, right: 12, mode: "review" })];
    const clock = clockAt("2026-05-01", instantAt("2026-05-01", 800, tz));
    const plain = replayGame(online(events), NO_QUESTS, clock);
    expect(plain.xp.total).toBe(replay(events).xp.total);
    const withQuests = replayGame(online(events), DEFAULT_GAME, clock);
    const done = withQuests.quests.filter((q) => q.done).length;
    expect(withQuests.xp.total).toBe(plain.xp.total + done * DEFAULT_GAME.xp.quest);
    for (const q of withQuests.quests) expect(q.progress).toBeLessThanOrEqual(q.target);
  });

  it("achievements unlock from the log: a 7-day streak, ten sessions", () => {
    const tz = "UTC";
    const events = Array.from({ length: 10 }, (_, i) => session({ at: instantAt(addDays("2026-02-01", i), 600, tz), tz })).flat();
    const state = replayGame(online(events), DEFAULT_GAME, clockAt("2026-02-10", Date.parse("2026-02-10T12:00:00Z")));
    expect(state.achievements).toEqual(["streak-7", "sessions-10"]);
  });

  it("a session pays a point a card up to ten, and the perfect bonus only from five cards (ADR 0107)", () => {
    const tz = "UTC";
    const at = (minutes: number): number => instantAt("2026-05-01", minutes, tz);
    const xpOf = (events: readonly LearnerEvent[]): number => replayGame(online(events), NO_QUESTS, clockAt("2026-05-01", at(1200))).xp.total;
    // One card right: 1 for the answer, 1 for the session, no perfect bonus.
    expect(xpOf(session({ at: at(600), tz, right: 1, mode: "mistakes" }))).toBe(2);
    // Five right: 5 + 5 + 5.
    expect(xpOf(session({ at: at(600), tz, right: 5, mode: "review" }))).toBe(15);
    // Fourteen, one wrong: 13 + 10, no bonus.
    expect(xpOf(session({ at: at(600), tz, right: 13, wrong: 1 }))).toBe(23);
    // Per card, five one-card sessions now pay less than one five-card session.
    const minis = [0, 1, 2, 3, 4].flatMap((i) => session({ at: at(600 + i * 10), tz, right: 1, mode: "mistakes" }));
    expect(xpOf(minis)).toBeLessThan(xpOf(session({ at: at(600), tz, right: 5, mode: "review" })));
  });

  it("a lesson finished before pays its answers only, until the course is started over (ADR 0107)", () => {
    const tz = "UTC";
    const at = (minutes: number): number => instantAt("2026-05-01", minutes, tz);
    const lesson = (minutes: number, node = "fa.greetings"): LearnerEvent[] =>
      session({ at: at(minutes), tz, right: 6 }).map((e): LearnerEvent => (e.type === "session_started" || e.type === "session_completed" ? { ...e, node } : e));
    const clock = clockAt("2026-05-01", at(1200));
    const first = lesson(600);
    const again = lesson(700);
    const once = replayGame(online(first), NO_QUESTS, clock).xp.total;
    expect(once).toBe(6 + 6 + 5);
    expect(replayGame(online([...first, ...again]), NO_QUESTS, clock).xp.total).toBe(once + 6);
    expect(replaysOf([...first, ...again])).toEqual(new Set([again.at(-1)?.id]));
    // Another lesson is no replay; neither is the same one after starting the course over.
    expect(replayGame(online([...first, ...lesson(700, "fa.names")]), NO_QUESTS, clock).xp.total).toBe(2 * once);
    const reset = { ...(first[0] as LearnerEvent), id: uuid(), type: "progress_reset", clientTime: new Date(at(650)).toISOString() } as unknown as LearnerEvent;
    const restarted = [...first, reset, ...again];
    expect(replayGame(online(restarted), NO_QUESTS, clock).xp.total).toBe(2 * once);
    // The learner model pays the same.
    for (const log of [[...first, ...again], restarted]) expect(replay(log).xp.total).toBe(replayGame(online(log), NO_QUESTS, clock).xp.total);
    // So do leagues, which see the finish before the week only to know the replay.
    const week = leagueWeek(at(700), DEFAULT_LEAGUE);
    const before = lesson(600).map((e) => ({ ...e, clientTime: new Date(week.start - 3_600_000 + Date.parse(e.clientTime) - at(600)).toISOString() })) as LearnerEvent[];
    const inWeek = lesson(600).map((e) => ({ ...e, clientTime: new Date(week.start + 3_600_000 + Date.parse(e.clientTime) - at(600)).toISOString() })) as LearnerEvent[];
    expect(leagueXp(online([...before, ...inWeek]), week.start, week.end, DEFAULT_GAME, DEFAULT_LEAGUE)).toBe(6);
    expect(leagueXp(online(inWeek), week.start, week.end, DEFAULT_GAME, DEFAULT_LEAGUE)).toBe(once);
  });

  it("a placement test stopped part-way places by its answers, without the session's XP (D9)", () => {
    const tz = "UTC";
    const at = (minutes: number): number => instantAt("2026-05-02", minutes, tz);
    const clock = clockAt("2026-05-02", at(1200));
    // Six right first tries, then the learner stops; the answers placed out of the first lesson.
    const stopped = session({ at: at(600), tz, right: 6 }).map((e): LearnerEvent =>
      e.type === "session_started"
        ? { ...e, mode: "placement" }
        : e.type === "session_completed"
          ? ({ ...e, mode: "placement", summary: { ...e.summary, completed: false }, placed: ["fa.greetings"], seeded: ["sense:salam"] } as unknown as LearnerEvent)
          : e,
    );
    expect(replayGame(online(stopped), NO_QUESTS, clock).xp.total).toBe(6);
    const model = replay(stopped);
    expect(model.xp.total).toBe(6);
    expect(model.completedNodes).toEqual(["fa.greetings"]);
    expect(model.cards["sense:salam|recognize"]).toBeDefined();
    // The same test run to its end pays the session's XP as well.
    const finished = stopped.map((e): LearnerEvent => (e.type === "session_completed" ? { ...e, summary: { ...e.summary, completed: true } } : e));
    expect(replayGame(online(finished), NO_QUESTS, clock).xp.total).toBe(6 + 6 + 5);
    expect(replay(finished).xp.total).toBe(6 + 6 + 5);
    // A lesson it placed out of is done: playing it pays its answers only, in the game and the model alike.
    const lesson = session({ at: at(700), tz, right: 6 }).map((e): LearnerEvent => (e.type === "session_started" || e.type === "session_completed" ? { ...e, node: "fa.greetings" } : e));
    const log = [...stopped, ...lesson];
    expect(replaysOf(log)).toEqual(new Set([lesson.at(-1)?.id]));
    expect(replayGame(online(log), NO_QUESTS, clock).xp.total).toBe(6 + 6);
    expect(replay(log).xp.total).toBe(6 + 6);
  });

  it("XP agrees with the learner model's on any log of one course, quests off (ADR 0044)", () => {
    const tz = "UTC";
    const nodes = ["fa.greetings", "fa.names", undefined];
    const day = fc.record({
      right: fc.integer({ min: 0, max: 14 }),
      wrong: fc.integer({ min: 0, max: 3 }),
      mode: fc.constantFrom<"lesson" | "review" | "mistakes" | "story">("lesson", "review", "mistakes", "story"),
      node: fc.constantFrom(...nodes),
      reset: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(day, { minLength: 1, maxLength: 12 }), (days) => {
        const events = days.flatMap((d, i) => {
          const at = instantAt(addDays("2026-03-01", i), 600, tz);
          const done = session({ at, tz, right: d.right, wrong: d.wrong, mode: d.mode }).map((e): LearnerEvent =>
            (e.type === "session_started" || e.type === "session_completed") && d.node !== undefined && (d.mode === "lesson" || d.mode === "story") ? { ...e, node: d.node } : e,
          );
          const reset = d.reset ? [{ ...(done[0] as LearnerEvent), id: uuid(), type: "progress_reset", clientTime: new Date(at - 60_000).toISOString() } as unknown as LearnerEvent] : [];
          return [...reset, ...done];
        });
        const last = events.at(-1) as LearnerEvent;
        expect(replayGame(online(events), NO_QUESTS, clockAt(last.localDate, Date.parse(last.clientTime))).xp.total).toBe(replay(events).xp.total);
      }),
      { numRuns: 200 },
    );
  });

  it("the golden session's XP agrees with the learner model when quests are off", () => {
    const golden = JSON.parse(readFileSync(join(import.meta.dirname, "golden/fa-lesson-1.events.json"), "utf8")) as LearnerEvent[];
    const last = golden.at(-1) as LearnerEvent;
    expect(replayGame(device(golden), NO_QUESTS, { today: last.localDate, now: last.clientTime }).xp.total).toBe(replay(golden).xp.total);
  });
});

// ------------------------------------------------------------------------------------ the gate (§12.3)

describe("the session gate", () => {
  const tz = "UTC";
  const t0 = Date.parse("2026-04-01T09:00:00Z");
  const clock = (ms: number) => clockAt("2026-04-01", ms);

  it("is off by default: every session may start", () => {
    const events = session({ at: t0, tz, right: 0, wrong: 9 });
    const state = replayGame(online(events), DEFAULT_GAME, clock(t0 + 60_000));
    expect(state.gate.policy).toBe("none");
    expect(canStart(state.gate, "lesson", DEFAULT_GAME.gate)).toBe(true);
  });

  it("hearts: mistakes in lessons cost one each, practice is free and refills, and they come back with time", () => {
    const config = gameConfig({ gate: HEARTS });
    const lesson = session({ at: t0, tz, right: 2, wrong: 5 });
    const out = replayGame(online(lesson), config, clock(t0 + 60_000));
    expect(out.gate).toMatchObject({ policy: "hearts", value: 0, max: 5 });
    expect(canStart(out.gate, "lesson", config.gate)).toBe(false);
    expect(canStart(out.gate, "mistakes", config.gate)).toBe(true);
    // 300 minutes after the first mistake, one heart is back.
    const later = replayGame(online(lesson), config, clock(t0 + 301 * 60_000));
    expect(later.gate.value).toBe(1);
    // A review session with mistakes costs nothing and refills.
    const practised = replayGame(online([...lesson, ...session({ at: t0 + 120_000, tz, right: 1, wrong: 2, mode: "review" })]), config, clock(t0 + 180_000));
    expect(practised.gate.value).toBe(5);
  });

  it("energy: each lesson answer costs one, a run of five right earns three back", () => {
    const config = gameConfig({ gate: ENERGY });
    const state = replayGame(online(session({ at: t0, tz, right: 10, wrong: 0 })), config, clock(t0 + 60_000));
    // 25 − 10 + 2 runs × 3 = 21
    expect(state.gate).toMatchObject({ policy: "energy", value: 21, max: 25 });
    expect(canStart(state.gate, "story", config.gate)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------ leagues (§12.4)

describe("league XP and ranking", () => {
  const league = { ...DEFAULT_LEAGUE };
  const week = leagueWeek(Date.parse("2026-06-03T12:00:00Z"), league);

  it("weeks start on Monday (UTC, configurable offset)", () => {
    expect(week.id).toBe("2026-06-01");
    expect(leagueWeek(Date.parse("2026-06-03T12:00:00Z"), { ...league, weekOffsetHours: 24 * 3 }).id).toBe("2026-05-28");
  });

  it("counts plausible XP in the week only", () => {
    const tz = "UTC";
    const inWeek = session({ at: week.start + 3_600_000, tz, right: 5 });
    const before = session({ at: week.start - 3_600_000, tz, right: 5 });
    const xp = leagueXp(online([...inWeek, ...before]), week.start, week.end, DEFAULT_GAME, league);
    expect(xp).toBe(5 + 5 + 5); // answers, a point a card, perfect: the earlier session does not count
    // Too fast: no answer XP, and a session with no plausible answer earns nothing either.
    const fast = session({ at: week.start + 7_200_000, tz, right: 5 }).map((e) => (e.type === "answer_submitted" ? { ...e, input: { ...e.input, latencyMs: 50 } } : e)) as LearnerEvent[];
    expect(leagueXp(online(fast), week.start, week.end, DEFAULT_GAME, league)).toBe(0);
    // Uploaded long after the week: not counted.
    const late = inWeek.map((event) => ({ event, receivedAt: new Date(week.end + 24 * 3_600_000).toISOString() }));
    expect(leagueXp(late, week.start, week.end, DEFAULT_GAME, league)).toBe(0);
    // An hour's XP is capped.
    const capped = leagueXp(online(session({ at: week.start + 10_800_000, tz, right: 900 })), week.start, week.end, DEFAULT_GAME, league);
    expect(capped).toBeLessThanOrEqual(league.maxXpPerHour * 2);
  });

  it("ranks by XP, then who joined first; zones never overlap", () => {
    const members = [
      { user: "a", xp: 50, joinedAt: 2 },
      { user: "b", xp: 80, joinedAt: 3 },
      { user: "c", xp: 50, joinedAt: 1 },
      { user: "d", xp: 10, joinedAt: 4 },
    ];
    const zones = { ...league, promote: [1, 1, 1], demote: [0, 1, 1] };
    expect(rankCohort(members, 2, zones).map((r) => [r.user, r.rank, r.outcome, r.nextTier])).toEqual([
      ["b", 1, "promoted", 3],
      ["c", 2, "stayed", 2],
      ["a", 3, "stayed", 2],
      ["d", 4, "demoted", 1],
    ]);
    expect(rankCohort(members, 1, zones).find((r) => r.user === "d")?.outcome).toBe("stayed"); // nobody falls out of tier 1
    expect(rankCohort([{ user: "solo", xp: 5, joinedAt: 0 }], 2, zones).map((r) => r.outcome)).toEqual(["promoted"]);
  });
});
