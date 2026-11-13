/**
 * A word's pronunciation (ADR 0054) in the visual matrix: UI {en, en-XA, ar-XB} × {fa, apc-Arab:
 * vowel marks; yue-Hant-HK: Jyutping}, horizontal. Vowel marks are chosen among the word's
 * vocalizations (ADR 0098), each option in the target's language and direction; a reading is typed
 * in a field that takes yue-Latn-HK-jyutping, left to right. The solution always shows its marks.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const JYUTPING = "yue-Latn-HK-jyutping";
const HARAKAT = /[ً-ْٰ]/u;

for (const cell of cells()) {
  if (cell.writingMode !== "horizontal-tb" || cell.target === "uz-Latn") continue;
  const reading = cell.target === "yue-Hant-HK";
  for (const screen of ["typing", "feedback"] as const) {
    test(`pronounce: ${cell.ui} × ${cell.target} × ${screen}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(storyUrl(`player-pronunciation--${screen}`, cellGlobals(cell)));
      await settle(page, "[data-lesson-player]");
      const player = page.locator("[data-lesson-player]");
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);

      const word = page.locator("[data-pronounce-word] [data-nabu-text]");
      await expect(word).toHaveAttribute("dir", cell.targetDir);
      // The word is shown without what the learner is to write: no marks, no ruby.
      expect(HARAKAT.test((await word.textContent()) ?? "")).toBe(false);
      await expect(word.locator("rt")).toHaveCount(0);
      await expect(page.locator("[data-pronounce-meaning] [data-nabu-text]")).toHaveAttribute("dir", "ltr");

      if (screen === "typing" && reading) {
        const input = page.locator("[data-answer-input]");
        await expect(input).toHaveAttribute("lang", JYUTPING);
        await expect(input).toHaveAttribute("dir", "ltr");
        await expect(input).toHaveValue("");
        await expect(page.locator("[data-char-bar]")).toHaveCount(0);
      } else if (screen === "typing") {
        // Marks are chosen, never typed: the word written with each vocalization of its letters.
        await expect(page.locator("[data-answer-input]")).toHaveCount(0);
        const options = page.locator("[data-options] [data-option] [data-nabu-text]");
        expect(await options.count()).toBeGreaterThanOrEqual(2);
        for (const option of await options.all()) {
          await expect(option).toHaveAttribute("lang", new RegExp(`^${cell.targetLang}`, "u"));
          await expect(option).toHaveAttribute("dir", cell.targetDir);
        }
        const written = await options.allTextContents();
        expect(new Set(written).size).toBe(written.length);
        expect(written.some((w) => HARAKAT.test(w))).toBe(true);
      } else {
        await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
        await expect(page.locator("[data-solution]")).toBeVisible();
        if (!reading) expect(HARAKAT.test((await page.locator("[data-solution]").textContent()) ?? "")).toBe(true);
      }

      const used = await platformFonts(page, "[data-lesson-player] :is(h2, p, label, button, [data-kind], ruby, rt, li)");
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
      await expectNoClipping(page, player);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);
      if (comparesPixels) await expect(player).toHaveScreenshot(`pronounce__${cell.name}__${screen}.png`);
    });
  }
}
