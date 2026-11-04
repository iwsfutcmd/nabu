/**
 * Writing in a word's pronunciation (ADR 0054) in the visual matrix: UI {en, en-XA, ar-XB} ×
 * {fa, apc-Arab: vowel marks; yue-Hant-HK: Jyutping}, horizontal. The field takes the answer's own
 * language and direction (the target's for marks, yue-Latn-HK-jyutping left to right for a
 * reading); the mark keys sit on a tatweel; the solution always shows its marks.
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

      if (screen === "typing") {
        const input = page.locator("[data-answer-input]");
        await expect(input).toHaveAttribute("lang", reading ? JYUTPING : new RegExp(`^${cell.targetLang}`, "u"));
        await expect(input).toHaveAttribute("dir", reading ? "ltr" : "rtl");
        if (reading) {
          await expect(input).toHaveValue("");
          await expect(page.locator("[data-char-bar]")).toHaveCount(0);
        } else {
          // The field starts from the letters; the keys add the marks.
          await expect(input).toHaveValue(((await word.textContent()) ?? "").trim());
          await expect(page.locator("[data-char-bar] [data-key]")).toHaveCount(9);
        }
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
