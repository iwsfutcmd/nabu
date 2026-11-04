/**
 * Corrections (ADR 0051) in the visual matrix: UI {en, en-XA, ar-XB} × target {fa, yue-Hant-HK,
 * uz-Latn, apc-Arab}, the correction form and the sentence list. The chrome follows the UI
 * locale; every field and every text takes its own language's tag and direction (a Persian
 * sentence right to left in English chrome, an English translation left to right in RTL chrome,
 * Jyutping in its own tag). Horizontal only: forms and lists are not set in columns (§11.4).
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { comparesPixels, expectNoClipping, platformFonts, settle } from "./checks.ts";
import { cellGlobals, cells, storyUrl } from "./matrix.ts";

const JYUTPING = "yue-Latn-HK-jyutping";
const SECOND_ORTHOGRAPHY: Readonly<Record<string, string>> = { "uz-Latn": "uz-Cyrl", "apc-Arab": "apc-Latn" };

for (const cell of cells().filter((c) => c.writingMode === "horizontal-tb")) {
  test(`correction form: ${cell.ui} × ${cell.target}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(storyUrl("corrections--correction-form-story", cellGlobals(cell)));
    await settle(page, "[data-correction-form]");
    const form = page.locator("[data-correction-form]");
    await expect(page.locator("[data-ui-root]")).toHaveAttribute("dir", cell.uiDir);
    expect(await form.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);

    // The learner's orthography first, in its own tag and direction; the course's others after it.
    const texts = form.locator("[data-field=correction-text]");
    const first = texts.first();
    expect((await first.getAttribute("lang"))?.startsWith(cell.targetLang)).toBe(true);
    await expect(first).toHaveAttribute("dir", cell.targetDir);
    const second = SECOND_ORTHOGRAPHY[cell.target];
    await expect(texts).toHaveCount(second === undefined ? 1 : 2);
    if (second !== undefined) expect((await texts.nth(1).getAttribute("lang"))?.startsWith(second)).toBe(true);
    await expect(form.locator("[data-field=correction-translation]")).toHaveAttribute("dir", "ltr");
    await expect(form.locator("[data-field=correction-note]")).toHaveAttribute("dir", "auto");
    const readings = form.locator("[data-field=correction-reading]");
    if (cell.target === "yue-Hant-HK") {
      expect(await readings.count()).toBeGreaterThan(1);
      await expect(readings.first()).toHaveAttribute("lang", JYUTPING);
      await expect(readings.first()).toHaveAttribute("dir", "ltr");
    } else await expect(readings).toHaveCount(0);

    // The course's text beside each field is language data: through <T>, in its own direction.
    const shown = await form.locator("[data-nabu-text]").evaluateAll((els) => els.map((e) => ({ lang: e.getAttribute("lang"), dir: e.getAttribute("dir") })));
    expect(shown.length).toBeGreaterThan(1);
    for (const t of shown) expect(t.dir).toBe(t.lang?.startsWith(cell.targetLang) === true ? cell.targetDir : "ltr");

    const used = await platformFonts(page, "[data-correction-form] :is(h2, p, label, legend, button, textarea, input)");
    expect(used.filter((u) => !u.custom), "system-font fallback").toEqual([]);
    await expectNoClipping(page, form);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include("[data-correction-form]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    if (comparesPixels) await expect(form).toHaveScreenshot(`correction-form__${cell.name}.png`);
  });

  test(`sentence list: ${cell.ui} × ${cell.target}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(storyUrl("corrections--sentence-list-story", cellGlobals(cell)));
    await settle(page, "[data-sentence-list]");
    const list = page.locator("[data-sentence-list]");
    expect(await list.evaluate((el) => getComputedStyle(el).direction)).toBe(cell.uiDir);
    // One item already corrected on this device says so.
    await expect(list.locator("[data-corrected]")).toHaveCount(1);
    await expect(list.locator("[data-correction-pending]")).toHaveCount(1);
    const items = list.locator("[data-correctable]");
    expect(await items.count()).toBeGreaterThan(10);
    const own = await items.first().locator("p[data-nabu-text]").first().evaluate((el) => ({ lang: el.getAttribute("lang"), dir: el.getAttribute("dir") }));
    expect(own.lang?.startsWith(cell.targetLang)).toBe(true);
    expect(own.dir).toBe(cell.targetDir);
    await expectNoClipping(page, list);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);
    const axe = await new AxeBuilder({ page }).include("[data-sentence-list]").analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    // The units, a sentence, and the one already corrected: each shape, without a page-long baseline.
    if (comparesPixels) {
      await expect(list.locator("nav")).toHaveScreenshot(`sentence-list__${cell.name}__units.png`);
      await expect(items.first()).toHaveScreenshot(`sentence-list__${cell.name}__item.png`);
      await expect(list.locator("[data-corrected]")).toHaveScreenshot(`sentence-list__${cell.name}__corrected.png`);
    }
  });
}
