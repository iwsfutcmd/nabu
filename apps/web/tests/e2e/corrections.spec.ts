/**
 * Corrections in the app (ADR 0051): any learner can mark a sentence or story line as wrong and
 * say what it should be, from the sentence list, from an exercise's feedback, or from a story
 * line. Each correction is a sentence_reported event: it shows on the device at once, downloads
 * as the file `nabu corrections apply` reads, and after sign-up reaches the server's review queue.
 *
 * Fields take their own text's lang and dir (Persian right to left, Jyutping in its own tag), and
 * nothing is sent while an input method is composing.
 */
import { readFileSync } from "node:fs";
import { seededRng } from "@nabu/core/lesson";
import { allStories, storyScript } from "@nabu/core/story";
import { surfaceOf } from "@nabu/core/text";
import type { LearnerEvent, SentenceCorrection, SentenceReported, TaggedText } from "@nabu/schema";
import { expect, test, type Page } from "@playwright/test";
import { API_PORT } from "./ports.ts";
import { answer, expectRightAndContinue, freshIds, historyBefore, loadCourse, logOf, planned, runTag as run, seedLog, seriousAxeViolations, waitFor } from "./solver.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const ADMIN = "e2e-review-token";
const SEED = 7;
const NOW = new Date("2026-05-12T09:00:00Z");
const ZWNJ = "\u200c";
const url = (hash: string): string => `/?seed=${SEED}&sound=off&api=${encodeURIComponent(API)}${hash}`;

const reports = async (page: Page, course: string): Promise<SentenceReported[]> => (await logOf(page, course)).filter((e: LearnerEvent): e is SentenceReported => e.type === "sentence_reported");

const dialog = (page: Page) => page.locator("[data-correction-dialog]");
const textField = (page: Page, orthography: string) => dialog(page).locator(`[data-orthography="${orthography}"] [data-field=correction-text]`);

test.describe("my answer should be accepted, in a story", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("a gap filled with another word is reported as the whole line, and reaches the review queue", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const course = loadCourse("yue", "yue-Hant-HK/standard");
    const [story] = allStories(course);
    if (story === undefined) throw new Error("yue has a story");
    const script = storyScript(course, story, seededRng(SEED));
    const question = script.steps.flatMap((st) => (st.tag === "question" && st.ex.template === "story-complete" ? [st.ex] : []))[0];
    if (question?.template !== "story-complete") throw new Error("the yue story fills a gap");
    const reader = page.locator("[data-story-reader]");
    await page.goto(url(`#/yue/yue-Hant-HK.standard/story/${story.node}`));
    for (let guard = 0; guard < 100 && (await reader.getAttribute("data-exercise")) !== question.id; guard += 1) {
      await expect(reader).toHaveAttribute("data-state", /^(reading|asking)$/u);
      if ((await reader.getAttribute("data-state")) === "reading") await page.keyboard.press("Enter");
      else {
        // Questions before it: answered right.
        const id = (await reader.getAttribute("data-exercise")) ?? "";
        const ex = script.steps.flatMap((st) => (st.tag === "question" && st.ex.id === id ? [st.ex] : []))[0];
        if (ex === undefined) throw new Error(id);
        await answer(page, ex, "keyboard");
        await page.keyboard.press("Enter");
      }
    }
    await expect(page.locator("[data-story-question]")).toHaveAttribute("data-state", "answering");
    const wrong = question.answer === 0 ? 1 : 0;
    await page.locator(`[data-option="${String(wrong)}"]`).click();
    await page.locator("[data-story-reader] [data-action=check]").click();
    await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
    await page.locator("[data-story-reader] [data-action=report]").click();
    await expect(page.locator("[data-reported]")).toBeVisible();
    const text = `${surfaceOf(question.before)}${surfaceOf(question.options[wrong] as TaggedText)}${surfaceOf(question.after)}`;
    await expect.poll(async () => (await logOf(page, "yue")).find((e) => e.type === "answer_reported")).toMatchObject({ text, exercise: { template: "story-complete", item: question.item } });

    await page.goto(url("#/"));
    await page.locator("[data-field=email]").fill(`story-reporter-${run()}@example.org`);
    await page.locator("[data-field=password]").fill("long enough password");
    await page.locator("[data-action=account-submit]").click();
    await expect(page.locator("[data-sync-status]")).toHaveAttribute("data-pending", "0");
    const res = await page.request.get(`${API}/admin/v1/reports?status=pending&course=yue`, { headers: { Authorization: `Bearer ${ADMIN}` } });
    const { reports: rows } = (await res.json()) as { reports: { item: string; template: string; answer: string }[] };
    expect(rows.some((r) => r.item === question.item && r.template === "story-complete" && r.answer === text)).toBe(true);
    expect(errors).toEqual([]);
  });
});

