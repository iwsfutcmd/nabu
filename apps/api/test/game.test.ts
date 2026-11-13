/**
 * Phase 7 on the server (gameplan §12, §16): profiles with UTS #39 usernames, leagues with an
 * idempotent weekly rollover, and practice reminders by Web Push (RFC 8291 encryption checked
 * against the RFC's own example; notifications localized for every UI locale).
 */
import { createDecipheriv, createECDH, createHmac, createPublicKey, verify } from "node:crypto";
import { DEFAULT_GAME, DEFAULT_LEAGUE, gameConfig, leagueWeek, localDateOf, type GameState, type LeagueConfig } from "@nabu/core/game";
import { directionOf, PSEUDO_LOCALES, UI_LOCALES } from "@nabu/i18n";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccounts } from "../src/accounts.ts";
import { createApp, type App } from "../src/app.ts";
import type { Database } from "../src/db/index.ts";
import { testDatabase } from "./database.ts";
import { leagueResults, nativePushTokens, pushLog } from "../src/db/schema.ts";
import { rollover } from "../src/leagues.ts";
import {
  chooseTemplate,
  decide,
  ignoredInARow,
  practicesOf,
  reminderMinute,
  renderReminder,
  sendReminders,
  TEMPLATES,
  usualStart,
  type Notification,
  type Sent,
  type Template,
} from "../src/reminders.ts";
import { base64url, encrypt, fromBase64url, sendPush, vapidAuthorization, vapidKeys, type Subscription } from "../src/webpush.ts";

let database: Database;
let app: App;
let clock = Date.parse("2026-06-03T10:00:00Z"); // a Wednesday
const LEAGUE: LeagueConfig = { ...DEFAULT_LEAGUE, cohortSize: 4, promote: [1, 1, 1, 1, 1, 1, 1, 1, 1, 0], demote: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1] };
/** A deployment's game.json with one quest a day. */
const ONE_QUEST = gameConfig({ quests: { daily: 1, pool: [{ id: "right-50", count: { type: "answer", correct: true }, target: 50 }] } });

beforeAll(async () => {
  database = await testDatabase();
  app = createApp({ db: database.db, accounts: createAccounts(database.db), leagues: LEAGUE, vapid: () => vapidKeys(database.db, "mailto:test@example.org", ""), now: () => clock });
});
afterAll(async () => database.close());

const request = (method: string, body: unknown, token?: string): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

