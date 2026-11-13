/**
 * Phase 7 in the app (gameplan §12): the streak, freezes, quests and achievements are projections
 * of the device's log; a deployment can turn on the hearts gate (practice stays open); and with
 * an account, a UTS #39 username, the weekly league and a practice reminder that arrives
 * encrypted by Web Push in the learner's UI locale.
 */
import { createDecipheriv, createECDH, createHmac } from "node:crypto";
import { DEFAULT_LEAGUE, leagueWeek } from "@nabu/core/game";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { expect, test, type Page } from "@playwright/test";
import { API_PORT } from "./ports.ts";
import { activate, canMiss, loadCourse, logOf, planned, playSession, seedLog, seriousAxeViolations } from "./solver.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const DAY = 86_400_000;
const course = loadCourse("fa", "fa-Arab/standard");
const BUNDLE = "0".repeat(64);

let n = 0;
const uuid = (): string => `00000000-0000-7000-a000-${(++n).toString(16).padStart(12, "0")}`;

/** A day's practice as a device logs it: a lesson, `right` answers right and `wrong` wrong, all at `at` (UTC). */
const practice = (at: number, right: number, wrong = 0, mode: "lesson" | "review" = "lesson"): LearnerEvent[] => {
  const session = uuid();
  const base = (offset: number) => {
    const t = new Date(at + offset * 1000).toISOString();
    return { id: uuid(), schema: 1 as const, device: "e2e-game", course: "fa", orthography: "fa-Arab/standard" as OrthographyId, support: "en", bundle: BUNDLE, session, clientTime: t, localDate: t.slice(0, 10), tz: "UTC" };
  };
  const answers = [...Array.from({ length: right }, () => true), ...Array.from({ length: wrong }, () => false)];
  return [
    { ...base(0), type: "session_started", mode, ...(mode === "lesson" ? { node: "fa.greetings" } : {}), seed: 1, exercises: answers.length, planner: "e2e" },
    ...answers.map((ok, i) => ({
      ...base(1 + i * 5),
      type: "answer_submitted",
      exercise: { id: `choose-translation:s.1#${i}`, template: "choose-translation", item: "s.1", kcs: ["sense:salam"] },
      attempt: 1,
      input: { method: "choice", latencyMs: 3000 },
      outcome: { kind: ok ? "CORRECT" : "WRONG", notes: [], kcs: [{ kc: "sense:salam", status: ok ? "right" : "wrong" }] },
    })),
    {
      ...base(2 + answers.length * 5),
      type: "session_completed",
      mode,
      ...(mode === "lesson" ? { node: "fa.greetings" } : {}),
      summary: { completed: true, exercises: answers.length, correctFirstTry: right, retries: 0, skipped: 0 },
    },
  ] as unknown as LearnerEvent[];
};

const home = (page: Page): Promise<unknown> => page.evaluate(() => (window.location.hash = "#/"));

