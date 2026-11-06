/**
 * Sign-off (ADR 0071, Phase 13 acceptance): in the browser, a reviewer signs off a whole unit
 * from the sentence list; the sign-offs stay on the device and download as the file
 * `nabu review apply` reads, each with the sha256 of what was shown. Learners see none of it.
 */
import { createHash } from "node:crypto";
import { correctablesByUnit, sentenceSignoffText, storySignoffText } from "@nabu/core/corrections";
import type { SignOffs } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { loadCourse, seriousAxeViolations } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

test("a reviewer signs off a whole unit, and the sign-offs download with what was shown", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("apc", "apc-Arab/standard");
  const [first] = correctablesByUnit(course).filter((u) => u.sentences.length > 0);
  if (first === undefined) throw new Error("apc has sentences");
  const expected = new Map<string, string>([
    ...first.unit.sentences.filter((s) => !s.id.startsWith("drill.")).map((s) => [`sentence:${s.id}`, sha256(sentenceSignoffText(s))] as const),
    ...(first.unit.stories ?? []).map((s) => [`story:${s.id}`, sha256(storySignoffText(s))] as const),
  ]);

  await page.goto("/?sound=off&debug=1#/apc/apc-Arab.standard/sentences");
  const list = page.locator(`[data-unit-items="${first.unit.id}"]`);
  await expect(list).toBeVisible();
  const toggles = list.locator("[data-action=sign-off]");
  await expect(toggles).toHaveCount(expected.size);
  expect(await seriousAxeViolations(page, "[data-sentences-page]")).toEqual([]);

  // One on and off again: nothing to download.
  await toggles.first().click();
  await expect(toggles.first()).toHaveAttribute("data-signed-off", "true");
  await expect(page.locator("[data-action=export-signoffs]")).toBeVisible();
  await toggles.first().click();
  await expect(page.locator("[data-action=export-signoffs]")).toHaveCount(0);

  // The whole unit at once.
  await page.locator("[data-action=sign-off-unit]").click();
  await expect(list.locator("[data-action=sign-off][data-signed-off]")).toHaveCount(expected.size);
  await page.reload();
  await expect(list.locator("[data-action=sign-off][data-signed-off]")).toHaveCount(expected.size);

  const downloading = page.waitForEvent("download");
  await page.locator("[data-action=export-signoffs]").click();
  const file = await downloading;
  expect(file.suggestedFilename()).toBe("nabu-signoffs-apc.json");
  const chunks: Buffer[] = [];
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer);
  const data = JSON.parse(Buffer.concat(chunks).toString("utf8")) as SignOffs;
  expect(data.course).toBe("apc");
  expect(new Map(data.signoffs.map((s) => [`${s.kind}:${s.item}`, s.shown]))).toEqual(expected);
  for (const s of data.signoffs) expect(Number.isNaN(Date.parse(s.at))).toBe(false);
  expect(errors).toEqual([]);
});

test("learners see no sign-off controls", async ({ page }) => {
  await page.goto("/?sound=off&debug=0#/apc/apc-Arab.standard/sentences");
  await expect(page.locator("[data-sentences-page=apc]")).toBeVisible();
  await expect(page.locator("[data-action=mark-incorrect]").first()).toBeVisible();
  await expect(page.locator("[data-action=sign-off], [data-action=sign-off-unit]")).toHaveCount(0);
});
