/**
 * Readings on new words only (ADR 0131): Cantonese shows Jyutping over the words whose reading the
 * learner has yet to read right on a reading card, and leaves it off the others; "All words" in the
 * display menu brings every reading back, and the choice holds for the course's next session.
 */
import { allLexemes, asksOf, lessonNodes, skillOf } from "@nabu/core/lesson";
import type { AnswerSubmitted, LearnerEvent } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { freshIds, historyBefore, loadCourse, seedLog, sessionUrl } from "./solver.ts";

const SEED = 7;
const NOW = new Date("2026-05-12T09:00:00Z");
const DAY = 86_400_000;

/** One first try, right for every part given, on a card of `template`. */
const answered = (model: AnswerSubmitted, template: AnswerSubmitted["exercise"]["template"], parts: readonly string[], at: Date): LearnerEvent => {
  const refs = parts;
  return {
    ...model,
    session: "00000000-0000-7000-a000-00000000d0d1",
    clientTime: at.toISOString(),
    localDate: at.toISOString().slice(0, 10),
    exercise: { id: `${template}:all`, template, item: "all", parts: refs },
    attempt: 1,
    outcome: { kind: "CORRECT", notes: [], labels: [], parts: refs.map((part) => ({ part, skill: skillOf(template, part), status: asksOf(template, part) ? ("right" as const) : ("given" as const) })) },
  };
};

test("Jyutping fades from the words whose reading the learner has read right, and All words brings it back", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const course = loadCourse("yue", "yue-Hant-HK/standard");
  const [first, second] = lessonNodes(course).map((n) => n.node.id);
  if (first === undefined || second === undefined) throw new Error("yue has two lessons");
  const model = historyBefore(course, second, new Date(NOW.getTime() - 3 * DAY)).find((e): e is AnswerSubmitted => e.type === "answer_submitted");
  if (model === undefined) throw new Error("yue's first lesson has answers");
  // Every word met two days ago, and its reading read right on a reading card the day after.
  const words = allLexemes(course).map((lexeme) => String(lexeme.id));
  const history = freshIds([answered(model, "choose-translation", words, new Date(NOW.getTime() - 2 * DAY)), answered(model, "char-read", words, new Date(NOW.getTime() - DAY))]);

  await page.clock.setFixedTime(NOW);
  await seedLog(page, history);
  await page.goto(sessionUrl(course, { mode: "lesson", node: first }, SEED));
  const player = page.locator("[data-lesson-player]");
  await expect(player).toHaveAttribute("data-state", "answering");
  // The Cantonese is on the card, its readings left off: every word's reading has been shown.
  await expect(player.locator("[data-orthography='yue-Hant-HK/standard'] [data-kind=lexical]").first()).toBeVisible();
  await expect(player.locator("rt")).toHaveCount(0);

  await player.locator("[data-action=display]").click();
  const readings = page.locator("[data-display-menu] [data-toggle=readings]");
  await expect(readings).toHaveAttribute("data-readings-shown", "new");
  await readings.locator("[data-reading=all]").click();
  await expect(player.locator("rt")).not.toHaveCount(0);

  // The course's next session keeps the choice.
  await page.goto(sessionUrl(course, { mode: "lesson", node: second }, SEED));
  await expect(page.locator("[data-lesson-player]")).toHaveAttribute("data-state", "answering");
  await expect(page.locator("[data-lesson-player] rt")).not.toHaveCount(0);
});
