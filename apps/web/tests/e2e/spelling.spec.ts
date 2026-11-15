/**
 * Building a word from its letters (word-write, a script track's card): the letters placed show as
 * the word they spell, one run of text, so Arabic letters join (ن ا ن placed read نان) instead of
 * standing apart in boxes. Pressing the word, or Backspace, takes back its last letter.
 */
import { cardGallery } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { TaggedText } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { loadCourse } from "./solver.ts";

test("letters placed to build a word show joined, as the word they spell", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const course = loadCourse("chg", "chg-Arab/standard");
  const ex = cardGallery(course, 7).find((c) => c.template === "word-write")?.exercise;
  if (ex?.template !== "word-write") throw new Error("chg's gallery has a word-write card");
  const letters = ex.solution.map((i) => surfaceOf(ex.tiles[i] as TaggedText));
  expect(letters.length).toBeGreaterThan(2);

  await page.goto("/?sound=off&debug=1#/chg/chg-Arab.standard");
  await page.locator("[data-cards-link]").click();
  await page.locator('[data-card="word-write"] [data-action=try-card]').click();
  const player = page.locator("[data-lesson-player]");
  await expect(player).toHaveAttribute("data-state", "answering");
  const spelled = player.locator("[data-spelled-word]");
  await expect(spelled).toHaveCount(0);

  for (const [n, tile] of ex.solution.entries()) {
    await player.locator(`[data-tile="${tile}"]`).click();
    // One word, one token: nothing between the letters to stop them joining.
    await expect(spelled.locator("[data-index]")).toHaveCount(1);
    await expect(spelled).toHaveText(letters.slice(0, n + 1).join("").normalize("NFC"));
    await expect(player.locator("[data-placed-tile]")).toHaveCount(0);
  }
  expect(await spelled.locator("[data-index]").evaluate((el) => el.childNodes.length)).toBe(1);
  await expect(spelled).toHaveText(surfaceOf(ex.canonical));

  // Pressing the word takes back its last letter, and focus stays on the word; so does Backspace.
  await spelled.click();
  await expect(spelled).toHaveText(letters.slice(0, -1).join("").normalize("NFC"));
  await expect(spelled).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(spelled).toHaveText(letters.slice(0, -2).join("").normalize("NFC"));
  // The letters come back to the bank, and the word is built again and checked as right.
  for (const tile of ex.solution.slice(-2)) await player.locator(`[data-tile="${tile}"]`).click();
  await expect(spelled).toHaveText(surfaceOf(ex.canonical));
  await player.locator("[data-action=check]").click();
  await expect(player.locator("[data-feedback]")).toHaveAttribute("data-verdict", /^CORRECT/u);
});
