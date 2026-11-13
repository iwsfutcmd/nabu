/**
 * Practice reminders (gameplan §12.6; ADRs 0044 and 0103), by Web Push and to the Android and iOS
 * apps, for learners who asked for them.
 *
 * - **When:** at the time the learner chose, or else after their usual window; only on a day they
 *   have not practised yet, at most once a day, in the zone they were last in. The window ends at
 *   the 80th percentile of the start times of their sessions in the last four weeks: by then four
 *   practice days in five have begun. Half an hour later, a session begun then is over and synced,
 *   so a reminder never lands just before the practice it would take credit for. Before there are
 *   any sessions, 19:00; never after 23:30, or it would not come that day at all.
 * - **Caps:** a reminder is answered when the learner practises after it, the day it came (practice
 *   before it, synced late, was going to happen anyway). After three unanswered in a row, every
 *   other day at most; after seven, none until they practise again.
 * - **Which:** rotation with novelty decay: the eligible template unused for longest. A sleeping,
 *   recovering bandit waits for traffic to learn from (Yancey & Settles 2020).
 * - **Rules:** the deployment's (`NABU_GAME`, as its web app has them): the streak and the quests a
 *   reminder speaks of are the ones the learner sees.
 * - **Copy:** kind, never guilt-tripping, written in the learner's UI locale with plurals.
 */
import { addDays, localDateOf, replayGame, type GameConfig, type GameInput } from "@nabu/core/game";
import { directionOf, loadTranslator, type MessageId } from "@nabu/i18n";
import type { LearnerEvent } from "@nabu/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db/index.ts";
import { events, nativePushTokens, profiles, pushLog, pushSubscriptions, reminderSettings } from "./db/schema.ts";
import type { NativeSenders, Platform } from "./nativepush.ts";
import type { Subscription } from "./webpush.ts";

export const TEMPLATES = ["streak", "quest", "gentle"] as const;
export type Template = (typeof TEMPLATES)[number];

const DEFAULT_MINUTE = 19 * 60;
const HABIT_DAYS = 28;
/** The share of start times the usual window takes in (nearest rank): four practice days in five have begun by its end. */
const USUAL_SHARE = 0.8;
/** After the window: time for a session begun at its end to finish and sync. */
const AFTER_MINUTES = 30;
/** The latest a reminder waits for: past midnight it would never come. */
const LATEST_MINUTE = 23 * 60 + 30;

const minuteFormats = new Map<string, Intl.DateTimeFormat>();

/** Minutes after local midnight of an instant in a zone. */
export const localMinute = (instant: string, tz: string): number | undefined => {
  try {
    let format = minuteFormats.get(tz);
    if (format === undefined) {
      format = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "numeric", minute: "numeric" });
      minuteFormats.set(tz, format);
    }
    const parts = format.formatToParts(Date.parse(instant));
    const n = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
    return n("hour") * 60 + n("minute");
  } catch {
    return undefined;
  }
};

/**
 * By when the learner has usually begun, in minutes after local midnight: the 80th percentile
 * (nearest rank) of the local start times of their sessions in the last four weeks, each in its
 * own zone. Undefined before there are any.
 */
export const usualStart = (log: readonly LearnerEvent[], now: number): number | undefined => {
  const since = now - HABIT_DAYS * 86_400_000;
  const minutes = log
    .filter((e) => e.type === "session_started" && Date.parse(e.clientTime) >= since)
    .flatMap((e) => localMinute(e.clientTime, e.tz) ?? [])
    .sort((a, b) => a - b);
  return minutes.length === 0 ? undefined : minutes[Math.ceil(USUAL_SHARE * minutes.length) - 1];
};

/** When the day's reminder may go, in minutes after local midnight: half an hour after the usual window. */
export const reminderMinute = (log: readonly LearnerEvent[], now: number): number => {
  const usual = usualStart(log, now);
  return usual === undefined ? DEFAULT_MINUTE : Math.min(usual + AFTER_MINUTES, LATEST_MINUTE);
};

/** A time of day as the API and the export write it: 1170 is "19:30". */
export const timeOf = (minute: number): string => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** The minutes after midnight of a 24-hour "HH:MM", or undefined for anything else. */
export const minuteOf = (time: string): number | undefined => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(time);
  return m === null ? undefined : Number(m[1]) * 60 + Number(m[2]);
};

/** The time the learner chose for the daily reminder, in minutes after local midnight; undefined: automatic. */
export const chosenMinute = async (db: Db, user: string): Promise<number | undefined> => {
  const [row] = await db.select({ minute: reminderSettings.minute }).from(reminderSettings).where(eq(reminderSettings.userId, user));
  return row?.minute;
};

