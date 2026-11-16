/**
 * A right answer typed where a reading layer is on: the feedback shows the sentence again with its
 * readings (chg's Arabic under Schluessel's transliteration), since the field shows only what was typed.
 */
import { cardGallery } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { expect, test } from "@playwright/test";
import { loadCourse } from "./solver.ts";

test("a right answer typed with the transliteration on shows it again with the transliteration", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const course = loadCourse("chg", "chg-Arab/standard");
  const ex = cardGallery(course, 7).find((c) => c.template === "translate-type.l1-l2")?.exercise;
  if (ex?.template !== "translate-type.l1-l2") throw new Error("chg's gallery has a translate-type card");

  await page.goto("/?sound=off&debug=1#/chg/chg-Arab.standard");
  await page.locator("[data-cards-link]").click();
  await page.locator('[data-card="translate-type.l1-l2"] [data-action=try-card]').click();
  const player = page.locator("[data-lesson-player]");
  await expect(player).toHaveAttribute("data-state", "answering");
  await player.locator("[data-action=display]").click();
  await page.locator("[data-display-menu] [data-toggle=readings]").click();
  await page.keyboard.press("Escape");

  await player.locator("[data-answer-input]").fill(surfaceOf(ex.canonical));
  await player.locator("[data-action=check]").click();
  const feedback = player.locator("[data-feedback]");
  await expect(feedback).toHaveAttribute("data-verdict", "CORRECT");
  const rt = feedback.locator("[data-solution] rt");
  await expect(rt.first()).toHaveAttribute("lang", "chg-Latn");
  expect(await rt.count()).toBeGreaterThan(0);
});
