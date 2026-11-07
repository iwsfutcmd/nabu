/**
 * The word list in the visual matrix: UI {en, en-XA, ar-XB} × target {fa, yue-Hant-HK, uz-Latn,
 * apc-Arab}. The chrome follows the UI locale; each word takes its own language's tag and
 * direction (Persian right to left in English chrome), each meaning the support language's (left
 * to right in RTL chrome). Horizontal only: a list is not set in columns (§11.4).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

for (const cell of cells().filter((c) => c.writingMode === "horizontal-tb")) {
  test(`word list: ${cell.ui} × ${cell.target}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(storyUrl("words--word-list-story", cellGlobals(cell)));
    await settle(page, "[data-word-list]");
    const list = page.locator("[data-word-list]");
    expect(await list.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);
    const words = list.locator("[data-word]");
    expect(await words.count()).toBeGreaterThan(2);
    // The word in its own language and direction; its meaning in the support language's.
    const texts = await words.first().locator("p[data-nabu-text]").evaluateAll((els) => els.map((e) => ({ lang: e.getAttribute("lang"), dir: e.getAttribute("dir") })));
    expect(texts[0]?.lang?.startsWith(cell.targetLang)).toBe(true);
    expect(texts[0]?.dir).toBe(cell.targetDir);
    expect(texts[1]?.dir).toBe("ltr");
    // All three bands show, in the order the story gives them.
    for (const band of ["strong", "fading", "due"]) await expect(list.locator(`[data-word][data-strength=${band}]`).first()).toBeVisible();
    await expect(list.locator("[data-field=word-search]")).toHaveAttribute("dir", "auto");

    const used = await platformFonts(page, "[data-word-list] :is(h2, p, label, input)");
    expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
    await expectNoClipping(page, list);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include("[data-word-list]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    if (comparesPixels) {
      await expect(list.locator("[data-word]").nth(0)).toHaveScreenshot(`word-list__${cell.name}__strong.png`);
      await expect(list.locator("[data-word][data-strength=due]").first()).toHaveScreenshot(`word-list__${cell.name}__due.png`);
    }
  });
}
