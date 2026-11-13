/**
 * Back and reload around a session (S3 in the 2026-11 review):
 * - Back in the middle of a lesson asks, as the quit button does; "Keep learning" stays on the same
 *   card, and quitting goes where Back was going.
 * - After a lesson, Continue goes back to the course page, and Back from there goes on back: it
 *   never opens the lesson again.
 * - A reload in the middle of a lesson picks the same session up at the same card, with the same
 *   plan; the log has one session, completed once.
 * - Back in the middle of a story asks too.
 * Android's back button goes through the same history (apps/web/src/native.ts).
 */
import { pathNodes } from "@nabu/core/learner";
import { lessonNodes } from "@nabu/core/lesson";
import { expect, test, type Page } from "@playwright/test";
import { activate, answer, expectRightAndContinue, graded, historyBefore, loadCourse, logOf, pathUrl, planned, playSession, seedLog, waitFor, type Mode } from "./solver.ts";

const SEED = 13;
const NOW = new Date("2026-06-02T08:00:00Z");
const course = loadCourse("fa", "fa-Arab/standard");
const [first, second] = lessonNodes(course).map((n) => n.node.id);
const player = (page: Page) => page.locator("[data-lesson-player]");

/** Plays the first `n` planned exercises right. */
const playFirst = async (page: Page, exercises: readonly Parameters<typeof answer>[1][], n: number, mode: Mode): Promise<void> => {
  for (const ex of exercises.slice(0, n)) {
    await waitFor(page, ex);
    await answer(page, ex, mode);
    await expectRightAndContinue(page, mode, ex);
  }
};

test.describe("back and reload", () => {
  if (first === undefined || second === undefined) throw new Error("fa needs two lessons");

  test("Back mid-lesson asks first; after the lesson, Back never opens it again", async ({ page }, info) => {
    const mode = info.project.name as Mode;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.clock.setFixedTime(NOW);
    await page.goto(`/?seed=${SEED}&sound=off#/`);
    await activate(page, mode, '[data-course="fa"] [data-orthography="fa-Arab/standard"]');
    await expect(page.locator("[data-course-path]")).toBeVisible();
    const exercises = planned(course, [], { mode: "lesson", node: first }, NOW, SEED);
    await activate(page, mode, `[data-lesson="${first}"]`);
    await playFirst(page, exercises, 2, mode);
    const at = exercises[2];
    if (at === undefined) throw new Error("a short lesson");
    await waitFor(page, at);
    const lessonUrl = page.url();

    // Back: the quit dialog, and the lesson stays where it is.
    await page.goBack();
    await expect(page.locator("[data-quit-dialog]")).toBeVisible();
    expect(page.url()).toBe(lessonUrl);
    await activate(page, mode, "[data-action=resume]");
    await expect(page.locator("[data-quit-dialog]")).toHaveCount(0);
    await waitFor(page, at);

    // Back again, and quit: the course page; the session ended as stopped.
    await page.goBack();
    await expect(page.locator("[data-quit-dialog]")).toBeVisible();
    await activate(page, mode, "[data-action=quit-confirm]");
    await expect(page.locator("[data-course-path]")).toBeVisible();
    await expect.poll(async () => (await logOf(page, "fa")).filter((e) => e.type === "session_completed").map((e) => (e.type === "session_completed" ? e.summary.completed : undefined))).toEqual([false]);

    // The lesson again, to the end: Continue goes back to the course page, and Back goes home.
    const again = planned(course, await logOf(page, "fa"), { mode: "lesson", node: first }, NOW, SEED);
    await activate(page, mode, `[data-lesson="${first}"]`);
    await playSession(page, again, mode);
    await activate(page, mode, "[data-action=exit]");
    await expect(page.locator(`[data-lesson="${first}"]`)).toHaveAttribute("data-status", "done");
    await page.goBack();
    await expect(page.locator("[data-course-list]")).toBeVisible();
    await expect(player(page)).toHaveCount(0);
    expect((await logOf(page, "fa")).filter((e) => e.type === "session_started")).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  test("a reload mid-lesson picks the session up at the same card", async ({ page }, info) => {
    const mode = info.project.name as Mode;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.clock.setFixedTime(NOW);
    const history = historyBefore(course, second, NOW);
    await seedLog(page, history);
    await page.goto(pathUrl(course, SEED));
    const exercises = planned(course, history, { mode: "lesson", node: second }, NOW, SEED);
    await activate(page, mode, `[data-lesson="${second}"]`);
    await playFirst(page, exercises, 3, mode);
    const progress = await page.locator("[data-progress-fill]").getAttribute("style");

    // Half a minute later the tab is reloaded (a phone dropped it): the same card, the same progress.
    await page.clock.setFixedTime(new Date(NOW.getTime() + 30_000));
    await page.reload();
    const next = exercises[3];
    if (next === undefined) throw new Error("a short lesson");
    await waitFor(page, next);
    await expect(page.locator("[data-progress-fill]")).toHaveAttribute("style", progress ?? "");

    // And on to the end, in the plan's order.
    await page.clock.setFixedTime(new Date(NOW.getTime() + 60_000));
    const { seen } = await playSession(page, exercises.slice(3), mode);
    expect(seen).toEqual(exercises.slice(3).map((e) => e.id));
    const session = (await logOf(page, "fa")).filter((e) => !history.some((h) => h.id === e.id));
    expect(new Set(session.map((e) => e.session)).size).toBe(1);
    expect(session.filter((e) => e.type === "session_started")).toHaveLength(1);
    expect(session.filter((e) => e.type === "answer_submitted").map((e) => (e.type === "answer_submitted" ? e.exercise.id : "")).sort()).toEqual(exercises.map((e) => e.id).sort());
    const completed = session.filter((e) => e.type === "session_completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]).toMatchObject({ summary: { completed: true, exercises: graded(exercises), correctFirstTry: graded(exercises) } });
    expect(errors).toEqual([]);
  });

  test("Back mid-story asks first", async ({ page }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
    await page.clock.setFixedTime(NOW);
    const story = pathNodes(course).find((n) => n.kind === "story");
    if (story === undefined) throw new Error("fa has a story");
    await seedLog(page, historyBefore(course, story.node.id, NOW));
    await page.goto(pathUrl(course, SEED));
    await activate(page, "keyboard", `[data-story-node="${story.node.id}"]`);
    await expect(page.locator("[data-story-reader]")).toBeVisible();
    const storyUrl = page.url();
    await page.goBack();
    await expect(page.locator("[data-quit-dialog]")).toBeVisible();
    expect(page.url()).toBe(storyUrl);
    await activate(page, "keyboard", "[data-action=quit-confirm]");
    await expect(page.locator("[data-course-path]")).toBeVisible();
  });
});
