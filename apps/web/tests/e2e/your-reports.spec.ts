/**
 * What came of a report (ADR 0115). The confirmation says where a report goes: to the course's
 * reviewers (an intake, or an account), to them once the learner signs in (a server, no account),
 * or nowhere. And the device compares its own reports with the course it has, asking no server: the
 * sentence list and Your reports say when a correction is in the course now, or a claimed answer is
 * graded as the learner said, and the course page counts them beside the link.
 */
import type { AnswerReported, AnswerSubmitted, CorrectionFields, LearnerEvent, OrthographyId, SentenceReported } from "@nabu/schema";
import { expect, test, type Page } from "@playwright/test";
import { API_PORT } from "./ports.ts";
import { answer, expectRightAndContinue, freshIds, historyBefore, loadCourse, logOf, planned, seedLog, seriousAxeViolations, waitFor } from "./solver.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const NOW = new Date("2026-05-12T09:00:00Z");
const SEED = 7;
const FA = "fa-Arab/standard";
/** fa's s.6 as the app shows it: with the vowel marks the course's vocalization adds (ADR 0053). */
const SHOWN = "سَلام مَریَم!";

/** The confirmations need one desktop pass; Your reports is laid out on a phone too. */
const desktopOnly = (project: string): void => test.skip(project !== "keyboard", "one desktop pass is enough");

const dialog = (page: Page) => page.locator("[data-correction-dialog]");

/** Corrects fa's s.5 from the sentence list (a note), and returns the confirmation. */
const correctS5 = async (page: Page, query: string) => {
  await page.goto(`/?sound=off${query}#/fa/fa-Arab.standard/sentences`);
  await page.locator('[data-correctable="s.5"] [data-action=mark-incorrect]').click();
  await dialog(page).locator("[data-field=correction-note]").fill("A comma after the greeting?");
  await dialog(page).locator("[data-action=send-correction]").click();
  await expect(dialog(page)).toHaveCount(0);
  return page.locator("[data-correction-sent]");
};

test("a correction's confirmation says where it goes: nowhere, to a reviewer once signed in, or to the reviewers", async ({ page }, info) => {
  desktopOnly(info.project.name);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // No intake and no server: it stays on this device, and says so.
  let sent = await correctS5(page, "");
  await expect(sent).toHaveAttribute("data-reach", "device");
  await expect(sent).toHaveText("Thanks! Your correction stays on this device: no reviewer will see it.");
  // A server, and no account: it goes once the learner signs in.
  sent = await correctS5(page, `&api=${encodeURIComponent(API)}`);
  await expect(sent).toHaveAttribute("data-reach", "sign-in");
  await expect(sent).toHaveText("Thanks! A reviewer will see your correction once you sign in.");
  // An intake beside the app (ADR 0055): to the reviewers.
  await page.route("**/reports.json", (r) => r.fulfill({ json: { firestore: { project: "nabu-test", apiKey: "test-key" } } }));
  await page.route("https://firestore.googleapis.com/**", (r) => r.fulfill({ json: {} }));
  sent = await correctS5(page, "");
  await expect(sent).toHaveAttribute("data-reach", "reviewers");
  await expect(sent).toHaveText("Thanks! A reviewer will check your correction.");
  expect(errors).toEqual([]);
});

test("a claimed answer's confirmation says it reaches a reviewer once the learner signs in", async ({ page }, info) => {
  desktopOnly(info.project.name);
  // Plays up to yue's first typed answer and answers it wrong, as ai.spec.ts does.
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const request = { mode: "lesson", node: "yue.names" } as const;
  const url = (hash: string): string => `/?seed=${SEED}&sound=off&api=${encodeURIComponent(API)}${hash}`;
  await page.clock.setFixedTime(NOW);
  const history = freshIds(historyBefore(course, request.node, NOW));
  await page.goto(url("#/"));
  if (history.length > 0) await seedLog(page, history);
  const exercises = planned(course, history, request, NOW, SEED);
  const at = exercises.findIndex((e) => e.template === "translate-type.l1-l2");
  expect(at).toBeGreaterThanOrEqual(0);
  await page.goto(url(`#/yue/yue-Hant-HK.standard/${request.node}`));
  for (const ex of exercises.slice(0, at)) {
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }
  const ex = exercises[at];
  if (ex === undefined) throw new Error("no typing exercise");
  await waitFor(page, ex);
  await page.locator("[data-answer-input]").fill("拜拜");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
  await page.locator("[data-action=report-problem]").click();
  await page.locator("[data-report-dialog] [data-action=report]").click();
  const reported = page.locator("[data-reported]");
  await expect(reported).toHaveAttribute("data-reach", "sign-in");
  await expect(reported).toHaveText("Counted as right. A reviewer will see your report once you sign in.");
  expect((await logOf(page, "yue")).some((e) => e.type === "answer_reported")).toBe(true);
});

