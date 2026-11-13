/**
 * A word's pronunciation (ADR 0054), in its sentence (ADR 0095), from the debug gallery: a Persian
 * word chosen with its vowel marks among others (ADR 0098), a Lebanese word typed in Arabizi instead,
 * and a Cantonese word's Jyutping typed, where a wrong tone says so.
 */
import { cardGallery, type Exercise } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { expect, test, type Page } from "@playwright/test";
import { loadCourse, seriousAxeViolations } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

const tryCard = async (page: Page, route: string, template: string): Promise<void> => {
  await page.goto(`/?sound=off&debug=1${route}/cards`);
  await page.locator(`[data-card="${template}"] [data-action=try-card]`).click();
  await expect(page.locator("[data-debug-template]")).toHaveAttribute("data-debug-template", template);
};

const cardOf = (id: string, orthography: string, template: string): Exercise => {
  const card = cardGallery(loadCourse(id, orthography), 7).find((c) => c.template === template)?.exercise;
  if (card === undefined) throw new Error(`${id} has no ${template} card`);
  return card;
};

test("vowel marks: the word is marked in its sentence, and chosen with its marks among others", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const ex = cardOf("fa", "fa-Arab/standard", "vocalize");
  if (ex.template !== "vocalize") throw new Error("not a vocalize card");
  await tryCard(page, "#/fa/fa-Arab.standard", "vocalize");
  // The sentence, with the word asked about marked (and no other word).
  await expect(page.locator("[data-pronounce-word] [data-emphasis]")).toHaveCount(1);
  await expect(page.locator("[data-options] [data-option]")).toHaveCount(ex.options.length);
  expect(await seriousAxeViolations(page)).toEqual([]);
  // A number key chooses, as on every multiple-choice card.
  await page.keyboard.press(String(ex.answer + 1));
  await page.locator("[data-action=check]").click();
  await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "CORRECT");
  expect(errors).toEqual([]);
});

test("vowel marks: a wrong vocalization is wrong, and the solution shows its marks even with marks hidden", async ({ page }) => {
  const ex = cardOf("apc", "apc-Arab/standard", "vocalize");
  if (ex.template !== "vocalize") throw new Error("not a vocalize card");
  await tryCard(page, "#/apc/apc-Arab.standard", "vocalize");
  // Vowel marks off, from the header's display menu (P12); the menu closes before answering.
  await page.locator("[data-lesson-player] [data-action=display]").click();
  await page.locator("[data-display-menu] [data-toggle=marks] [data-marks=hide]").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-display-menu]")).toHaveCount(0);
  await page.locator(`[data-option="${(ex.answer + 1) % ex.options.length}"]`).click();
  await page.locator("[data-action=check]").click();
  await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
  await expect(page.locator("[data-solution] [data-nabu-text]")).toHaveText(surfaceOf(ex.vocalized));
});

test("Arabizi spells the vowels: the word written in it is a vocalization too", async ({ page }) => {
  const ex = cardOf("apc", "apc-Arab/standard", "vocalize");
  if (ex.template !== "vocalize" || ex.spelled === undefined) throw new Error("not a vocalize card with an Arabizi spelling");
  await tryCard(page, "#/apc/apc-Arab.standard", "vocalize");
  await page.locator("[data-action=vocalize-spelled]").click();
  const field = page.locator("[data-answer-input]");
  await expect(field).toHaveValue("");
  await expect(field).toHaveAttribute("dir", "ltr");
  await field.fill(surfaceOf(ex.spelled));
  await page.locator("[data-action=check]").click();
  await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "CORRECT");
});

test("Jyutping: no ruby on the word, a wrong tone is named, the reading is the solution", async ({ page }) => {
  const ex = cardOf("yue", "yue-Hant-HK/standard", "transcribe");
  if (ex.template !== "transcribe") throw new Error("not a transcribe card");
  await tryCard(page, "#/yue/yue-Hant-HK.standard", "transcribe");
  await expect(page.locator("[data-pronounce-word] rt")).toHaveCount(0);
  const field = page.locator("[data-answer-input]");
  await expect(field).toHaveAttribute("lang", "yue-Latn-HK-jyutping");
  await expect(field).toHaveAttribute("dir", "ltr");
  const reading = surfaceOf(ex.reading);
  await field.fill(reading.replace(/([1-6])$/u, (d) => String((Number(d) % 6) + 1)));
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
  await expect(page.locator("[data-feedback] [data-note=reading-tone]")).toBeVisible();
  await expect(page.locator("[data-solution] [data-nabu-text]")).toHaveText(reading);
});