/** Chooses the time of the daily reminder (minutes after local midnight), or leaves it automatic (undefined). */
export const chooseMinute = async (db: Db, user: string, minute: number | undefined): Promise<void> => {
  if (minute === undefined) await db.delete(reminderSettings).where(eq(reminderSettings.userId, user));
  else await db.insert(reminderSettings).values({ userId: user, minute }).onConflictDoUpdate({ target: reminderSettings.userId, set: { minute } });
};

export interface Sent {
  readonly template: Template;
  readonly localDate: string;
  /** When it was sent (ISO 8601). */
  readonly sentAt: string;
}

/** A completed session: when it began (its start, else its end) and the local date it counts for. */
export interface Practice {
  readonly at: number;
  readonly date: string;
}

/** The learner's completed sessions. */
export const practicesOf = (log: readonly LearnerEvent[]): readonly Practice[] => {
  const started = new Map<string, number>();
  for (const e of log) if (e.type === "session_started") started.set(e.session, Date.parse(e.clientTime));
  return log.flatMap((e) => (e.type === "session_completed" && e.summary.completed ? [{ at: started.get(e.session) ?? Date.parse(e.clientTime), date: e.localDate }] : []));
};

/** Rotation with novelty decay: of the eligible templates, the one unused for longest (never used first). */
export const chooseTemplate = (eligible: readonly Template[], history: readonly Pick<Sent, "template" | "localDate">[], today: string): Template => {
  const age = (t: Template): number => {
    const last = history.filter((h) => h.template === t).map((h) => h.localDate).sort().at(-1);
    return last === undefined ? Number.POSITIVE_INFINITY : (Date.parse(today) - Date.parse(last)) / 86_400_000;
  };
  return [...eligible].sort((a, b) => age(b) - age(a) || TEMPLATES.indexOf(a) - TEMPLATES.indexOf(b))[0] ?? "gentle";
};

/** Whether the learner practised after a reminder, the day it came: what answering it means. */
const answered = (sent: Sent, practices: readonly Practice[]): boolean => {
  const at = Date.parse(sent.sentAt);
  return practices.some((p) => p.date === sent.localDate && p.at >= at);
};

/** Reminders in a row, the latest first, that the learner did not answer. */
export const ignoredInARow = (history: readonly Sent[], practices: readonly Practice[]): number => {
  let n = 0;
  for (const h of [...history].sort((a, b) => (a.localDate < b.localDate ? 1 : -1))) {
    if (answered(h, practices)) break;
    n += 1;
  }
  return n;
};

export interface Notification {
  readonly title: string;
  readonly body: string;
  readonly lang: string;
  readonly dir: "ltr" | "rtl";
  readonly tag: string;
  readonly url: string;
}

/** A template's notification in a UI locale (pseudo-locales included). */
export const renderReminder = async (template: Template, locale: string, values: { readonly days: number; readonly count: number }): Promise<Notification> => {
  const t = await loadTranslator(locale, {
    onError: (e) => {
      throw e instanceof Error ? e : new Error(String(e));
    },
  });
  const id = (part: "title" | "body"): MessageId => `push.reminder.${template}.${part}` as MessageId;
  return { title: t.format(id("title"), values), body: t.format(id("body"), values), lang: locale, dir: directionOf(locale), tag: "nabu-reminder", url: "./" };
};

export interface Decision {
  readonly send: boolean;
  readonly reason: "practised" | "too-early" | "already-sent" | "resting" | "stopped" | "due";
  readonly localDate: string;
  readonly template?: Template;
  readonly values?: { readonly days: number; readonly count: number };
}

/** The event with the latest device time (of equals, the last): where the learner was last. */
const latestOf = (log: readonly LearnerEvent[]): LearnerEvent | undefined => {
  let latest: LearnerEvent | undefined;
  let at = Number.NEGATIVE_INFINITY;
  for (const e of log) {
    const t = Date.parse(e.clientTime);
    if (t >= at) {
      latest = e;
      at = t;
    }
  }
  return latest;
};

/**
 * Whether, and what, to remind one learner now: pure, from their log, their reminder history, the
 * deployment's game rules and the time they chose (minutes after local midnight; undefined:
 * automatic, after their usual window).
 */
