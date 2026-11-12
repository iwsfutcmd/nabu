/**
 * Phase 8 in the app (gameplan §13, §16).
 *
 * Against the real API, which runs without a model as most instances will: a wrong typed answer
 * can be reported offline, the report syncs at sign-up and lands in the review queue, and no AI
 * help is offered (the judge falls back to accept sets plus reports, §13.1).
 *
 * With AI responses stubbed at the network (no model involved): the judge's revision upgrades
 * the answer retroactively, and an explanation renders its segments in their own languages.
 */
import { expect, test, type Page } from "@playwright/test";
import { replay } from "@nabu/core/learner";
import type { AnswerSubmitted, Explanation, LearnerEvent } from "@nabu/schema";
import { API_PORT } from "./ports.ts";
import { answer, expectRightAndContinue, freshIds, historyBefore, loadCourse, logOf, planned, runTag as run, seedLog, waitFor } from "./solver.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const ADMIN = "e2e-review-token";
const NOW = new Date("2026-05-12T09:00:00Z");
const SEED = 7;
const course = loadCourse("yue", "yue-Hant-HK/standard");
const request = { mode: "lesson", node: "yue.names" } as const;
const url = (hash: string): string => `/?seed=${SEED}&sound=off&api=${encodeURIComponent(API)}${hash}`;

/** Plays up to the lesson's typing exercise and answers it wrong; returns the logged answer. */
const answerWrong = async (page: Page): Promise<AnswerSubmitted> => {
  await page.clock.setFixedTime(NOW);
  const history = freshIds(historyBefore(course, request.node, NOW));
  await page.goto(url("#/"));
  if (history.length > 0) await seedLog(page, history);
  const exercises = planned(course, history, request, NOW, SEED);
  const at = exercises.findIndex((e) => e.template === "translate-type.l1-l2");
  expect(at).toBeGreaterThanOrEqual(0);
  await page.goto(url(`#/yue/yue-Hant-HK.standard/${request.node}`));
  for (const ex of exercises.slice(0, at)) {
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expectRightAndContinue(page, "keyboard", ex);
  }
  const ex = exercises[at];
  if (ex === undefined) throw new Error("no typing exercise");
  await waitFor(page, ex);
  await page.locator("[data-answer-input]").fill("拜拜");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "WRONG");
  const log = await logOf(page, "yue");
  const logged = log.find((e): e is AnswerSubmitted => e.type === "answer_submitted" && e.exercise.id === ex.id);
  if (logged === undefined) throw new Error("answer not logged");
  return logged;
};

