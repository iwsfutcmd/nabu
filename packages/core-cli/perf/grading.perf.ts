/**
 * Phase 1 acceptance (gameplan §16): grading takes under 5 ms at p95 for a
 * typical sentence on a throttled mid-range mobile profile. Chromium runs the
 * bundled core with CDP CPU throttling at 4× (Lighthouse's mid-tier mobile
 * setting); accept sets are compiled up front, only grade() is timed.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import numberingSystems from "@nabu/i18n/generated/numbering-systems.json" with { type: "json" };
import type { BundleManifest } from "@nabu/schema";
import { loadProfileData, loadRawProfiles, REPO } from "../src/load.ts";
import type { BenchCase, BenchResult, CourseCase, FirstAnswerResult } from "./bench.entry.ts";

const THROTTLE = 4;
const BUDGET_MS = 5;
const ZWNJ = "\u200c";

const CASES: readonly BenchCase[] = [
  {
    name: "fa: 4-word sentence, 3 alternatives, ZWNJ paths",
    profile: "fa-Arab/standard",
    accept: `کتاب${ZWNJ}ها روی میز هستند\nکتاب${ZWNJ}ها روی میز است\n[این] کتاب${ZWNJ}ها روی میز هستند @0.5`,
    answers: ["کتاب ها روی میز هستند", "كتابها روي ميز هستمد", "روی میز کتاب\u200cها هستند", "کتاب\u200cها میز"],
  },
  {
    name: "yue: 6 characters, optional particle, variants and homophones",
    profile: "yue-Hant-HK/standard",
    accept: "我哋去飲茶[啦]\n我哋去飲茶呀\n(我哋|我地)一齊去飲茶[啦]",
    answers: ["我哋去飲茶啦", "我们去饮茶啦", "我地去飲茶", "我哋去係茶啦呀呀"],
  },
  {
    name: "uz-Latn: 4 words, optionals, keyboard typos",
    profile: "uz-Latn/standard",
    accept: "[Men] o'zbek tilini o'rganyapman\n[Men] o'zbek tilini o'rganaman\nMen o'zbekchani o'rganyapman @0.5",
    answers: ["men o'zbek tilini o'rganyapman", "Men ozbek tiluni orgamyapman", "o'zbek tili", "Men ingliz tilini o'rganyapman"],
  },
  {
    name: "ar: 3 words, equivalences with notes",
    profile: "ar-Arab/standard",
    accept: "أكلت التفاحة [الحمراء]\nأكلت تفاحة [حمراء]",
    answers: ["اكلت التفاحه الحمراء", "أَكَلْتُ التُّفَّاحَةَ", "شربت الماء", "أكلت التفاحة الحمراء اليوم"],
  },
  {
    name: "tr: casing torture",
    profile: "tr-Latn/standard",
    accept: "[Ben] İstanbul'da yaşıyorum\n[Ben] İstanbul'da oturuyorum",
    answers: ["ISTANBUL'DA YAŞIYORUM", "ben istanbulda yasiyorum", "İstanbul'da yaşıyorum", "Ankara'da"],
  },
];

/** The bundled benchmark in a page with the CPU throttled. */
const benchPage = async (page: Page): Promise<void> => {
  const bundle = await build({
    entryPoints: [resolve(import.meta.dirname, "bench.entry.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
  });
  await page.setContent("<!doctype html><meta charset=utf-8><title>nabu grading bench</title>");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
};

test(`grading p95 < ${BUDGET_MS} ms with ${THROTTLE}× CPU throttling`, async ({ page }) => {
  const profiles = loadRawProfiles();
  const data = loadProfileData();
  await benchPage(page);

  const results = await page.evaluate(
    ([p, d, c]) => (globalThis as unknown as { nabuBench: (...a: unknown[]) => BenchResult[] }).nabuBench(p, d, c, 50),
    [profiles, data, CASES] as const,
  );
  const table = results.map((r) => `${r.name.padEnd(64)} n=${r.samples}  p50=${r.p50.toFixed(2)}  p95=${r.p95.toFixed(2)}  max=${r.max.toFixed(2)} ms`);
  console.log(table.join("\n"));
  await test.info().attach("grading-bench.txt", { body: table.join("\n"), contentType: "text/plain" });
  for (const r of results) expect(r.p95, r.name).toBeLessThan(BUDGET_MS);
});

/** The committed bundle of a course as the app loads it (packages/ui/src/player/load.ts). */
const courseCase = (course: string, orthography: string): CourseCase => {
  const dir = join(REPO, "apps/web/public/bundles", course);
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as BundleManifest;
  const files = manifest.files.filter((f) => f.role !== "image" && f.role !== "audio").map((f) => [f.path, JSON.parse(readFileSync(join(dir, f.path), "utf8")) as unknown] as const);
  return { name: `${course} ${orthography}`, orthography, manifest, files };
};

/**
 * A session's first answer (the review's R5): the largest courses, whose word lexicons took the
 * first Check half a second at 4× before they were built once per course. Once the app has
 * prepared the course (while it is shown), a new session's first answer is within the budget; a
 * course just loaded is reported, not asserted (it depends on the machine more than the rest).
 */
test(`a session's first answer p95 < ${BUDGET_MS} ms with ${THROTTLE}× CPU throttling, once the course is prepared`, async ({ page }) => {
  const courses = [courseCase("es", "es-Latn/standard"), courseCase("apc", "apc-Latn/arabizi")];
  await benchPage(page);
  const results = await page.evaluate(
    ([n, c]) => (globalThis as unknown as { nabuFirstAnswers: (...a: unknown[]) => FirstAnswerResult[] }).nabuFirstAnswers(n, c, 50),
    [numberingSystems, courses] as const,
  );
  const table = results.map(
    (r) =>
      `${r.name.padEnd(28)} just loaded: ${r.cold.map((t) => t.toFixed(0)).join(" / ")} ms   prepared: n=${r.warm.samples}  p50=${r.warm.p50.toFixed(2)}  p95=${r.warm.p95.toFixed(2)}  max=${r.warm.max.toFixed(2)} ms`,
  );
  console.log(table.join("\n"));
  await test.info().attach("first-answer-bench.txt", { body: table.join("\n"), contentType: "text/plain" });
  for (const r of results) expect(r.warm.p95, r.name).toBeLessThan(BUDGET_MS);
});
