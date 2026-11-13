/**
 * The review workspace (ADR 0074), against the real API: an admin grants a signed-in account the
 * reviewer role for apc. The reviewer finds the workspace from the course list. They add an
 * accepted answer and sign off a unit (sign-offs kept on the server, each with the sha256 of what
 * was shown), then take one back. They approve a learner's report from the queue. Everything lands
 * on the server; nothing of it is learner progress.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { correctablesByUnit, sentenceSignoffText, storySignoffText } from "@nabu/core/corrections";
import type { AnswerReport, AnswerReported, BundleManifest, OrthographyId, SignOffs } from "@nabu/schema";
import { expect, test, type Page } from "@playwright/test";
import { API_PORT } from "./ports.ts";
import { loadCourse, runTag, seriousAxeViolations } from "./solver.ts";

const API = `http://127.0.0.1:${API_PORT}`;
const ADMIN = { Authorization: "Bearer e2e-review-token" };
const ORTHOGRAPHY = "apc-Arab/standard" as OrthographyId;
const app = (hash: string): string => `/?sound=off&api=${encodeURIComponent(API)}${hash}`;
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const course = loadCourse("apc", ORTHOGRAPHY);
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../../public/bundles/apc/manifest.json"), "utf8")) as BundleManifest;

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

const tokenOf = async (page: Page, email: string, password: string): Promise<string> => {
  const res = await page.request.post(`${API}/v1/auth/sign-in`, { data: { email, password } });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { token: string }).token;
};

/** A learner's "this should have been accepted" for a sentence, uploaded from their own account. */
const learnerReports = async (page: Page, tag: string, item: string, kcs: AnswerReported["exercise"]["kcs"], text: string): Promise<void> => {
  const email = `learner-${tag}@example.org`;
  expect((await page.request.post(`${API}/v1/auth/sign-up`, { data: { email, password: "long enough password" } })).status()).toBe(201);
  const token = await tokenOf(page, email, "long enough password");
  const id = (n: number): string => `${tag.slice(0, 8)}-${tag.slice(8, 12)}-7000-8000-${n.toString(16).padStart(12, "0")}`;
  const at = new Date().toISOString();
  const report: AnswerReported = {
    id: id(1),
    type: "answer_reported",
    schema: 1,
    device: "e2e-learner",
    course: course.id,
    orthography: ORTHOGRAPHY,
    support: course.supportKey,
    bundle: manifest.id,
    session: id(2),
    clientTime: at,
    localDate: at.slice(0, 10),
    tz: "UTC",
    answer: id(3),
    exercise: { id: `${item}#e2e`, template: "translate-type.l1-l2", item, kcs: [...kcs] },
    text,
  };
  const res = await page.request.post(`${API}/v1/events`, { headers: { Authorization: `Bearer ${token}` }, data: { events: [report] } });
  expect(res.status()).toBe(200);
};

