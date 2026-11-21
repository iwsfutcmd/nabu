/**
 * The Data page (debug mode): everything a course says of its words, forms and sentences, to
 * browse. It is linked from the course page only in debug mode, lists what `courseData` lists, is
 * searched by letters, meanings and ids, and records nothing.
 */
import { courseData, dataMatcher } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { loadCourse, logOf, seriousAxeViolations } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

test("a course's words, forms and sentences are browsed and searched, and nothing is recorded", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("uz", "uz-Latn/standard");
  const data = courseData(course);

  // No way in without debug mode.
  await page.goto("/?sound=off#/uz/uz-Latn.standard");
  await expect(page.locator("[data-course-path]")).toBeVisible();
  await expect(page.locator("[data-data-link]")).toHaveCount(0);

  await page.goto("/?sound=off&debug=1#/uz/uz-Latn.standard");
  const before = (await logOf(page, "uz")).length;
  await page.locator("[data-data-link]").click();
  await expect(page.locator("[data-data-page=uz]")).toBeVisible();
  const browser = page.locator("[data-data-browser=uz]");
  const rows = browser.locator("[data-data-row]");
  const found = browser.locator("[data-data-found]");

  // The words, a page at a time, under their units.
  await expect(browser.locator("[data-data-view]")).toHaveAttribute("data-data-view", "words");
  await expect(found).toHaveAttribute("data-data-found", String(data.words.length));
  await expect(rows).toHaveCount(Math.min(40, data.words.length));
  await browser.locator("[data-action=data-more]").click();
  await expect(rows).toHaveCount(Math.min(80, data.words.length));
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);

  // A word is found by its id, and shows every way a sentence writes it, each with its parts.
  const word = data.words.find((w) => w.written.some((x) => x.carries?.asked === true));
  if (word === undefined) throw new Error("uz has a word the parts cards ask");
  const search = browser.locator("[data-field=data-search]");
  await search.fill(word.id.id);
  await expect(found).toHaveAttribute("data-data-found", "1");
  const row = browser.locator(`[data-data-row="${word.id.id}"]`);
  await expect(row.locator("[data-entry-id]")).toHaveText(word.id.id);
  await expect(row.locator("[data-written]")).toHaveCount(word.written.length);
  await expect(row.locator("[data-parts-asked]")).toHaveCount(word.written.filter((x) => x.carries?.asked === true).length);
  await expect(row.locator("[data-written] [data-parts]").first()).toHaveAttribute("dir", "ltr");

  // The forms, each with the words that carry it.
  await browser.locator("[data-view=forms]").click();
  await search.fill("");
  await expect(found).toHaveAttribute("data-data-found", String(data.forms.length));
  const form = data.forms.find((f) => f.carriers.length > 0);
  if (form === undefined) throw new Error("uz has a form some word carries");
  await search.fill(form.id.id);
  const formRow = browser.locator(`[data-data-row="${form.id.id}"]`);
  await expect(formRow.locator("[data-carrier]")).toHaveCount(Math.min(12, form.carriers.length));

  // The sentences that list it: found by its id, each with its words.
  await browser.locator("[data-view=sentences]").click();
  const listing = data.sentences.filter(dataMatcher(course, form.id.id).sentences);
  expect(listing.length).toBeGreaterThan(0);
  await expect(found).toHaveAttribute("data-data-found", String(listing.length));
  const first = browser.locator(`[data-data-row="${listing[0]?.sentence.id ?? ""}"]`);
  await expect(first.locator("[data-listed-part]").filter({ hasText: form.id.id }).first()).toBeVisible();
  await expect(first.locator("[data-sentence-word]")).toHaveCount(listing[0]?.words.length ?? 0);
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);

  // Nothing matches, said in the count; and nothing was recorded.
  await search.fill("zzqqxxzzqq");
  await expect(found).toHaveAttribute("data-data-found", "0");
  await expect(rows).toHaveCount(0);
  expect((await logOf(page, "uz")).length).toBe(before);
  expect(errors).toEqual([]);
});

test("a right-to-left course's data keeps each text in its own direction", async ({ page }) => {
  const course = loadCourse("fa", "fa-Arab/standard");
  const data = courseData(course);
  await page.goto("/?sound=off&debug=1#/fa/fa-Arab.standard/data");
  const browser = page.locator("[data-data-browser=fa]");
  await expect(browser.locator("[data-data-found]")).toHaveAttribute("data-data-found", String(data.words.length));
  const word = data.words.find((w) => w.written.some((x) => x.carries?.asked === true));
  if (word === undefined) throw new Error("fa has a word the parts cards ask");
  await browser.locator("[data-field=data-search]").fill(word.id.id);
  const row = browser.locator(`[data-data-row="${word.id.id}"]`);
  // The word and its parts read right to left; its id and tags left to right; its meaning as English does.
  await expect(row.locator("[data-parts]").first()).toHaveAttribute("dir", "rtl");
  await expect(row.locator("[data-nabu-text][lang^=fa]").first()).toHaveAttribute("dir", "rtl");
  await expect(row.locator("[data-nabu-text][lang^=en]").first()).toHaveAttribute("dir", "ltr");
  expect(await row.locator("[data-entry-id]").evaluate((el) => getComputedStyle(el).direction)).toBe("ltr");
  expect(await seriousAxeViolations(page, "[data-data-page]")).toEqual([]);
});