test.describe("AI features", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("without a model: report a wrong answer offline; it reaches the review queue at sign-up", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const wrong = await answerWrong(page);
    // No account, no model: reporting only. Nothing else is offered.
    await expect(page.locator("[data-action=explain]")).toHaveCount(0);
    await expect(page.locator("[data-judge]")).toHaveAttribute("data-judge", "idle");
    await page.locator("[data-action=report]").click();
    await expect(page.locator("[data-reported]")).toBeVisible();
    await expect(page.locator("[data-action=report]")).toBeDisabled();
    await expect.poll(async () => (await logOf(page, "yue")).find((e) => e.type === "answer_reported")).toMatchObject({ answer: wrong.id, text: "拜拜", exercise: { template: "translate-type.l1-l2" } });
    // It counts as right for the learner at once (ADR 0052): no mistake left for it.
    await expect(page.locator("[data-reported]")).toHaveAttribute("data-reported", "accept");
    expect(replay(await logOf(page, "yue")).mistakes.some((m) => m.item === wrong.exercise.item && m.template === wrong.exercise.template)).toBe(false);

    // Sign up: the log, report included, uploads; the server agrees with the device.
    await page.goto(url("#/"));
    const email = `reporter-${run()}@example.org`;
    await page.locator("[data-field=email]").fill(email);
    await page.locator("[data-field=password]").fill("long enough password");
    await page.locator("[data-action=account-submit]").click();
    const status = page.locator("[data-sync-status]");
    await expect(status).toHaveAttribute("data-pending", "0");
    await expect(status).toHaveAttribute("data-verified", "true");

    const queue = await page.request.get(`${API}/admin/v1/reports?status=pending&course=yue`, { headers: { Authorization: `Bearer ${ADMIN}` } });
    expect(queue.status()).toBe(200);
    const { reports } = (await queue.json()) as { reports: { answer: string; item: string; reports: number }[] };
    const row = reports.find((r) => r.answer === "拜拜" && r.item === wrong.exercise.item);
    // One row per answer, counting learners (more than one if this server saw the test before).
    expect(row?.reports).toBeGreaterThanOrEqual(1);

    // The server has no model: still no AI help once signed in, and no conversations.
    const ai = await page.request.get(`${API}/v1/ai/status?course=yue&orthography=${encodeURIComponent("yue-Hant-HK/standard")}`, {
      headers: { Authorization: `Bearer ${((await (await page.request.post(`${API}/v1/auth/sign-in`, { data: { email, password: "long enough password" } })).json()) as { token: string }).token}` },
    });
    expect(await ai.json()).toEqual({ judge: false, explain: false, roleplay: false });
    await page.goto(url("#/yue/yue-Hant-HK.standard"));
    await expect(page.locator("[data-course-path]")).toBeVisible();
    await expect(page.locator("[data-scenario]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("this should have been wrong: a right answer counts wrong at once, and is queued as a reject", async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    const history = freshIds(historyBefore(course, request.node, NOW));
    await page.goto(url("#/"));
    if (history.length > 0) await seedLog(page, history);
    const exercises = planned(course, history, request, NOW, SEED);
    const at = exercises.findIndex((e) => e.template !== "match-pairs" && !e.template.startsWith("speak") && e.template !== "listen-speak");
    expect(at).toBeGreaterThanOrEqual(0);
    await page.goto(url(`#/yue/yue-Hant-HK.standard/${request.node}`));
    for (const ex of exercises.slice(0, at)) {
      await waitFor(page, ex);
      await answer(page, ex, "keyboard");
      await expectRightAndContinue(page, "keyboard", ex);
    }
    const ex = exercises[at];
    if (ex === undefined) throw new Error("no exercise");
    await waitFor(page, ex);
    await answer(page, ex, "keyboard");
    await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", /^CORRECT/u);
    await page.locator("[data-action=report-wrong]").click();
    await expect(page.locator("[data-reported]")).toHaveAttribute("data-reported", "reject");
    const log = await logOf(page, "yue");
    expect(log.find((e) => e.type === "answer_reported")).toMatchObject({ claim: "reject", exercise: { id: ex.id } });
    expect(replay(log).mistakes.some((m) => m.item === ex.item)).toBe(true);
  });

  test("with stubbed AI responses: the judge's revision counts the answer right, and an explanation renders by language", async ({ page }) => {
    // Sign in through the API, then hand the account to the app as the sign-up form would.
    const email = `judged-${run()}@example.org`;
    const { token, user } = (await (await page.request.post(`${API}/v1/auth/sign-up`, { data: { email, password: "long enough password" } })).json()) as { token: string; user: { id: string; email: string } };
    await page.route(`${API}/v1/ai/status**`, (route) => route.fulfill({ json: { judge: true, explain: true, roleplay: false } }));
    let judged: AnswerSubmitted | undefined;
    await page.route(`${API}/v1/ai/judge`, async (route) => {
      judged = (route.request().postDataJSON() as { answer: AnswerSubmitted }).answer;
      const revision: LearnerEvent = {
        ...judged,
        id: "00000000-0000-7000-8000-00000000e2e1",
        type: "outcome_revised",
        device: "server",
        answer: judged.id,
        outcome: { kind: "CORRECT_PROVISIONAL", notes: ["judge"], kcs: judged.outcome.kcs.map((c) => ({ ...c, status: c.status === "wrong" ? "right" : c.status })) },
        by: "judge",
        judge: { model: "stub", promptHash: "000000000000", confidence: 0.95 },
      } as unknown as LearnerEvent;
      await route.fulfill({ json: { verdict: { verdict: "accept", confidence: 0.95, category: "paraphrase" }, revision } });
    });
    await page.route(`${API}/v1/ai/explain`, async (route) => {
      const { answer: a } = route.request().postDataJSON() as { answer: AnswerSubmitted };
      const explanation: Explanation = {
        answer: { lang: "yue-Hant-HK", orthography: "yue-Hant-HK/standard", tokens: [{ surface: "拜", kind: "word" }, { surface: "拜", kind: "word" }] } as unknown as Explanation["answer"],
        segments: [
          { kind: "support", text: { lang: "en-Latn", orthography: "en-Latn/standard", tokens: [{ surface: "You", kind: "word" }, { surface: " ", kind: "space" }, { surface: "wrote", kind: "word" }] } as unknown as Explanation["answer"] },
          { kind: "ref", answerTokens: [0, 1] },
          { kind: "target", text: { lang: "yue-Hant-HK", orthography: "yue-Hant-HK/standard", tokens: [{ surface: "你", kind: "word" }, { surface: "好", kind: "word" }] } as unknown as Explanation["answer"] },
        ],
        provenance: { provider: "fixture", model: "stub", prompt: "explain", promptHash: "000000000000", createdAt: "2026-05-12T09:00:00Z" },
      };
      expect(a.input.raw).toBe("拜拜");
      await route.fulfill({ json: { explanation, key: "0123456789abcdef0123456789abcdef" } });
    });
    await page.goto(url("#/"));
    await page.waitForFunction(() => window.nabu !== undefined);
    await page.evaluate(async ({ account }) => {
      await window.nabu?.setMeta("account", account);
    }, { account: { server: API, token, user } });

    const wrong = await answerWrong(page);
    await expect(page.locator("[data-judge]")).toHaveAttribute("data-judge", "accepted");
    expect(judged?.id).toBe(wrong.id);
    await expect.poll(async () => (await logOf(page, "yue")).some((e) => e.type === "outcome_revised" && e.answer === wrong.id)).toBe(true);

    await page.locator("[data-action=explain]").click();
    const explanation = page.locator("[data-explanation]");
    await expect(explanation).toBeVisible();
    await expect(explanation.locator('[data-segment=support] [lang="en-Latn"]').first()).toBeVisible();
    await expect(explanation.locator('[data-segment=target] [lang="yue-Hant-HK"]').first()).toBeVisible();
    await expect(explanation.locator("[data-provenance]")).toContainText("stub");
  });
});