test("a reviewer signs off a unit, accepts an answer and decides a report, all kept on the server", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const tag = runTag();
  const email = `reviewer-${tag}@example.org`;
  const password = "long enough password";
  const handle = `e2e-${tag}`;
  const [first] = correctablesByUnit(course).filter((u) => u.sentences.length > 0);
  if (first === undefined) throw new Error("apc has sentences");
  const sentence = first.unit.sentences.find((s) => s.forms[ORTHOGRAPHY]?.reverse !== undefined);
  if (sentence === undefined) throw new Error("apc's first unit has a target-language accept set");

  // A learner account, signed up in the app; the admin makes it a reviewer of apc.
  await page.goto(app("#/"));
  await page.locator("[data-field=email]").fill(email);
  await page.locator("[data-field=password]").fill(password);
  await page.locator("[data-action=account-submit]").click();
  await expect(page.locator("[data-sync-status]")).toBeVisible();
  // Not a reviewer yet: no link.
  await expect(page.locator("[data-review-link]")).toHaveCount(0);
  const grant = await page.request.put(`${API}/admin/v1/reviewers`, { headers: ADMIN, data: { email, handle, courses: ["apc"] } });
  expect(grant.status()).toBe(200);
  await learnerReports(page, runTag(), sentence.id, sentence.kcs, "مرحبتين");

  // The course list asks for the role once a browser session: the next session finds the link.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.locator("[data-review-link]").click();
  await expect(page.locator("[data-reviewer=yes]")).toContainText(handle);
  await page.locator(`[data-review-course=apc] [data-orthography="${ORTHOGRAPHY}"]`).click();
  const workspace = page.locator("[data-review-page=apc]");
  await expect(workspace.locator(`[data-unit-items="${first.unit.id}"]`)).toBeVisible();
  expect(await seriousAxeViolations(page, "[data-review-page]")).toEqual([]);

  // Each item shows its accept sets; one more answer is accepted, for nabu reports promote.
  const details = workspace.locator(`[data-review-details="${sentence.id}"]`);
  await expect(details.locator(`[data-accept-set="${ORTHOGRAPHY}"] li`).first()).toBeVisible();
  const field = details.locator("[data-field=accepted-answer]");
  await expect(field).toHaveAttribute("dir", "rtl");
  await field.fill("أهلين وسهلين");
  await details.locator("[data-action=add-accepted]").click();
  await expect(details.locator("[data-accept-result=added]")).toBeVisible();
  const approved = await page.request.get(`${API}/admin/v1/reports?status=approved&course=apc`, { headers: ADMIN });
  const accepted = ((await approved.json()) as { reports: AnswerReport[] }).reports.find((r) => r.item === sentence.id && r.answer === "أهلين وسهلين");
  expect(accepted).toMatchObject({ template: "translate-type.l1-l2", claim: "accept", orthography: ORTHOGRAPHY });

  // The whole unit, signed off; the server keeps what was shown.
  const expected = new Map<string, string>([
    ...first.unit.sentences.filter((s) => !s.id.startsWith("drill.")).map((s) => [`sentence:${s.id}`, sha256(sentenceSignoffText(s))] as const),
    ...(first.unit.stories ?? []).map((s) => [`story:${s.id}`, sha256(storySignoffText(s))] as const),
  ]);
  await workspace.locator("[data-action=sign-off-unit]").click();
  const toggles = workspace.locator(`[data-unit-items="${first.unit.id}"] [data-action=sign-off]`);
  await expect(toggles.and(page.locator("[data-signed-off]"))).toHaveCount(expected.size);
  const token = await tokenOf(page, email, password);
  const signoffs = async (): Promise<SignOffs> => (await (await page.request.get(`${API}/v1/review/signoffs?course=apc`, { headers: { Authorization: `Bearer ${token}` } })).json()) as SignOffs;
  const file = await signoffs();
  expect(file.reviewer).toBe(`human:${handle}`);
  expect(new Map(file.signoffs.map((s) => [`${s.kind}:${s.item}`, s.shown]))).toEqual(expected);

  // One taken back.
  await toggles.first().click();
  await expect(toggles.first()).not.toHaveAttribute("data-signed-off", "true");
  await expect.poll(async () => (await signoffs()).signoffs.length).toBe(expected.size - 1);

  // The queue: the learner's report, approved.
  await workspace.locator("[data-tab=queue]").click();
  const report = workspace.locator("[data-report]").filter({ hasText: "مرحبتين" });
  await expect(report).toHaveAttribute("data-status", "pending");
  expect(await seriousAxeViolations(page, "[data-review-page]")).toEqual([]);
  await report.locator("[data-action=approve]").click();
  await expect(report).toHaveAttribute("data-status", "approved");
  const id = await report.getAttribute("data-report");
  const after = (await (await page.request.get(`${API}/admin/v1/reports?status=approved&course=apc`, { headers: ADMIN })).json()) as { reports: AnswerReport[] };
  expect(after.reports.map((r) => r.id)).toContain(id);

  // The sign-offs are the account's, not the device's: a reload shows them as they are.
  await page.reload();
  await expect(page.locator(`[data-review-page=apc] [data-unit-items="${first.unit.id}"] [data-action=sign-off][data-signed-off]`)).toHaveCount(expected.size - 1);
  expect(errors).toEqual([]);
});

test("an account that reviews nothing is told so, and sees no workspace", async ({ page }) => {
  const tag = runTag();
  await page.goto(app("#/"));
  await page.locator("[data-field=email]").fill(`not-a-reviewer-${tag}@example.org`);
  await page.locator("[data-field=password]").fill("long enough password");
  await page.locator("[data-action=account-submit]").click();
  await expect(page.locator("[data-sync-status]")).toBeVisible();
  await page.goto(app("#/review/apc/apc-Arab.standard"));
  await expect(page.locator("[data-reviewer=not-reviewer]")).toBeVisible();
  await expect(page.locator("[data-unit-items]")).toHaveCount(0);
});
