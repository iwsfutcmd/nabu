/**
 * Clips that play by themselves:
 * - match the pairs: a tapped word says itself when it has a clip; meanings say nothing;
 * - every card with a clip says it once answered (complete the translation, translations both
 *   ways, gap-fill, pictures, pronunciation, listening cards again);
 * - with sound off nothing plays.
 */
import { cardGallery } from "@nabu/core/lesson";
import { expect, test, type Page } from "@playwright/test";
import { answer, loadCourse } from "./solver.ts";

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

const tryCard = async (page: Page, template: string, query = "", route = "#/fa/fa-Arab.standard"): Promise<void> => {
  await page.goto(`/?debug=1${query}${route}/cards`);
  await page.locator(`[data-card="${template}"] [data-action=try-card]`).click();
  await expect(page.locator("[data-debug-template]")).toHaveAttribute("data-debug-template", template);
};
const pairsCard = (page: Page, query: string): Promise<void> => tryCard(page, "match-pairs", query);

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

test("complete the translation: once answered, the whole sentence is said", async ({ page }) => {
  // apc's gallery card is a sentence with a clip (fa's, uz's and yue's are held back or have none).
  const course = loadCourse("apc", "apc-Arab/standard");
  const ex = cardGallery(course, 7).find((c) => c.template === "complete-translation")?.exercise;
  if (ex?.template !== "complete-translation") throw new Error("apc has a complete-translation card");
  const clip = course.audio[ex.item]?.normal.path;
  expect(clip).toBeDefined();

  await recordPlays(page);
  await tryCard(page, "complete-translation", "", "#/apc/apc-Arab.standard");
  expect(await page.evaluate(() => window.nabuPlayed)).toEqual([]);
  await answer(page, ex, "keyboard");
  await expect(page.locator("[data-feedback]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.nabuPlayed)).toEqual([clip]);
  await expect(page.locator("[data-lesson-player] [data-action=play]")).toBeVisible();
});

/** Cards that say their clip once answered, beyond complete-the-translation (listening cards also play when they open). */
const SAY_WHEN_ANSWERED = ["choose-translation", "translate-tap.l2-l1", "translate-tap.l1-l2", "translate-type.l1-l2", "gap-fill", "select-image", "vocalize", "listen-type"] as const;

for (const template of SAY_WHEN_ANSWERED) {
  test(`${template}: once answered, the card's clip is said`, async ({ page }) => {
    const course = loadCourse("apc", "apc-Arab/standard");
    const ex = cardGallery(course, 7).find((c) => c.template === template)?.exercise;
    const clip = ex === undefined ? undefined : course.audio[ex.item]?.normal.path;
    test.skip(ex === undefined || clip === undefined, `apc's gallery has no ${template} card with a clip`);
    if (ex === undefined || clip === undefined) return;

    await recordPlays(page);
    await tryCard(page, template, "", "#/apc/apc-Arab.standard");
    const opened = template.startsWith("listen-") ? [clip] : [];
    await expect.poll(() => page.evaluate(() => window.nabuPlayed)).toEqual(opened);
    await answer(page, ex, "keyboard");
    await expect(page.locator("[data-feedback]")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.nabuPlayed)).toEqual([...opened, clip]);
  });
}

