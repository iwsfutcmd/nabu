/**
 * Phase 6: stories in the app. From the course path, a learner who finished a unit's lessons
 * reads its story to the end, by keyboard and by touch, across all six orthographies; the
 * story completes its node and earns XP. Tap-for-gloss explains words, and in the vocalized
 * apc-Arab story the vocalized words find their unvocalized glossary entries.
 */
import { seededRng } from "@nabu/core/lesson";
import { allStories, storyScript, type StoryScript } from "@nabu/core/story";
import { expect, test, type Page } from "@playwright/test";
import { activate, answer, historyBefore, loadCourse, logOf, pathUrl, seedLog, seriousAxeViolations, type Mode } from "./solver.ts";

const SEED = 11;
const NOW = new Date("2026-03-20T09:00:00Z");

const RUNS: Readonly<Record<Mode, readonly (readonly [string, string])[]>> = {
  keyboard: [
    ["fa", "fa-Arab/standard"],
    ["yue", "yue-Hant-HK/standard"],
    ["uz", "uz-Latn/standard"],
    ["apc", "apc-Arab/standard"],
  ],
  touch: [
    ["fa", "fa-Arab/standard"],
    ["uz", "uz-Cyrl/standard"],
    ["apc", "apc-Latn/arabizi"],
    ["yue", "yue-Hant-HK/standard"],
  ],
};

const reader = (page: Page) => page.locator("[data-story-reader]");

const forward = async (page: Page, mode: Mode): Promise<void> => {
  if (mode === "keyboard") await page.keyboard.press("Enter");
  else await page.locator("[data-story-reader] [data-action=continue]").tap();
};

/** Reads the story through, answering every question right. Returns the axe findings on the way. */
const read = async (page: Page, script: StoryScript, mode: Mode): Promise<string[]> => {
  const questions = new Map(script.steps.flatMap((s) => (s.tag === "question" ? [[s.ex.id, s.ex] as const] : [])));
  const violations: string[] = [];
  for (let guard = 0; guard < 100; guard += 1) {
    await expect(reader(page)).toHaveAttribute("data-state", /^(reading|asking|finished)$/u);
    const state = await reader(page).getAttribute("data-state");
    if (state === "finished") return violations;
    if (state === "reading") {
      await forward(page, mode);
      continue;
    }
    const id = (await reader(page).getAttribute("data-exercise")) ?? "";
    const ex = questions.get(id);
    if (ex === undefined) throw new Error(`the reader asked ${id}, which the script does not have`);
    await expect(page.locator("[data-story-question]")).toHaveAttribute("data-state", "answering");
    if (mode === "keyboard") violations.push(...(await seriousAxeViolations(page, "[data-story-reader]")).map((v) => `${id}: ${v}`));
    await answer(page, ex, mode);
    const feedback = page.locator("[data-feedback]");
    await expect(feedback).toBeVisible();
    expect(await feedback.getAttribute("data-verdict"), id).toMatch(/^CORRECT/u);
    await forward(page, mode);
  }
  throw new Error("the story did not end");
};

for (const mode of ["keyboard", "touch"] as const) {
  for (const [id, orthography] of RUNS[mode]) {
    test(`${mode}: ${id} (${orthography}) reads its story from the path`, async ({ page }, info) => {
      test.skip(info.project.name !== mode, `the ${mode} pass runs in the ${mode} project`);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.clock.setFixedTime(NOW);
      const course = loadCourse(id, orthography);
      const [story] = allStories(course);
      if (story === undefined) throw new Error(`${id} has no story`);
      const script = storyScript(course, story, seededRng(SEED));

      // A learner who finished the unit's lessons: the story is the next node on the path.
      await seedLog(page, historyBefore(course, story.node, NOW));
      await page.goto(pathUrl(course, SEED));
      const node = page.locator(`[data-story-node="${story.node}"]`);
      await expect(node).toHaveAttribute("data-status", "available");
      await activate(page, mode, `[data-story-node="${story.node}"]`);
      await expect(reader(page)).toHaveAttribute("data-story", story.id);

      const violations = await read(page, script, mode);
      expect(violations).toEqual([]);
      await expect(page.locator("[data-story-reader] [data-xp-earned]")).toBeVisible();
      await activate(page, mode, "[data-story-reader] [data-action=exit]");
      await expect(page.locator(`[data-story-node="${story.node}"]`)).toHaveAttribute("data-status", "done");

      const log = await logOf(page, id);
      const started = log.find((e) => e.type === "session_started" && e.mode === "story");
      expect(started).toMatchObject({ node: story.node, orthography });
      const completed = log.find((e) => e.type === "session_completed" && e.mode === "story");
      expect(completed).toMatchObject({ node: story.node, summary: { completed: true, correctFirstTry: script.steps.filter((s) => s.tag === "question").length } });
      expect(errors).toEqual([]);
    });
  }
}

test("tap-for-gloss: vocalized apc-Arab words find their unvocalized entries", async ({ page }, info) => {
  test.skip(info.project.name !== "touch", "one pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("apc", "apc-Arab/standard");
  const [story] = allStories(course);
  if (story === undefined) throw new Error("apc has no story");
  await seedLog(page, historyBefore(course, story.node, NOW));
  await page.goto(`/?seed=${SEED}&sound=off#/apc/apc-Arab.standard/story/${encodeURIComponent(story.node)}`);
  // Read on until Maya's greeting (مَرْحَبا سامي! كِيفَك؟) is in the transcript.
  const kifak = page.locator("[data-story-transcript] button[data-index]", { hasText: "كِيفَك" });
  for (let i = 0; i < 5 && (await kifak.count()) === 0; i += 1) await page.locator("[data-story-reader] [data-action=continue]").tap();
  await kifak.tap();
  await expect(kifak).toHaveAttribute("aria-pressed", "true");
  const panel = page.locator("[data-gloss-panel]");
  const entry = panel.locator('[data-gloss-kc="sense:kifak"]');
  await expect(entry).toBeVisible();
  // The entry shown is the glossary's own unvocalized form, and the KC's meaning.
  await expect(entry.locator("dt")).toHaveText("كيفك");
  await expect(entry.locator("dd")).toContainText("how are you?");
  // Hiding the vowel marks changes the display only: the same word, the same gloss.
  const line = await kifak.evaluate((el) => el.closest("[data-line]")?.getAttribute("data-line"));
  const index = await kifak.getAttribute("data-index");
  const word = page.locator(`[data-story-transcript] [data-line="${line ?? ""}"] button[data-index="${index ?? ""}"]`);
  await page.locator("[data-toggle=marks]").tap();
  await expect(word).toHaveText("كيفك");
  await expect(word).toHaveAttribute("aria-pressed", "true");
  await expect(entry).toBeVisible();
});
