/**
 * Phase 10 acceptance (gameplan §16), against the production build and the real API (PGlite):
 *
 * - Courses download per unit (the course's text and each unit's audio and pictures). With no
 *   network the app reloads from its service worker, and a lesson plans with the media this
 *   device has: no listening exercise for a clip it never downloaded.
 * - Three sessions in airplane mode, synced a day later in the background (the service worker,
 *   with no page open): the streak counts each on its own local date, and the server's
 *   projections (the learner state and the game state) match the device's exactly.
 *
 * The time zone is Asia/Kathmandu (UTC+05:45): sessions just after local midnight fall on the
 * previous UTC date, so an implementation that dated them in UTC would get the streak wrong.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_GAME, localDateOf, replayGame } from "@nabu/core/game";
import { replay } from "@nabu/core/learner";
import { LISTENING, lessonNodes, type CourseView } from "@nabu/core/lesson";
import { coreFiles, restrictMedia } from "@nabu/core/offline";
import type { BundleManifest } from "@nabu/schema";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { canonical } from "../../src/compare.ts";
import { API_PORT } from "./ports.ts";
import { activate, loadCourse, logOf, planned, playSession } from "./solver.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const TZ = "Asia/Kathmandu";
const SEED = 11;
const HOUR = 3_600_000;
const course = loadCourse("fa", "fa-Arab/standard");
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../../public/bundles/fa/manifest.json"), "utf8")) as BundleManifest;
const app = (hash: string): string => `/?seed=${SEED}&sound=off&api=${encodeURIComponent(API)}${hash}`;

// Full Chromium, not the headless shell: the shell has no Background Sync.
test.use({ timezoneId: TZ, channel: "chromium" });

/** Waits until the service worker controls the page (it claims pages when it activates). */
const controlled = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 30_000 });
};

/** What this device has stored of a course, as paths in its bundle directory. */
const storedOf = (page: Page, id: string): Promise<string[]> =>
  page.evaluate(async (c) => {
    const prefix = new URL(`bundles/${c}/`, window.location.href).href;
    const keys = await (await caches.open("nabu-bundles")).keys();
    return keys.map((r) => r.url).filter((u) => u.startsWith(prefix)).map((u) => u.slice(prefix.length));
  }, id);