export const decide = (log: readonly LearnerEvent[], history: readonly Sent[], now: number, game: GameConfig, chosen?: number): Decision => {
  const tz = latestOf(log)?.tz ?? "UTC";
  const iso = new Date(now).toISOString();
  const today = localDateOf(iso, tz) ?? iso.slice(0, 10);
  const inputs: GameInput[] = log.map((event) => ({ event }));
  const state = replayGame(inputs, game, { today, now: iso });
  if (state.streak.practicedToday) return { send: false, reason: "practised", localDate: today };
  if (history.some((h) => h.localDate === today)) return { send: false, reason: "already-sent", localDate: today };
  if ((localMinute(iso, tz) ?? 0) < (chosen ?? reminderMinute(log, now))) return { send: false, reason: "too-early", localDate: today };
  const practices = practicesOf(log);
  const ignored = ignoredInARow(history, practices);
  // Seven unanswered: none until the learner practises again, at any time after the last one.
  const last = Math.max(...history.map((h) => Date.parse(h.sentAt)));
  if (ignored >= 7 && !practices.some((p) => p.at >= last)) return { send: false, reason: "stopped", localDate: today };
  if (ignored >= 3 && history.some((h) => h.localDate === addDays(today, -1))) return { send: false, reason: "resting", localDate: today };
  const left = state.quests.filter((q) => !q.done).length;
  const eligible: Template[] = ["gentle", ...(state.streak.current > 0 ? (["streak"] as const) : []), ...(left > 0 && state.quests.some((q) => q.progress > 0) ? (["quest"] as const) : [])];
  const template = chooseTemplate(eligible, history, today);
  return { send: true, reason: "due", localDate: today, template, values: { days: state.streak.current, count: left } };
};

export type Sender = (sub: Subscription, payload: Notification) => Promise<number>;

export interface Channels {
  /** Web Push, when this instance has VAPID keys. */
  readonly send?: Sender | undefined;
  /** The Android and iOS apps: the platforms this instance has credentials for. */
  readonly native?: NativeSenders | undefined;
  /** The deployment's game rules (`NABU_GAME`, the game.json its web app is deployed with). */
  readonly game: GameConfig;
}

/**
 * One pass over every learner who can be reminded: by Web Push (`send`, when this instance has
 * VAPID keys) and on the Android and iOS apps (`native`, the platforms it has credentials for).
 * Returns how many learners were reminded.
 */
export const sendReminders = async (db: Db, now: number, { send, native = {}, game }: Channels): Promise<{ readonly sent: number; readonly decisions: number }> => {
  const subs = send === undefined ? [] : await db.select().from(pushSubscriptions);
  const platforms = (Object.keys(native) as Platform[]).filter((p) => native[p] !== undefined);
  const tokens = platforms.length === 0 ? [] : await db.select().from(nativePushTokens).where(inArray(nativePushTokens.platform, platforms));
  const users = [...new Set([...subs.map((s) => s.userId), ...tokens.map((t) => t.userId)])];
  let sent = 0;
  for (const user of users) {
    const log = (await db.select({ payload: events.payload }).from(events).where(eq(events.userId, user))).map((r) => r.payload as LearnerEvent);
    const history = (
      await db.select({ template: pushLog.template, localDate: pushLog.localDate, sentAt: pushLog.sentAt }).from(pushLog).where(eq(pushLog.userId, user)).orderBy(desc(pushLog.localDate)).limit(30)
    ).map((h) => ({ template: h.template as Template, localDate: h.localDate, sentAt: h.sentAt.toISOString() }));
    const decision = decide(log, history, now, game, await chosenMinute(db, user));
    if (!decision.send || decision.template === undefined || decision.values === undefined) continue;
    const [profile] = await db.select({ uiLocale: profiles.uiLocale }).from(profiles).where(eq(profiles.userId, user));
    const payload = await renderReminder(decision.template, profile?.uiLocale ?? "en", decision.values);
    // Claim the day first: a reminder is never sent twice, even by overlapping runs. It is sent now
    // by the jobs' clock (whether practice came after it is what answering it means).
    const claimed = await db
      .insert(pushLog)
      .values({ userId: user, localDate: decision.localDate, template: decision.template, sentAt: new Date(now) })
      .onConflictDoNothing()
      .returning({ userId: pushLog.userId });
    if (claimed.length === 0) continue;
    const gone: string[] = [];
    for (const s of subs.filter((x) => x.userId === user)) {
      const status = await send?.({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload);
      if (status === 404 || status === 410) gone.push(s.endpoint);
    }
    if (gone.length > 0) await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user), inArray(pushSubscriptions.endpoint, gone)));
    const dead: string[] = [];
    for (const t of tokens.filter((x) => x.userId === user)) {
      const deliver = native[t.platform as Platform];
      if (deliver === undefined) continue;
      const delivery = await deliver(t.token, payload).catch(() => "failed" as const);
      if (delivery === "gone") dead.push(t.token);
    }
    if (dead.length > 0) await db.delete(nativePushTokens).where(and(eq(nativePushTokens.userId, user), inArray(nativePushTokens.token, dead)));
    sent += 1;
  }
  return { sent, decisions: users.length };
};
