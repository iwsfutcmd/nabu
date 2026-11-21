/**
 * A word and its parts (ADR 0152) in the app, tried from the card gallery by keyboard and by touch,
 * in a left-to-right course (Uzbek) and a right-to-left one (Persian).
 *
 * - parts-whole: the word's parts stand in the word's direction; its own word typed for it is
 *   refused, and the word as the sentence writes it is right.
 * - whole-parts: a part too many is wrong, and the feedback says the word's parts as well as marking
 *   their tiles; the word's own parts, picked in any order, are right.
 */
import { cardGallery, type Exercise } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { directionOf } from "@nabu/i18n";
import { expect, test, type Page } from "@playwright/test";
import { answer, loadCourse, seriousAxeViolations, type Mode } from "./solver.ts";

const COURSES = [
  ["uz", "uz-Latn/standard"],
  ["fa", "fa-Arab/standard"],
] as const;

/** Opens a kind of card from the gallery and waits until it can be answered. */
const tryCard = async (page: Page, id: string, orthography: string, template: Exercise["template"]): Promise<void> => {
  await page.goto(`/?sound=off&debug=1#/${id}/${orthography.replace("/", ".")}`);
  await page.locator("[data-cards-link]").click();
  await page.locator(`[data-card="${template}"] [data-action=try-card]`).click();
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-template", template);
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
};

const press = async (page: Page, mode: Mode, selector: string): Promise<void> => {
  if (mode === "touch") await page.locator(selector).tap();
  else await page.locator(selector).click();
};

for (const [id, orthography] of COURSES) {
  test(`${id}: a word is built from its parts, and its own word alone is not it`, async ({ page }, info) => {
    const mode = info.project.name as Mode;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const course = loadCourse(id, orthography);
    const ex = cardGallery(course, 7).find((c) => c.template === "parts-whole")?.exercise;
    if (ex?.template !== "parts-whole") throw new Error(`${id}'s gallery has a parts-whole card`);
    const dir = directionOf(ex.whole.lang);

    await tryCard(page, id, orthography, "parts-whole");
    const player = page.locator("[data-lesson-player]");
    const parts = player.locator("[data-parts]");
    await expect(parts).toHaveAttribute("dir", dir);
    await expect(parts.locator("[data-part]")).toHaveCount(ex.wordParts.length);
    await expect(parts.locator("[data-part-own]")).toHaveCount(1);
    const input = player.locator("[data-answer-input]");
    await expect(input).toHaveAttribute("dir", dir);
    await expect(input).toBeFocused();
    expect(await seriousAxeViolations(page)).toEqual([]);

    // The word's own word, typed as the card shows it, is not the word.
    const own = ex.wordParts.find((p) => p.base === true)?.text;
    if (own === undefined) throw new Error("a built word has its own word among its parts");
    await input.fill(surfaceOf(own));
    await press(page, mode, "[data-action=check]");
    await expect(player.locator("[data-feedback]")).toHaveAttribute("data-verdict", /^WRONG/u);
    await expect(player.locator("[data-solution]")).toBeVisible();
    expect(await seriousAxeViolations(page)).toEqual([]);

    // Tried again (the gallery plays a card once), the word as the sentence writes it is right.
    await tryCard(page, id, orthography, "parts-whole");
    await answer(page, ex, mode);
    await expect(player.locator("[data-feedback]")).toHaveAttribute("data-verdict", /^CORRECT/u);
    expect(errors).toEqual([]);
  });

  test(`${id}: a word is taken apart, and a part too many is said and marked`, async ({ page }, info) => {
    const mode = info.project.name as Mode;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const course = loadCourse(id, orthography);
    const ex = cardGallery(course, 7).find((c) => c.template === "whole-parts")?.exercise;
    if (ex?.template !== "whole-parts") throw new Error(`${id}'s gallery has a whole-parts card`);
    const dir = directionOf(ex.prompt.lang);

    await tryCard(page, id, orthography, "whole-parts");
    const player = page.locator("[data-lesson-player]");
    const options = player.locator("[data-part-option]");
    await expect(options).toHaveCount(ex.options.length);
    await expect(player.locator("[data-parts-word] [data-emphasis]")).toHaveCount(1);
    // What the sentence means would name the parts: out of sight until the card is answered.
    await expect(player.locator("[data-parts-meaning]")).toBeHidden();
    expect(await seriousAxeViolations(page)).toEqual([]);

    // Every part of the word, and one that is not its.
    const other = ex.options.findIndex((_, i) => !ex.solution.includes(i));
    for (const i of [...ex.solution, other]) await press(page, mode, `[data-part-option="${i}"]`);
    await expect(options.and(page.locator('[aria-pressed="true"]'))).toHaveCount(ex.solution.length + 1);
    // Backspace takes the last pick back; a number key puts it on again.
    if (mode === "keyboard" && other < 9) {
      await page.keyboard.press("Backspace");
      await expect(options.and(page.locator('[aria-pressed="true"]'))).toHaveCount(ex.solution.length);
      await page.keyboard.press(String(other + 1));
      await expect(options.and(page.locator('[aria-pressed="true"]'))).toHaveCount(ex.solution.length + 1);
    }
    await press(page, mode, "[data-action=check]");
    const feedback = player.locator("[data-feedback]");
    await expect(feedback).toHaveAttribute("data-verdict", "WRONG");
    await expect(options.and(page.locator("[data-correct]"))).toHaveCount(ex.solution.length);
    await expect(options.and(page.locator("[data-wrong]"))).toHaveCount(1);
    await expect(player.locator("[data-parts-meaning]")).toBeVisible();
    // The feedback says the parts, in the word's direction: colour is not the only sign.
    const said = feedback.locator("[data-solution] [data-parts]");
    await expect(said).toHaveAttribute("dir", dir);
    await expect(said.locator("[data-part]")).toHaveCount(ex.solution.length);
    expect(await seriousAxeViolations(page)).toEqual([]);

    // Tried again (the gallery plays a card once), the word's own parts are right, in any order.
    await tryCard(page, id, orthography, "whole-parts");
    await expect(options.and(page.locator('[aria-pressed="true"]'))).toHaveCount(0);
    await answer(page, ex, mode);
    await expect(feedback).toHaveAttribute("data-verdict", "CORRECT");
    await expect(feedback.locator("[data-parts]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
