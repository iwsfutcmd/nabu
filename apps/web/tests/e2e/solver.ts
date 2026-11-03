/**
 * A learner who knows every answer. Core is pure, so the test plans the same
 * session the app plans: the same learner state (the event log), the same
 * clock (Playwright fixes the page's Date) and the same seed. It then answers
 * each exercise by keyboard only or by touch only, the way a person would:
 * number keys and Enter, or taps on options and tiles, with typed text coming
 * from the device's keyboard or IME.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { plan, replay, type SessionRequest } from "@nabu/core/learner";
import { assembleCourse, lessonNodes, type CourseView, type Exercise } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { BundleManifest, LearnerEvent, OrthographyId } from "@nabu/schema";
import { expect, type Page } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "../../../..");
const BUNDLES = join(ROOT, "apps/web/public/bundles");
const numberingSystems = JSON.parse(readFileSync(join(ROOT, "packages/i18n/src/generated/numbering-systems.json"), "utf8")) as Record<string, string>;
const DAY = 86_400_000;

export type Mode = "keyboard" | "touch";

const manifestOf = (id: string): BundleManifest => JSON.parse(readFileSync(join(BUNDLES, id, "manifest.json"), "utf8")) as BundleManifest;

export const loadCourse = (id: string, orthography: string): CourseView => {
  const manifest = manifestOf(id);
  const files = new Map<string, unknown>(
    manifest.files.filter((f) => f.role !== "image").map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]),
  );
  const course = assembleCourse({ manifest, files, numberingSystems }, orthography);
  if (!course.ok) throw new Error(JSON.stringify(course.error));
  return course.value;
};

const route = (course: CourseView): string => `#/${course.id}/${course.orthography.replace("/", ".")}`;

export const sessionUrl = (course: CourseView, request: SessionRequest, seed: number): string =>
  `/?seed=${seed}&sound=off${route(course)}/${request.mode === "lesson" ? encodeURIComponent(request.node) : request.mode}`;

/** The course path. The seed stays in the query string, so sessions opened from the path use it too. */
export const pathUrl = (course: CourseView, seed: number): string => `/?seed=${seed}&sound=off${route(course)}`;

/** Follows a link or button the way the learner would: Enter on it, or a tap. */
export const activate = async (page: Page, mode: Mode, selector: string): Promise<void> => {
  const target = page.locator(selector);
  if (mode === "touch") await target.tap();
  else {
    await target.focus();
    await page.keyboard.press("Enter");
  }
};

/** The session the app plans for this log, clock and seed. */
export const planned = (course: CourseView, log: readonly LearnerEvent[], request: SessionRequest, now: Date, seed: number): readonly Exercise[] =>
  plan(course, replay(log), request, { now: now.toISOString(), seed }).exercises;

/**
 * A learner who already finished every lesson before `node`, two days before
 * `now`, answering everything right: the events their device would hold.
 */
export const historyBefore = (course: CourseView, node: string, now: Date): LearnerEvent[] => {
  const nodes = lessonNodes(course).map((n) => n.node.id);
  const events: LearnerEvent[] = [];
  const bundle = manifestOf(course.id).id;
  let n = 0;
  let clock = now.getTime() - 2 * DAY;
  const uuid = (): string => `00000000-0000-7000-8000-${(++n).toString(16).padStart(12, "0")}`;
  for (const id of nodes.slice(0, Math.max(0, nodes.indexOf(node)))) {
    const exercises = planned(course, events, { mode: "lesson", node: id }, new Date(clock), 1);
    const session = uuid();
    const base = () => {
      clock += 10_000;
      const at = new Date(clock).toISOString();
      return {
        id: uuid(),
        schema: 1 as const,
        device: "e2e-history",
        course: course.id,
        orthography: course.orthography as OrthographyId,
        support: course.supportKey,
        bundle,
        session,
        clientTime: at,
        localDate: at.slice(0, 10),
        tz: "UTC",
      };
    };
    events.push({ ...base(), type: "session_started", mode: "lesson", node: id, seed: 1, exercises: exercises.length, planner: "e2e" });
    for (const ex of exercises) {
      events.push({
        ...base(),
        type: "answer_submitted",
        exercise: { id: ex.id, template: ex.template, item: ex.item, kcs: [...ex.kcs] },
        attempt: 1,
        input: { method: "choice", latencyMs: 3000 },
        outcome: { kind: "CORRECT", notes: [], kcs: ex.kcs.map((kc) => ({ kc, status: "right" as const })) },
      });
    }
    const summary = { completed: true, exercises: exercises.length, correctFirstTry: exercises.length, retries: 0, skipped: 0 };
    events.push({ ...base(), type: "session_completed", mode: "lesson", node: id, summary });
  }
  return events;
};

