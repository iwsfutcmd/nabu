/**
 * Phase 8 in the app (gameplan §13, §16).
 *
 * Against the real API, which runs without a model as most instances will: a wrong typed answer
 * can be reported offline, the report syncs at sign-up and lands in the review queue, and no AI
 * help is offered (the judge falls back to accept sets plus reports, §13.1).
 *
 * With AI responses stubbed at the network (no model involved): the judge's revision upgrades
 * the answer retroactively and says a model decided, and an explanation renders its segments in
 * their own languages. The end of the lesson keeps both (M10): the explanation under the card
 * missed, and an accept that came after Continue, listed as a model's.
 */
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { replay } from "@nabu/core/learner";
import { lessonNodes, type Exercise } from "@nabu/core/lesson";
import { graphemes, surfaceOf } from "@nabu/core/text";
import type { AnswerSubmitted, Explanation, LearnerEvent } from "@nabu/schema";
import { API_PORT } from "./ports.ts";
import { activate, answer, expectRightAndContinue, freshIds, historyBefore, loadCourse, logOf, planned, playSession, runTag as run, seedLog, seriousAxeViolations, waitFor, type Mode } from "./solver.ts";

const LETTER = /\p{L}/u;
const letters = (word: string): number => graphemes(word).filter((g) => LETTER.test(g)).length;

/** The text with a slip in its longest word, its last letter typed twice: a typo, not another word. */
const withTypo = (text: string): string => {
  const words = text.split(" ");
  const at = words.reduce((best, w, i) => (letters(w) > letters(words[best] ?? "") ? i : best), 0);
  const g = graphemes(words[at] ?? "");
  const last = g.findLastIndex((c) => LETTER.test(c));
  words[at] = [...g.slice(0, last + 1), g[last] ?? "", ...g.slice(last + 1)].join("");
  return words.join(" ");
};

const API = `http://127.0.0.1:${API_PORT}`;
const ADMIN = "e2e-review-token";
const NOW = new Date("2026-05-12T09:00:00Z");
const SEED = 7;
const course = loadCourse("yue", "yue-Hant-HK/standard");
const request = { mode: "lesson", node: "yue.names" } as const;
const url = (hash: string): string => `/?seed=${SEED}&sound=off&api=${encodeURIComponent(API)}${hash}`;

/**
 * Plays up to the lesson's typing exercise and answers it wrong: the lesson's plan, where that card
 * is in it, and the logged answer.
 */
const typedWrong = async (page: Page): Promise<{ readonly exercises: readonly Exercise[]; readonly at: number; readonly logged: AnswerSubmitted }> => {
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
  return { exercises, at, logged };
};

/** Plays up to the lesson's typing exercise and answers it wrong; returns the logged answer. */
const answerWrong = async (page: Page): Promise<AnswerSubmitted> => (await typedWrong(page)).logged;

/** The judge's accept of an answer, as the server issues it (§8.3): stubbed, no model involved. */
const acceptOf = (judged: AnswerSubmitted): LearnerEvent =>
  ({
    ...judged,
    id: "00000000-0000-7000-8000-00000000e2e1",
    type: "outcome_revised",
    device: "server",
    answer: judged.id,
    outcome: { kind: "CORRECT_PROVISIONAL", notes: ["judge"], kcs: judged.outcome.kcs.map((c) => ({ ...c, status: c.status === "wrong" ? "right" : c.status })) },
    by: "judge",
    judge: { model: "stub", promptHash: "000000000000", confidence: 0.95 },
  }) as unknown as LearnerEvent;

