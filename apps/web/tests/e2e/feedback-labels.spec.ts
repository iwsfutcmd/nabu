/**
 * Feedback names what a miss is (ADR 0148): a typed Spanish answer that spells a word with the
 * right sounds and another letter (the profile's own same-sound spellings: k for qu, z for s…) is
 * not accepted, and its headline says "Not quite." (it is the same word, not another). What the
 * miss is is said once: the profile's note where it is about that word (es: sound-alike), the
 * orthographic label's line naming both words where no note is (the unit tests' fui for fuy).
 */
import { createGrader, gradeExercise, lessonNodes, profileOf, type Exercise, type TranslateType } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { LearnerEvent } from "@nabu/schema";
import { expect, test } from "@playwright/test";
import { answer, expectRightAndContinue, freshIds, historyBefore, loadCourse, planned, seedLog, seriousAxeViolations, sessionUrl, waitFor } from "./solver.ts";

const NOW = new Date("2026-05-12T09:00:00Z");
const SEED = 11;

interface Found {
  readonly node: string;
  readonly history: readonly LearnerEvent[];
  readonly exercises: readonly Exercise[];
  readonly card: TranslateType;
  readonly typed: string;
  /** The words the miss is about, as the grade lines them up: expected, then typed. */
  readonly pair: readonly [string, string];
  /** The note the grade raised on that word, if any (sound-alike): it says what the label would. */
  readonly note: string | undefined;
}

test("a word with the right sound and the wrong letter: not accepted, not called another word, and what it is said once", async ({ page }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const course = loadCourse("es", "es-Latn/standard");
  const grader = createGrader(course);
  const projection = profileOf(course, course.orthography).projection;
  if (projection?.from !== "spelling") throw new Error("es reads its sound off its spelling");

  // The first lesson whose session types a sentence with a word the profile could spell otherwise,
  // with the same sounds: the solver's right answer with that word so spelled is orthographic alone,
  // the same word and no other (a capital's first letter left alone: Ké for Qué is fine too).
  const found = ((): Found | undefined => {
    for (const { node } of lessonNodes(course).slice(0, 12)) {
      const history = freshIds(historyBefore(course, node.id, NOW));
      const exercises = planned(course, history, { mode: "lesson", node: node.id }, NOW, SEED);
      for (const ex of exercises) {
        if (ex.template !== "translate-type.l1-l2") continue;
        const right = surfaceOf(ex.canonical);
        for (const token of ex.canonical.tokens.filter((t) => t.kind === "lexical")) {
          for (const other of projection.spellings(token.surface)) {
            const typed = right.replace(token.surface, other);
            const o = gradeExercise(ex, { tag: "text", text: typed }, grader);
            const op = o.alignment?.find((a) => a.labels?.includes("orthographic") === true);
            if (o.labels?.length !== 1 || o.labels[0] !== "orthographic" || (op?.op !== "match" && op?.op !== "substitute")) continue;
            return { node: node.id, history, exercises, card: ex, typed, pair: [op.expected, op.actual], note: op.note };
          }
        }
      }
    }
    return undefined;
  })();
  if (found === undefined) throw new Error("es's first lessons type a word that can be spelled otherwise with the same sounds");
  const { card, typed, pair, note } = found;

  await page.clock.setFixedTime(NOW);
  if (found.history.length > 0) await seedLog(page, found.history);
  await page.goto(sessionUrl(course, { mode: "lesson", node: found.node }, SEED));
  // Every card before it answered right, as the solver does.
  for (const ex of found.exercises) {
    await waitFor(page, ex);
    if (ex.id === card.id) break;
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }

  await page.keyboard.type(typed);
  await page.keyboard.press("Enter");
  const feedback = page.locator("[data-feedback]");
  await expect(feedback).toHaveAttribute("data-verdict", "WRONG_WORD");
  await expect(feedback).not.toHaveAttribute("data-right", /.*/u);
  // The same word misspelled: not "a different word".
  await expect(feedback.locator("p").first()).toHaveText("Not quite.");
  const line = feedback.locator("[data-label=orthographic]");
  if (note !== undefined) {
    // The note is about that word: it says it, and the label's line would say it again.
    await expect(feedback.locator(`[data-note="${note}"]`)).toHaveCount(1);
    await expect(line).toHaveCount(0);
  } else {
    await expect(line).toHaveText(`Right sound, wrong letter: ${pair[0]}, not ${pair[1]}.`);
    // The two words, each in its own language through <T>.
    const words = line.locator("[data-nabu-text]");
    await expect(words).toHaveCount(2);
    await expect(words.nth(0)).toHaveText(pair[0]);
    await expect(words.nth(1)).toHaveText(pair[1]);
    await expect(words.nth(0)).toHaveAttribute("lang", /^es/u);
  }
  // Nothing calls it another word, or another form.
  await expect(feedback.locator("[data-label=lexical], [data-label=grammatical]")).toHaveCount(0);
  expect(await seriousAxeViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});
