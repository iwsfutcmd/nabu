/**
 * A wrong word can be reported (ADR 0057): under a match-the-pairs exercise's feedback, "One of
 * these is wrong" asks which word, then opens the correction form for that word: its form in
 * every orthography and its meaning. The correction is a sentence_reported event naming the KC.
 */
import { expect, test } from "@playwright/test";
import { answer, loadCourse, logOf, planned, seriousAxeViolations, sessionUrl } from "./solver.ts";

const SEED = 7;
const NOW = new Date("2026-03-10T09:00:00Z");

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

test("match-the-pairs: choose the wrong word, then correct its meaning", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const request = { mode: "lesson", node: "yue.greetings" } as const;
  const [ex] = planned(course, [], request, NOW, SEED);
  if (ex?.template !== "match-pairs") throw new Error("the first card is match-pairs");
  await page.goto(sessionUrl(course, request, SEED));
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  await answer(page, ex, "keyboard");
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "feedback");

  // The one report button beside the feedback (M6), then "One of these is wrong".
  await page.locator("[data-action=report-problem]").click();
  await page.locator("[data-report-dialog] [data-action=mark-incorrect]").click();
  const choose = page.locator("[data-correction-choose]");
  await expect(choose.getByRole("heading")).toHaveText("Which one is wrong?");
  await expect(choose.locator("[data-choose]")).toHaveCount(ex.kcs.length);
  expect(await seriousAxeViolations(page, "[data-correction-choose]")).toEqual([]);

  // Each choice shows the word in its own language and the meaning in the UI's.
  const kc = ex.kcs[1] ?? "";
  const choice = choose.locator(`[data-choose="${kc}"]`);
  await expect(choice.locator('[lang^="yue"]').first()).toBeVisible();
  await choice.click();

  const form = page.locator(`[data-correction-form][data-kind=word][data-item="${kc}"]`);
  await expect(form).toBeVisible();
  await expect(form.getByText("Meaning", { exact: true })).toBeVisible();
  const meaning = form.locator("[data-field=correction-translation]");
  const was = await meaning.inputValue();
  await meaning.fill(`${was} (corrected)`);
  await form.locator("[data-action=send-correction]").click();
  await expect(page.locator("[data-correction-sent]")).toBeVisible();

  const reported = (await logOf(page, "yue")).filter((e) => e.type === "sentence_reported");
  expect(reported).toHaveLength(1);
  expect(reported[0]).toMatchObject({ item: kc, shown: { translation: was }, correction: { translation: `${was} (corrected)` } });
  expect(errors).toEqual([]);
});