/** An explanation of the answer 拜拜, as the server gives one: stubbed, no model involved. */
const EXPLANATION: Explanation = {
  answer: { lang: "yue-Hant-HK", orthography: "yue-Hant-HK/standard", tokens: [{ surface: "拜", kind: "word" }, { surface: "拜", kind: "word" }] } as unknown as Explanation["answer"],
  segments: [
    { kind: "support", text: { lang: "en-Latn", orthography: "en-Latn/standard", tokens: [{ surface: "You", kind: "word" }, { surface: " ", kind: "space" }, { surface: "wrote", kind: "word" }] } as unknown as Explanation["answer"] },
    { kind: "ref", answerTokens: [0, 1] },
    { kind: "target", text: { lang: "yue-Hant-HK", orthography: "yue-Hant-HK/standard", tokens: [{ surface: "你", kind: "word" }, { surface: "好", kind: "word" }] } as unknown as Explanation["answer"] },
  ],
  provenance: { provider: "fixture", model: "stub", prompt: "explain", promptHash: "000000000000", createdAt: "2026-05-12T09:00:00Z" },
};

/** Signs up through the API and hands the account to the app, as the sign-up form would. */
const signedIn = async (page: Page, name: string): Promise<void> => {
  const email = `${name}-${run()}@example.org`;
  const { token, user } = (await (await page.request.post(`${API}/v1/auth/sign-up`, { data: { email, password: "long enough password" } })).json()) as { token: string; user: { id: string; email: string } };
  await page.goto(url("#/"));
  await page.waitForFunction(() => window.nabu !== undefined);
  await page.evaluate(async ({ account }) => {
    await window.nabu?.setMeta("account", account);
  }, { account: { server: API, token, user } });
};

