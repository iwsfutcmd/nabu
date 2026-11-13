/**
 * The course path says where the learner is (S11 in the 2026-11 review):
 * - each unit says its number, title, level and how many of its lessons and stories are done;
 * - lessons are numbered within their unit, and where the path is out of sight (the tab's title)
 *   a lesson is "Unit 2, lesson 1";
 * - a lesson's preview shows each new word with its meaning under it, as a card glosses it;
 * - a drill's unit, which has no title, is "Extra practice";
 * - an alphabet row says who it is for and that the units don't wait for it, and shows each letter
 *   with its Latin spelling.
 */
import { pathUnits, type PathUnit } from "@nabu/core/learner";
import { cardGloss, scriptNodes } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { expect, test } from "@playwright/test";
import { historyBefore, loadCourse, pathUrl, seedLog, seriousAxeViolations, sessionUrl } from "./solver.ts";

const NOW = new Date("2026-06-02T08:00:00Z");
const SEED = 7;

/** A unit's entries as the path names them. */
const namesOf = (unit: PathUnit): string[] => unit.entries.map((e) => (e.kind === "story" ? "Story" : e.number === undefined ? "Practice" : `Lesson ${e.number}`));

test.describe("the course path", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("units say their number, level and progress; lessons are numbered within them, each new word with its meaning", async ({ page }) => {
    const course = loadCourse("fa", "fa-Arab/standard");
    const units = pathUnits(course);
    const [first, second] = units;
    const opening = first?.entries[0];
    const next = first?.entries[1];
    if (first === undefined || second === undefined || opening === undefined || next === undefined) throw new Error("fa has units of lessons");
    // One lesson of the first unit done.
    await page.clock.setFixedTime(NOW);
    await seedLog(page, historyBefore(course, next.node.id, NOW));
    await page.goto(pathUrl(course, SEED));

    const sections = page.locator("[data-course-path] [data-unit]");
    await expect(sections).toHaveCount(units.length);
    for (const [i, unit] of units.entries()) {
      const section = sections.nth(i);
      await expect(section).toHaveAttribute("data-unit", unit.unit.id);
      await expect(section.locator("[data-node-name]")).toHaveText(namesOf(unit));
      if (unit.number !== undefined) await expect(section.locator("h3 [data-unit-number]")).toHaveText(`Unit ${unit.number}`);
      // The level is a placeholder, so MF2 isolates it (FSI … PDI).
      if (unit.unit.cefr !== undefined) await expect(section.locator("[data-unit-level]")).toHaveText(`Level ⁨${unit.unit.cefr}⁩`);
    }
    const progress = sections.first().locator("[data-unit-done]");
    await expect(progress).toHaveText(`1 of ${first.entries.length} done`);
    await expect(sections.nth(1).locator("[data-unit-done]")).toHaveText(`0 of ${second.entries.length} done`);

    // The first lesson's new words, each with its meaning under it, as a card glosses it.
    const words = opening.node.introduces.flatMap((id) => {
      const kc = first.unit.kcs.find((k) => k.id === id);
      const form = kc?.forms?.[course.orthography]?.[0];
      return form === undefined ? [] : [{ form, gloss: kc?.gloss?.[course.supportKey] }];
    });
    expect(words.length).toBeGreaterThan(0);
    const items = page.locator(`[data-lesson="${opening.node.id}"] [data-preview-item]`);
    await expect(items).toHaveCount(words.length);
    for (const [i, { form, gloss }] of words.entries()) {
      const item = items.nth(i);
      await expect(item.locator(`[data-nabu-text][data-orthography="${course.orthography}"]`)).toHaveText(surfaceOf(form));
      if (gloss !== undefined) await expect(item.locator('[data-nabu-text][lang="en-Latn"]')).toHaveText(surfaceOf(cardGloss(gloss)));
    }

    // The numbers drill comes last, under a heading of its own.
    const drill = sections.last();
    await expect(drill.locator("h3")).toHaveText("Extra practice");
    await expect(drill.locator("[data-preview]")).toHaveText("numbers");
    expect(await seriousAxeViolations(page, "main")).toEqual([]);

    // Out of the path's sight, a lesson is named by its unit.
    const later = second.entries[0];
    if (later === undefined) throw new Error("fa's second unit has lessons");
    await page.goto(sessionUrl(course, { mode: "lesson", node: later.node.id }, SEED));
    await expect(page.locator("[data-lesson-player]")).toBeVisible();
    await expect(page).toHaveTitle("⁨Unit 2, lesson 1⁩ – ⁨Persian⁩ – ⁨Nabu⁩");
    await expect(page.locator("[data-screen-heading]")).toHaveText("Unit 2, lesson 1");
  });

  test("an alphabet row says who it is for, and shows each letter with its Latin spelling", async ({ page }) => {
    const course = loadCourse("grc", "grc-Grek/polytonic");
    await page.goto(pathUrl(course, SEED));
    const track = page.locator("[data-script-track]");
    await expect(track.locator("[data-unit-advice]")).toHaveText(/^New to these letters\? Start here\./u);
    const [first] = scriptNodes(course);
    if (first === undefined) throw new Error("grc has an alphabet row");
    const items = track.locator(`[data-script-node="${first.node.id}"] [data-preview-item]`);
    await expect(items).toHaveText(first.node.alphabet.letters.map((l) => `${surfaceOf(l.text)}${surfaceOf(l.latin)}`));
    // The units don't wait for it: the first lesson is open as well.
    const lesson = pathUnits(course)[0]?.entries[0];
    await expect(page.locator(`[data-lesson="${lesson?.node.id ?? ""}"]`)).toHaveAttribute("data-status", "available");
    await expect(page.locator(`[data-lesson="${lesson?.node.id ?? ""}"] [data-node-name]`)).toHaveText("Lesson 1");
    expect(await seriousAxeViolations(page, "main")).toEqual([]);
  });
});