const stamp = (n: number) => ({
  id: `00000000-0000-7000-8000-${String(n).padStart(12, "0")}`,
  schema: 1 as const,
  device: "e2e-device",
  session: "00000000-0000-7000-8000-ffffffffffff",
  clientTime: `2026-05-0${String(n)}T10:00:00.000Z`,
  localDate: `2026-05-0${String(n)}`,
  tz: "UTC",
  bundle: "0".repeat(64),
});

const correction = (n: number, item: string, shown: CorrectionFields, fix: CorrectionFields, note?: string): SentenceReported => ({
  ...stamp(n),
  type: "sentence_reported",
  course: "fa",
  orthography: FA as OrthographyId,
  support: "en",
  item,
  shown,
  correction: fix,
  ...(note === undefined ? {} : { note }),
});

const claim = (n: number, text: string): AnswerReported => ({
  ...stamp(n),
  type: "answer_reported",
  course: "fa",
  orthography: FA as OrthographyId,
  support: "en",
  answer: `00000000-0000-7000-8000-${String(100 + n).padStart(12, "0")}`,
  exercise: { id: "translate-type.l1-l2:s.6", template: "translate-type.l1-l2", item: "s.6", kcs: [] } satisfies AnswerSubmitted["exercise"],
  text,
});

test("what came of the reports: the course page counts them, the sentence list and Your reports say so", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const s6 = { forms: { [FA]: { text: SHOWN } }, translation: "Hello, Maryam!" };
  const events: LearnerEvent[] = [
    // Made against an older version of the course, which said Mariam: the course says Maryam now, as suggested.
    correction(1, "s.6", { ...s6, translation: "Hello, Mariam!" }, { translation: "Hello, Maryam!" }),
    // A note alone, about s.5 as the course still has it.
    correction(2, "s.5", { forms: { [FA]: { text: "نَه، مَمنون." } }, translation: "No, thank you." }, {}, "Too formal for friends?"),
    // The course accepts this answer now; and still marks this one wrong.
    claim(3, "سلام مریم"),
    claim(4, "خداحافظ"),
  ];
  await seedLog(page, events);

  // The course page links to them, with how many the course took up.
  await page.goto("/?sound=off#/fa/fa-Arab.standard");
  const link = page.locator("[data-reports-link]");
  await expect(link).toHaveAttribute("data-count", "2");
  await expect(link).toContainText("Your reports");
  await expect(link).toContainText("2 in the course now");

  await link.click();
  const reports = page.locator("[data-reports-page=fa]");
  await expect(reports).toBeVisible();
  // No intake and no server here: they stay on this device, and the page says so.
  await expect(page.locator("[data-reports-reach]")).toHaveAttribute("data-reports-reach", "device");
  const entries = reports.locator("[data-report]");
  await expect(entries).toHaveCount(4);
  // Newest first.
  await expect(entries.nth(0)).toHaveAttribute("data-report-status", "pending");
  await expect(entries.nth(1)).toHaveAttribute("data-report-status", "accepted");
  await expect(entries.nth(1).locator("[data-report-badge]")).toHaveText("The course accepts this answer now. Thank you!");
  await expect(entries.nth(2)).toHaveAttribute("data-report-status", "pending");
  await expect(entries.nth(3)).toHaveAttribute("data-report-status", "adopted");
  await expect(entries.nth(3).locator("[data-report-badge]")).toHaveText("In the course now. Thank you!");
  await expect(reports.locator("[data-report-badge]")).toHaveCount(2);
  // The answer is Persian, right to left, through <T>; the note takes its own direction.
  const answerText = entries.nth(1).locator("[data-nabu-text]", { hasText: "سلام مریم" }).last();
  await expect(answerText).toHaveAttribute("dir", "rtl");
  await expect(entries.nth(2).locator("[data-report-note]")).toHaveAttribute("dir", "auto");
  expect(await seriousAxeViolations(page, "[data-reports-page]")).toEqual([]);
  // On a phone too, nothing runs off the side.
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= document.scrollingElement!.clientWidth)).toBe(true);

  // The sentence list says so too; a correction the course took up is no longer one to change.
  await page.goto("/?sound=off#/fa/fa-Arab.standard/sentences");
  const taken = page.locator('[data-correctable="s.6"]');
  await expect(taken).toHaveAttribute("data-correction-status", "adopted");
  await expect(taken.locator("[data-correction-status=adopted]")).toHaveText("In the course now. Thank you!");
  await expect(taken.locator("[data-action=mark-incorrect]")).toHaveText("This sentence is wrong");
  const open = page.locator('[data-correctable="s.5"]');
  await expect(open.locator("[data-correction-pending]")).toBeVisible();
  await expect(open.locator("[data-action=mark-incorrect]")).toHaveText("Change your correction");
  // Only the correction still open downloads: the other has nothing left to apply.
  await expect(page.locator("[data-action=export-corrections]")).toContainText("(1)");
  // A new correction of s.6 starts from what the course has now, not from the one it took up.
  await taken.locator("[data-action=mark-incorrect]").click();
  await expect(dialog(page).locator("[data-field=correction-translation]")).toHaveValue("Hello, Maryam!");
  await expect(dialog(page).locator("[data-field=correction-note]")).toHaveValue("");
  expect(errors).toEqual([]);
});