test.describe("AI features", () => {
  test.beforeEach(({ page: _ }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
  });

  test("without a model: report a wrong answer offline; it reaches the review queue at sign-up", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const wrong = await answerWrong(page);
    // No account, no model: reporting only, from the one report button beside the feedback (M6).
    await expect(page.locator("[data-action=explain]")).toHaveCount(0);
    await expect(page.locator("[data-judge]")).toHaveAttribute("data-judge", "idle");
    await expect(page.locator("[data-action=report-problem]")).toHaveCount(1);
    await expect(page.locator("[data-action=report]")).toHaveCount(0); // nothing reads like a verdict under the feedback
    await page.locator("[data-action=report-problem]").click();
    await page.locator("[data-report-dialog] [data-action=report]").click();
    await expect(page.locator("[data-reported]")).toBeVisible();
    await page.locator("[data-action=report-problem]").click();
    await expect(page.locator("[data-report-dialog] [data-action=report]")).toBeDisabled();
    await page.keyboard.press("Escape");
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

  test("this should have been wrong, after a lenient grade: the answer counts wrong at once, and is queued as a reject", async ({ page }) => {
    // Only a grade that let a difference pass (here a typo) can be claimed wrong (M6): Cuban Spanish
    // grades typos, and the first lesson with a typed card whose canonical answer has a long word.
    const es = loadCourse("es", "es-Latn/standard");
    await page.clock.setFixedTime(NOW);
    const typed = (e: Exercise): boolean => e.template === "translate-type.l1-l2" && surfaceOf(e.canonical).split(" ").some((w) => letters(w) >= 6);
    let found: { readonly node: string; readonly history: LearnerEvent[]; readonly exercises: readonly Exercise[] } | undefined;
    for (const { node } of lessonNodes(es)) {
      const history = freshIds(historyBefore(es, node.id, NOW));
      const exercises = planned(es, history, { mode: "lesson", node: node.id }, NOW, SEED);
      if (exercises.some(typed)) {
        found = { node: node.id, history, exercises };
        break;
      }
    }
    if (found === undefined) throw new Error("no es lesson with a typed card");
    await page.goto(url("#/"));
    if (found.history.length > 0) await seedLog(page, found.history);
    const at = found.exercises.findIndex(typed);
    await page.goto(url(`#/es/es-Latn.standard/${found.node}`));
    for (const ex of found.exercises.slice(0, at)) {
      await waitFor(page, ex);
      await answer(page, ex, "keyboard");
      await expectRightAndContinue(page, "keyboard", ex);
    }
    const ex = found.exercises[at];
    if (ex === undefined || ex.template !== "translate-type.l1-l2") throw new Error("no typed exercise");
    await waitFor(page, ex);
    await page.locator("[data-answer-input]").fill(withTypo(surfaceOf(ex.canonical)));
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", "CORRECT_WITH_TYPO");
    await page.locator("[data-action=report-problem]").click();
    await page.locator("[data-report-dialog] [data-action=report-wrong]").click();
    await expect(page.locator("[data-reported]")).toHaveAttribute("data-reported", "reject");
    const log = await logOf(page, "es");
    expect(log.find((e) => e.type === "answer_reported")).toMatchObject({ claim: "reject", exercise: { id: ex.id } });
    expect(replay(log).mistakes.some((m) => m.item === ex.item)).toBe(true);
  });

  test("an answer the course lists cannot be claimed wrong: the report button offers corrections only", async ({ page }) => {
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
    await expect(page.locator("[data-feedback]")).toHaveAttribute("data-verdict", /^CORRECT(_ALT)?$/u);
    await page.locator("[data-action=report-problem]").click();
    const dialog = page.locator("[data-report-dialog]");
    await expect(dialog.locator("[data-action=mark-incorrect]")).toBeVisible();
    await expect(dialog.locator("[data-action=report-wrong]")).toHaveCount(0);
    expect(await seriousAxeViolations(page, "[data-report-dialog]")).toEqual([]);
  });

  test("with stubbed AI responses: the judge's revision counts the answer right, and an explanation renders by language", async ({ page }) => {
    await page.route(`${API}/v1/ai/status**`, (route) => route.fulfill({ json: { judge: true, explain: true, roleplay: false } }));
    let judged: AnswerSubmitted | undefined;
    await page.route(`${API}/v1/ai/judge`, async (route) => {
      judged = (route.request().postDataJSON() as { answer: AnswerSubmitted }).answer;
      await route.fulfill({ json: { verdict: { verdict: "accept", confidence: 0.95, category: "paraphrase" }, revision: acceptOf(judged) } });
    });
    await page.route(`${API}/v1/ai/explain`, async (route) => {
      const { answer: a } = route.request().postDataJSON() as { answer: AnswerSubmitted };
      expect(a.input.raw).toBe("拜拜");
      await route.fulfill({ json: { explanation: EXPLANATION, key: "0123456789abcdef0123456789abcdef" } });
    });
    await signedIn(page, "judged");

    const wrong = await answerWrong(page);
    const verdict = page.locator("[data-judge]");
    await expect(verdict).toHaveAttribute("data-judge", "accepted");
    // It says a model decided, not a person (M10).
    await expect(verdict).toContainText("A language model checked your answer again and accepted it");
    expect(judged?.id).toBe(wrong.id);
    await expect.poll(async () => (await logOf(page, "yue")).some((e) => e.type === "outcome_revised" && e.answer === wrong.id)).toBe(true);

    await page.locator("[data-action=explain]").click();
    const explanation = page.locator("[data-explanation]");
    await expect(explanation).toBeVisible();
    await expect(explanation.locator('[data-segment=support] [lang="en-Latn"]').first()).toBeVisible();
    await expect(explanation.locator('[data-segment=target] [lang="yue-Hant-HK"]').first()).toBeVisible();
    await expect(explanation.locator("[data-provenance]")).toContainText("stub");
  });

  test("an explanation stays under the missed card at the end of the lesson (M10)", async ({ page }) => {
    await page.route(`${API}/v1/ai/status**`, (route) => route.fulfill({ json: { judge: false, explain: true, roleplay: false } }));
    let asked = 0;
    await page.route(`${API}/v1/ai/explain`, async (route) => {
      asked += 1;
      await route.fulfill({ json: { explanation: EXPLANATION, key: "0123456789abcdef0123456789abcdef" } });
    });
    await signedIn(page, "explained");
    const { exercises, at, logged } = await typedWrong(page);
    await page.locator("[data-action=explain]").click();
    await expect(page.locator("[data-explanation]")).toBeVisible();
    await page.locator("[data-rate=up]").click();
    // Continue: the explanation goes with the feedback; the lesson goes on, the card coming back at its end.
    await page.locator("[data-action=continue]").click();
    await expect(page.locator("[data-explanation]")).toHaveCount(0);
    await playSession(page, exercises, "keyboard", { played: at + 1 });

    // The end lists the card missed, the explanation under it as it was, rating and all: not asked for again.
    const card = page.locator(`[data-lesson-player][data-state="finished"] [data-end-missed] [data-missed="${logged.exercise.id}"]`);
    const kept = card.locator("[data-explanation]");
    await expect(kept).toBeVisible();
    await expect(kept.locator("[data-provenance]")).toContainText("stub");
    await expect(kept.locator("[data-rate=up]")).toHaveAttribute("aria-pressed", "true");
    expect(asked).toBe(1);
    expect(await seriousAxeViolations(page)).toEqual([]);
  });

  test("the judge's accept after Continue is listed at the end of the lesson as a model's (M10)", async ({ page }) => {
    await page.route(`${API}/v1/ai/status**`, (route) => route.fulfill({ json: { judge: true, explain: false, roleplay: false } }));
    // The judge answers only once the learner has moved on.
    let release: () => void = () => undefined;
    const moved = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`${API}/v1/ai/judge`, async (route) => {
      const judged = (route.request().postDataJSON() as { answer: AnswerSubmitted }).answer;
      await moved;
      await route.fulfill({ json: { verdict: { verdict: "accept", confidence: 0.95, category: "paraphrase" }, revision: acceptOf(judged) } });
    });
    await signedIn(page, "judged-late");
    const { exercises, at, logged } = await typedWrong(page);
    await expect(page.locator("[data-judge]")).toHaveAttribute("data-judge", "checking");
    await page.locator("[data-action=continue]").click();
    await expect(page.locator("[data-judge]")).toHaveCount(0);
    release();
    await expect.poll(async () => (await logOf(page, "yue")).some((e) => e.type === "outcome_revised" && e.answer === logged.id)).toBe(true);
    await playSession(page, exercises, "keyboard", { played: at + 1 });

    // Not missed: it counts right. Listed as accepted on a second check, and said to be a model's.
    const end = page.locator('[data-lesson-player][data-state="finished"]');
    await expect(end.locator(`[data-end-missed] [data-missed="${logged.exercise.id}"]`)).toHaveCount(0);
    const accepted = end.locator("[data-end-accepted]");
    await expect(accepted.locator(`[data-missed="${logged.exercise.id}"]`)).toBeVisible();
    await expect(accepted.locator("[data-ai-notice]")).toContainText("A language model checked this answer again and accepted it");
    expect(await seriousAxeViolations(page)).toEqual([]);
  });
});

