/**
 * Debug mode: ?debug=1 turns on, for this device, a gallery with one card of every kind the
 * course can make, and a label on every card saying which kind it is. Nothing played in the
 * gallery is recorded. Every screen says it is on, with a way out.
 */
import { cardGallery, cardId, lessonNodes } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { answer, expectRightAndContinue, loadCourse, logOf, planned, sessionUrl, waitFor } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

test("every kind of card can be tried from the gallery, and none of it is recorded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const gallery = cardGallery(course, 7);
  await page.goto("/?sound=off#/yue/yue-Hant-HK.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-cards-link]")).toHaveCount(0);

  await page.goto("/?sound=off&debug=1#/yue/yue-Hant-HK.standard");
  await page.locator("[data-cards-link]").click();
  await expect(page.locator("[data-cards-page=yue]")).toBeVisible();
  await expect(page.locator("[data-card]")).toHaveCount(gallery.length);
  await expect(page.locator("[data-card][data-available=true]")).toHaveCount(gallery.filter((c) => c.exercise !== undefined).length);

  const before = (await logOf(page, "yue")).length;
  for (const template of ["gap-fill", "char-read", "match-pairs"]) {
    await page.locator(`[data-card="${template}"] [data-action=try-card]`).click();
    await expect(page.locator("[data-lesson-player]")).toBeVisible();
    await expect(page.locator("[data-debug-template]")).toHaveAttribute("data-debug-template", template);
    await page.locator("[data-action=quit]").click();
    // Quitting goes straight back (P8): no stopped screen to tap through.
    await page.locator("[data-action=quit-confirm]").click();
    await expect(page.locator("[data-cards-page=yue]")).toBeVisible();
  }
  await page.locator("[data-action=play-all-cards]").click();
  await expect(page.locator("[data-debug-template]")).toHaveAttribute("data-debug-template", gallery.find((c) => c.exercise !== undefined)?.template ?? "");
  expect((await logOf(page, "yue")).length).toBe(before);

  // Every screen says debug mode is on, with the way out. Leaving also drops ?debug=1 from the
  // address (it would turn debug mode straight back on) and opens the page again without it.
  await page.goto("/?sound=off&debug=1#/yue/yue-Hant-HK.standard");
  await expect(page.locator("[data-debug-notice]")).toBeVisible();
  await page.locator("[data-action=leave-debug]").click();
  await expect(page).toHaveURL(/\/\?sound=off#\/yue\/yue-Hant-HK\.standard$/u);
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-cards-link]")).toHaveCount(0);
  await expect(page.locator("[data-debug-notice]")).toHaveCount(0);

  // ?debug=0 turns it off too.
  await page.goto("/?sound=off&debug=1#/yue/yue-Hant-HK.standard");
  await expect(page.locator("[data-cards-link]")).toBeVisible();
  await page.goto("/?sound=off&debug=0#/yue/yue-Hant-HK.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-cards-link]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a card's link opens that very card again, wherever it is opened, and records nothing", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const now = new Date("2026-05-12T09:00:00Z");
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const node = lessonNodes(course)[0]?.node.id ?? "";
  const exercises = planned(course, [], { mode: "lesson", node }, now, 3);
  const [first, second] = exercises;
  if (first === undefined || second === undefined) throw new Error("a lesson has two cards");

  // The second card of a lesson, so the link is to the card on screen, not the session's first.
  await page.clock.setFixedTime(now);
  await page.goto(sessionUrl(course, { mode: "lesson", node }, 3).replace("#", "&debug=1#"));
  await waitFor(page, first);
  await answer(page, first, "keyboard");
  await expectRightAndContinue(page, "keyboard", first);
  await waitFor(page, second);
  // The card's full id: its course and orthography, then the exercise's own id.
  await expect(page.locator("[data-debug-card]")).toHaveText(`yue/yue-Hant-HK.standard/${second.id}`);
  await expect(page.locator("[data-debug-card]")).toHaveText(cardId(course, second));
  const copy = page.locator("[data-action=copy-card-link]");
  await copy.click();
  await expect(copy).toHaveText("Link copied");
  const link = await page.evaluate(async () => navigator.clipboard.readText());
  expect(link).toMatch(/\?debug=1#\/yue\/yue-Hant-HK\.standard\/card\/[A-Za-z0-9_-]+$/u);

  // Opened elsewhere (a fresh page), it is the same card, answered as the planner's card is.
  const other = await context.newPage();
  other.on("pageerror", (e) => errors.push(String(e)));
  await other.goto(link);
  await expect(other.locator("[data-card-page]")).toHaveAttribute("data-card-page", second.id);
  await waitFor(other, second);
  await expect(other.locator("[data-debug-template]")).toHaveAttribute("data-debug-template", second.template);
  const before = (await logOf(other, "yue")).length;
  await answer(other, second, "keyboard");
  await expectRightAndContinue(other, "keyboard", second);
  expect((await logOf(other, "yue")).length).toBe(before);

  // A link cut short says so.
  const code = link.split("/card/")[1] ?? "";
  await other.goto(link.slice(0, link.length - Math.floor(code.length / 2)));
  await expect(other.locator("[data-card-unreadable]")).toBeVisible();
  expect(errors).toEqual([]);
});

test("debug mode is turned on and off in Preferences, for this device", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/?sound=off#/preferences");
  const choice = page.locator("[data-preference=debug]");
  await expect(choice.locator("[data-debug-choice=off] input")).toBeChecked();
  await expect(page.locator("[data-debug-notice]")).toHaveCount(0);

  // On: the page opens again with it, still on Preferences, and every screen says so.
  await choice.locator("[data-debug-choice=on]").click();
  await expect(page.locator("[data-debug-notice]")).toBeVisible();
  await expect(page.locator("[data-preferences]")).toBeVisible();
  await expect(choice.locator("[data-debug-choice=on] input")).toBeChecked();
  await page.goto("/?sound=off#/yue/yue-Hant-HK.standard");
  await expect(page.locator("[data-cards-link]")).toBeVisible();

  // Off: gone again.
  await page.goto("/?sound=off#/preferences");
  await choice.locator("[data-debug-choice=off]").click();
  await expect(page.locator("[data-debug-notice]")).toHaveCount(0);
  await expect(choice.locator("[data-debug-choice=off] input")).toBeChecked();
  await page.goto("/?sound=off#/yue/yue-Hant-HK.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-cards-link]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
