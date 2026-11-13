/**
 * The end of a session (P9 in the 2026-11 review, ADR 0113) and a claim that counts at once (P14).
 *
 * - A learner's first lesson, one card missed: the end lists it with the right answer and theirs,
 *   shows the lesson's new words with their meanings, says the streak started today, and offers
 *   the next lesson, which it opens.
 * - A wrong typed answer claimed right in its feedback: Continue no longer says wrong, the card does
 *   not come back (a reload in between changes nothing), and the session counts it right.
 */
import { allKcs, lessonNodes } from "@nabu/core/lesson";
import { expect, test } from "@playwright/test";
import { activate, answer, canMiss, expectRightAndContinue, graded, historyBefore, loadCourse, logOf, planned, playSession, seedLog, seriousAxeViolations, sessionUrl, waitFor, type Mode } from "./solver.ts";

const SEED = 11;
const NOW = new Date("2026-03-10T09:00:00Z");

test("the end of a lesson: what was missed, the new words, the streak, and the next lesson (P9)", async ({ page }, info) => {
  const mode = info.project.name as Mode;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("fa", "fa-Arab/standard");
  const [first, second] = lessonNodes(course);
  if (first === undefined || second === undefined) throw new Error("fa has two lessons");
  const request = { mode: "lesson", node: first.node.id } as const;
  const lesson = planned(course, [], request, NOW, SEED);
  const missed = lesson.find(canMiss);
  if (missed === undefined) throw new Error("no card to miss");
  await page.goto(sessionUrl(course, request, SEED));
  await playSession(page, lesson, mode, { miss: new Set([missed.id]) });

  const end = page.locator('[data-lesson-player][data-state="finished"]');
  await expect(end.locator("h2")).toHaveText("Lesson complete!");
  // The card missed, with the right answer and the learner's.
  const card = end.locator(`[data-end-missed] [data-missed="${missed.id}"]`);
  await expect(card).toBeVisible();
  await expect(card.locator("[data-solution]")).toBeVisible();
  await expect(card.locator("[data-your-answer]")).toBeVisible();
  await expect(end.locator("[data-end-missed] [data-missed]")).toHaveCount(1);
  // The lesson's new words, each with its meaning.
  const kinds = new Map(allKcs(course).map((k) => [k.id as string, k.kind]));
  const words = first.node.introduces.filter((kc) => kinds.get(kc) !== "grapheme");
  await expect(end.locator("[data-end-words] [data-end-word]")).toHaveCount(words.length);
  // The first session of the day starts a streak; the XP comes after it.
  await expect(end.locator('[data-end-progress] [data-streak-now="1"]')).toBeVisible();
  await expect(end.locator("[data-end-progress] [data-xp-earned]")).toBeVisible();
  // The next step is the course page's Continue: the next lesson, focused, beside the way back.
  const next = end.locator("[data-action=next]");
  await expect(next).toHaveAttribute("data-next", "lesson 2");
  if (mode === "keyboard") await expect(next).toBeFocused();
  await expect(end.locator("[data-action=exit]")).toHaveText("Back to the course");
  if (mode === "keyboard") expect(await seriousAxeViolations(page)).toEqual([]);

  // It opens the next lesson, planned from the log as the course page's Continue would open it.
  await expect.poll(async () => (await logOf(page, "fa")).some((e) => e.type === "session_completed")).toBe(true);
  const after = planned(course, await logOf(page, "fa"), { mode: "lesson", node: second.node.id }, NOW, SEED);
  const opening = after[0];
  if (opening === undefined) throw new Error("the second lesson has cards");
  await activate(page, mode, "[data-action=next]");
  await waitFor(page, opening);
  expect(errors).toEqual([]);
});

test("a claim counts at once: Continue turns, the card does not come back, and the score has it (P14)", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const request = { mode: "lesson", node: "yue.names" } as const;
  const history = historyBefore(course, request.node, NOW);
  if (history.length > 0) await seedLog(page, history);
  const lesson = planned(course, history, request, NOW, SEED);
  const at = lesson.findIndex((e) => e.template === "translate-type.l1-l2");
  const typed = lesson[at];
  if (typed === undefined) throw new Error("no typing card");
  await page.goto(sessionUrl(course, request, SEED));
  for (const ex of lesson.slice(0, at)) {
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }
  await waitFor(page, typed);
  await page.locator("[data-answer-input]").fill("拜拜");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
  const proceed = page.locator("[data-action=continue]");
  await expect(proceed).toHaveAttribute("data-counts-as", "WRONG");

  // "My answer should have been accepted": it counts as right in the session at once.
  await page.locator("[data-action=report-problem]").click();
  await page.locator("[data-report-dialog] [data-action=report]").click();
  await expect(page.locator("[data-reported]")).toHaveAttribute("data-reported", "accept");
  await expect(proceed).toHaveAttribute("data-counts-as", "CORRECT");
  // The feedback still shows the grading, the solution with it.
  await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");

  // A reload before Continue picks the session up as the claim left it (ADR 0108, 0113).
  await expect.poll(async () => (await logOf(page, "yue")).some((e) => e.type === "answer_reported")).toBe(true);
  await page.reload();
  const rest = lesson.slice(at + 1);
  const { seen } = await playSession(page, rest, "keyboard");
  expect(seen).toEqual(rest.map((e) => e.id));
  expect(seen).not.toContain(`${typed.id}#2`);

  // The end counts it right: nothing missed, and the logged summary agrees.
  const end = page.locator('[data-lesson-player][data-state="finished"]');
  await expect(end.locator("[data-summary]")).toHaveText(`${graded(lesson)} of ${graded(lesson)} right the first time`);
  await expect(end.locator("[data-end-missed]")).toHaveCount(0);
  await expect
    .poll(async () => (await logOf(page, "yue")).find((e) => e.type === "session_completed" && e.node === request.node))
    .toMatchObject({ summary: { completed: true, exercises: graded(lesson), correctFirstTry: graded(lesson), retries: 0 } });
  expect(errors).toEqual([]);
});