/** The instant of a local wall-clock time in TZ (no DST there, so the offset is fixed). */
const localTime = (date: string, time: string): Date => new Date(`${date}T${time}:00+05:45`);
const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T12:00:00Z`) + n * 24 * HOUR).toISOString().slice(0, 10);

/** Plays one planned session from the course path, at the page's clock `now`. */
const play = async (page: Page, c: CourseView, request: Parameters<typeof planned>[2], now: Date, selector: string): Promise<void> => {
  const exercises = planned(c, await logOf(page, c.id), request, now, SEED);
  await activate(page, "keyboard", selector);
  await playSession(page, exercises, "keyboard");
  await activate(page, "keyboard", "[data-action=exit]");
  await expect(page.locator("[data-course-path]")).toBeVisible();
};

/**
 * Wakes the service worker with its Background Sync event, as the browser does when the network
 * comes back, from a blank page: no page of the app is open.
 */
const backgroundSync = async (context: BrowserContext, origin: string): Promise<void> => {
  const blank = await context.newPage();
  const cdp = await context.newCDPSession(blank);
  const registration = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const r = registrations.find((x) => x.scopeURL.startsWith(origin) && !x.isDeleted);
      if (r !== undefined) resolve(r.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.dispatchSyncEvent", { origin, registrationId: await registration, tag: "nabu-outbox", lastChance: false });
  await blank.close();
};

test.describe("offline", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("courses download per unit; offline, the app reloads and plans with the media it has", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const now = new Date("2026-03-10T09:00:00Z");
    await page.clock.setFixedTime(now);
    const first = lessonNodes(course)[0]?.node.id;
    if (first === undefined) throw new Error("fa has lessons");
    await page.goto(app("#/fa/fa-Arab.standard"));
    await controlled(page);

    const panel = page.locator("[data-offline=fa]");
    const intro = panel.locator('[data-offline-unit="intro"]');
    const numbers = panel.locator('[data-offline-unit="drill-numbers"]');
    await expect(numbers).toHaveAttribute("data-state", "missing");
    await expect(numbers.locator("[data-action=download-unit]")).toContainText(/\d kB|\d(\.\d)? MB/u);

    // One unit: the course's text and that unit's media, nothing else.
    await numbers.locator("[data-action=download-unit]").click();
    await expect(numbers).toHaveAttribute("data-state", "ready");
    await expect(panel).toHaveAttribute("data-offline-core", "true");
    await expect(intro).toHaveAttribute("data-state", "missing");
    const numberAssets = manifest.units.find((u) => u.id === "drill-numbers")?.assets ?? [];
    const stored = new Set(await storedOf(page, "fa"));
    expect(stored).toEqual(new Set(["manifest.json", ...coreFiles(manifest).map((f) => f.path), ...numberAssets]));

    // No network: the app comes back from the service worker.
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("[data-course-path=fa]")).toBeVisible();
    await expect(page.locator("[data-offline-notice]")).toBeVisible();

    // The first unit's clips are not on this device: its first lesson plans without listening.
    const full = planned(course, [], { mode: "lesson", node: first }, now, SEED);
    const here = restrictMedia(course, (p) => stored.has(p));
    const offline = planned(here, [], { mode: "lesson", node: first }, now, SEED);
    expect(full.some((e) => LISTENING.has(e.template))).toBe(true);
    expect(offline.some((e) => LISTENING.has(e.template))).toBe(false);
    await play(page, here, { mode: "lesson", node: first }, now, `[data-lesson="${first}"]`);
    await expect(page.locator(`[data-lesson="${first}"]`)).toHaveAttribute("data-status", "done");

    // Back online, the rest of the course downloads, and a unit can be removed again.
    await context.setOffline(false);
    await page.locator("[data-action=download-course]").click();
    await expect(panel).toHaveAttribute("data-offline-complete", "true");
    await numbers.locator("[data-action=remove-unit]").click();
    await expect(numbers).toHaveAttribute("data-state", "missing");
    await expect(intro).toHaveAttribute("data-state", "ready");
    expect(errors).toEqual([]);
  });

  test("three sessions in airplane mode, synced a day later in the background: streak dates and projections agree", async ({ page, context, baseURL }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const [first, second] = lessonNodes(course).map((n) => n.node.id);
    if (first === undefined || second === undefined) throw new Error("fa needs two lessons");

    // Real time now is when the server receives the sync ("a day later"). The sessions were on
    // the two local dates before today, inside the server's 72-hour grace window.
    const today = localDateOf(new Date().toISOString(), TZ) ?? "";
    const day1 = addDays(today, -2);
    const day2 = addDays(today, -1);
    const sessions = [
      { at: localTime(day1, "03:00"), request: { mode: "lesson", node: first } as const, selector: `[data-lesson="${first}"]` }, // 21:15 UTC the day before
      { at: localTime(day1, "23:40"), request: { mode: "lesson", node: second } as const, selector: `[data-lesson="${second}"]` },
      { at: localTime(day2, "01:00"), request: { mode: "review" } as const, selector: '[data-practice-mode="review"]' }, // still day 1 in UTC
    ];

    // Online first: an account, and the whole course downloaded.
    const email = `airplane-${Date.now()}@example.org`;
    await page.clock.setFixedTime(new Date((sessions[0]?.at.getTime() ?? 0) - HOUR));
    await page.goto(app("#/"));
    await page.locator("[data-field=email]").fill(email);
    await page.locator("[data-field=password]").fill("ketab-e man");
    await page.locator("[data-action=account-submit]").click();
    await expect(page.locator("[data-account]")).toHaveAttribute("data-account", email);
    await page.evaluate(() => (window.location.hash = "#/fa/fa-Arab.standard"));
    await controlled(page);
    await page.locator("[data-action=download-course]").click();
    await expect(page.locator("[data-offline=fa]")).toHaveAttribute("data-offline-complete", "true");

    // Airplane mode: three sessions, the app reloaded from the service worker before each.
    await context.setOffline(true);
    for (const s of sessions) {
      await page.clock.setFixedTime(s.at);
      await page.reload();
      await expect(page.locator("[data-offline-notice]")).toBeVisible();
      await play(page, course, s.request, s.at, s.selector);
    }
    const log = await logOf(page, "fa");
    expect(log.filter((e) => e.type === "session_completed").map((e) => e.localDate)).toEqual([day1, day1, day2]);
    // The app asked for a background sync; nothing has reached the server.
    expect(await page.evaluate(async () => ((await navigator.serviceWorker.ready) as unknown as { sync: { getTags: () => Promise<string[]> } }).sync.getTags())).toContain("nabu-outbox");
    const token = ((await (await context.request.post(`${API}/v1/auth/sign-in`, { data: { email, password: "ketab-e man" } })).json()) as { token: string }).token;
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const serverEvents = async (): Promise<number> => ((await (await context.request.get(`${API}/v1/state?course=fa`, auth)).json()) as { events: number }).events;
    expect(await serverEvents()).toBe(0);

    // The app is closed. A day later the network is back, and the browser wakes the worker.
    await page.close();
    await context.setOffline(false);
    await backgroundSync(context, new URL(baseURL ?? "").origin);
    await expect.poll(serverEvents, { timeout: 20_000 }).toBe(log.length);

    // The server dates the streak by each session's local date.
    const game = ((await (await context.request.get(`${API}/v1/game?today=${today}`, auth)).json()) as { game: ReturnType<typeof replayGame> }).game;
    expect(game.days).toEqual([day1, day2]);
    expect(game.streak.current).toBe(2);

    // Opened again: the device pulls, checks, and agrees with the server exactly.
    const again = await context.newPage();
    again.on("pageerror", (e) => errors.push(String(e)));
    await again.goto(app("#/"));
    const status = again.locator("[data-sync-status]");
    await expect(status).toHaveAttribute("data-pending", "0");
    await expect(status).toHaveAttribute("data-verified", "true");
    await expect(again.locator("[data-streak]")).toHaveAttribute("data-streak", "2");
    const device = await again.evaluate(async () => {
      const store = window.nabu;
      if (store === undefined) throw new Error("no store");
      return { events: [...(await store.allEvents())], received: Object.fromEntries(await store.receivedTimes()) };
    });
    const now = new Date().toISOString();
    const deviceGame = replayGame(device.events.map((event) => ({ event, receivedAt: device.received[event.id] })), DEFAULT_GAME, { today, now });
    const serverGame = ((await (await context.request.get(`${API}/v1/game?today=${today}&now=${encodeURIComponent(now)}`, auth)).json()) as { game: unknown }).game;
    expect(canonical(serverGame)).toBe(canonical(JSON.parse(JSON.stringify(deviceGame))));
    const serverState = ((await (await context.request.get(`${API}/v1/state?course=fa`, auth)).json()) as { state: unknown }).state;
    const { seen: _seen, ...local } = replay(device.events.filter((e) => e.course === "fa"));
    expect(canonical(serverState)).toBe(canonical(JSON.parse(JSON.stringify(local))));
    expect(errors).toEqual([]);
  });
});
