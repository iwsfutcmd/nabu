/**
 * A learner who knows every answer. Core is pure, so the test plans the same
 * session the app plans: the same learner state (the event log), the same
 * clock (Playwright fixes the page's Date) and the same seed. It then answers
 * each exercise by keyboard only or by touch only, the way a person would:
 * number keys and Enter, or taps on options and tiles, with typed text coming
 * from the device's keyboard or IME.
 */
import { restrictMedia } from "@nabu/core/offline";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { paceOf, pathNodes, plan, replay, type SessionRequest } from "@nabu/core/learner";
import { assembleCourse, lessonNodes, MEDIA_ROLES, retryOf, speechSupportOf, type CourseView, type Exercise } from "@nabu/core/lesson";
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
    manifest.files.filter((f) => !MEDIA_ROLES.has(f.role)).map((f) => [f.path, JSON.parse(readFileSync(join(BUNDLES, id, f.path), "utf8")) as unknown]),
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

/**
 * The course as the app teaches it right now (Phase 10): online, all of it; offline, only the media
 * this device has stored (what the service worker keeps in "nabu-bundles").
 */
export const teachable = async (page: Page, course: CourseView): Promise<CourseView> => {
  const offline = await page.evaluate(() => !navigator.onLine);
  if (!offline) return course;
  const stored = new Set(
    await page.evaluate(async (id) => {
      const prefix = new URL(`bundles/${id}/`, window.location.href).href;
      const keys = await (await caches.open("nabu-bundles")).keys();
      return keys.map((r) => r.url).filter((u) => u.startsWith(prefix)).map((u) => u.slice(prefix.length));
    }, course.id),
  );
  return restrictMedia(course, (path) => stored.has(path));
};

