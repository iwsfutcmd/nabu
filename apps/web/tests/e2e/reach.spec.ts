/**
 * On a phone, Continue is in reach once a card is answered. The player focuses it, and the page
 * scrolls it into view with room to spare below: a browser's toolbar at the bottom of the screen
 * (Chrome's bottom address bar) covers the last strip of the viewport. The page keeps room below
 * the card for that, so even the end of the page scrolls clear of it. A small phone, and Toki Pona
 * in sitelen pona with its readings shown, make a lesson card taller than the screen.
 */
import { lessonNodes } from "@nabu/core/lesson";
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