test.describe("a roleplay turn while a keyboard composes (D39)", () => {
  /** What the learner types with an Arabic keyboard, still composing when Send is pressed. */
  const TYPED = "مرحبا، كيفك؟";
  /** The character's turn, as the stubbed model gives it. */
  const TURN = { lang: "apc-Arab-LB", orthography: "apc-Arab/standard", tokens: [{ kind: "word", surface: "أهلين" }] };

  type Sent = (readonly { readonly role: string; readonly text: string }[])[];

  /**
   * The café conversation (apc) with the model stubbed at the network, after the character's first
   * turn, the learner's field composing TYPED: the histories the app sends the model, and the CDP
   * session composing.
   */
  const toComposingTurn = async (page: Page, mode: Mode): Promise<{ readonly sent: Sent; readonly cdp: CDPSession }> => {
    const email = `roleplay-${run()}@example.org`;
    const { token, user } = (await (await page.request.post(`${API}/v1/auth/sign-up`, { data: { email, password: "long enough password" } })).json()) as { token: string; user: { id: string; email: string } };
    await page.route(`${API}/v1/ai/status**`, (route) => route.fulfill({ json: { judge: false, explain: false, roleplay: true } }));
    const sent: Sent = [];
    await page.route(`${API}/v1/ai/roleplay`, async (route) => {
      sent.push((route.request().postDataJSON() as { history: { role: string; text: string }[] }).history);
      await route.fulfill({ json: { turn: { text: TURN, checks: { unknown: [] } } } });
    });
    await page.goto(url("#/"));
    await page.waitForFunction(() => window.nabu !== undefined);
    await page.evaluate(async (account) => window.nabu?.setMeta("account", account), { server: API, token, user });
    await page.goto(url("#/apc/apc-Arab.standard/roleplay/apc.cafe-waiter"));
    // The account is read as the app starts.
    await page.reload();
    await activate(page, mode, "[data-action=start]");
    await expect(page.locator("[data-roleplay] [data-turn=character]")).toHaveCount(1);
    const field = page.locator("[data-roleplay] [data-answer-input]");
    if (mode === "touch") await field.tap();
    else await field.focus();
    await expect(field).toBeFocused();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.imeSetComposition", { text: TYPED, selectionStart: TYPED.length, selectionEnd: TYPED.length });
    await expect(field).toHaveValue(TYPED);
    await expect(page.locator("[data-roleplay] [data-action=send]")).toBeEnabled();
    return { sent, cdp };
  };

  /** The learner's turn went to the model once, settled, and the field is empty for the next. */
  const expectSent = async (page: Page, sent: Sent): Promise<void> => {
    await expect(page.locator("[data-roleplay] [data-turn=learner]")).toHaveCount(1);
    await expect(page.locator("[data-roleplay] [data-turn=character]")).toHaveCount(2);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.at(-1)).toEqual({ role: "learner", text: TYPED });
    await expect(page.locator("[data-roleplay] [data-answer-input]")).toHaveValue("");
  };

  test("one tap on Send while a phone keyboard still composes sends the turn", async ({ page }, info) => {
    test.skip(info.project.name !== "touch", "a phone keyboard: the touch pass");
    const { sent } = await toComposingTurn(page, "touch");
    await page.locator("[data-roleplay] [data-action=send]").tap();
    await expectSent(page, sent);
  });

  test("a press on Send that leaves the focus in the composing field waits for the composition to end", async ({ page }, info) => {
    const { sent } = await toComposingTurn(page, info.project.name === "touch" ? "touch" : "keyboard");
    // What the field and the page saw, in order: the turn must be sent after compositionend.
    await page.evaluate(() => {
      const seen: string[] = [];
      (window as unknown as { seen: string[] }).seen = seen;
      document.querySelector("[data-roleplay] [data-answer-input]")?.addEventListener("compositionend", () => seen.push("compositionend"));
      new MutationObserver(() => {
        if (document.querySelector("[data-roleplay] [data-turn=learner]") !== null && !seen.includes("sent")) seen.push("sent");
      }).observe(document.body, { childList: true, subtree: true });
    });
    // A screen reader's activation: a click with no pointer, which moves no focus by itself.
    await page.locator("[data-roleplay] [data-action=send]").dispatchEvent("click");
    await expectSent(page, sent);
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(["compositionend", "sent"]);
  });

  test("an input method's Enter, or its commit, sends nothing by itself", async ({ page }, info) => {
    test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
    const { sent, cdp } = await toComposingTurn(page, "keyboard");
    // Enter while composing, as an IME reports it (keyCode 229), then the IME's commit: compositionend.
    await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    await cdp.send("Input.insertText", { text: TYPED });
    // Past the moment a waiting press would take to go ahead: nothing was sent, and the field keeps its text.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 100)));
    const field = page.locator("[data-roleplay] [data-answer-input]");
    await expect(field).toHaveValue(TYPED);
    await expect(page.locator("[data-roleplay] [data-turn=learner]")).toHaveCount(0);
    expect(sent).toHaveLength(1);
    // Once committed, Enter sends: the one turn, settled.
    await field.press("Enter");
    await expectSent(page, sent);
  });
});
