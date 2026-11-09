/**
 * On a phone, Check and Continue stay in reach. Continue, once a card is answered: the player focuses it, and the page
 * scrolls it into view with room to spare below: a browser's toolbar at the bottom of the screen
 * (Chrome's bottom address bar) covers the last strip of the viewport. The page keeps room below
 * the card for that, so even the end of the page scrolls clear of it. A small phone, and Toki Pona
 * in sitelen pona with its readings shown, make a lesson card taller than the screen. Check, while
 * typing: the on-screen keyboard leaves little of the screen, and the browser scrolls only the
 * field into view, so the page scrolls on until the card's footer clears the bottom toolbar too.
 */
import { cardGallery, lessonNodes } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { answer, loadCourse, planned, sessionUrl, waitFor } from "./solver.ts";

/** What a bottom toolbar can cover: Chrome's bottom address bar is about 56 CSS px. */
const TOOLBAR = 64;
const NOW = new Date("2026-03-10T09:00:00Z");

test("on a phone, Continue scrolls into view clear of a toolbar at the bottom of the screen", async ({ page }, info) => {
  test.skip(info.project.name !== "touch", "a phone's screen");
  await page.setViewportSize({ width: 375, height: 667 });
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("tok", "tok-Qaap/sitelen-pona");
  const node = lessonNodes(course)[0]?.node.id;
  if (node === undefined) throw new Error("tok has lessons");
  const request = { mode: "lesson", node } as const;
  const exercises = planned(course, [], request, NOW, 7);
  await page.goto(sessionUrl(course, request, 7));
  let checked = 0;
  for (const ex of exercises) {
    await waitFor(page, ex);
    await answer(page, ex, "touch");
    const go = page.locator("[data-action=continue]");
    await expect(go).toBeFocused();
    // Only a card taller than the screen makes the page scroll to Continue.
    if (await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1)) {
      const box = await go.boundingBox();
      const height = await page.evaluate(() => window.innerHeight);
      if (box === null) throw new Error("Continue is not laid out");
      expect(box.y, ex.id).toBeGreaterThanOrEqual(0);
      expect(height - (box.y + box.height), ex.id).toBeGreaterThanOrEqual(TOOLBAR);
      checked++;
    }
    await go.click();
    if (checked >= 3) break;
  }
  expect(checked).toBeGreaterThan(0);
});

test("on a phone, Check stays in reach while typing with the on-screen keyboard open", async ({ page }, info) => {
  test.skip(info.project.name !== "touch", "a phone's screen");
  await page.setViewportSize({ width: 375, height: 667 });
  const course = loadCourse("hbo", "hbo-Hebr/tiberian");
  const ex = cardGallery(course, 7).find((c) => c.template === "complete-translation")?.exercise;
  if (ex === undefined) throw new Error("hbo's gallery has a complete-translation card");
  await page.goto("/?sound=off&debug=1#/hbo/hbo-Hebr.tiberian/cards");
  await page.locator('[data-card="complete-translation"] [data-action=try-card]').click();
  await waitFor(page, ex);
  const field = page.locator("[data-answer-input]");
  await expect(field).toBeFocused();
  // The keyboard opens: it and the toolbar above it leave this much of the screen.
  await page.setViewportSize({ width: 375, height: 390 });
  const check = page.locator("[data-action=check]");
  await expect
    .poll(async () => {
      const box = await check.boundingBox();
      return box === null ? -1 : (await page.evaluate(() => window.innerHeight)) - (box.y + box.height);
    })
    .toBeGreaterThanOrEqual(TOOLBAR);
  // The field itself stays in view.
  const at = await field.boundingBox();
  expect(at?.y ?? -1).toBeGreaterThanOrEqual(0);
});
