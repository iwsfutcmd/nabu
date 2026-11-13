/**
 * The course path says where the learner is (S11 in the 2026-11 review):
 * - each unit says its number, title, level and how many of its lessons and stories are done;
 * - lessons are numbered within their unit, and where the path is out of sight (the tab's title)
 *   a lesson is "Unit 2, lesson 1";
 * - a lesson's preview shows each new word with its meaning under it, as a card glosses it;
 * - a drill's unit, which has no title, is "Extra practice";
 * - an alphabet row says who it is for and that the units don't wait for it, and shows each letter
 *   with its Latin spelling.
 * And the page has a main action and a short way to the rest (S2):
 * - finished units fold away, and open again from their heading;
 * - the page opens at Continue's lesson, focus on its heading;
 * - its other pages are linked under its title: the words, the sentences, Preferences, Offline.
 */
import { pathUnits, type PathUnit } from "@nabu/core/learner";
import { cardGloss, scriptNodes, type CourseView } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { activate, historyBefore, loadCourse, pathUrl, seedLog, seriousAxeViolations, sessionUrl, type Mode } from "./solver.ts";

const NOW = new Date("2026-06-02T08:00:00Z");
const SEED = 7;
const DAY = 86_400_000;

/** A placement test, as a device logs it, that placed the learner out of `nodes` at `at`. */
const placedOutOf = (course: CourseView, nodes: readonly string[], at: Date): LearnerEvent[] => {
  const base = (id: number, seconds: number) => {
    const time = new Date(at.getTime() + seconds * 1000).toISOString();
    return {
      id: `00000000-0000-7000-9000-${id.toString(16).padStart(12, "0")}`,
      schema: 1 as const,
      device: "e2e-placement",
      course: course.id,
      orthography: course.orthography as OrthographyId,
      support: course.supportKey,
      bundle: "0".repeat(64),
      session: "00000000-0000-7000-9000-0000000000ff",
      clientTime: time,
      localDate: time.slice(0, 10),
      tz: "UTC",
    };
  };
  return [
    { ...base(1, 0), type: "session_started", mode: "placement", seed: 1, exercises: 10, planner: "e2e" },
    { ...base(2, 300), type: "session_completed", mode: "placement", placed: [...nodes], summary: { completed: true, exercises: 10, correctFirstTry: 10, retries: 0, skipped: 0 } },
  ];
};

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
      if (unit.unit.cefr !== undefined) await expect(section.locator("[data-unit-level]")).toHaveText(`Level \u2068${unit.unit.cefr}\u2069`);
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
    await expect(page).toHaveTitle("\u2068Unit 2, lesson 1\u2069 – \u2068Persian\u2069 – \u2068Nabu\u2069");
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

  test("the course's other pages are linked under its title; Offline is a page of its own (S2)", async ({ page }) => {
    const course = loadCourse("fa", "fa-Arab/standard");
    await page.goto(pathUrl(course, SEED));
    const links = page.locator("[data-course-path] [data-course-links]");
    // Before the main action, not after the whole path. Your reports joins them once there is a report.
    await expect(page.locator("[data-course-path] [data-course-links] ~ [data-continue]")).toHaveCount(1);
    await expect(links.locator("a")).toHaveText(["Words you've learned", "Check the sentences", "Preferences", "Offline"]);
    await expect(page.locator("[data-practice] [data-words-link]")).toHaveCount(0);
    expect(await seriousAxeViolations(page, "[data-course-links]")).toEqual([]);

    await links.locator("[data-offline-link]").click();
    await expect(page.locator("[data-offline-page=fa] h1")).toHaveText("Offline");
    await expect(page.locator("[data-offline=fa] [data-offline-unit]").first()).toBeVisible();
    await expect(page).toHaveTitle("\u2068Offline\u2069 – \u2068Persian\u2069 – \u2068Nabu\u2069");
    expect(await seriousAxeViolations(page, "main")).toEqual([]);
    await page.locator("[data-offline-page=fa] a").first().click();
    await expect(page.locator("[data-course-path=fa]")).toBeVisible();
    await expect(page.locator("[data-course-path] [data-offline]")).toHaveCount(0);
  });
});

test("after placement, finished units fold away and open again; the page opens at Continue's lesson (S2)", async ({ page }, info) => {
  const mode = info.project.name as Mode;
  const course = loadCourse("es", "es-Latn/standard");
  const units = pathUnits(course);
  // The first three units, lessons and stories, placed out of yesterday: Continue is the fourth's first lesson.
  const placed = units.slice(0, 3);
  const [first] = placed;
  const fourth = units[3];
  const next = fourth?.entries[0];
  const opening = first?.entries[0];
  if (first === undefined || fourth === undefined || next === undefined || opening === undefined) throw new Error("es has units of lessons");
  await page.clock.setFixedTime(NOW);
  await seedLog(page, placedOutOf(course, placed.flatMap((u) => u.entries.map((e) => e.node.id)), new Date(NOW.getTime() - DAY)));
  await page.reload();

  // From Home, as the learner comes: the course's card. The page opens at Continue's lesson, its
  // heading focused, as every screen's is (S10).
  await activate(page, mode, '[data-course="es"] [data-course-link]');
  await expect(page.locator("[data-course-path=es]")).toBeVisible();
  await expect(page.locator("[data-continue] [data-action=continue]")).toHaveAttribute("href", new RegExp(`${next.node.id.replace(/\./gu, "\\.")}$`, "u"));
  const arrival = page.locator(`[data-arrival][data-lesson="${next.node.id}"], [data-arrival][data-story-node="${next.node.id}"]`);
  await expect(arrival).toBeInViewport({ ratio: 1 });
  await expect(page.locator("[data-course-path] h1")).toBeFocused();

  // The units placed out of are folded: each says it is done, and its lessons are out of sight.
  for (const unit of placed) {
    const section = page.locator(`[data-unit="${unit.unit.id}"]`);
    await expect(section).toHaveAttribute("data-finished", "");
    await expect(section.locator("[data-unit-done]")).toHaveText(`${unit.entries.length} of ${unit.entries.length} done`);
    await expect(section.locator("[data-action=unit-toggle]")).toHaveAttribute("aria-expanded", "false");
    await expect(section.locator("[data-lesson-list]")).toBeHidden();
  }
  // The unit under way is open, and has nothing to fold.
  await expect(page.locator(`[data-unit="${fourth.unit.id}"] [data-lesson-list]`)).toBeVisible();
  await expect(page.locator(`[data-unit="${fourth.unit.id}"] [data-action=unit-toggle]`)).toHaveCount(0);

  // A folded unit opens again from its heading, its lessons there to replay, and folds again.
  const unit = page.locator(`[data-unit="${first.unit.id}"]`);
  const toggle = `[data-unit="${first.unit.id}"] [data-action=unit-toggle]`;
  await activate(page, mode, toggle);
  await expect(page.locator(toggle)).toHaveAttribute("aria-expanded", "true");
  await expect(unit.locator(`[data-lesson="${opening.node.id}"]`)).toBeVisible();
  await expect(unit.locator(`[data-lesson="${opening.node.id}"]`)).toHaveAttribute("data-status", "done");
  expect(await seriousAxeViolations(page, "main")).toEqual([]);
  await activate(page, mode, toggle);
  await expect(page.locator(toggle)).toHaveAttribute("aria-expanded", "false");
  await expect(unit.locator("[data-lesson-list]")).toBeHidden();
});
