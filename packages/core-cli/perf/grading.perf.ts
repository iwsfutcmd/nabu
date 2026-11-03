/**
 * Phase 1 acceptance (gameplan §16): grading takes under 5 ms at p95 for a
 * typical sentence on a throttled mid-range mobile profile. Chromium runs the
 * bundled core with CDP CPU throttling at 4× (Lighthouse's mid-tier mobile
 * setting); accept sets are compiled up front, only grade() is timed.
 */
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "esbuild";
import { loadProfileData, loadRawProfiles } from "../src/load.ts";
import type { BenchCase, BenchResult } from "./bench.entry.ts";

const THROTTLE = 4;
const BUDGET_MS = 5;
const ZWNJ = "‌";

const CASES: readonly BenchCase[] = [
  {
    name: "fa: 4-word sentence, 3 alternatives, ZWNJ paths",
    profile: "fa-Arab/standard",
    accept: `کتاب${ZWNJ}ها روی میز هستند\nکتاب${ZWNJ}ها روی میز است\n[این] کتاب${ZWNJ}ها روی میز هستند @0.5`,
    answers: ["کتاب ها روی میز هستند", "كتابها روي ميز هستمد", "روی میز کتاب‌ها هستند", "کتاب‌ها میز"],
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

test(`grading p95 < ${BUDGET_MS} ms with ${THROTTLE}× CPU throttling`, async ({ page }) => {
  const bundle = await build({
    entryPoints: [resolve(import.meta.dirname, "bench.entry.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
  });
  const profiles = loadRawProfiles();
  const data = loadProfileData();

  await page.setContent("<!doctype html><meta charset=utf-8><title>nabu grading bench</title>");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });

  const results = await page.evaluate(
    ([p, d, c]) => (globalThis as unknown as { nabuBench: (...a: unknown[]) => BenchResult[] }).nabuBench(p, d, c, 50),
    [profiles, data, CASES] as const,
  );
  const table = results.map((r) => `${r.name.padEnd(64)} n=${r.samples}  p50=${r.p50.toFixed(2)}  p95=${r.p95.toFixed(2)}  max=${r.max.toFixed(2)} ms`);
  console.log(table.join("\n"));
  await test.info().attach("grading-bench.txt", { body: table.join("\n"), contentType: "text/plain" });
  for (const r of results) expect(r.p95, r.name).toBeLessThan(BUDGET_MS);
});