/** The local date (YYYY-MM-DD) at `now` in a time zone, as the app's clock stamps it in a browser there. */
const localDateIn = (now: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

/**
 * The session the app plans for this log, clock and seed (no speech server: tones scored on the
 * device), in the browser's time zone: UTC (playwright.config.ts) unless the spec sets another. The
 * plan aims at the skills of words met before the learner's local date (ADR 0101).
 */
export const planned = (course: CourseView, log: readonly LearnerEvent[], request: SessionRequest, now: Date, seed: number, timeZone = "UTC"): readonly Exercise[] => {
  const state = replay(log);
  // At the pace the app reads from the same log (ADR 0105); the tests never choose one.
  const pace = paceOf(course, state, now.toISOString()).band;
  return plan(course, state, request, { now: now.toISOString(), today: localDateIn(now, timeZone), seed, speech: speechSupportOf(course, 0), pace }).exercises;
};

/**
 * A learner who already finished every lesson before `node`, two days before
 * `now`, answering everything right: the events their device would hold.
 */
export const historyBefore = (course: CourseView, node: string, now: Date): LearnerEvent[] => {
  // Every lesson before `node` on the path (stories included in the order, lessons played).
  const lessons = new Set(lessonNodes(course).map((n) => n.node.id));
  const path = pathNodes(course).map((n) => n.node.id);
  const nodes = path.slice(0, Math.max(0, path.indexOf(node))).filter((id) => lessons.has(id));
  const events: LearnerEvent[] = [];
  const bundle = manifestOf(course.id).id;
  let n = 0;
  let clock = now.getTime() - 2 * DAY;
  const uuid = (): string => `00000000-0000-7000-8000-${(++n).toString(16).padStart(12, "0")}`;
  for (const id of nodes) {
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
    const summary = { completed: true, exercises: graded(exercises), correctFirstTry: graded(exercises), retries: 0, skipped: 0 };
    events.push({ ...base(), type: "session_completed", mode: "lesson", node: id, summary });
  }
  return events;
};

/** Unique per test run: emails and seeded event ids must not collide between tests on one server. */
export const runTag = (): string => `${Date.now().toString(16)}${Math.floor(Math.random() * 0xffff).toString(16)}`.slice(-12).padStart(12, "0");

/** Events with fresh ids: the server deduplicates event ids across all users, so seeded history uploaded twice would vanish. */
export const freshIds = (events: readonly LearnerEvent[], tag: string = runTag()): LearnerEvent[] =>
  events.map((e, i) => ({ ...e, id: `${tag.slice(0, 8)}-${tag.slice(8, 12)}-7000-8000-${i.toString(16).padStart(12, "0")}` }));

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
    case "listen-select":
    case "minimal-pair":
    case "story-choose":
    case "story-complete":
    case "tone-identify":
    case "letter-read":
    case "word-read":
    case "vocalize":
      await choose(page, mode, ex.answer);
      return;
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "listen-tap":
    case "story-arrange":
    case "word-write": {
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
    case "complete-translation":
    case "listen-type": {
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
    case "transcribe": {
      const text = surfaceOf(ex.reading);
      const field = page.locator("[data-answer-input]");
      if (mode === "touch") await field.tap();
      await field.selectText();
      await page.keyboard.insertText(text);
      await press(page, mode, "[data-action=check]");
      return;
    }
    case "match-pairs":
    case "letter-pairs":
      for (const [left, right] of ex.pairs.entries()) {
        await press(page, mode, `[data-pair="left-${left}"]`);
        await press(page, mode, `[data-pair="right-${right}"]`);
      }
      return;
    case "speak.tier-0":
      await press(page, mode, "[data-rating=good]");
      return;
    case "speak":
    case "listen-speak":
      // The test browser has no microphone: recording fails over to rating yourself.
      await press(page, mode, "[data-action=record]");
      await press(page, mode, "[data-rating=good]");
      return;
  }
};

/** Can the solver get this exercise wrong on purpose? (Choices only: pick another option.) */
export const canMiss = (ex: Exercise): boolean =>
  ex.template === "choose-translation" ||
  ex.template === "select-image" ||
  ex.template === "gap-fill" ||
  ex.template === "char-read" ||
  ex.template === "reading-disambiguation" ||
  ex.template === "listen-select" ||
  ex.template === "minimal-pair";

const miss = async (page: Page, ex: Exercise, mode: Mode): Promise<void> => {
  if (!canMiss(ex) || !("answer" in ex) || !("options" in ex)) throw new Error(`cannot miss ${ex.template}`);
  await choose(page, mode, (ex.answer + 1) % ex.options.length);
};

/** The cards a session's score counts: a self-rated speaking card is no verdict (P5). */
export const graded = (exercises: readonly Exercise[]): number => exercises.filter((e) => e.template !== "speak.tier-0").length;

/** Feedback must say "right" (or, for a self-rating, nothing either way); then move on the same way the learner answered. */
export const expectRightAndContinue = async (page: Page, mode: Mode, ex: Exercise): Promise<void> => {
  const feedback = page.locator("[data-feedback]");
  await expect(feedback, ex.id).toBeVisible();
  expect(await feedback.getAttribute("data-verdict"), `${ex.id}: ${await feedback.innerText()}`).toMatch(/^(CORRECT|SELF_RATED$)/u);
  await next(page, mode);
};

const next = async (page: Page, mode: Mode): Promise<void> => {
  if (mode === "keyboard") await page.keyboard.press("Enter");
  else await page.locator("[data-action=continue]").tap();
};

export const seriousAxeViolations = async (page: Page, scope = "[data-lesson-player]"): Promise<string[]> => {
  const result = await new AxeBuilder({ page }).include(scope).analyze();
  return result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
};

/** The exercise the player shows under `id`: the planned one, or its retry ("…#2", "…#3") as core reshuffles it. */
export const retried = (planned: Exercise, id: string): Exercise => {
  const attempt = Number(id.split("#")[1] ?? "1");
  let ex = planned;
  for (let a = 2; a <= attempt; a++) ex = retryOf(ex, a);
  return ex;
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
    // A card that comes back has its options or tiles in a new order (P4): the player's own reshuffle.
    const ex = retried(planned, id);
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
