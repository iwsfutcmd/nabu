/**
 * Phase 3 acceptance: the IME composition test (gameplan §6.7). Chromium's own
 * composition (CDP Input.imeSetComposition / Input.insertText) drives a
 * Cantonese typing exercise, as a Jyutping IME would:
 * - while composing, Enter (keyCode 229, as IMEs send it) never submits;
 * - the field is never rewritten: the composition text stays exactly as typed;
 * - a commit alone (an IME's Enter, a tapped candidate) submits nothing;
 * - after compositionend the settled text is what gets graded.
 *
 * And as a phone keyboard composes (ADR 0118): Gboard keeps the word being typed in a composition
 * until it is committed, so Check stays enabled while composing. One tap on it ends the composition
 * and checks the settled text; a press that leaves focus in the field (an assistive technology's)
 * waits for compositionend, never submitting mid-composition.
 */
import type { Exercise } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { answer, expectRightAndContinue, historyBefore, loadCourse, logOf, planned, seedLog, sessionUrl, waitFor, type Mode } from "./solver.ts";

const NOW = new Date("2026-03-10T09:00:00Z");

/** Plays yue.names up to its first typed translation, and waits there with the field focused. */
const toTypingCard = async (page: Page, mode: Mode): Promise<Extract<Exercise, { template: "translate-type.l1-l2" }>> => {
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const request = { mode: "lesson", node: "yue.names" } as const;
  const history = historyBefore(course, request.node, NOW);
  if (history.length > 0) await seedLog(page, history);
  const exercises = planned(course, history, request, NOW, 7);
  const at = exercises.findIndex((e) => e.template === "translate-type.l1-l2");
  expect(at).toBeGreaterThanOrEqual(0);
  await page.goto(sessionUrl(course, request, 7));
  for (const ex of exercises.slice(0, at)) {
    await waitFor(page, ex);
    await answer(page, ex, mode);
    await expectRightAndContinue(page, mode, ex);
  }
  const ex = exercises[at];
  if (ex === undefined || ex.template !== "translate-type.l1-l2") throw new Error("no typing exercise");
  await waitFor(page, ex);
  const input = page.locator("[data-answer-input]");
  if (mode === "touch") await input.tap();
  await expect(input).toBeFocused();
  return ex;
};

/** The composition as the field shows it: CDP sets it as an IME would, with the caret at its end. */
const compose = async (cdp: CDPSession, text: string): Promise<void> => {
  await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
};

/** What the log says was answered for `ex`, once the answer is recorded. */
const logged = (page: Page, ex: Exercise) => expect.poll(async () => (await logOf(page, "yue")).find((e) => e.type === "answer_submitted" && e.exercise.id === ex.id));

test("IME composition never submits, never rewrites, and grades the settled text", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const ex = await toTypingCard(page, "keyboard");
  const input = page.locator("[data-answer-input]");
  await expect(input).toHaveAttribute("lang", "yue-Hant-HK");
  const cdp = await page.context().newCDPSession(page);

  // Composing: a Jyutping IME shows the syllables it is converting. Full-width and odd
  // characters included: nothing may normalize them while composing.
  const composing = "ngo dei ｈａｉ";
  await compose(cdp, composing);
  await expect(input).toHaveValue(composing);
  // Check stays enabled (ADR 0118): pressed now, it would wait for the composition to end.
  await expect(page.locator("[data-action=check]")).toBeEnabled();

  // Enter while composing, as an IME reports it (keyCode 229): no submission.
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  await expect(page.locator("[data-feedback]")).toHaveCount(0);
  await expect(input).toHaveValue(composing);

  // The IME commits the characters: compositionend with the settled text, and nothing submitted.
  const settled = surfaceOf(ex.canonical);
  await cdp.send("Input.insertText", { text: settled });
  await expect(input).toHaveValue(settled);
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  await expect(page.locator("[data-feedback]")).toHaveCount(0);
  await expect(page.locator("[data-action=check]")).toBeEnabled();

  // Now Enter submits, and the settled text is graded.
  await page.keyboard.press("Enter");
  const feedback = page.locator("[data-feedback]");
  await expect(feedback).toBeVisible();
  expect(await feedback.getAttribute("data-verdict")).toBe("CORRECT");
  await logged(page, ex).toMatchObject({ input: { method: "text", raw: settled }, outcome: { kind: "CORRECT" } });
});

test("one tap on Check while a phone keyboard composes the last word checks the answer", async ({ page }, info) => {
  test.skip(info.project.name !== "touch", "a phone keyboard: the touch pass");
  const ex = await toTypingCard(page, "touch");
  const input = page.locator("[data-answer-input]");
  // The keyboard's Enter key says what it does: it checks the answer.
  await expect(input).toHaveAttribute("enterkeyhint", "done");
  const cdp = await page.context().newCDPSession(page);

  // Gboard keeps the word being typed in a composition until it is committed (P16): here the
  // whole answer, uncommitted, as after typing its last word.
  const settled = surfaceOf(ex.canonical);
  await compose(cdp, settled);
  await expect(input).toHaveValue(settled);
  const check = page.locator("[data-action=check]");
  await expect(check).toBeEnabled();

  // One tap: the composition ends as focus leaves the field, and the settled text is checked.
  await check.tap();
  const feedback = page.locator("[data-feedback]");
  await expect(feedback).toBeVisible();
  expect(await feedback.getAttribute("data-verdict")).toBe("CORRECT");
  await logged(page, ex).toMatchObject({ input: { method: "text", raw: settled }, outcome: { kind: "CORRECT" } });
});

test("a press on Check that leaves focus in the composing field waits for the composition to end", async ({ page }, info) => {
  const mode = info.project.name === "touch" ? "touch" : "keyboard";
  const ex = await toTypingCard(page, mode);
  const input = page.locator("[data-answer-input]");
  const cdp = await page.context().newCDPSession(page);
  const settled = surfaceOf(ex.canonical);
  await compose(cdp, settled);
  await expect(input).toHaveValue(settled);

  // Record what the field and the player saw, in order: the submit must come after compositionend.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    const field = document.querySelector("[data-answer-input]");
    field?.addEventListener("compositionend", () => seen.push("compositionend"));
    new MutationObserver(() => seen.push(`state:${document.querySelector("[data-lesson-player]")?.getAttribute("data-state") ?? ""}`)).observe(
      document.querySelector("[data-lesson-player]") as Element,
      { attributes: true, attributeFilter: ["data-state"] },
    );
  });
  // A screen reader's activation: a click with no pointer, which moves no focus by itself.
  await page.locator("[data-action=check]").dispatchEvent("click");
  const feedback = page.locator("[data-feedback]");
  await expect(feedback).toBeVisible();
  expect(await feedback.getAttribute("data-verdict")).toBe("CORRECT");
  const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
  expect(seen[0]).toBe("compositionend");
  expect(seen).toContain("state:feedback");
  await logged(page, ex).toMatchObject({ input: { method: "text", raw: settled }, outcome: { kind: "CORRECT" } });
});
