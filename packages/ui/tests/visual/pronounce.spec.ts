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

// Vowel marks put on a word's letters (ADR 0137): Lebanese Arabic's harakat on buttons, the word's
// letters in its own direction, the letter being marked pressed; no field to type in.
for (const cell of cells()) {
  if (cell.writingMode !== "horizontal-tb" || cell.target !== "apc-Arab") continue;
  test(`pronounce: ${cell.ui} × ${cell.target} × marks`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(storyUrl("player-pronunciation--marks", cellGlobals(cell)));
    await settle(page, "[data-lesson-player]");
    const player = page.locator("[data-lesson-player]");
    await expect(page.locator("[data-answer-input]")).toHaveCount(0);
    const letters = player.locator("[data-letter]");
    expect(await letters.count()).toBeGreaterThanOrEqual(2);
    await expect(letters.first()).toHaveAttribute("aria-pressed", "true");
    await expect(player.locator("[data-target-region]")).toHaveAttribute("dir", cell.targetDir);
    for (const letter of await letters.locator("[data-nabu-text]").all()) await expect(letter).toHaveAttribute("dir", cell.targetDir);
    expect(await player.locator("[data-mark]").count()).toBeGreaterThanOrEqual(4);
    // A mark goes on the chosen letter, and the word shows it.
    await player.locator("[data-mark]").first().click();
    expect(HARAKAT.test((await player.locator("[data-spelled-word]").textContent()) ?? "")).toBe(true);
    await expectNoClipping(page, player);
    const axe = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    if (comparesPixels) await expect(player).toHaveScreenshot(`pronounce__${cell.name}__marks.png`);
  });
}

// A feature card (ADR 0139): a Cantonese word's Jyutping among the same syllables in other tones the
// course attests, each option in the reading's language, left to right; the word marked, no ruby.
for (const cell of cells()) {
  if (cell.writingMode !== "horizontal-tb" || cell.target !== "yue-Hant-HK") continue;
  test(`pronounce: ${cell.ui} × ${cell.target} × feature`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(storyUrl("player-pronunciation--feature", cellGlobals(cell)));
    await settle(page, "[data-lesson-player]");
    const player = page.locator("[data-lesson-player]");
    await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);
    await expect(page.locator("[data-pronounce-word] rt")).toHaveCount(0);
    const options = page.locator("[data-options] [data-option] [data-nabu-text]");
    expect(await options.count()).toBeGreaterThanOrEqual(3);
    for (const option of await options.all()) {
      await expect(option).toHaveAttribute("lang", JYUTPING);
      await expect(option).toHaveAttribute("dir", "ltr");
    }
    // The options differ in one tone only: the same letters, tone numbers aside.
    const written = await options.allTextContents();
    expect(new Set(written.map((w) => w.replace(/[0-9]/gu, ""))).size).toBe(1);
    await expectNoClipping(page, player);
    const axe = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    if (comparesPixels) await expect(player).toHaveScreenshot(`pronounce__${cell.name}__feature.png`);
  });
}
