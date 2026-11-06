/**
 * The review workspace (ADR 0074) in the visual matrix: UI {en, en-XA, ar-XB} × target {fa,
 * yue-Hant-HK, uz-Latn, apc-Arab}. The sentence list with each item's accept sets and answer
 * field, and the queue of what learners filed. The chrome follows the UI locale; each accept-set
 * line, answer and correction takes its own language's tag and direction (a Persian answer right
 * to left in English chrome, an English translation left to right in RTL chrome), and the answer
 * field takes the orthography's. Horizontal only: forms and lists are not set in columns (§11.4).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

for (const cell of cells().filter((c) => c.writingMode === "horizontal-tb")) {
  test(`review workspace: ${cell.ui} × ${cell.target}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(storyUrl("review--workspace-story", cellGlobals(cell)));
    await settle(page, "[data-sentence-list]");
    const list = page.locator("[data-sentence-list]");
    expect(await list.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);
    const item = list.locator("[data-correctable]").filter({ has: page.locator("[data-field=accepted-answer]") }).first();
    await expect(item).toBeVisible();

    // Accept-set lines are language data: the target's in its direction, the translation's LTR.
    const sets = item.locator("[data-accept-set]");
    expect(await sets.count()).toBeGreaterThan(1);
    const lines = await sets.locator("[data-nabu-text]").evaluateAll((els) => els.map((e) => ({ lang: e.getAttribute("lang"), dir: e.getAttribute("dir") })));
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.dir).toBe(l.lang?.startsWith(cell.targetLang) === true ? cell.targetDir : "ltr");
    const field = item.locator("[data-field=accepted-answer]");
    expect((await field.getAttribute("lang"))?.startsWith(cell.targetLang)).toBe(true);
    await expect(field).toHaveAttribute("dir", cell.targetDir);
    // One item signed off already, the others not: both states of the toggle.
    await expect(list.locator("[data-action=sign-off][data-signed-off]")).toHaveCount(1);

    const used = await platformFonts(page, "[data-sentence-list] :is(h2, h4, p, label, button, input)");
    expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
    await expectNoClipping(page, list);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include("[data-sentence-list]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    if (comparesPixels) await expect(item).toHaveScreenshot(`review-workspace__${cell.name}__item.png`);
  });

  test(`review queue: ${cell.ui} × ${cell.target}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(storyUrl("review--queue-story", cellGlobals(cell)));
    await settle(page, "[data-review-queue]");
    const queue = page.locator("[data-review-queue]");
    expect(await queue.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);
    const reports = queue.locator("[data-report]");
    await expect(reports).toHaveCount(2);
    // An answer in the target language takes its direction; one in the learner's language, LTR.
    const answerDir = (n: number): Promise<string | null> => reports.nth(n).locator("p[data-nabu-text]").last().getAttribute("dir");
    expect(await answerDir(0)).toBe(cell.targetDir);
    expect(await answerDir(1)).toBe("ltr");
    // Learners' notes are free text: their own first strong character decides.
    await expect(reports.first().locator("li").first()).toHaveAttribute("dir", "auto");
    await expect(reports.nth(1)).toHaveAttribute("data-status", "approved");
    await expect(queue.locator("[data-correction]")).toHaveCount(1);

    await reports.first().locator("[data-action=approve]").click();
    await expect(reports.first()).toHaveAttribute("data-status", "approved");

    const used = await platformFonts(page, "[data-review-queue] :is(h2, p, li, dt, dd, button)");
    expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
    await expectNoClipping(page, queue);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include("[data-review-queue]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    if (comparesPixels) await expect(queue).toHaveScreenshot(`review-queue__${cell.name}.png`);
  });
}