test.describe("game", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("streak, freezes, quests and achievements come from the device's log", async ({ page }) => {
    const now = Date.parse("2026-05-20T15:00:00Z");
    await page.clock.setFixedTime(new Date(now));
    // Eight days in a row, ending yesterday.
    await seedLog(
      page,
      Array.from({ length: 8 }, (_, i) => practice(now - (8 - i) * DAY, 6)).flat(),
    );
    await page.reload(); // seedLog left the page here: reload so the app reads the seeded log
    const streak = page.locator("[data-streak]");
    await expect(streak).toHaveAttribute("data-streak", "8");
    await expect(streak).toHaveAttribute("data-practiced-today", "false");
    await expect(page.locator("[data-freezes]")).toHaveAttribute("data-freezes", "1");
    await expect(page.locator('[data-achievement="streak-7"]')).toBeVisible();
    await expect(page.locator("[data-quests] [data-quest]")).toHaveCount(3);

    // A lesson today: the streak grows, and today's quests move.
    await page.evaluate(() => (window.location.hash = "#/fa/fa-Arab.standard"));
    const exercises = planned(course, await logOf(page, "fa"), { mode: "lesson", node: "fa.greetings" }, new Date(now), 3);
    await page.goto(`/?seed=3&sound=off#/fa/fa-Arab.standard/fa.greetings`);
    await playSession(page, exercises, "keyboard");
    await home(page);
    await expect(streak).toHaveAttribute("data-streak", "9");
    await expect(streak).toHaveAttribute("data-practiced-today", "true");
    const moved = await page.locator("[data-quests] [data-quest]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-quest-progress"))));
    expect(moved.some((p) => p > 0)).toBe(true);
  });

  test("Home opens on the courses for a new learner; then a freeze says what it covered, and a weekly goal can be set (ADR 0107)", async ({ page }) => {
    const now = Date.parse("2026-05-20T15:00:00Z"); // a Wednesday
    await page.clock.setFixedTime(new Date(now));
    await page.goto("/?sound=off#/");
    await expect(page.locator("[data-course-list]")).toBeVisible();
    await expect(page.locator("[data-game]")).toHaveCount(0); // no empty streak before the first session
    // Eight days in a row, Monday missed (a freeze covers it), then yesterday.
    await seedLog(page, [...Array.from({ length: 8 }, (_, i) => practice(now - (10 - i) * DAY, 6)).flat(), ...practice(now - DAY, 6)]);
    await page.reload();
    await expect(page.locator("[data-streak]")).toHaveAttribute("data-streak", "9");
    await expect(page.locator("[data-freeze-covered]")).toHaveAttribute("data-freeze-covered", "1");
    await expect(page.locator("[data-freezes]")).toHaveCount(0); // spent, and none held
    // The goal: asked once, then this week's progress toward it. It is the account's (D12): a
    // goal_set event in the log, which syncs to every device, not a setting of this one.
    await page.locator('[data-goal-choice] [data-goal-days="5"]').click();
    await expect(page.locator("[data-goal]")).toHaveAttribute("data-goal", "5");
    const goals = (): Promise<(number | null)[]> => page.evaluate(async () => ((await window.nabu?.allEvents()) ?? []).flatMap((e) => (e.type === "goal_set" ? [e.days] : [])));
    await expect.poll(goals).toEqual([5]);
    await page.reload();
    await expect(page.locator("[data-goal]")).toHaveAttribute("data-goal", "5");
    // A minute later, as a learner's second choice would be: the later goal_set is the goal.
    await page.clock.setFixedTime(new Date(now + 60_000));
    await page.locator("[data-action=change-goal]").click();
    await page.locator('[data-goal-choice] [data-goal-days="3"]').click();
    await expect(page.locator("[data-goal]")).toHaveAttribute("data-goal", "3");
    await expect.poll(goals).toEqual([5, 3]);
    expect(await seriousAxeViolations(page, "[data-game]")).toEqual([]);
  });

  test("a page left open overnight turns the streak and today's quests over by itself", async ({ page }) => {
    const evening = Date.parse("2026-05-20T23:59:00Z");
    await page.clock.install({ time: new Date(evening) });
    // Yesterday and an hour ago.
    await seedLog(page, [...practice(evening - DAY, 6), ...practice(evening - 3_600_000, 6)]);
    await page.reload();
    const streak = page.locator("[data-streak]");
    await expect(streak).toHaveAttribute("data-streak", "2");
    await expect(streak).toHaveAttribute("data-practiced-today", "true");

    // Past midnight, nothing reloaded: a new day with nothing practised yet.
    await page.clock.runFor(2 * 60_000);
    await expect(streak).toHaveAttribute("data-practiced-today", "false");
    await expect(streak).toHaveAttribute("data-streak", "2");
    await expect(page.locator('[data-quests] [data-quest][data-quest-progress="0"]')).toHaveCount(3);

    // A whole day missed, the page still open: the streak is gone.
    await page.clock.runFor(DAY);
    await expect(streak).toHaveAttribute("data-streak", "0");
  });

  test.describe("deployment rules", () => {
    // The deployment's game.json is stubbed with page.route, which does not see requests the
    // service worker makes: these tests run without it.
    test.use({ serviceWorkers: "block" });

    const HEARTS = { gate: { policy: "hearts", max: 5, regenMinutes: 300, refillByPractice: true } };
    /** When the first heart lost in `practice(at, 2, …)` comes back: its first mistake (11 s in), plus 300 minutes. */
    const firstHeartBack = (at: number): number => at + 11_000 + 300 * 60_000;

    test("a deployment can turn on hearts; practice stays open", async ({ page }) => {
      await page.route("**/game.json", (route) => route.fulfill({ json: HEARTS }));
      const now = Date.parse("2026-05-21T10:00:00Z");
      await page.clock.setFixedTime(new Date(now));
      await seedLog(page, practice(now - 3_600_000, 2, 5)); // five mistakes an hour ago: no hearts left
      await page.reload();
      await expect(page.locator("[data-gate]")).toHaveAttribute("data-gate-value", "0");
      // When the next comes back (M5).
      await expect(page.locator("[data-gate-next]")).toHaveAttribute("data-gate-next", new Date(firstHeartBack(now - 3_600_000)).toISOString());
      await page.goto("/?sound=off#/fa/fa-Arab.standard/fa.names");
      await expect(page.locator("[data-gate-empty]")).toBeVisible();
      await activate(page, "keyboard", '[data-gate-empty] ~ div [data-practice-mode="review"]');
      await expect(page.locator("[data-lesson-player], [data-empty-session]").first()).toBeVisible();
      await expect(page.locator("[data-gate-empty]")).toHaveCount(0);
    });

    test("the empty gate says when a lesson may start, and starts it then (M5)", async ({ page }) => {
      await page.route("**/game.json", (route) => route.fulfill({ json: HEARTS }));
      const now = Date.parse("2026-05-21T10:00:00Z");
      await page.clock.install({ time: new Date(now) });
      const earlier = now - 3_600_000;
      await seedLog(page, practice(earlier, 2, 5)); // no hearts left
      await page.reload();
      await page.evaluate(() => (window.location.hash = "#/fa/fa-Arab.standard/fa.names"));
      const empty = page.locator("[data-gate-empty]");
      await expect(empty).toHaveAttribute("data-gate-opens", new Date(firstHeartBack(earlier)).toISOString());
      await expect(empty).toContainText("You're out of hearts for now. Practise reviews or mistakes to refill, or start your next lesson at");
      await expect(page.locator("[data-action=gate-start]")).toHaveCount(0);
      // Four hours on, the page still open: the lesson may start.
      await page.clock.runFor(firstHeartBack(earlier) - now + 1_000);
      await expect(page.locator("[data-gate-open]")).toBeVisible();
      await page.locator("[data-action=gate-start]").click();
      await expect(page.locator("[data-lesson-player]")).toBeVisible();
      await expect(page.locator("[data-gate-empty], [data-gate-open]")).toHaveCount(0);
    });

    test("a lesson that spends the last heart ends saying when the next may start, and offers practice (M5)", async ({ page }) => {
      await page.route("**/game.json", (route) => route.fulfill({ json: HEARTS }));
      const now = Date.parse("2026-05-21T10:00:00Z");
      await page.clock.setFixedTime(new Date(now));
      const earlier = now - 3_600_000;
      await seedLog(page, practice(earlier, 2, 4)); // four mistakes an hour ago: one heart left
      await page.reload();
      await expect(page.locator("[data-gate]")).toHaveAttribute("data-gate-value", "1");
      const request = { mode: "lesson", node: "fa.names" } as const;
      const exercises = planned(course, await logOf(page, "fa"), request, new Date(now), 3);
      const missed = exercises.find(canMiss);
      if (missed === undefined) throw new Error("no card to miss");
      await page.goto(`/?seed=3&sound=off#/fa/fa-Arab.standard/${request.node}`);
      await playSession(page, exercises, "keyboard", { miss: new Set([missed.id]) });
      const end = page.locator('[data-lesson-player][data-state="finished"]');
      const gate = end.locator("[data-end-gate]");
      await expect(gate).toHaveAttribute("data-gate-opens", new Date(firstHeartBack(earlier)).toISOString());
      await expect(gate).toContainText("You're out of hearts for now.");
      // The next step is practice, which refills them; no lesson beside it.
      await expect(end.locator("[data-action=next]")).toHaveAttribute("data-next", "practice");
      await expect(end.locator("[data-action=next-anyway]")).toHaveCount(0);
      expect(await seriousAxeViolations(page)).toEqual([]);
    });
  });
});

