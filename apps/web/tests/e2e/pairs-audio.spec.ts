/**
 * Match the pairs: a tapped word says itself when it has a clip, as the learner hears it in
 * listening exercises. Meanings say nothing, and with sound off nothing plays.
 */
import { cardGallery } from "@nabu/core/lesson";
import { expect, test, type Page } from "@playwright/test";
import { loadCourse } from "./solver.ts";

declare global {
  interface Window {
    nabuPlayed?: string[];
  }
}

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

/** Records which clip each play() asks for, instead of playing it. */
const recordPlays = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    window.nabuPlayed = [];
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      window.nabuPlayed?.push(this.dataset["clip"] ?? this.src);
      return Promise.resolve();
    };
  });
};

const pairsCard = async (page: Page, query: string): Promise<void> => {
  await page.goto(`/?debug=1${query}#/fa/fa-Arab.standard/cards`);
  await page.locator('[data-card="match-pairs"] [data-action=try-card]').click();
  await expect(page.locator("[data-debug-template]")).toHaveAttribute("data-debug-template", "match-pairs");
};

test("a tapped word plays its clip; a meaning plays nothing", async ({ page }) => {
  const course = loadCourse("fa", "fa-Arab/standard");
  const ex = cardGallery(course, 7).find((c) => c.template === "match-pairs")?.exercise;
  if (ex?.template !== "match-pairs") throw new Error("fa has a match-pairs card");
  const at = ex.kcs.findIndex((kc) => course.audio[kc] !== undefined);
  expect(at).toBeGreaterThanOrEqual(0);
  const clip = course.audio[ex.kcs[at] ?? ""]?.normal.path;

  await recordPlays(page);
  await pairsCard(page, "");
  await expect(page.locator(`[data-pair="left-${String(at)}"]`)).toHaveAttribute("data-clip", clip ?? "");
  await page.locator(`[data-pair="left-${String(at)}"]`).click();
  await expect.poll(() => page.evaluate(() => window.nabuPlayed)).toEqual([clip]);
  await page.locator('[data-pair="right-0"]').click();
  expect(await page.evaluate(() => window.nabuPlayed)).toEqual([clip]);
});

test("with sound off, a tapped word plays nothing", async ({ page }) => {
  await recordPlays(page);
  await pairsCard(page, "&sound=off");
  await page.locator('[data-pair^="left-"][data-clip]').first().click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.nabuPlayed)).toEqual([]);
});
