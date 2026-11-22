/**
 * Spelling cards (ADR 0142, 0148) in the visual matrix: UI {en, en-XA, ar-XB} × {fa: other letters
 * of a sound; yue-Hant-HK: characters read alike} × {horizontal, vertical-rl where allowed}. A word
 * with one other spelling has two options (ADR 0142 amendment), a word with more three or four;
 * every option is in the target's language and direction, the gap's sentence in the target's
 * writing mode. uz and apc-Arab have no such card.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const SCREENS = [
  { screen: "two", story: "player-spelling--two", options: 2 },
  { screen: "two-feedback", story: "player-spelling--two-feedback", options: 2 },
  { screen: "several", story: "player-spelling--several", options: 3 },
] as const;

for (const cell of cells()) {
  if (cell.target !== "fa" && cell.target !== "yue-Hant-HK") continue;
  for (const { screen, story, options: least } of SCREENS) {
    test(`spelling: ${cell.ui} × ${cell.target} × ${cell.writingMode} × ${screen}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(storyUrl(story, cellGlobals(cell)));
      await settle(page, "[data-lesson-player]");
      const player = page.locator("[data-lesson-player]");
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);
      const region = player.locator("[data-target-region]").first();
      await expect(region).toHaveAttribute("dir", cell.targetDir);
      expect(await region.evaluate((el) => getComputedStyle(el).writingMode)).toBe(cell.writingMode);

      const options = player.locator("[data-options] [data-option]");
      if (least === 2) await expect(options).toHaveCount(2);
      else expect(await options.count()).toBeGreaterThanOrEqual(least);
      const written = await options.locator("[data-nabu-text]").allTextContents();
      expect(new Set(written).size).toBe(written.length);
      for (const option of await options.locator("[data-nabu-text]").all()) {
        await expect(option).toHaveAttribute("lang", new RegExp(`^${cell.targetLang}`, "u"));
        await expect(option).toHaveAttribute("dir", cell.targetDir);
      }
      if (screen === "two-feedback") {
        await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
        await expect(page.locator("[data-solution]")).toBeVisible();
      }

      const used = await platformFonts(page, "[data-lesson-player] :is(h2, p, label, button, [data-kind], ruby, rt, li)");
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
      await expectNoClipping(page, player);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);
      if (comparesPixels) await expect(player).toHaveScreenshot(`spelling__${cell.name}__${screen}.png`);
    });
  }
}
