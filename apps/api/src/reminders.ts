/**
 * Practice reminders (gameplan §12.6), sent by Web Push to learners who asked for them.
 *
 * - **When:** at the learner's habitual practice time (the median local start time of their
 *   sessions in the last four weeks; 19:00 before there are any), only on a day they have not
 *   practised yet, and at most once a day.
 * - **Caps:** after three reminders in a row went unanswered, every other day at most; after
 *   seven, none until they practise again.
 * - **Which:** rotation with novelty decay: the eligible template unused for longest. A sleeping,
 *   recovering bandit waits for traffic to learn from (Yancey & Settles 2020).
 * - **Copy:** kind, never guilt-tripping, written in the learner's UI locale with plurals.
 */
import { addDays, DEFAULT_GAME, localDateOf, replayGame, type GameInput } from "@nabu/core/game";
import { directionOf, loadTranslator, type MessageId } from "@nabu/i18n";
import type { LearnerEvent } from "@nabu/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db/index.ts";
import { events, nativePushTokens, profiles, pushLog, pushSubscriptions } from "./db/schema.ts";
import type { NativeSenders, Platform } from "./nativepush.ts";
import type { Subscription } from "./webpush.ts";

export const TEMPLATES = ["streak", "quest", "gentle"] as const;
export type Template = (typeof TEMPLATES)[number];

const DEFAULT_MINUTE = 19 * 60;
const HABIT_DAYS = 28;

/** Minutes after local midnight of an instant in a zone. */
export const localMinute = (instant: string, tz: string): number | undefined => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "numeric", minute: "numeric" }).formatToParts(Date.parse(instant));
    const n = (t: string): number => Number(parts.find((p) => p.type === t)?.value);
    return n("hour") * 60 + n("minute");
  } catch {
    return undefined;
  }
};

/** The median local start time of recent sessions, in minutes after midnight. */
export const habitualMinute = (log: readonly LearnerEvent[], now: number): number => {
  const since = now - HABIT_DAYS * 86_400_000;
  const minutes = log
    .filter((e) => e.type === "session_started" && Date.parse(e.clientTime) >= since)
    .flatMap((e) => localMinute(e.clientTime, e.tz) ?? [])
    .sort((a, b) => a - b);
  if (minutes.length === 0) return DEFAULT_MINUTE;
  const mid = Math.floor(minutes.length / 2);
  return minutes.length % 2 === 1 ? (minutes[mid] as number) : Math.round(((minutes[mid - 1] as number) + (minutes[mid] as number)) / 2);
};

export interface Sent {
  readonly template: Template;
  readonly localDate: string;
}

/** Rotation with novelty decay: of the eligible templates, the one unused for longest (never used first). */
export const chooseTemplate = (eligible: readonly Template[], history: readonly Sent[], today: string): Template => {
  const age = (t: Template): number => {
    const last = history.filter((h) => h.template === t).map((h) => h.localDate).sort().at(-1);
    return last === undefined ? Number.POSITIVE_INFINITY : (Date.parse(today) - Date.parse(last)) / 86_400_000;
  };
  return [...eligible].sort((a, b) => age(b) - age(a) || TEMPLATES.indexOf(a) - TEMPLATES.indexOf(b))[0] ?? "gentle";
};

/** Reminders in a row the learner did not answer by practising that day. */
export const ignoredInARow = (history: readonly Sent[], practised: ReadonlySet<string>): number => {
  let n = 0;
  for (const h of [...history].sort((a, b) => (a.localDate < b.localDate ? 1 : -1))) {
    if (practised.has(h.localDate)) break;
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

/** Whether, and what, to remind one learner now: pure, from their log and reminder history. */
export const decide = (log: readonly LearnerEvent[], history: readonly Sent[], now: number): Decision => {
  const latest = [...log].sort((a, b) => Date.parse(a.clientTime) - Date.parse(b.clientTime)).at(-1);
  const tz = latest?.tz ?? "UTC";
  const iso = new Date(now).toISOString();
  const today = localDateOf(iso, tz) ?? iso.slice(0, 10);
  const inputs: GameInput[] = log.map((event) => ({ event }));
  const game = replayGame(inputs, DEFAULT_GAME, { today, now: iso });
  if (game.streak.practicedToday) return { send: false, reason: "practised", localDate: today };
  if (history.some((h) => h.localDate === today)) return { send: false, reason: "already-sent", localDate: today };
  if ((localMinute(iso, tz) ?? 0) < habitualMinute(log, now)) return { send: false, reason: "too-early", localDate: today };
  const ignored = ignoredInARow(history, new Set(game.days));
  if (ignored >= 7) return { send: false, reason: "stopped", localDate: today };
  if (ignored >= 3 && history.some((h) => h.localDate === addDays(today, -1))) return { send: false, reason: "resting", localDate: today };
  const left = game.quests.filter((q) => !q.done).length;
  const eligible: Template[] = ["gentle", ...(game.streak.current > 0 ? (["streak"] as const) : []), ...(left > 0 && game.quests.some((q) => q.progress > 0) ? (["quest"] as const) : [])];
  const template = chooseTemplate(eligible, history, today);
  return { send: true, reason: "due", localDate: today, template, values: { days: game.streak.current, count: left } };
};

export type Sender = (sub: Subscription, payload: Notification) => Promise<number>;

/**
 * One pass over every learner who can be reminded: by Web Push (`send`, when this instance has
 * VAPID keys) and on the Android and iOS apps (`native`, the platforms it has credentials for).
 * Returns how many learners were reminded.
 */
export const sendReminders = async (db: Db, now: number, send: Sender | undefined, native: NativeSenders = {}): Promise<{ readonly sent: number; readonly decisions: number }> => {
  const subs = send === undefined ? [] : await db.select().from(pushSubscriptions);
  const platforms = (Object.keys(native) as Platform[]).filter((p) => native[p] !== undefined);
  const tokens = platforms.length === 0 ? [] : (await db.select().from(nativePushTokens).where(inArray(nativePushTokens.platform, platforms)));
  const users = [...new Set([...subs.map((s) => s.userId), ...tokens.map((t) => t.userId)])];
  let sent = 0;
  for (const user of users) {
    const log = (await db.select({ payload: events.payload }).from(events).where(eq(events.userId, user))).map((r) => r.payload as LearnerEvent);
    const history = (await db.select({ template: pushLog.template, localDate: pushLog.localDate }).from(pushLog).where(eq(pushLog.userId, user)).orderBy(desc(pushLog.localDate)).limit(30)).map(
      (h) => ({ template: h.template as Template, localDate: h.localDate }),
    );
    const decision = decide(log, history, now);
    if (!decision.send || decision.template === undefined || decision.values === undefined) continue;
    const [profile] = await db.select({ uiLocale: profiles.uiLocale }).from(profiles).where(eq(profiles.userId, user));
    const payload = await renderReminder(decision.template, profile?.uiLocale ?? "en", decision.values);
    // Claim the day first: a reminder is never sent twice, even by overlapping runs.
    const claimed = await db.insert(pushLog).values({ userId: user, localDate: decision.localDate, template: decision.template }).onConflictDoNothing().returning({ userId: pushLog.userId });
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