/** RFC 8291 decryption: what the browser does with the push message (written from the RFC). */
const decrypt = (body: Buffer, uaPrivate: Buffer, auth: Buffer): string => {
  const hmac = (k: Buffer, d: Buffer): Buffer => createHmac("sha256", k).update(d).digest();
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const prk = hmac(body.subarray(0, 16), hmac(hmac(auth, ecdh.computeSecret(asPublic)), Buffer.concat([Buffer.from("WebPush: info\0", "latin1"), ecdh.getPublicKey(), asPublic, Buffer.from([1])])));
  const decipher = createDecipheriv("aes-128-gcm", hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "latin1")).subarray(0, 16), hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "latin1")).subarray(0, 12));
  const sealed = body.subarray(21 + idlen);
  decipher.setAuthTag(sealed.subarray(-16));
  const plain = Buffer.concat([decipher.update(sealed.subarray(0, -16)), decipher.final()]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString("utf8");
};

test("with an account: a username, the league, and a reminder by Web Push", async ({ page, context }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  // The league week is the server's: play on today's real clock.
  const now = Date.now();
  await page.clock.setFixedTime(new Date(now));
  const app = `/?sound=off&api=${encodeURIComponent(API)}#/`;

  // Someone else already has the name "Maryam".
  const other = await (await page.request.post(`${API}/v1/auth/sign-up`, { data: { email: `other-${now}@example.org`, password: "another long pass" } })).json() as { token: string };
  expect((await page.request.put(`${API}/v1/profile`, { data: { username: "Maryam" }, headers: { Authorization: `Bearer ${other.token}` } })).status()).toBe(200);

  // The browser's push subscription: its keys are ours, so the test can read what arrives.
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = Buffer.from("e2e-auth-secret!");
  const endpoint = `${API}/test/push/e2e-${now}`;
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(
    ({ endpoint, p256dh, auth }) => {
      let current: PushSubscription | null = null;
      const fake = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh, auth } }), unsubscribe: () => Promise.resolve(true) } as unknown as PushSubscription;
      // Headless Chromium has no push service to register with: stand in for the browser's side.
      PushManager.prototype.subscribe = function () {
        current = fake;
        return Promise.resolve(fake);
      };
      PushManager.prototype.getSubscription = function () {
        return Promise.resolve(current);
      };
    },
    { endpoint, p256dh: ua.getPublicKey("base64url"), auth: auth.toString("base64url") },
  );

  // The last practice is in this league week, also in the first hour after it starts (Monday 00:00 UTC).
  const recent = Math.max(now - 3_600_000, leagueWeek(now, DEFAULT_LEAGUE).start);
  await seedLog(page, [...practice(now - 2 * DAY, 8), ...practice(now - DAY, 8), ...practice(recent, 8)]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(app);
  await page.locator("[data-field=email]").fill(`learner-${now}@example.org`);
  await page.locator("[data-field=password]").fill("long enough pass");
  await page.locator("[data-action=account-submit]").click();
  await expect(page.locator("[data-sync-status]")).toHaveAttribute("data-sync-status", "saved");

  // A taken name (in another guise) is refused; a free one is saved.
  const username = page.locator("[data-field=username]");
  await username.fill("MARYAM");
  await page.locator("[data-action=profile-save]").click();
  await expect(page.locator("[data-profile-error]")).toHaveAttribute("data-profile-error", "app.error.profile.username-taken");
  await username.fill("مریم_جان");
  await page.locator("[data-field=display-name]").fill("Maryam J.");
  await page.locator("[data-action=profile-save]").click();
  await expect(page.locator("[data-profile-saved]")).toBeVisible();

  // The upload put the learner in this week's league.
  await page.reload();
  const league = page.locator("[data-league]");
  await expect(league).toHaveAttribute("data-league", "member");
  const me = league.locator('[data-you="true"]');
  await expect(me).toContainText("Maryam J.");
  await expect(me.locator("bdi")).toHaveCount(1);

  // The home screen with every panel passes axe.
  expect(await seriousAxeViolations(page, "main")).toEqual([]);

  // Reminders on: the browser subscribes and the server keeps the subscription.
  await page.locator("[data-action=reminders]").click();
  await expect(page.locator("[data-reminders]")).toHaveAttribute("data-reminders", "on");

  // Tomorrow, with no practice yet, the job sends one reminder once the habitual time has come.
  // The sessions above ran on the real clock, so the habitual minute is today's: the last minute of
  // tomorrow is past it whatever time of day the test runs (at 22:00 it failed after 22:00 UTC).
  const evening = new Date(now + DAY);
  evening.setUTCHours(23, 59, 0, 0);
  const jobs = await (await page.request.post(`${API}/test/jobs?now=${evening.getTime()}`)).json() as { sent: number };
  expect(jobs.sent).toBeGreaterThanOrEqual(1);
  const { messages } = await (await page.request.get(`${API}/test/push/e2e-${now}`)).json() as { messages: string[] };
  expect(messages).toHaveLength(1);
  const payload = JSON.parse(decrypt(Buffer.from(messages[0] ?? "", "base64url"), ua.getPrivateKey(), auth)) as { title: string; body: string; lang: string; dir: string };
  expect(payload).toMatchObject({ lang: "en", dir: "ltr" });
  expect(payload.title).toMatch(/streak|practice|quest/iu);
  expect(errors).toEqual([]);
});
