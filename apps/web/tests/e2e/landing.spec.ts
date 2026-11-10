/**
 * The site's landing page (landing.ts), written from the bundles and the catalog: every course of
 * the demo with its scripts, lessons and stories; each script's sample in its own language and
 * direction, in its own font; its links open the app. It meets contrast in light and dark, and
 * fits a phone. The test serves it beside the app, as the site does.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { pathNodes } from "@nabu/core/learner";
import { loadTranslator } from "@nabu/i18n";
import { expect, test, type Page } from "@playwright/test";
import { demoStylesheets, landingPage } from "../../landing.ts";
import { loadCourse } from "./solver.ts";

const WEB = resolve(import.meta.dirname, "../..");
const BUNDLES = join(WEB, "public/bundles");
const COURSES = (JSON.parse(readFileSync(join(BUNDLES, "index.json"), "utf8")) as { courses: { id: string; orthographies: string[] }[] }).courses;

/** Directions written out, not computed with the code under test. */
const DIRECTION: Readonly<Record<string, "ltr" | "rtl">> = {
  "fa-Arab/standard": "rtl",
  "apc-Arab/standard": "rtl",
  "apc-Latn/arabizi": "ltr",
  "hbo-Hebr/tiberian": "rtl",
  "yue-Hant-HK/standard": "ltr",
  "lzh-Hant/standard": "ltr",
  "grc-Grek/polytonic": "ltr",
  "tok-Qaap/sitelen-pona": "ltr",
  "uz-Cyrl/standard": "ltr",
};

const open = async (page: Page): Promise<void> => {
  const html = await landingPage({
    bundles: BUNDLES,
    demo: "/",
    stylesheets: demoStylesheets(join(WEB, "dist/index.html"), "/"),
    repository: "https://example.invalid/nabu",
  });
  await page.route("**/landing.html", (route) => route.fulfill({ body: html, contentType: "text/html; charset=utf-8" }));
  await page.goto("/landing.html");
  await page.evaluate(async () => document.fonts.ready);
};

const serious = async (page: Page): Promise<string[]> =>
  (await new AxeBuilder({ page }).include("[data-landing]").analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

test("the landing page lists every course with its scripts, and its links open the app", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await open(page);
  const t = await loadTranslator("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("#courses")).toHaveText(t.format("landing.courses.title"));

  expect(COURSES.length).toBeGreaterThanOrEqual(9);
  await expect(page.locator("[data-course]")).toHaveCount(COURSES.length);
  for (const { id, orthographies } of COURSES) {
    const card = page.locator(`[data-course="${id}"]`);
    const course = loadCourse(id, orthographies[0] ?? "");
    const path = pathNodes(course);
    await expect(card.locator(".facts li").first()).toHaveText(t.format("landing.course.lessons", { count: path.filter((e) => e.kind === "lesson").length }));
    for (const orthography of orthographies) {
      const script = card.locator(`[data-orthography="${orthography}"]`);
      await expect(script.locator("a")).toHaveAttribute("href", `/#/${id}/${orthography.replace("/", ".")}`);
      // A sample in its own language and direction.
      const sample = script.locator(".sample");
      await expect(sample).toHaveCount(1);
      expect((await sample.getAttribute("lang"))?.startsWith(`${orthography.split("-")[0] ?? ""}-`), orthography).toBe(true);
      await expect(sample).toHaveAttribute("dir", DIRECTION[orthography] ?? "ltr");
    }
  }
  // sitelen pona's logographs are private-use code points: they need the course's own font.
  const sitelen = page.locator('[data-orthography="tok-Qaap/sitelen-pona"] .sample');
  const glyphs = (await sitelen.textContent()) ?? "";
  expect(glyphs.length).toBeGreaterThan(0);
  expect(await page.evaluate((text) => document.fonts.check('22px "sitelen seli kiwen juniko"', text), glyphs)).toBe(true);

  expect(await serious(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await serious(page)).toEqual([]);
  await page.emulateMedia({ colorScheme: "light" });

  // Its links open the app: the app itself, and a course in one of its scripts.
  await expect(page.locator("[data-open-app]")).toHaveAttribute("href", "/");
  await page.locator('[data-orthography="hbo-Hebr/tiberian"] a').click();
  await expect(page.locator("[data-course-path=hbo]")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the landing page fits a phone", async ({ page }, info) => {
  test.skip(info.project.name !== "touch", "a phone's screen");
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
