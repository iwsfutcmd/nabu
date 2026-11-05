/**
 * The audio check (ADR 0060): every clip of a course, held-back ones too, to listen to and
 * judge. Verdicts are kept on the device and download as a file for `nabu audio verdicts`.
 * The preview server serves the clips from courses/ (audio-check.ts).
 */
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import type { AudioVerdicts } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { parse } from "yaml";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

const indexOf = (course: string): { clips: { item: string; speed: string; sha256: string; qa?: { status?: string } }[] } =>
  parse(readFileSync(new URL(`../../../../courses/${course}/audio/index.yaml`, import.meta.url), "utf8")) as never;

test("every item with a clip can be heard and judged, and the verdicts download", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const index = indexOf("fa");
  const items = new Set(index.clips.map((c) => c.item));
  const failed = index.clips.filter((c) => c.speed === "normal" && c.qa?.status === "fail").length;

  await page.goto("/?sound=off&debug=1#/fa/fa-Arab.standard");
  await page.locator("[data-audio-check-link]").click();
  await expect(page.locator("[data-audio-check=fa]")).toBeVisible();
  await expect(page.locator("[data-audio-item]")).toHaveCount(items.size);
  await expect(page.locator("[data-count=fail] dd")).toHaveText(String(failed));

  // Held-back items are listed too: the filter shows exactly the failed ones (none reviewed yet).
  await page.locator("[data-filter=status]").selectOption("held");
  await expect(page.locator("[data-audio-item]")).toHaveCount(failed);
  await page.locator("[data-filter=status]").selectOption("all");

  // Keys move and judge; a click on "Sounds wrong" opens the note.
  const first = page.locator("[data-audio-item]").nth(0);
  const second = page.locator("[data-audio-item]").nth(1);
  await page.locator("h1").click();
  await page.keyboard.press("j");
  await expect(second).toHaveAttribute("data-current", "true");
  await page.keyboard.press("r");
  await expect(second.locator("[data-action=sounds-right]")).toHaveAttribute("aria-pressed", "true");
  await first.locator("[data-action=sounds-wrong]").click();
  await first.locator("[data-field=note]").fill("too fast");
  await page.locator("h1").click();
  await expect(page.locator("[data-action=export-verdicts]")).toBeVisible();

  // Kept on the device across a reload.
  await page.reload();
  await expect(page.locator("[data-audio-item]").nth(1).locator("[data-action=sounds-right]")).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-filter=mine]").selectOption("wrong");
  await expect(page.locator("[data-audio-item]")).toHaveCount(1);

  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("[data-action=export-verdicts]").click()]);
  const file = JSON.parse(readFileSync(await download.path(), "utf8")) as AudioVerdicts;
  expect(file.course).toBe("fa");
  expect(file.verdicts.map((v) => v.verdict).sort()).toEqual(["right", "wrong"]);
  const wrong = file.verdicts.find((v) => v.verdict === "wrong");
  expect(wrong?.note).toBe("too fast");
  const heard = index.clips.filter((c) => c.item === wrong?.item).map((c) => c.sha256);
  expect([...(wrong?.clips ?? [])].sort()).toEqual(heard.sort());

  const audit = await new AxeBuilder({ page }).include("[data-audio-check]").analyze();
  expect(audit.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("a clip plays from the audio check", async ({ page }) => {
  await page.goto("/?debug=1#/uz/uz-Latn.standard/audio");
  const row = page.locator("[data-audio-item]").first();
  await row.locator("[data-action=play]").click();
  await expect(row.locator("[data-action=play]")).toHaveAttribute("data-playing", "true");
});
