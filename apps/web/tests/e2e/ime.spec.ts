/**
 * Phase 3 acceptance: the IME composition test (gameplan §6.7). Chromium's own
 * composition (CDP Input.imeSetComposition / Input.insertText) drives a
 * Cantonese typing exercise, as a Jyutping IME would:
 * - while composing, Enter (keyCode 229, as IMEs send it) never submits and
 *   Check is disabled;
 * - the field is never rewritten: the composition text stays exactly as typed;
 * - after compositionend the settled text is what gets graded.
 */
import { surfaceOf } from "@nabu/core/text";
import { expect, test } from "@playwright/test";
import { answer, expectRightAndContinue, historyBefore, loadCourse, logOf, planned, seedLog, sessionUrl, waitFor } from "./solver.ts";

const NOW = new Date("2026-03-10T09:00:00Z");

test("IME composition never submits, never rewrites, and grades the settled text", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const request = { mode: "lesson", node: "yue.who" } as const;
  const history = historyBefore(course, request.node, NOW);
  if (history.length > 0) await seedLog(page, history);
  const exercises = planned(course, history, request, NOW, 7);
  const at = exercises.findIndex((e) => e.template === "translate-type.l1-l2");
  expect(at).toBeGreaterThanOrEqual(0);
  await page.goto(sessionUrl(course, request, 7));
  for (const ex of exercises.slice(0, at)) {
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }
  const ex = exercises[at];
  if (ex === undefined || ex.template !== "translate-type.l1-l2") throw new Error("no typing exercise");
  await waitFor(page, ex);

  const input = page.locator("[data-answer-input]");
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("lang", "yue-Hant-HK");
  const cdp = await page.context().newCDPSession(page);

  // Composing: a Jyutping IME shows the syllables it is converting. Full-width and odd
  // characters included: nothing may normalize them while composing.
  const composing = "ngo dei ｈａｉ";
  await cdp.send("Input.imeSetComposition", { text: composing, selectionStart: composing.length, selectionEnd: composing.length });
  await expect(input).toHaveValue(composing);
  await expect(page.locator("[data-action=check]")).toBeDisabled();

  // Enter while composing, as an IME reports it (keyCode 229): no submission.
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  await expect(page.locator("[data-feedback]")).toHaveCount(0);
  await expect(input).toHaveValue(composing);

  // The IME commits the characters: compositionend with the settled text.
  const settled = surfaceOf(ex.canonical);
  await cdp.send("Input.insertText", { text: settled });
  await expect(input).toHaveValue(settled);
  await expect(page.locator("[data-action=check]")).toBeEnabled();

  // Now Enter submits, and the settled text is graded.
  await page.keyboard.press("Enter");
  const feedback = page.locator("[data-feedback]");
  await expect(feedback).toBeVisible();
  expect(await feedback.getAttribute("data-verdict")).toBe("CORRECT");
  await expect
    .poll(async () => (await logOf(page, "yue")).find((e) => e.type === "answer_submitted" && e.exercise.id === ex.id))
    .toMatchObject({ input: { method: "text", raw: settled }, outcome: { kind: "CORRECT" } });
});