/** Waits for the app's store, then writes events into it (as a device that already has this history). */
export const seedLog = async (page: Page, events: readonly LearnerEvent[]): Promise<void> => {
  await page.goto("/?sound=off#/");
  await page.waitForFunction(() => window.nabu !== undefined);
  await page.evaluate(async (e) => window.nabu?.append(e), events as LearnerEvent[]);
};

/** The device's log for a course, read back from the app. */
export const logOf = async (page: Page, course: string): Promise<LearnerEvent[]> => {
  await page.waitForFunction(() => window.nabu !== undefined);
  return page.evaluate(async (c) => [...((await window.nabu?.eventsOf(c)) ?? [])], course);
};

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

const choose = async (page: Page, mode: Mode, index: number): Promise<void> => {
  if (mode === "keyboard") {
    await page.keyboard.press(String(index + 1));
    await page.keyboard.press("Enter");
  } else {
    await page.locator(`[data-option="${index}"]`).tap();
    await page.locator("[data-action=check]").tap();
  }
};

/** Answers the current exercise correctly, by keyboard or by touch. */
export const answer = async (page: Page, ex: Exercise, mode: Mode): Promise<void> => {
  switch (ex.template) {
    case "select-image":
    case "choose-translation":
    case "gap-fill":
    case "char-read":
    case "reading-disambiguation":
      await choose(page, mode, ex.answer);
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

/** Can the solver get this exercise wrong on purpose? (Choices only: pick another option.) */
export const canMiss = (ex: Exercise): boolean =>
  ex.template === "choose-translation" || ex.template === "select-image" || ex.template === "gap-fill" || ex.template === "char-read" || ex.template === "reading-disambiguation";

const miss = async (page: Page, ex: Exercise, mode: Mode): Promise<void> => {
  if (!canMiss(ex) || !("answer" in ex) || !("options" in ex)) throw new Error(`cannot miss ${ex.template}`);
  await choose(page, mode, (ex.answer + 1) % ex.options.length);
};

/** Feedback must say "right"; then move on the same way the learner answered. */
export const expectRightAndContinue = async (page: Page, mode: Mode, ex: Exercise): Promise<void> => {
  const feedback = page.locator("[data-feedback]");
  await expect(feedback, ex.id).toBeVisible();
  expect(await feedback.getAttribute("data-verdict"), `${ex.id}: ${await feedback.innerText()}`).toMatch(/^CORRECT/u);
  await next(page, mode);
};

const next = async (page: Page, mode: Mode): Promise<void> => {
  if (mode === "keyboard") await page.keyboard.press("Enter");
  else await page.locator("[data-action=continue]").tap();
};

export const seriousAxeViolations = async (page: Page): Promise<string[]> => {
  const result = await new AxeBuilder({ page }).include("[data-lesson-player]").analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
};

export interface PlayOptions {
  /** Planned exercise ids to answer wrong the first time; the player brings them back. */
  readonly miss?: ReadonlySet<string>;
  /** Run axe on every exercise and its feedback (keyboard passes). */
  readonly axe?: boolean;
}

/**
 * Plays the session through to its summary, following the page: planned
 * exercises in order, then the retries the player appends ("id#2"). Returns
 * the ids it saw, in order, and any serious axe violations.
 */
export const playSession = async (page: Page, exercises: readonly Exercise[], mode: Mode, options: PlayOptions = {}): Promise<{ seen: string[]; violations: string[] }> => {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const seen: string[] = [];
  const violations: string[] = [];
  for (;;) {
    await expect(player(page)).toHaveAttribute("data-state", /^(answering|finished)$/u);
    if ((await player(page).getAttribute("data-state")) === "finished") break;
    const id = (await player(page).getAttribute("data-exercise")) ?? "";
    const base = id.split("#")[0] ?? id;
    const planned = byId.get(base);
    if (planned === undefined) throw new Error(`the app showed ${id}, which the solver did not plan`);
    if (!id.includes("#")) expect(id, "planned order").toBe(exercises[seen.filter((s) => !s.includes("#")).length]?.id);
    seen.push(id);
    const ex = { ...planned, id };
    if (options.axe === true) violations.push(...(await seriousAxeViolations(page)).map((v) => `${id}: ${v}`));
    if (options.miss?.has(id) === true) {
      await miss(page, ex, mode);
      const feedback = page.locator("[data-feedback]");
      await expect(feedback).toBeVisible();
      expect(await feedback.getAttribute("data-verdict"), id).toBe("WRONG");
      await next(page, mode);
      continue;
    }
    await answer(page, ex, mode);
    await expect(page.locator("[data-feedback]")).toBeVisible();
    if (options.axe === true) violations.push(...(await seriousAxeViolations(page)).map((v) => `${id} feedback: ${v}`));
    await expectRightAndContinue(page, mode, ex);
  }
  if (options.axe === true) violations.push(...(await seriousAxeViolations(page)).map((v) => `summary: ${v}`));
  return { seen, violations };
};