/** s.6 as the app shows it: سلام مریم! with the vowel marks the course's vocalization adds (ADR 0053). */
const SHOWN = "\u0633\u064e\u0644\u0627\u0645 \u0645\u064e\u0631\u06cc\u064e\u0645!";

test.describe("corrections", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("the sentence list: correct a Persian sentence, see it marked, and download the file", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(url("#/fa/fa-Arab.standard"));
    await page.locator("[data-sentences-link]").click();
    await expect(page.locator("[data-sentences-page=fa]")).toBeVisible();
    expect(await seriousAxeViolations(page, "[data-sentences-page]")).toEqual([]);

    // Nothing changed: the form says so and records nothing.
    await page.locator('[data-correctable="s.5"] [data-action=mark-incorrect]').click();
    await dialog(page).locator("[data-action=send-correction]").click();
    await expect(dialog(page).locator("[data-correction-error=unchanged]")).toBeVisible();
    await dialog(page).locator("[data-action=cancel-correction]").click();
    await expect(dialog(page)).toHaveCount(0);

    const item = page.locator('[data-correctable="s.6"]');
    await item.locator("[data-action=mark-incorrect]").click();
    await expect(dialog(page)).toBeVisible();
    const text = textField(page, "fa-Arab/standard");
    await expect(text).toHaveValue(SHOWN);
    await expect(text).toHaveAttribute("lang", "fa-Arab-IR");
    await expect(text).toHaveAttribute("dir", "rtl");
    const translation = dialog(page).locator("[data-field=correction-translation]");
    await expect(translation).toHaveAttribute("dir", "ltr");
    expect(await seriousAxeViolations(page, "[data-correction-dialog]")).toEqual([]);

    // While an input method composes, the correction cannot be sent.
    await text.dispatchEvent("compositionstart");
    await expect(dialog(page).locator("[data-action=send-correction]")).toBeDisabled();
    await text.dispatchEvent("compositionend");
    await expect(dialog(page).locator("[data-action=send-correction]")).toBeEnabled();

    // Typed as the learner types it (a ZWNJ kept, an accent decomposed); stored NFC.
    await text.fill(`سلام${ZWNJ}ها، مریم!`);
    await translation.fill("Hello, Mariam!");
    await dialog(page).locator("[data-field=correction-note]").fill("Café style greeting");
    await dialog(page).locator("[data-action=send-correction]").click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator("[data-correction-sent]")).toBeVisible();
    await expect(item).toHaveAttribute("data-corrected", "true");
    await expect(item.locator("[data-correction-pending]")).toBeVisible();

    await expect.poll(async () => (await reports(page, "fa")).length).toBe(1);
    const [event] = await reports(page, "fa");
    expect(event).toMatchObject({
      item: "s.6",
      orthography: "fa-Arab/standard",
      shown: { forms: { "fa-Arab/standard": { text: SHOWN } }, translation: "Hello, Maryam!" },
      correction: { forms: { "fa-Arab/standard": { text: `سلام${ZWNJ}ها، مریم!` } }, translation: "Hello, Mariam!" },
      note: "Café style greeting",
    });

    // The device's own corrections, as the file a reviewer applies.
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-action=export-corrections]").click()]);
    expect(download.suggestedFilename()).toBe("nabu-corrections-fa.jsonl");
    const rows = readFileSync(await download.path(), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as SentenceCorrection);
    expect(rows).toEqual([expect.objectContaining({ id: event?.id, item: "s.6", status: "pending", reports: 1, notes: ["Café style greeting"], correction: event?.correction })]);

    // Opening it again starts from the learner's correction.
    await item.locator("[data-action=mark-incorrect]").click();
    await expect(textField(page, "fa-Arab/standard")).toHaveValue(`سلام${ZWNJ}ها، مریم!`);
    await dialog(page).locator("[data-action=cancel-correction]").click();
    expect(errors).toEqual([]);
  });

  test("a Cantonese word's Jyutping, in every orthography's own tag", async ({ page }) => {
    await page.goto(url("#/yue/yue-Hant-HK.standard/sentences"));
    await page.locator('[data-correctable="s.6"] [data-action=mark-incorrect]').click();
    const reading = dialog(page).locator("[data-field=correction-reading][data-token='1']");
    await expect(reading).toHaveValue("aa3");
    await expect(reading).toHaveAttribute("lang", "yue-Latn-HK-jyutping");
    await reading.fill("aa4");
    await dialog(page).locator("[data-action=send-correction]").click();
    await expect.poll(async () => (await reports(page, "yue")).at(-1)?.correction).toEqual({
      forms: { "yue-Hant-HK/standard": { readings: [{ token: 1, surface: "呀", scheme: "jyutping", reading: "aa4" }] } },
    });
  });

  test("from a lesson's feedback and a story line; after sign-up, both reach the review queue", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.clock.setFixedTime(NOW);
    const course = loadCourse("yue", "yue-Hant-HK/standard");
    const request = { mode: "lesson", node: "yue.who" } as const;
    const history = freshIds(historyBefore(course, request.node, NOW));
    await page.goto(url("#/"));
    if (history.length > 0) await seedLog(page, history);
    const exercises = planned(course, history, request, NOW, SEED);
    const sentences = new Set(course.units.flatMap((u) => u.sentences.map((s) => s.id)));
    const at = exercises.findIndex((e) => sentences.has(e.item));
    expect(at).toBeGreaterThanOrEqual(0);
    await page.goto(url(`#/yue/yue-Hant-HK.standard/${request.node}`));
    for (const ex of exercises.slice(0, at)) {
      await waitFor(page, ex);
      await answer(page, ex, "keyboard");
      await expectRightAndContinue(page, "keyboard", ex);
    }
    const ex = exercises[at];
    if (ex === undefined) throw new Error("no sentence exercise");
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expect(page.locator("[data-feedback]")).toBeVisible();
    await page.locator(`[data-action=mark-incorrect][data-item="${ex.item}"]`).click();
    const translation = dialog(page).locator("[data-field=correction-translation]");
    const fixed = `${await translation.inputValue()} (corrected)`;
    await translation.fill(fixed);
    await dialog(page).locator("[data-action=send-correction]").click();
    await expect(page.locator("[data-correction-sent]")).toBeVisible();
    // The lesson goes on.
    await page.locator("[data-action=continue]").click();
    await expect(page.locator("[data-lesson-player]")).not.toHaveAttribute("data-exercise", ex.id);

    // A story line, by its step in the story.
    const [story] = allStories(course);
    if (story === undefined) throw new Error("yue has a story");
    await page.goto(url(`#/yue/yue-Hant-HK.standard/story/${story.node}`));
    const line = page.locator("[data-story-reader] [data-line='0']");
    await line.locator("[data-action=mark-incorrect]").click();
    const step = story.steps.findIndex((s) => s.line !== undefined);
    await expect(dialog(page).locator("[data-correction-form]")).toHaveAttribute("data-step", String(step));
    await dialog(page).locator("[data-field=correction-note]").fill("Too formal for friends.");
    await dialog(page).locator("[data-action=send-correction]").click();
    await expect(line.locator("[data-correction-sent]")).toBeVisible();

    // Sign up: the log, corrections included, uploads; the review queue has both.
    await page.goto(url("#/"));
    await page.locator("[data-field=email]").fill(`corrector-${run()}@example.org`);
    await page.locator("[data-field=password]").fill("long enough password");
    await page.locator("[data-action=account-submit]").click();
    await expect(page.locator("[data-sync-status]")).toHaveAttribute("data-pending", "0");
    const res = await page.request.get(`${API}/admin/v1/corrections?status=pending&course=yue`, { headers: { Authorization: `Bearer ${ADMIN}` } });
    expect(res.status()).toBe(200);
    const { corrections } = (await res.json()) as { corrections: SentenceCorrection[] };
    expect(corrections.some((c) => c.item === ex.item && c.correction.translation === fixed)).toBe(true);
    expect(corrections.some((c) => c.item === story.id && c.step === step && c.notes.includes("Too formal for friends."))).toBe(true);
    expect(errors).toEqual([]);
  });
});
