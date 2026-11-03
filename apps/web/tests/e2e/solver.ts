/**
 * A learner who knows every answer. The test rebuilds the same seeded lesson
 * the app builds (core is pure), then answers each exercise by keyboard only or
 * by touch only, the way a person would: number keys and Enter, or taps on
 * options and tiles, with typed text coming from the device's keyboard or IME.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { assembleCourse, buildLesson, type CourseView, type Exercise } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { BundleManifest } from "@nabu/schema";
import { expect, type Page } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;

export type Mode = "keyboard" | "touch";

export const loadCourse = (id: string, orthography: string): CourseView => {
  const manifest = JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;
  const files = new Map<string, unknown>(
    manifest.files.filter((f) => f.role !== "image").map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]),
  );
  const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

export const lessonUrl = (course: string, orthography: string, node: string, seed: number): string =>
  `/?seed=${seed}&sound=off#/${course}/${orthography.replace("/", ".")}/${encodeURIComponent(node)}`;

export const lesson = (course: CourseView, node: string, seed: number): readonly Exercise[] => buildLesson(course, node, { seed });

const player = (page: Page) => page.locator("[data-lesson-player]");

/** Waits until the player shows `ex` ready for an answer. */
export const waitFor = async (page: Page, ex: Exercise): Promise<void> => {
  await expect(player(page)).toHaveAttribute("data-exercise", ex.id);
  await expect(player(page)).toHaveAttribute("data-state", "answering");
};

const press = async (page: Page, mode: Mode, selector: string): Promise<void> => {
  const target = page.locator(selector);
  if (mode === "touch") await target.tap();
  else await target.press("Enter");
};

/** Answers the current exercise correctly, by keyboard or by touch. */
export const answer = async (page: Page, ex: Exercise, mode: Mode): Promise<void> => {
  switch (ex.template) {
    case "select-image":
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
      if (mode === "keyboard") {
        await page.keyboard.press(String(ex.answer + 1));
        await page.keyboard.press("Enter");
      } else {
        await page.locator(`[data-option="${ex.answer}"]`).tap();
        await page.locator("[data-action=check]").tap();
      }
      return;
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2": {
      const placed: number[] = [];
      for (const tile of ex.solution) {
        const remaining = ex.tiles.map((_, i) => i).filter((i) => !placed.includes(i));
        const k = remaining.indexOf(tile);
        if (mode === "keyboard" && k < 9) await page.keyboard.press(String(k + 1));
        else await press(page, mode, `[data-tile="${tile}"]`);
        placed.push(tile);
      }
      await press(page, mode, "[data-action=check]");
      return;
    }
    case "translate-type.l1-l2":
    case "complete-translation": {
      const text = surfaceOf(ex.template === "complete-translation" ? ex.blank : ex.canonical);
      if (mode === "keyboard") {
        await page.keyboard.type(text);
        await page.keyboard.press("Enter");
      } else {
        // Touch: tap the field, then the phone's own keyboard or IME commits the text.
        await page.locator("[data-answer-input]").tap();
        await page.keyboard.insertText(text);
        await page.locator("[data-action=check]").tap();
      }
      return;
    }
    case "match-pairs":
      for (const [left, right] of ex.pairs.entries()) {
        await press(page, mode, `[data-pair="left-${left}"]`);
        await press(page, mode, `[data-pair="right-${right}"]`);
      }
      return;
    case "speak.tier-0":
      await press(page, mode, "[data-rating=good]");
      return;
  }
};

/** Feedback must say "right"; then move on the same way the learner answered. */
export const expectRightAndContinue = async (page: Page, mode: Mode, ex: Exercise): Promise<void> => {
  const feedback = page.locator("[data-feedback]");
  await expect(feedback, ex.id).toBeVisible();
  expect(await feedback.getAttribute("data-verdict"), `${ex.id}: ${await feedback.innerText()}`).toMatch(/^CORRECT/u);
  if (mode === "keyboard") await page.keyboard.press("Enter");
  else await page.locator("[data-action=continue]").tap();
};

export const seriousAxeViolations = async (page: Page): Promise<string[]> => {
  const result = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
};