let accounts = 0;
const signUp = async (): Promise<string> => {
  const res = await app.request("/v1/auth/sign-up", request("POST", { email: `learner${++accounts}@example.org`, password: "correct horse battery" }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { token: string }).token;
};

let ids = 0;
const id = (): string => `00000000-0000-7000-9000-${(++ids).toString(16).padStart(12, "0")}`;

/** A completed session of `right` answers at `at`, `latencyMs` each, as a device logs it. */
const session = (at: number, right: number, latencyMs = 3000, tz = "UTC"): LearnerEvent[] => {
  const s = id();
  const base = (offset: number) => {
    const t = new Date(at + offset * 1000).toISOString();
    return { id: id(), schema: 1 as const, device: "d", course: "fa", orthography: "fa-Arab/standard" as OrthographyId, support: "en", bundle: "0".repeat(64), session: s, clientTime: t, localDate: t.slice(0, 10), tz };
  };
  return [
    { ...base(0), type: "session_started", mode: "lesson", node: "fa.greetings", seed: 1, exercises: right, planner: "t" },
    ...Array.from({ length: right }, (_, i) => ({
      ...base(1 + i * 4),
      type: "answer_submitted",
      exercise: { id: `x${i}`, template: "choose-translation", item: "s.1", kcs: ["sense:salam"] },
      attempt: 1,
      input: { method: "choice", latencyMs },
      outcome: { kind: "CORRECT", notes: [], kcs: [{ kc: "sense:salam", status: "right" }] },
    })),
    { ...base(2 + right * 4), type: "session_completed", mode: "lesson", node: "fa.greetings", summary: { completed: true, exercises: right, correctFirstTry: right, retries: 0, skipped: 0 } },
  ] as unknown as LearnerEvent[];
};

const upload = async (token: string, events: readonly LearnerEvent[]): Promise<void> => {
  const res = await app.request("/v1/events", request("POST", { events }, token));
  expect(res.status).toBe(200);
};

// ------------------------------------------------------------------------------------ Web Push

/** The receiving side of RFC 8291, written from the RFC, to check what the server sends. */
const decrypt = (body: Buffer, uaPrivate: Buffer, authSecret: Buffer): Buffer => {
  const hmac = (k: Buffer, d: Buffer): Buffer => createHmac("sha256", k).update(d).digest();
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const prkKey = hmac(authSecret, ecdh.computeSecret(asPublic));
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "latin1")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "latin1")).subarray(0, 12);
  const sealed = body.subarray(21 + idlen);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(sealed.subarray(-16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
  return padded.subarray(0, padded.lastIndexOf(2));
};

const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("Web Push encryption (RFC 8291)", () => {
  it("reproduces the RFC's example message byte for byte", () => {
    const body = encrypt({ plaintext: Buffer.from(RFC.plaintext), uaPublic: fromBase64url(RFC.uaPublic), authSecret: fromBase64url(RFC.auth), asPrivate: fromBase64url(RFC.asPrivate), salt: fromBase64url(RFC.salt) });
    expect(base64url(body)).toBe(RFC.body);
    expect(decrypt(body, fromBase64url(RFC.uaPrivate), fromBase64url(RFC.auth)).toString()).toBe(RFC.plaintext);
  });

  it("signs VAPID tokens the push service can verify (ES256, RFC 8292)", async () => {
    const vapid = await vapidKeys(database.db, "mailto:test@example.org", "");
    expect((await vapidKeys(database.db, "mailto:test@example.org", "")).publicKey.equals(vapid.publicKey)).toBe(true); // kept, not regenerated
    const header = vapidAuthorization("https://push.example.net/push/abc", vapid, clock);
    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/u.exec(header) ?? [];
    const [h, c, sig] = (token ?? "").split(".");
    const claims = JSON.parse(fromBase64url(c ?? "").toString()) as { aud: string; exp: number; sub: string };
    expect(claims).toMatchObject({ aud: "https://push.example.net", sub: "mailto:test@example.org" });
    expect(claims.exp).toBeGreaterThan(clock / 1000);
    const raw = fromBase64url(key ?? "");
    const publicKey = createPublicKey({ key: { kty: "EC", crv: "P-256", x: base64url(raw.subarray(1, 33)), y: base64url(raw.subarray(33)) }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${h ?? ""}.${c ?? ""}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, fromBase64url(sig ?? ""))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------ profiles

describe("profiles", () => {
  it("usernames are unique on NFKC_Casefold and on their confusable skeleton", async () => {
    const a = await signUp();
    const b = await signUp();
    const put = (token: string, profile: unknown) => app.request("/v1/profile", request("PUT", profile, token));
    const first = await put(a, { username: "Maryam", displayName: "مریم", uiLocale: "ar-XB" });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ profile: { username: "Maryam", displayName: "مریم", uiLocale: "ar-XB" } });
    expect((await put(b, { username: "ＭＡＲＹＡＭ" })).status).toBe(409); // fullwidth and capitals: the same name
    const confusable = await put(b, { username: "Mаrуаm" }); // Cyrillic а and у
    expect(confusable.status).toBe(400); // mixed Latin and Cyrillic is refused outright
    expect(await confusable.json()).toMatchObject({ error: { code: "invalid-username", reason: "mixed-script" } });
    expect((await put(a, { username: "сору" })).status).toBe(200); // all Cyrillic: fine
    const lookalike = await put(b, { username: "copy" }); // Latin, but looks exactly like сору
    expect(lookalike.status).toBe(409);
    expect(await lookalike.json()).toMatchObject({ error: { code: "username-confusable" } });
    expect((await put(b, { username: "کتاب\u200Cخوان" })).status).toBe(200);
    const mine = await app.request("/v1/profile", request("GET", undefined, b));
    expect(await mine.json()).toMatchObject({ profile: { username: "کتاب\u200Cخوان", uiLocale: "en" } });
  });
});

// ------------------------------------------------------------------------------------ leagues

describe("leagues", () => {
  it("cohorts fill to their size; standings rank by XP; the rollover writes results once", async () => {
    const week = leagueWeek(clock, LEAGUE);
    const tokens = await Promise.all(Array.from({ length: 5 }, () => signUp()));
    // Five learners earn XP this week: four fill cohort 1, the fifth opens cohort 2.
    for (const [i, token] of tokens.entries()) await upload(token, session(week.start + 86_400_000 + i * 3_600_000, 5 + i * 2));
    const views = await Promise.all(tokens.map(async (t) => (await (await app.request("/v1/league", request("GET", undefined, t))).json()) as { member: boolean; cohort: number; standings: { rank: number; you: boolean; xp: number; outcome: string }[] }));
    expect(views.map((v) => v.cohort)).toEqual([1, 1, 1, 1, 2]);
    const cohort1 = views[0]?.standings ?? [];
    expect(cohort1.map((s) => s.xp)).toEqual([...cohort1.map((s) => s.xp)].sort((x, y) => y - x));
    expect(cohort1[0]).toMatchObject({ rank: 1, outcome: "promoted" }); // tier 1: nobody falls
    // Implausibly fast answers earn no league XP.
    const fast = await signUp();
    await upload(fast, session(week.start + 2 * 86_400_000, 30, 100));
    expect(((await (await app.request("/v1/league", request("GET", undefined, fast))).json()) as { member: boolean }).member).toBe(false);

    // Before the week (plus grace) ends, nothing rolls.
    expect(await rollover(database.db, week.end, LEAGUE)).toEqual([]);
    const after = week.end + (LEAGUE.graceHours + 1) * 3_600_000;
    const [once, twice] = await Promise.all([rollover(database.db, after, LEAGUE), rollover(database.db, after, LEAGUE)]);
    expect([...(once ?? []), ...(twice ?? [])]).toEqual([week.id]); // exactly one run did it
    const rows = await database.db.select().from(leagueResults).where(eq(leagueResults.week, week.id));
    expect(rows).toHaveLength(5);
    expect(await rollover(database.db, after + 86_400_000, LEAGUE)).toEqual([]); // and again: nothing
    expect(await database.db.select().from(leagueResults).where(eq(leagueResults.week, week.id))).toEqual(rows);
    // The promoted learner plays tier 2 next week.
    const top = rows.find((r) => r.cohort === 1 && r.rank === 1);
    expect(top).toMatchObject({ outcome: "promoted", nextTier: 2 });
    clock = week.end + 2 * 86_400_000;
    const winner = tokens[views.findIndex((v) => v.standings.find((s) => s.you)?.rank === 1 && v.cohort === 1)] as string;
    await upload(winner, session(clock - 3_600_000, 3));
    expect(await (await app.request("/v1/league", request("GET", undefined, winner))).json()).toMatchObject({ member: true, tier: 2 });
  });

  it("a lesson finished before the week and replayed in it earns its answers only (ADR 0107)", async () => {
    const week = leagueWeek(clock, LEAGUE);
    const token = await signUp();
    await upload(token, session(week.start - 2 * 86_400_000, 6)); // fa.greetings, the week before
    await upload(token, session(week.start + 3_600_000, 6)); // the same lesson again
    const view = (await (await app.request("/v1/league", request("GET", undefined, token))).json()) as { member: boolean; standings: { you: boolean; xp: number }[] };
    expect(view.member).toBe(true);
    expect(view.standings.find((s) => s.you)?.xp).toBe(6);
  });
});

// ------------------------------------------------------------------------------------ reminders

describe("reminders", () => {
  const at = (iso: string): number => Date.parse(iso);
  const tz = "Europe/Berlin";
  /** A wall-clock time in Berlin in May or June (CEST, UTC+2). */
  const berlin = (date: string, time: string): number => at(`${date}T${time}:00+02:00`);
  /** Someone who starts between 18:00 and 19:00, every day of the first week of May. */
  const usual = ["18:00", "18:10", "18:20", "18:30", "18:40", "18:50", "19:00"].flatMap((time, i) => session(berlin(`2026-05-0${i + 1}`, time), 3, 3000, tz));
  const sent = (localDate: string, time: string, template: Template = "gentle"): Sent => ({ template, localDate, sentAt: new Date(berlin(localDate, time)).toISOString() });
  const day = (n: number): string => `2026-05-${String(n).padStart(2, "0")}`;

  it("come after the usual window, not at the usual time", () => {
    const noon = berlin("2026-05-08", "12:00");
    expect(usualStart(usual, noon)).toBe(18 * 60 + 50); // the 80th percentile of the start times
    expect(reminderMinute(usual, noon)).toBe(19 * 60 + 20); // and half an hour more
    expect(reminderMinute([], noon)).toBe(19 * 60); // no habit yet
    // At 18:30 (the median, where reminders used to come) they would have begun anyway; at 19:10 too, most days.
    expect(decide(usual, [], berlin("2026-05-08", "18:30"), DEFAULT_GAME)).toMatchObject({ send: false, reason: "too-early" });
    expect(decide(usual, [], berlin("2026-05-08", "19:10"), DEFAULT_GAME)).toMatchObject({ send: false, reason: "too-early" });
    // By 19:30 nothing yet: due. On a streak, the streak template comes first; the gentle one is never off the table.
    expect(decide(usual, [], berlin("2026-05-08", "19:30"), DEFAULT_GAME)).toMatchObject({ send: true, template: "streak", values: { days: 7 } });
    // A late habit still hears that evening.
    const owl = session(berlin("2026-05-07", "23:50"), 3, 3000, tz);
    expect(reminderMinute(owl, noon)).toBe(23 * 60 + 30);
  });

  it("come at the time the learner chose, instead", () => {
    // The learner who practises 18:00–19:00 asks for mornings…
    expect(decide(usual, [], berlin("2026-05-08", "07:55"), DEFAULT_GAME, 8 * 60)).toMatchObject({ send: false, reason: "too-early" });
    expect(decide(usual, [], berlin("2026-05-08", "08:00"), DEFAULT_GAME, 8 * 60)).toMatchObject({ send: true, template: "streak" });
    // …or for late evenings: nothing at 19:30, when the automatic time would have come.
    expect(decide(usual, [], berlin("2026-05-08", "19:30"), DEFAULT_GAME, 21 * 60)).toMatchObject({ send: false, reason: "too-early" });
    expect(decide(usual, [], berlin("2026-05-08", "21:00"), DEFAULT_GAME, 21 * 60)).toMatchObject({ send: true });
    // A day already practised still gets none.
    const practised = [...usual, ...session(berlin("2026-05-08", "07:00"), 3, 3000, tz)];
    expect(decide(practised, [], berlin("2026-05-08", "08:00"), DEFAULT_GAME, 8 * 60)).toMatchObject({ send: false, reason: "practised" });
  });

  it("come only on a day without practice, at most once a day", () => {
    const practised = [...usual, ...session(berlin("2026-05-08", "09:00"), 3, 3000, tz)];
    expect(decide(practised, [], berlin("2026-05-08", "21:00"), DEFAULT_GAME)).toMatchObject({ send: false, reason: "practised" });
    expect(decide(usual, [sent("2026-05-08", "19:20")], berlin("2026-05-08", "21:00"), DEFAULT_GAME)).toMatchObject({ send: false, reason: "already-sent" });
  });

  it("count as answered only when practice came after them, and back off when it did not", () => {
    const history = [sent(day(8), "19:20"), sent(day(9), "19:20"), sent(day(10), "19:20")];
    // On the 9th the learner had practised at 18:00, offline, and synced later: the reminder brought about nothing.
    const before = [...usual, ...session(berlin(day(9), "18:00"), 3, 3000, tz)];
    expect(ignoredInARow(history, practicesOf(before))).toBe(3);
    expect(decide(before, history, berlin(day(11), "20:00"), DEFAULT_GAME)).toMatchObject({ send: false, reason: "resting" });
    expect(decide(before, history.slice(0, 2), berlin(day(11), "20:00"), DEFAULT_GAME)).toMatchObject({ send: true });
    // Practice after the reminder, that evening, answers it.
    const after = [...usual, ...session(berlin(day(10), "20:15"), 3, 3000, tz)];
    expect(ignoredInARow(history, practicesOf(after))).toBe(0);
    expect(decide(after, history, berlin(day(11), "20:00"), DEFAULT_GAME)).toMatchObject({ send: true });
  });

  it("stop after seven unanswered, until the learner practises again", () => {
    const week = Array.from({ length: 7 }, (_, i) => sent(day(8 + i), "19:20"));
    expect(decide(usual, week, berlin(day(15), "20:00"), DEFAULT_GAME)).toMatchObject({ send: false, reason: "stopped" });
    expect(decide(usual, week, berlin(day(20), "20:00"), DEFAULT_GAME)).toMatchObject({ send: false, reason: "stopped" });
    // Back on the 16th, on their own: reminders come again.
    const back = [...usual, ...session(berlin(day(16), "08:00"), 3, 3000, tz)];
    expect(decide(back, week, berlin(day(17), "21:00"), DEFAULT_GAME)).toMatchObject({ send: true });
  });

  it("rotate templates with novelty decay", () => {
    expect(chooseTemplate(["gentle", "streak"], [], "2026-05-04")).toBe("streak");
    expect(chooseTemplate(["gentle", "streak"], [{ template: "streak", localDate: "2026-05-03" }], "2026-05-04")).toBe("gentle");
  });

  it("speak of the deployment's quests, not the defaults", () => {
    // An unfinished lesson today with five right answers: quests under way, the day not practised yet.
    const started = session(berlin("2026-05-08", "18:00"), 5, 3000, tz).filter((e) => e.type !== "session_completed");
    const evening = berlin("2026-05-08", "19:00");
    expect(decide(started, [], evening, ONE_QUEST)).toMatchObject({ send: true, template: "quest", values: { count: 1 } });
    expect(decide(started, [], evening, DEFAULT_GAME).values?.count).toBe(3);
    expect(decide(started, [], evening, gameConfig({ quests: { daily: 0 } }))).toMatchObject({ send: true, template: "gentle", values: { count: 0 } });
  });

  it("are localized for every UI locale (§16 Phase 7)", async () => {
    for (const locale of [...UI_LOCALES, ...PSEUDO_LOCALES]) {
      for (const template of TEMPLATES) {
        for (const values of [
          { days: 1, count: 1 },
          { days: 12, count: 3 },
        ]) {
          const n = await renderReminder(template, locale, values);
          expect(n.title.trim(), `${locale} ${template}`).not.toBe("");
          expect(n.body.trim()).not.toBe("");
          expect(`${n.title} ${n.body}`).not.toMatch(/\{\$|\{push\./u);
          expect(n).toMatchObject({ lang: locale, dir: directionOf(locale) });
          if (template === "streak") expect(n.title).toContain(String(values.days));
        }
      }
    }
    const en = await renderReminder("quest", "en", { days: 0, count: 1 });
    expect(en.title).toBe("1 quest left today");
    expect((await renderReminder("quest", "en", { days: 0, count: 2 })).title).toBe("2 quests left today");
    expect((await renderReminder("gentle", "ar-XB", { days: 0, count: 0 })).dir).toBe("rtl");
  });

  it("reach the subscription encrypted, in the learner's locale, once", async () => {
    const token = await signUp();
    await app.request("/v1/profile", request("PUT", { username: "reminded", uiLocale: "en-XA" }, token));
    clock = at("2026-07-01T09:00:00Z");
    await upload(token, session(at("2026-06-30T19:00:00Z"), 3));
    // The browser's subscription: its own key pair and secret.
    const ua = createECDH("prime256v1");
    ua.generateKeys();
    const secret = Buffer.from("0123456789abcdef");
    const key = (await (await app.request("/v1/push/key", request("GET", undefined, token))).json()) as { publicKey: string };
    expect(fromBase64url(key.publicKey)).toHaveLength(65);
    const sub = { endpoint: "https://push.example.net/push/xyz", keys: { p256dh: base64url(ua.getPublicKey()), auth: base64url(secret) } };
    expect((await app.request("/v1/push/subscribe", request("POST", sub, token))).status).toBe(201);
    expect((await app.request("/v1/push/subscribe", request("POST", { endpoint: "ftp://x", keys: sub.keys }, token))).status).toBe(400);

    const vapid = await vapidKeys(database.db, "mailto:test@example.org", "");
    const delivered: { url: string; headers: Record<string, string>; payload: Notification }[] = [];
    const fakeFetch = (url: string, init: { headers: Record<string, string>; body: Uint8Array }) => {
      delivered.push({ url, headers: init.headers, payload: JSON.parse(decrypt(Buffer.from(init.body), ua.getPrivateKey(), secret).toString()) as Notification });
      return Promise.resolve({ status: 201 });
    };
    const send = (s: Subscription, p: Notification) => sendPush(s, p, vapid, clock, fakeFetch);
    const evening = at("2026-07-01T19:30:00Z");
    expect((await sendReminders(database.db, evening, { send, game: DEFAULT_GAME })).sent).toBeGreaterThanOrEqual(1);
    const mine = delivered.filter((d) => d.url === sub.endpoint);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(mine[0]?.payload).toMatchObject({ lang: "en-XA", dir: "ltr", tag: "nabu-reminder" });
    expect(mine[0]?.payload.title).not.toMatch(/^Your|^Ready/u); // pseudo-localized, not English
    // Overlapping runs never send a second reminder the same day.
    await sendReminders(database.db, evening + 60_000, { send, game: DEFAULT_GAME });
    expect(delivered.filter((d) => d.url === sub.endpoint)).toHaveLength(1);
    expect(await database.db.select().from(pushLog)).not.toHaveLength(0);
    // A subscription the push service says is gone is dropped.
    const gone = () => Promise.resolve({ status: 410 });
    await sendReminders(database.db, at("2026-07-02T19:30:00Z"), { send: (s, p) => sendPush(s, p, vapid, clock, gone), game: DEFAULT_GAME });
    expect((await app.request("/v1/push/unsubscribe", request("POST", { endpoint: sub.endpoint }, token))).status).toBe(204);
  });

  it("go out with the deployment's game rules, and remember when they went", async () => {
    const res = await app.request("/v1/auth/sign-up", request("POST", { email: "quests@example.org", password: "correct horse battery" }));
    expect(res.status).toBe(201);
    const { token, user } = (await res.json()) as { token: string; user: { id: string } };
    // An unfinished lesson this morning: quests under way, no practice yet, no streak.
    await upload(token, session(at("2026-08-03T08:00:00Z"), 5).filter((e) => e.type !== "session_completed"));
    await database.db.insert(nativePushTokens).values({ token: "deployment-rules", userId: user.id, platform: "android" });
    const received: Notification[] = [];
    const android = (device: string, n: Notification): Promise<"sent"> => {
      if (device === "deployment-rules") received.push(n);
      return Promise.resolve("sent");
    };
    const jobsAt = at("2026-08-03T10:00:00Z");
    await sendReminders(database.db, jobsAt, { native: { android }, game: ONE_QUEST });
    expect(received.map((n) => n.title)).toEqual(["1 quest left today"]);
    // Sent at the jobs' clock: whether practice came after it is what answering it means.
    const [log] = await database.db.select().from(pushLog).where(eq(pushLog.userId, user.id));
    expect(log).toMatchObject({ localDate: "2026-08-03", template: "quest" });
    expect(log?.sentAt.getTime()).toBe(jobsAt);
  });

  it("keep the time the learner chose, and come then", async () => {
    const res = await app.request("/v1/auth/sign-up", request("POST", { email: "mornings@example.org", password: "correct horse battery" }));
    const { token, user } = (await res.json()) as { token: string; user: { id: string } };
    const put = (body: unknown) => app.request("/v1/push/reminder", request("PUT", body, token));
    const get = async (): Promise<unknown> => (await app.request("/v1/push/reminder", request("GET", undefined, token))).json();
    expect(await get()).toEqual({ available: true, time: null }); // automatic until chosen
    for (const bad of [{ time: "24:00" }, { time: "7:30" }, { time: "07:30:00" }, { time: 450 }, {}]) expect((await put(bad)).status).toBe(400);
    expect(await (await put({ time: "07:30" })).json()).toEqual({ available: true, time: "07:30" });
    expect(await get()).toEqual({ available: true, time: "07:30" });
    expect((await app.request("/v1/push/reminder", request("GET", undefined))).status).toBe(401);

    // They practise in the evening and asked for mornings: the reminder comes at 07:30, not before.
    await upload(token, session(at("2026-08-10T19:00:00Z"), 3));
    await database.db.insert(nativePushTokens).values({ token: "chosen-time", userId: user.id, platform: "android" });
    const received: Notification[] = [];
    const android = (device: string, n: Notification): Promise<"sent"> => {
      if (device === "chosen-time") received.push(n);
      return Promise.resolve("sent");
    };
    await sendReminders(database.db, at("2026-08-11T07:25:00Z"), { native: { android }, game: DEFAULT_GAME });
    expect(received).toHaveLength(0);
    await sendReminders(database.db, at("2026-08-11T07:30:00Z"), { native: { android }, game: DEFAULT_GAME });
    expect(received).toHaveLength(1);

    // Automatic again.
    expect(await (await put({ time: null })).json()).toEqual({ available: true, time: null });
    expect(await get()).toEqual({ available: true, time: null });
    // An instance that sends no reminders says so.
    const quiet = createApp({ db: database.db, accounts: createAccounts(database.db) });
    expect(await (await quiet.request("/v1/push/reminder", request("GET", undefined, token))).json()).toEqual({ available: false, time: null });
  });
});

// ------------------------------------------------------------------------- The game on the server

describe("the game state on the server (Phase 10)", () => {
  /** A session in a time zone, with the local date the device would stamp. */
  const zoned = (at: string, tz: string): LearnerEvent[] => session(Date.parse(at), 2, 3000, tz).map((e) => ({ ...e, localDate: localDateOf(e.clientTime, tz) ?? "" }));
  const gameOf = async (token: string, query: string): Promise<GameState> => ((await (await app.request(`/v1/game?${query}`, request("GET", undefined, token))).json()) as { game: GameState }).game;

  it("counts each session on its own local date, and a late sync for XP but not the streak", async () => {
    const token = await signUp();
    const tz = "Asia/Kathmandu"; // UTC+05:45: local and UTC dates part around midnight
    const offline = [
      ...zoned("2026-06-01T21:00:00Z", tz), // 02:45 on 2 June there (1 June in UTC)
      ...zoned("2026-06-02T17:30:00Z", tz), // 23:15 on 2 June
      ...zoned("2026-06-02T18:20:00Z", tz), // 00:05 on 3 June (still 2 June in UTC)
    ];
    const saved = clock;
    clock = Date.parse("2026-06-03T10:00:00Z"); // synced the next day, inside the 72-hour grace
    try {
      await upload(token, offline);
      const game = await gameOf(token, "today=2026-06-03&now=2026-06-03T10:00:00.000Z");
      expect(game.days).toEqual(["2026-06-02", "2026-06-03"]);
      expect(game.streak.current).toBe(2);
      expect(Object.keys(game.xp.byDate).sort()).toEqual(["2026-06-02", "2026-06-03"]);
      // Without a clock, the server's own, and the date where the learner last was.
      expect((await gameOf(token, "")).streak.current).toBe(2);
      // A session from five days earlier, synced only now: XP, but no streak day.
      await upload(token, zoned("2026-05-29T06:00:00Z", tz));
      const late = await gameOf(token, "today=2026-06-03&now=2026-06-03T10:00:00.000Z");
      expect(late.days).toEqual(["2026-06-02", "2026-06-03"]);
      expect(late.xp.byDate["2026-05-29"]).toBeGreaterThan(0);
      expect((await app.request("/v1/game?today=3.6.2026", request("GET", undefined, token))).status).toBe(400);
    } finally {
      clock = saved;
    }
  });
});
