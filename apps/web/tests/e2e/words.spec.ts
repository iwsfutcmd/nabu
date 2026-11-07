/**
 * The word list: from a course's page, the words this learner has learned, as the device's own
 * log says (learnedWords). Each in its own language and direction with its meaning; found by its
 * letters whatever its vowel marks, or by its meaning; ordered as the course, alphabetically or
 * weakest first. A learner who has practised nothing is told how words get there.
 */
import { learnedWords, replay } from "@nabu/core/learner";
import { lessonNodes } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { expect, test } from "@playwright/test";
import { freshIds, historyBefore, loadCourse, seedLog, seriousAxeViolations } from "./solver.ts";

const NOW = new Date("2026-05-12T09:00:00Z");

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

test("a learner browses the words they have learned, finds one, and reorders them", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("fa", "fa-Arab/standard");
  const third = lessonNodes(course)[2]?.node.id;
  if (third === undefined) throw new Error("fa has three lessons");
  const history = freshIds(historyBefore(course, third, NOW));
  const words = learnedWords(course, replay(history), NOW.toISOString());
  expect(words.length).toBeGreaterThan(3);

  await page.clock.setFixedTime(NOW);
  await seedLog(page, history);
  await page.goto("/?sound=off#/fa/fa-Arab.standard");
  await page.locator("[data-words-link]").click();
  const list = page.locator("[data-word-list=fa]");
  await expect(list.locator("[data-words-count]")).toHaveAttribute("data-words-count", String(words.length));
  await expect(list.locator("[data-word]")).toHaveCount(words.length);
  expect(await list.locator("[data-word]").evaluateAll((els) => els.map((e) => e.getAttribute("data-word")))).toEqual(words.map((w) => w.kc));
  expect(await seriousAxeViolations(page, "[data-words-page]")).toEqual([]);

  // Each word right to left in its own tag; its meaning left to right.
  const first = list.locator(`[data-word="${words[0]?.kc ?? ""}"]`);
  const form = first.locator("p[data-nabu-text]").first();
  await expect(form).toHaveAttribute("dir", "rtl");
  expect((await form.getAttribute("lang"))?.startsWith("fa")).toBe(true);
  await expect(first.locator("p[data-nabu-text]").nth(1)).toHaveAttribute("dir", "ltr");
  // How well each is remembered, as of the page's clock: the same bands the core's numbers give.
  const band = (w: (typeof words)[number]): string => (w.due ? "due" : w.strength >= 0.85 ? "strong" : "fading");
  expect(await list.locator("[data-word]").evaluateAll((els) => els.map((e) => e.getAttribute("data-strength")))).toEqual(words.map(band));

  // Found by its letters, without the vowel marks it is written with.
  const marked = words.find((w) => /[\u064B-\u0652]/u.test(surfaceOf(w.form)));
  if (marked === undefined) throw new Error("fa's first lessons have a word with vowel marks");
  const search = page.locator("[data-field=word-search]");
  await search.fill(surfaceOf(marked.form).replace(/[\u064B-\u0652]/gu, ""));
  await expect(list.locator(`[data-word="${marked.kc}"]`)).toBeVisible();
  // And by its meaning.
  const meaning = marked.gloss === undefined ? "" : surfaceOf(marked.gloss);
  await search.fill(meaning.toLocaleUpperCase("en"));
  await expect(list.locator(`[data-word="${marked.kc}"]`)).toBeVisible();
  await search.fill("zzzz");
  await expect(list.locator("[data-words-none-found]")).toBeVisible();
  await search.fill("");

  // Alphabetical, by Persian's own collation.
  await list.locator("[data-order=alphabetical]").click();
  const collator = new Intl.Collator("fa", { sensitivity: "base" });
  const shown = await list.locator("[data-word]").evaluateAll((els) => els.map((e) => e.getAttribute("data-word")));
  const alphabetical = [...words].sort((a, b) => collator.compare(surfaceOf(a.form), surfaceOf(b.form))).map((w) => w.kc);
  expect(shown).toEqual(alphabetical);
  expect(errors).toEqual([]);
});

test("Cantonese words show their Jyutping; a learner with no practice is told how words get here", async ({ page }) => {
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  await page.goto("/?sound=off#/yue/yue-Hant-HK.standard/words");
  await expect(page.locator("[data-words-empty]")).toBeVisible();

  const second = lessonNodes(course)[1]?.node.id;
  if (second === undefined) throw new Error("yue has two lessons");
  const history = freshIds(historyBefore(course, second, NOW));
  await page.clock.setFixedTime(NOW);
  await seedLog(page, history);
  // The app read this course's log when the page first opened: load it again, as a new visit would.
  await page.goto("/?sound=off#/yue/yue-Hant-HK.standard/words");
  await page.reload();
  const word = page.locator("[data-word-list=yue] [data-word]").first();
  await expect(word).toBeVisible();
  await expect(word.locator("rt").first()).toBeAttached();
  expect(await seriousAxeViolations(page, "[data-words-page]")).toEqual([]);
});
