/**
 * Phase 4 acceptance for sync (gameplan §16), against the real API (PGlite):
 * - A learner finishes three sessions with no account and no network, then
 *   signs up: the server's projections are identical to the device's.
 * - The offline queue survives a page reload, and drains when the server is
 *   back.
 */
import { replay } from "@nabu/core/learner";
import { lessonNodes } from "@nabu/core/lesson";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { API_PORT } from "./ports.ts";
import { canonical } from "../../src/compare.ts";
import { activate, loadCourse, logOf, planned, playSession, teachable } from "./solver.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const SEED = 5;
const DAY = 86_400_000;
const course = loadCourse("fa", "fa-Arab/standard");
const [first, second] = lessonNodes(course).map((n) => n.node.id);
const app = (hash: string): string => `/?seed=${SEED}&sound=off&api=${encodeURIComponent(API)}${hash}`;
const home = async (page: Page): Promise<void> => {
  await page.evaluate(() => (window.location.hash = "#/"));
  await expect(page.locator("[data-progress]")).toBeVisible();
};
const coursePath = async (page: Page): Promise<void> => {
  await page.evaluate(() => (window.location.hash = "#/fa/fa-Arab.standard"));
  await expect(page.locator("[data-course-path]")).toBeVisible();
};

/** Plays one planned session from the course path, at the page's fixed clock `now`. */
const session = async (page: Page, request: Parameters<typeof planned>[2], now: Date, selector: string): Promise<void> => {
  const exercises = planned(await teachable(page, course), await logOf(page, "fa"), request, now, SEED);
  await activate(page, "keyboard", selector);
  await playSession(page, exercises, "keyboard");
  await activate(page, "keyboard", "[data-action=exit]");
  await expect(page.locator("[data-course-path]")).toBeVisible();
};

const signUp = async (page: Page, email: string, password: string): Promise<void> => {
  await page.locator("[data-field=email]").fill(email);
  await page.locator("[data-field=password]").fill(password);
  await page.locator("[data-action=account-submit]").click();
};

/** The server's projection of a course, read with the learner's own credentials. */
const serverState = async (page: Page, email: string, password: string): Promise<{ events: number; state: unknown }> => {
  const signIn = await page.request.post(`${API}/v1/auth/sign-in`, { data: { email, password } });
  const { token } = (await signIn.json()) as { token: string };
  const res = await page.request.get(`${API}/v1/state?course=fa`, { headers: { Authorization: `Bearer ${token}` } });
  return (await res.json()) as { events: number; state: unknown };
};

test.describe("sync", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });
  if (first === undefined || second === undefined) throw new Error("fa needs two lessons");

  test("three sessions offline with no account, then sign-up: the server agrees with the device", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    let now = new Date("2026-04-01T09:00:00Z");
    await page.clock.setFixedTime(now);
    await page.goto(app("#/fa/fa-Arab.standard"));
    await expect(page.locator(`[data-lesson="${first}"]`)).toHaveAttribute("data-status", "available");

    // No network from here on: the app is a complete node.
    await context.setOffline(true);
    await session(page, { mode: "lesson", node: first }, now, `[data-lesson="${first}"]`);
    now = new Date(now.getTime() + 10 * 60_000);
    await page.clock.setFixedTime(now);
    await session(page, { mode: "lesson", node: second }, now, `[data-lesson="${second}"]`);
    now = new Date(now.getTime() + DAY);
    await page.clock.setFixedTime(now);
    await session(page, { mode: "review" }, now, '[data-practice-mode="review"]');
    const log = await logOf(page, "fa");
    expect(log.filter((e) => e.type === "session_completed")).toHaveLength(3);

    // Signing up needs the server: offline, the form says so and nothing is lost.
    await home(page);
    const email = "maryam@example.com";
    const password = "ketab-e man";
    await signUp(page, email, password);
    await expect(page.locator("[data-account-error]")).toHaveAttribute("data-account-error", "unreachable");

    // Back online: sign up, and the whole local history uploads.
    await context.setOffline(false);
    await page.locator("[data-action=account-submit]").click();
    await expect(page.locator("[data-account]")).toHaveAttribute("data-account", email);
    const status = page.locator("[data-sync-status]");
    await expect(status).toHaveAttribute("data-sync-status", "saved");
    await expect(status).toHaveAttribute("data-pending", "0");
    await expect(status).toHaveAttribute("data-verified", "true");

    const server = await serverState(page, email, password);
    const { seen: _seen, ...local } = replay(await logOf(page, "fa"));
    expect(server.events).toBe(log.length);
    expect(canonical(server.state)).toBe(canonical(local));
    expect(errors).toEqual([]);
  });

  test("the offline queue survives a reload and drains when the server is back", async ({ page }) => {
    const now = new Date("2026-04-05T18:30:00Z");
    await page.clock.setFixedTime(now);
    await page.goto(app("#/"));
    await expect(page.locator("[data-progress]")).toBeVisible();
    const axe = async (): Promise<string[]> =>
      (await new AxeBuilder({ page }).include("[data-progress]").analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`);
    expect(await axe()).toEqual([]);
    const email = "عمر@example.com";
    const password = "مرحبا يا عالم";
    await signUp(page, email, password);
    await expect(page.locator("[data-sync-status]")).toHaveAttribute("data-sync-status", "saved");
    expect(await axe()).toEqual([]);

    // The server becomes unreachable; the learner keeps going.
    await page.route(`${API}/v1/**`, (route) => route.abort("internetdisconnected"));
    await coursePath(page);
    await session(page, { mode: "lesson", node: first }, now, `[data-lesson="${first}"]`);
    await home(page);
    const status = page.locator("[data-sync-status]");
    await expect(status).toHaveAttribute("data-sync-status", /^(offline|pending)$/u);
    // The session's last events are still being stored as the path opens: read the queue once
    // it holds still (the same size twice, half a second apart).
    let pending = -1;
    await expect
      .poll(
        async () => {
          const now = Number(await status.getAttribute("data-pending"));
          const settled = now === pending;
          pending = now;
          return settled;
        },
        { intervals: [500] },
      )
      .toBe(true);
    expect(pending).toBeGreaterThan(10);

    // A reload keeps the queue: it lives in IndexedDB.
    await page.reload();
    await expect(page.locator("[data-sync-status]")).toHaveAttribute("data-pending", String(pending));

    // The server is back: the queue drains and the server agrees.
    await page.unroute(`${API}/v1/**`);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(status).toHaveAttribute("data-sync-status", "saved");
    await expect(status).toHaveAttribute("data-pending", "0");
    await expect(status).toHaveAttribute("data-verified", "true");
    const server = await serverState(page, email, password);
    expect(server.events).toBe((await logOf(page, "fa")).length);
  });
});
