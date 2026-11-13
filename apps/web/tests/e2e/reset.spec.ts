/**
 * Starting a course over: a learner with progress confirms it by typing the course's name (case,
 * accents and outer spaces aside; never mid-composition), the path goes back to the first
 * lesson (placement is offered again), XP stays, the reset survives a reload, and it syncs: the
 * server's projection forgets the same things and agrees with the device. The dialog works in
 * RTL chrome and passes axe.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { lessonNodes } from "@nabu/core/lesson";
import { API_PORT } from "./ports.ts";
import { freshIds, historyBefore, loadCourse, logOf, seedLog } from "./solver.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const NOW = new Date("2026-04-10T09:00:00Z");
const course = loadCourse("fa", "fa-Arab/standard");
const [first, second, third] = lessonNodes(course).map((n) => n.node.id);

const axe = async (page: Page, scope: string): Promise<string[]> =>
  (await new AxeBuilder({ page }).include(scope).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`);

test.describe("starting a course over", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });
  if (first === undefined || second === undefined || third === undefined) throw new Error("fa needs three lessons");

  test("forgets the course's progress on every device, keeps XP, and survives a reload", async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.clock.setFixedTime(NOW);
    // Two lessons done, then an account: the history uploads.
    await seedLog(page, freshIds(historyBefore(course, third, NOW)));
    await page.goto(`/?seed=3&sound=off&api=${encodeURIComponent(API)}#/`);
    const email = `start-over-${Date.now()}@example.org`;
    await page.locator("[data-field=email]").fill(email);
    await page.locator("[data-field=password]").fill("az avval shoru kon");
    await page.locator("[data-action=account-submit]").click();
    await expect(page.locator("[data-sync-status]")).toHaveAttribute("data-pending", "0");

    await page.evaluate(() => (window.location.hash = "#/fa/fa-Arab.standard"));
    await expect(page.locator(`[data-lesson="${second}"]`)).toHaveAttribute("data-status", "done");
    const xp = await page.locator("[data-xp]").getAttribute("data-xp");
    expect(Number(xp)).toBeGreaterThan(0);

    // Changing one's mind changes nothing.
    await page.locator("[data-action=start-over]").click();
    const dialog = page.locator("[data-start-over-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("role", "alertdialog");
    await expect(page.locator("[data-action=keep-progress]")).toBeFocused();
    expect(await axe(page, "[data-start-over-dialog]")).toEqual([]);
    await page.locator("[data-action=keep-progress]").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(`[data-lesson="${second}"]`)).toHaveAttribute("data-status", "done");

    // Starting over takes typing the course's name; the button waits for it.
    await page.locator("[data-action=start-over]").click();
    const confirm = page.locator("[data-action=confirm-start-over]");
    const field = page.locator("[data-field=reset-name]");
    await expect(confirm).toBeDisabled();
    await field.fill("Persia");
    await expect(confirm).toBeDisabled();
    // Mid-composition (an IME still open), the name is not yet typed.
    await field.fill("");
    await field.focus();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: "persian", selectionStart: 7, selectionEnd: 7 });
    await expect(confirm).toBeDisabled();
    await cdp.send("Input.insertText", { text: "persian" });
    await expect(field).toHaveValue("persian");
    await expect(confirm).toBeEnabled(); // case does not matter
    await field.fill("  PERSIAN ");
    await expect(confirm).toBeEnabled(); // nor do outer spaces
    expect(await axe(page, "[data-start-over-dialog]")).toEqual([]);
    await confirm.click();
    await expect(page.locator("[data-reset-done]")).toBeVisible();
    await expect(page.locator(`[data-lesson="${first}"]`)).toHaveAttribute("data-status", "available");
    await expect(page.locator(`[data-lesson="${second}"]`)).toHaveAttribute("data-status", "locked");
    await expect(page.locator('[data-practice-mode="placement"]')).toBeVisible();
    // As to a new learner: "Find your level", not "take it again" (S5).
    await expect(page.locator('[data-practice-mode="placement"]')).not.toHaveAttribute("data-again");
    await expect(page.locator("[data-xp]")).toHaveAttribute("data-xp", xp ?? "");
    const log = await logOf(page, "fa");
    expect(log.filter((e) => e.type === "progress_reset")).toHaveLength(1);
    expect(log.length).toBeGreaterThan(1); // the log keeps everything

    // A reload replays the log to the same place.
    await page.reload();
    await expect(page.locator(`[data-lesson="${first}"]`)).toHaveAttribute("data-status", "available");
    await expect(page.locator("[data-start-over]")).toHaveCount(0); // nothing left to reset

    // The reset synced, and the server forgets the same things.
    await page.evaluate(() => (window.location.hash = "#/"));
    const status = page.locator("[data-sync-status]");
    await expect(status).toHaveAttribute("data-pending", "0");
    await expect(status).toHaveAttribute("data-verified", "true");
    const token = ((await (await context.request.post(`${API}/v1/auth/sign-in`, { data: { email, password: "az avval shoru kon" } })).json()) as { token: string }).token;
    const server = (await (await context.request.get(`${API}/v1/state?course=fa`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { state: { completedNodes: string[]; xp: { total: number } } };
    expect(server.state.completedNodes).toEqual([]);
    expect(server.state.xp.total).toBe(Number(xp));
    expect(errors).toEqual([]);
  });

  test("the confirmation reads right to left in RTL chrome", async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await seedLog(page, historyBefore(course, second, NOW));
    await page.goto("/?ui=ar-XB&sound=off#/fa/fa-Arab.standard");
    await page.locator("[data-action=start-over]").click();
    const dialog = page.locator("[data-start-over-dialog]");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => getComputedStyle(el).direction)).toBe("rtl");
    // The safe choice comes first in reading order, so it sits at the inline start (the right).
    const keep = await page.locator("[data-action=keep-progress]").boundingBox();
    const confirm = await page.locator("[data-action=confirm-start-over]").boundingBox();
    expect((keep?.x ?? 0) > (confirm?.x ?? 0)).toBe(true);
    expect(await axe(page, "[data-start-over-dialog]")).toEqual([]);
  });
});
