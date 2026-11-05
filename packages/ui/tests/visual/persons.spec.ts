/**
 * A sentence's persons in the visual matrix: UI {en, en-XA, ar-XB} × target {fa, yue-Hant-HK,
 * uz-Latn, apc-Arab}, horizontal. The tags under the support-language prompt follow the UI's
 * language and direction, and never clip.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

for (const cell of cells()) {
  if (cell.writingMode !== "horizontal-tb") continue;
  test(`persons: ${cell.ui} × ${cell.target}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(storyUrl("player-persons--tagged", cellGlobals(cell)));
    await settle(page, "[data-lesson-player]");
    const player = page.locator("[data-lesson-player]");
    const tags = page.locator("[data-persons]");
    await expect(tags).toHaveAttribute("data-persons", "speaker:f addressee:pl");
    await expect(tags.locator("span")).toHaveCount(2);
    // Lined up under the (support-language) prompt; each tag in the UI's direction.
    expect(await tags.evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
    for (const dir of await tags.locator("span").evaluateAll((els) => els.map((e) => getComputedStyle(e).direction))) expect(dir).toBe(cell.uiDir);

    const used = await platformFonts(page, "[data-lesson-player] :is(h2, p, label, button, [data-kind], li, span)");
    expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
    await expectNoClipping(page, player);
    const axe = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    if (comparesPixels) await expect(player).toHaveScreenshot(`persons__${cell.name}.png`);
  });
}
