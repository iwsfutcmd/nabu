/**
 * The audio check (ADR 0060): every clip of a course, held-back ones too, to listen to and
 * judge. Verdicts are kept on the device and download as a file for `nabu audio verdicts`.
 * The preview server serves the clips from courses/ (audio-check.ts).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import type { AudioVerdicts, BundleAudio, BundleManifest } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { parse } from "yaml";
import { writeAudioCheck, type AudioCheckData } from "../../audio-check.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

interface IndexClip {
  readonly item: string;
  readonly speed: string;
  readonly sha256: string;
  readonly qa?: { readonly status?: string };
  readonly provenance?: { readonly status?: string };
  readonly rejected?: unknown;
}

const indexOf = (course: string): { clips: IndexClip[] } =>
  parse(readFileSync(new URL(`../../../../courses/${course}/audio/index.yaml`, import.meta.url), "utf8")) as never;

/** The items whose clips a course's bundle carries: what learners get. */
const bundledAudioOf = (course: string): Readonly<Record<string, unknown>> => {
  const bundle = new URL(`../../public/bundles/${course}/`, import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", bundle), "utf8")) as BundleManifest;
  const file = manifest.files.find((f) => f.role === "audio-index");
  return file === undefined ? {} : (JSON.parse(readFileSync(new URL(file.path, bundle), "utf8")) as BundleAudio).items;
};

test("every item with a clip can be heard and judged, and the verdicts download", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const index = indexOf("fa");
  const items = new Set(index.clips.map((c) => c.item));
  const failed = index.clips.filter((c) => c.speed === "normal" && c.qa?.status === "fail").length;
  // Held back: what the compiler left out of the learners' bundle.
  const shipped = bundledAudioOf("fa");
  const held = [...items].filter((item) => shipped[item] === undefined).length;

  await page.goto("/?sound=off&debug=1#/fa/fa-Arab.standard");
  await page.locator("[data-audio-check-link]").click();
  await expect(page.locator("[data-audio-check=fa]")).toBeVisible();
  await expect(page.locator("[data-audio-item]")).toHaveCount(items.size);
  await expect(page.locator("[data-count=fail] dd")).toHaveText(String(failed));

  // Held-back items are listed too: the filter shows exactly those.
  await page.locator("[data-filter=status]").selectOption("held");
  await expect(page.locator("[data-audio-item]")).toHaveCount(held);
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

test("a course still keeping an older voice opens on its own voice; the voice filter shows the others", async ({ page }) => {
  const cast = (parse(readFileSync(new URL("../../../../courses/uz/course.yaml", import.meta.url), "utf8")) as { audio: { voices: { provider: string; voice: string }[] } }).audio.voices.map((v) => `${v.provider}:${v.voice}`);
  const clips = (indexOf("uz") as { clips: { item: string; speed: string; synthesis?: { provider: string; voice: string } }[] }).clips;
  const byItem = new Map<string, string>();
  for (const c of [...clips].sort((a, b) => Number(a.speed !== "normal") - Number(b.speed !== "normal")))
    if (!byItem.has(c.item)) byItem.set(c.item, c.synthesis === undefined ? "recorded" : `${c.synthesis.provider}:${c.synthesis.voice}`);
  const made = new Set(byItem.values());
  const count = (voice: string): number => [...byItem.values()].filter((v) => v === voice).length;

  // Straight to the check, as the landing page links to it: it needs no debug mode.
  await page.goto("/#/uz/uz-Latn.standard/audio");
  await expect(page.locator("[data-audio-item]").first()).toBeVisible();
  await expect(page.locator("[data-debug-notice]")).toHaveCount(0);
  if (made.size < 2) {
    await expect(page.locator("[data-filter=voice]")).toHaveCount(0);
    await expect(page.locator("[data-audio-item]")).toHaveCount(byItem.size);
    return;
  }
  const own = cast.find((v) => made.has(v)) ?? "";
  await expect(page.locator("[data-filter=voice]")).toHaveValue(own);
  await expect(page.locator("[data-audio-item]")).toHaveCount(count(own));
  await expect(page.locator(`[data-audio-item]:not([data-voice="${own}"])`)).toHaveCount(0);
  for (const voice of made) {
    await page.locator("[data-filter=voice]").selectOption(voice);
    await expect(page.locator("[data-audio-item]")).toHaveCount(count(voice));
  }
  await page.locator("[data-filter=voice]").selectOption("all");
  await expect(page.locator("[data-audio-item]")).toHaveCount(byItem.size);
});

test("slow plays the same clip, slowed with its pitch kept (ADR 0062)", async ({ page }) => {
  type Play = { src: string; rate: number; pitch: boolean };
  await page.addInitScript(() => {
    const plays: Play[] = [];
    (window as unknown as { plays: Play[] }).plays = plays;
    const play = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "play")?.value as (this: HTMLMediaElement) => Promise<void>;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      plays.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch });
      return play.call(this);
    };
  });
  await page.goto("/#/uz/uz-Latn.standard/audio");
  const row = page.locator("[data-audio-item]").first();
  await row.locator("[data-action=play]").click();
  await row.locator("[data-action=play-slow]").click();
  const plays = await page.evaluate(() => (window as unknown as { plays: Play[] }).plays);
  expect(plays).toHaveLength(2);
  expect(plays[1]?.src).toBe(plays[0]?.src);
  expect(plays[0]?.rate).toBe(1);
  expect(plays[1]).toMatchObject({ rate: 0.75, pitch: true });
});

test("a clip plays from the audio check", async ({ page }) => {
  await page.goto("/#/uz/uz-Latn.standard/audio");
  const row = page.locator("[data-audio-item]").first();
  await row.locator("[data-action=play]").click();
  await expect(row.locator("[data-action=play]")).toHaveAttribute("data-playing", "true");
});

test("Pages' copy points at the clips the bundles carry and copies only the others", ({ page: _ }, info) => {
  const out = info.outputPath("audio-check");
  const bundles = fileURLToPath(new URL("../../public/bundles", import.meta.url));
  writeAudioCheck(out, undefined, bundles);
  const data = JSON.parse(readFileSync(join(out, "fa", "index.json"), "utf8")) as AudioCheckData;
  const bundled = data.bundled ?? {};
  expect(Object.keys(bundled).length).toBeGreaterThan(0);
  const sha = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");
  for (const clip of data.index.clips) {
    const at = bundled[clip.file];
    if (at === undefined) expect(sha(join(out, "fa", clip.file))).toBe(clip.sha256);
    else {
      expect(existsSync(join(out, "fa", clip.file))).toBe(false);
      expect(sha(join(bundles, at.slice("bundles/".length)))).toBe(clip.sha256);
    }
  }
});
