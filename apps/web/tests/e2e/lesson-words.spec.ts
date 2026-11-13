/**
 * Words in lessons (P1): a word of a card's target text can be tapped for its meaning where that
 * gives nothing away (the words around a gap, from the start; what a sentence means, once answered),
 * never on the options; and the card that first shows a word the lesson teaches says it is new.
 */
import { cardGallery } from "@nabu/core/lesson";
import { expect, test, type Page } from "@playwright/test";
import { answer, loadCourse, planned, sessionUrl, waitFor } from "./solver.ts";

const NOW = new Date("2026-03-10T09:00:00Z");
const SEED = 7;

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

const tryCard = async (page: Page, template: string): Promise<void> => {
  await page.goto(`/?sound=off&debug=1#/apc/apc-Arab.standard/cards`);
  await page.locator(`[data-card="${template}"] [data-action=try-card]`).click();
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
};

test("gap-fill: the words around the gap say what they mean; the options never do", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await tryCard(page, "gap-fill");
  await expect(page.locator("[data-options] button[data-index]")).toHaveCount(0);
  const word = page.locator("[data-gap-sentence] button[data-index]").first();
  await word.click();
  await expect(word).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator("[data-gloss-panel]");
  await expect(panel).toHaveAttribute("data-gloss-open", "");
  await expect(panel.locator("[data-gloss-kc]")).not.toHaveCount(0);
  // A second tap closes it.
  await word.click();
  await expect(panel).not.toHaveAttribute("data-gloss-open", "");
  expect(errors).toEqual([]);
});

test("choose the meaning: the sentence's words say what they mean only once it is answered", async ({ page }) => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const ex = cardGallery(course, 7).find((c) => c.template === "choose-translation")?.exercise;
  if (ex === undefined) throw new Error("apc has a choose-translation card");
  await tryCard(page, "choose-translation");
  const prompt = page.locator("[data-lesson-player] [data-ink-container=prompt]");
  await expect(prompt.locator("button[data-index]")).toHaveCount(0);
  await answer(page, ex, "keyboard");
  await expect(page.locator("[data-feedback]")).toBeVisible();
  await prompt.locator("button[data-index]").first().click();
  await expect(page.locator("[data-gloss-panel] [data-gloss-kc]")).not.toHaveCount(0);
  // Still the feedback: tapping a word never moves the lesson on.
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "feedback");
});

test("the first card of a lesson says its words are new", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const request = { mode: "lesson", node: "yue.greetings" } as const;
  const [first] = planned(course, [], request, NOW, SEED);
  if (first === undefined) throw new Error("the lesson has cards");
  await page.goto(sessionUrl(course, request, SEED));
  await waitFor(page, first);
  await expect(page.locator("[data-lesson-player] [data-new-word-tag]")).toHaveText(/New words?/u);
  const introduced = course.units.flatMap((u) => u.nodes).find((n) => n.id === request.node)?.introduces ?? [];
  const shown = ((await page.locator("[data-lesson-player] [data-new-words]").getAttribute("data-new-words")) ?? "").split(" ");
  expect(shown.length).toBeGreaterThan(0);
  for (const kc of shown) expect(introduced).toContain(kc);
});
