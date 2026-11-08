/**
 * Listening cards say what was heard once answered, and what it means: the transcript with the
 * translation of the sentence (listen-tap, listen-type) or the word's gloss (listen-select,
 * minimal-pair). Nothing of either shows before the answer: that would give it away.
 */
import { cardGallery } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import { expect, test } from "@playwright/test";
import { answer, loadCourse, waitFor } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

const LISTENING = ["listen-tap", "listen-type", "listen-select", "minimal-pair"] as const;
const COURSES = [
  ["fa", "fa-Arab/standard"],
  ["yue", "yue-Hant-HK/standard"],
  ["uz", "uz-Latn/standard"],
  ["apc", "apc-Arab/standard"],
  ["hbo", "hbo-Hebr/tiberian"],
] as const;

for (const [id, orthography] of COURSES) {
  for (const template of LISTENING) {
    test(`${id} ${template}: once answered, what was heard and what it means`, async ({ page }) => {
      const course = loadCourse(id, orthography);
      const ex = cardGallery(course, 7).find((c) => c.template === template)?.exercise;
      test.skip(ex === undefined, `${id}'s gallery has no ${template} card`);
      if (ex === undefined || !("translation" in ex) || ex.translation === undefined) throw new Error(`${ex?.id ?? template} has no translation`);
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`/?sound=off&debug=1#/${id}/${orthography.replace("/", ".")}/cards`);
      await page.locator(`[data-card="${template}"] [data-action=try-card]`).click();
      await waitFor(page, ex);
      await expect(page.locator("[data-transcript]")).toHaveCount(0);

      await answer(page, ex, "keyboard");
      await expect(page.locator("[data-feedback]")).toBeVisible();
      const transcript = page.locator("[data-transcript]");
      await expect(transcript).toBeVisible();
      // The meaning, in the support language's own tag and direction, whatever the target's.
      const meaning = transcript.locator(`[data-nabu-text][lang="${ex.translation.lang}"]`);
      await expect(meaning).toHaveText(surfaceOf(ex.translation));
      await expect(meaning).toHaveAttribute("dir", "ltr");
      expect(errors).toEqual([]);
    });
  }
}
