/**
 * The first-run home screen explains itself (the 2026-11 review's S4): what Nabu is and how to
 * start, then the courses in the order of their names, each card a link to its course, saying what
 * it teaches, its levels and size, and what it leaves out; a course in several writing systems
 * offers each, and says the learner can switch any time.
 *
 * A returning learner's Home picks up where they left off (S1): a card for the course studied last,
 * in the writing system studied, whose Continue starts the course page's next step; the courses
 * studied come first, the latest first, each saying when it was last practised. A reminder tapped
 * with the app open opens it.
 */
import { continueOf, paceOf, pathUnits, replay } from "@nabu/core/learner";
import { lessonNodes, type CourseView } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { activate, freshIds, historyBefore, loadCourse, pathUrl, seedLog, seriousAxeViolations, type Mode } from "./solver.ts";

const DAY = 86_400_000;

/** A node as the course path names it where the path is out of sight: "Unit 2, lesson 1". */
const nameOf = (course: CourseView, node: string): string => {
  for (const unit of pathUnits(course)) {
    const entry = unit.entries.find((e) => e.node.id === node);
    if (entry !== undefined) return entry.kind === "story" ? "Story" : `Unit ${unit.number ?? 0}, lesson ${entry.number ?? 0}`;
  }
  throw new Error(`${node} is not on the path`);
};

test.describe("home", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("a new learner is told what Nabu is and how to start; each course says what it is", async ({ page }) => {
    await page.goto("/?sound=off#/");
    await expect(page.locator("[data-home-intro]")).toBeVisible();
    await expect(page.locator("[data-game]")).toHaveCount(0);
    const cards = page.locator("[data-course-list] > [data-course]");
    const names = await cards.locator("h2").allInnerTexts();
    expect(names).toEqual([...names].sort((a, b) => new Intl.Collator("en").compare(a, b)));

    // The whole card is the course's link, to its first writing system.
    const es = page.locator('[data-course="es"]');
    await expect(es.locator("[data-course-link]")).toHaveAttribute("href", "#/es/es-Latn.standard");
    await expect(es.locator("[data-course-about]")).toBeVisible();
    // Reading courses say what they leave out; a course with listening says nothing.
    await expect(page.locator('[data-course="lzh"] [data-course-leaves]')).toBeVisible();
    await expect(page.locator('[data-course="hbo"] [data-course-leaves]')).toBeVisible();
    await expect(es.locator("[data-course-leaves]")).toHaveCount(0);

    // Several writing systems: each one a link, and a word that switching later is fine.
    const uz = page.locator('[data-course="uz"]');
    await expect(uz.locator("[data-orthography]")).toHaveCount(2);
    await uz.locator('[data-orthography="uz-Cyrl/standard"]').click();
    await expect(page.locator("[data-course-path=uz]")).toBeVisible();
    await expect(page).toHaveURL(/#\/uz\/uz-Cyrl\.standard$/u);
    await page.goBack();
    await page.locator('[data-course="fa"] [data-course-about]').click({ force: true }); // anywhere on the card
    await expect(page.locator("[data-course-path=fa]")).toBeVisible();
    await page.goBack();
    expect(await seriousAxeViolations(page, "main")).toEqual([]);
  });
});

test("a returning learner picks up where they left off, in the writing system they study (S1)", async ({ page }, info) => {
  const mode = info.project.name as Mode;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const NOW = new Date("2026-06-02T08:00:00Z");
  const fa = loadCourse("fa", "fa-Arab/standard");
  const uz = loadCourse("uz", "uz-Cyrl/standard");
  const [, , faThird] = lessonNodes(fa).map((n) => n.node.id);
  const [, uzSecond] = lessonNodes(uz).map((n) => n.node.id);
  if (faThird === undefined || uzSecond === undefined) throw new Error("fa and uz have lessons");
  // Persian four days ago, then Uzbek in Cyrillic two days ago: Uzbek is where the learner left off.
  const faLog = historyBefore(fa, faThird, new Date(NOW.getTime() - 2 * DAY));
  const uzLog = freshIds(historyBefore(uz, uzSecond, NOW));
  const uzState = replay(uzLog);
  const next = continueOf(uz, uzState, paceOf(uz, uzState, NOW.toISOString()));
  if (next.kind !== "path") throw new Error("Continue goes on along the path");
  await page.clock.setFixedTime(NOW);
  await seedLog(page, [...faLog, ...uzLog]);
  await page.reload(); // seedLog left the page here: reload so the app reads the seeded log

  const card = page.locator("[data-home-continue]");
  await expect(card).toHaveAttribute("data-home-continue", "uz");
  await expect(card).toHaveAttribute("data-continue-orthography", "uz-Cyrl/standard");
  await expect(card).toHaveAttribute("data-step", "path");
  // The step is a placeholder, so MF2 isolates it (FSI … PDI).
  await expect(card.locator("[data-continue-step]")).toHaveText(`Next: \u2068${nameOf(uz, next.next.node)}\u2069`);
  await expect(card.locator("[data-continue-course]")).toHaveAttribute("href", "#/uz/uz-Cyrl.standard");
  const go = card.locator("[data-action=continue]");
  await expect(go).toHaveAttribute("href", `#/uz/uz-Cyrl.standard/${encodeURIComponent(next.next.node)}`);

  // The courses studied first, the latest first, each in its own writing system and saying when; then the rest.
  const cards = page.locator("[data-course-list] > [data-course]");
  await expect(cards.nth(0)).toHaveAttribute("data-course", "uz");
  await expect(cards.nth(1)).toHaveAttribute("data-course", "fa");
  await expect(cards.nth(0).locator("[data-course-last]")).toHaveText("Last practised \u20682 days ago\u2069");
  await expect(cards.nth(1).locator("[data-course-last]")).toHaveText("Last practised \u20684 days ago\u2069");
  await expect(cards.nth(0).locator("[data-course-link]")).toHaveAttribute("href", "#/uz/uz-Cyrl.standard");
  await expect(cards.nth(2).locator("[data-course-last]")).toHaveCount(0);
  expect(await seriousAxeViolations(page, "main")).toEqual([]);

  // One press: the lesson.
  await activate(page, mode, "[data-home-continue] [data-action=continue]");
  await expect(page.locator("[data-lesson-player]")).toBeVisible();
  expect(page.url()).toContain(`#/uz/uz-Cyrl.standard/${encodeURIComponent(next.next.node)}`);

  // A reminder tapped while the app is open: the service worker hands its address over, and Home
  // opens, Continue first. Here, from Persian's page.
  await page.goto(pathUrl(fa, 3));
  await expect(page.locator("[data-course-path=fa]")).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "nabu-open", url: new URL("./", window.location.href).href } })));
  await expect(page.locator("[data-home-continue]")).toHaveAttribute("data-home-continue", "uz");
  await expect(page).toHaveURL(/#\/$/u);
  expect(errors).toEqual([]);
});
