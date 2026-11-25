/**
 * Words in lessons (P1): a word of a card's target text can be tapped for its meaning where that
 * gives nothing away (the words around a gap, from the start; what a sentence means, once answered),
 * never on the options; what it means and its forms open in a dialog (ADR 0157); and the card that
 * first shows a word the lesson teaches says it is new.
 */
import { baseIdOf, cardGallery, formCellAt, lexemeForms, sampleExercise, type Exercise } from "@nabu/core/lesson";
import { expect, test, type Page } from "@playwright/test";
import { encodeCard } from "../../src/card-link.ts";
import { answer, loadCourse, planned, sessionUrl, waitFor } from "./solver.ts";

const NOW = new Date("2026-03-10T09:00:00Z");
const SEED = 7;

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

const tryCard = async (page: Page, template: string): Promise<void> => {
  await page.goto(`/?sound=off&debug=1#/apc/apc-Arab.standard/cards`);
  await page.locator(`[data-card="${template}"] [data-action=try-card]`).click();
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
};

test("gap-fill: the words around the gap say what they mean; the options never do", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await tryCard(page, "gap-fill");
  await expect(page.locator("[data-options] button[data-index]")).toHaveCount(0);
  const word = page.locator("[data-gap-sentence] button[data-index]").first();
  await word.click();
  await expect(word).toHaveAttribute("aria-pressed", "true");
  // What it means opens in a dialog, which takes the focus (ADR 0157).
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("data-gloss-panel", "");
  await expect(dialog.locator("[data-gloss-id]")).not.toHaveCount(0);
  // Its close button closes it and gives the focus back to the word; Escape does too.
  await dialog.locator("[data-action=close-gloss]").click();
  await expect(page.locator("[data-gloss-panel]")).toHaveCount(0);
  await expect(word).toHaveAttribute("aria-pressed", "false");
  await expect(word).toBeFocused();
  await word.click();
  await expect(page.locator("[data-gloss-panel]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-gloss-panel]")).toHaveCount(0);
  // Still the card: looking a word up never moves the lesson on or quits it.
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  expect(errors).toEqual([]);
});

test("a verb of a typed answer opens with its forms, the one it stands in marked (ADR 0157)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("apc", "apc-Arab/standard");
  // A typing card whose answer has a word whose lexeme has a paradigm (apc's verbs and adjectives), opened
  // from its link as debug mode copies it (as the owner did: "I wake up in the morning").
  const paradigmAt = (ex: Exercise): number =>
    ex.template !== "translate-type.l1-l2"
      ? -1
      : ex.canonical.tokens.findIndex((t) => {
          const id = baseIdOf(t);
          return id !== undefined && lexemeForms(course, id)?.source === "paradigm";
        });
  const ex = sampleExercise(course, "translate-type.l1-l2", 7, (e) => paradigmAt(e) >= 0);
  if (ex?.template !== "translate-type.l1-l2") throw new Error("apc has a translate-type.l1-l2 card with a verb");
  const at = paradigmAt(ex);
  const lexeme = baseIdOf(ex.canonical.tokens[at] as never) as string;
  const forms = lexemeForms(course, lexeme)?.rows ?? [];
  await page.goto(`/?sound=off&debug=1#/apc/apc-Arab.standard/card/${await encodeCard(ex)}`);
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  await answer(page, ex, "keyboard");
  await expect(page.locator("[data-feedback]")).toBeVisible();
  // The right answer comes again for its words to be looked up.
  await page.locator(`[data-solution] button[data-index="${at}"]`).click();
  const table = page.getByRole("dialog").locator(`[data-gloss-forms="${lexeme}"]`);
  await expect(table).toBeVisible();
  await expect(table.locator("tr[data-form-cell]")).toHaveCount(forms.length);
  await expect(table.locator("tr[aria-current=true]")).toHaveAttribute("data-form-cell", formCellAt(course, ex.canonical, at, lexeme) ?? "");
  await expect(table.locator("tr[aria-current=true]")).toBeInViewport();
  // The forms are the course's script, right to left inside the chrome's left to right.
  await expect(table.locator("th [data-nabu-text]").first()).toHaveAttribute("dir", "rtl");
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "feedback");
  expect(errors).toEqual([]);
});

test("choose the meaning: the sentence's words say what they mean only once it is answered", async ({ page }) => {
  const course = loadCourse("apc", "apc-Arab/standard");
  const ex = cardGallery(course, 7).find((c) => c.template === "choose-translation")?.exercise;
  if (ex === undefined) throw new Error("apc has a choose-translation card");
  await tryCard(page, "choose-translation");
  const prompt = page.locator("[data-lesson-player] [data-ink-container=prompt]");
  await expect(prompt.locator("button[data-index]")).toHaveCount(0);
  await answer(page, ex, "keyboard");
  await expect(page.locator("[data-feedback]")).toBeVisible();
  await prompt.locator("button[data-index]").first().click();
  await expect(page.locator("[data-gloss-panel] [data-gloss-id]")).not.toHaveCount(0);
  // Still the feedback: tapping a word never moves the lesson on.
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "feedback");
});

test("the first card of a lesson says its words are new", async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const request = { mode: "lesson", node: "yue.greetings" } as const;
  const [first] = planned(course, [], request, NOW, SEED);
  if (first === undefined) throw new Error("the lesson has cards");
  await page.goto(sessionUrl(course, request, SEED));
  await waitFor(page, first);
  await expect(page.locator("[data-lesson-player] [data-new-word-tag]")).toHaveText(/New words?/u);
  const introduced = course.units.flatMap((u) => u.nodes).find((n) => n.id === request.node)?.introduces ?? [];
  const shown = ((await page.locator("[data-lesson-player] [data-new-words]").getAttribute("data-new-words")) ?? "").split(" ");
  expect(shown.length).toBeGreaterThan(0);
  for (const kc of shown) expect(introduced).toContain(kc);
});
