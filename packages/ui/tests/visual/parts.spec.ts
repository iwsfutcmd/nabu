/**
 * A word and its parts (ADR 0152) in the visual matrix: UI {en, en-XA, ar-XB} × {fa, uz-Latn,
 * apc-Arab}, horizontal, on four screens: a word to build from its parts, the word's own word typed
 * for it (refused), a word to take apart with one part picked, and its parts marked and said once
 * answered wrongly.
 * Cantonese plans neither card (one form, nothing to tell it from), and no orthography that is
 * written vertically plans them yet: there is no vertical cell to show.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const SCREENS = ["build", "build-wrong", "apart", "apart-wrong"] as const;

for (const cell of cells()) {
  if (cell.writingMode !== "horizontal-tb") continue;
  if (cell.target === "yue-Hant-HK") {
    test(`parts: ${cell.ui} × ${cell.target} plans neither card`, async ({ page }) => {
      for (const screen of SCREENS) {
        await page.goto(storyUrl(`player-parts--${screen}`, cellGlobals(cell)));
        await settle(page, "[data-ui-root]");
        await expect(page.locator("[data-no-parts]"), screen).toBeVisible();
        await expect(page.locator("[data-lesson-player]"), screen).toHaveCount(0);
      }
    });
    continue;
  }
  for (const screen of SCREENS) {
    test(`parts: ${cell.ui} × ${cell.target} × ${screen}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.goto(storyUrl(`player-parts--${screen}`, cellGlobals(cell)));
      await settle(page, "[data-lesson-player]");
      const player = page.locator("[data-lesson-player]");
      await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);
      const target = new RegExp(`^${cell.targetLang}`, "u");

      if (screen === "build" || screen === "build-wrong") {
        // The parts stand in the word's order, in the target's direction, whatever the chrome's.
        const parts = player.locator("[data-parts]");
        await expect(parts).toHaveAttribute("dir", cell.targetDir);
        expect(await parts.locator("[data-part]").count()).toBeGreaterThanOrEqual(2);
        await expect(parts.locator("[data-part-own]")).toHaveCount(1);
        // The word's own word is written as the course writes it; what it means, and each form's
        // name, are in the support language.
        const own = parts.locator("[data-part-own] [data-nabu-text]");
        await expect(own.first()).toHaveAttribute("lang", target);
        await expect(own.first()).toHaveAttribute("dir", cell.targetDir);
        await expect(own.last()).toHaveAttribute("lang", /^en/u);
        await expect(own.last()).toHaveAttribute("dir", "ltr");
        const input = player.locator("[data-answer-input]");
        await expect(input).toHaveAttribute("lang", target);
        await expect(input).toHaveAttribute("dir", cell.targetDir);
        if (screen === "build") {
          await expect(input).toHaveValue("");
          await expect(player.locator("[data-feedback]")).toHaveCount(0);
        } else {
          await expect(player.locator("[data-feedback]")).toHaveAttribute("data-verdict", /^WRONG/u);
          await expect(player.locator("[data-solution]")).toBeVisible();
        }
      } else {
        const sentence = player.locator("[data-parts-word] [data-nabu-text]");
        await expect(sentence).toHaveAttribute("lang", target);
        await expect(sentence).toHaveAttribute("dir", cell.targetDir);
        await expect(sentence.locator("[data-emphasis]")).toHaveCount(1);
        const options = player.locator("[data-parts-options] [data-part-option]");
        expect(await options.count()).toBeGreaterThanOrEqual(4);
        const labels = await options.allTextContents();
        expect(new Set(labels).size).toBe(labels.length);
        if (screen === "apart") {
          // One part picked, nothing answered: what the sentence means stays out of sight (it names
          // the parts), in room kept for it.
          await expect(options.and(player.locator('[aria-pressed="true"]'))).toHaveCount(1);
          await expect(player.locator("[data-parts-meaning]")).toBeHidden();
          await expect(player.locator("[data-feedback]")).toHaveCount(0);
        } else {
          await expect(player.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
          expect(await options.and(player.locator("[data-correct]")).count()).toBeGreaterThanOrEqual(2);
          await expect(options.and(player.locator("[data-wrong]"))).toHaveCount(1);
          await expect(player.locator("[data-parts-meaning]")).toBeVisible();
          // The feedback says the word's parts as well, in the word's direction: the tiles mark them
          // by colour alone.
          const said = player.locator("[data-feedback] [data-solution] [data-parts]");
          await expect(said).toHaveAttribute("dir", cell.targetDir);
          expect(await said.locator("[data-part]").count()).toBe(await options.and(player.locator("[data-correct]")).count());
          await expect(said.locator("[data-part-own]")).toHaveCount(1);
        }
      }

      const used = await platformFonts(page, "[data-lesson-player] :is(h2, p, label, button, [data-kind], ruby, rt, li)");
      expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
      await expectNoClipping(page, player);
      expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      expect(errors).toEqual([]);
      if (comparesPixels) await expect(player).toHaveScreenshot(`parts__${cell.name}__${screen}.png`);
    });
  }
}
