/**
 * The report intake (ADR 0055): with `reports.json` beside the app, a correction goes straight to
 * the intake's Firestore collection as a document named by its event, carrying no device, user or
 * session id. When it cannot be sent, it waits on the device and goes when the browser is back online.
 * The forms say reports become public issues.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { logOf } from "./solver.ts";

test.beforeEach(({ page: _ }, info) => {
  test.skip(info.project.name !== "keyboard", "one desktop pass is enough");
});

interface Posted {
  readonly url: URL;
  readonly fields: Readonly<Record<string, { readonly stringValue?: string; readonly integerValue?: string; readonly timestampValue?: string }>>;
}

/** A deployment with an intake, and a fake Firestore that records what it gets. */
const withIntake = async (page: Page, answer: (route: Route) => Promise<void> = (r) => r.fulfill({ json: {} })): Promise<Posted[]> => {
  const posted: Posted[] = [];
  await page.route("**/reports.json", (r) => r.fulfill({ json: { firestore: { project: "nabu-test", apiKey: "test-key" } } }));
  await page.route("https://firestore.googleapis.com/**", async (r) => {
    posted.push({ url: new URL(r.request().url()), fields: (r.request().postDataJSON() as { fields: Posted["fields"] }).fields });
    await answer(r);
  });
  return posted;
};

const correctS5 = async (page: Page): Promise<void> => {
  await page.goto("/?sound=off#/fa/fa-Arab.standard/sentences");
  await page.locator('[data-correctable="s.5"] [data-action=mark-incorrect]').click();
  const dialog = page.locator("[data-correction-dialog]");
  await expect(dialog.locator("[data-reports-public]")).toBeVisible();
  await dialog.locator("[data-field=correction-note]").fill("@someone the comma #1");
  await dialog.locator("[data-action=send-correction]").click();
  await expect(dialog).toHaveCount(0);
};

test("a correction goes to the intake at once, without device, user or session ids", async ({ page }) => {
  const posted = await withIntake(page);
  await correctS5(page);
  await expect.poll(() => posted.length).toBe(1);
  const [{ url, fields }] = posted as [Posted];
  const [event] = (await logOf(page, "fa")).filter((e) => e.type === "sentence_reported");
  expect(url.pathname).toBe("/v1/projects/nabu-test/databases/(default)/documents/nabu_reports");
  expect(url.searchParams.get("documentId")).toBe(event?.id);
  expect(url.searchParams.get("key")).toBe("test-key");
  expect(fields["status"]?.stringValue).toBe("new");
  expect(fields["kind"]?.stringValue).toBe("correction");
  const payload = JSON.parse(fields["payload"]?.stringValue ?? "{}") as Record<string, unknown>;
  expect(payload).toMatchObject({ v: 1, kind: "correction", id: event?.id, course: "fa", item: "s.5", note: "@someone the comma #1" });
  for (const key of ["device", "user", "session", "clientTime", "tz"]) expect(payload).not.toHaveProperty(key);
  // Sent: nothing waits on the device.
  expect(await page.evaluate(() => localStorage.getItem("nabu.reports.pending"))).toBeNull();
});

test("made offline, a report waits and goes when the browser is back online", async ({ page }) => {
  let offline = true;
  const posted = await withIntake(page, (r) => (offline ? r.abort("internetdisconnected") : r.fulfill({ json: {} })));
  await correctS5(page);
  await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem("nabu.reports.pending") ?? "[]") as unknown[]).length)).toBe(1);
  // Back online: the browser says so, and what waited goes.
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nabu.reports.pending"))).toBeNull();
  expect(posted.length).toBe(2);
});

test("a send the intake refuses for good is dropped, not retried forever", async ({ page }) => {
  const posted = await withIntake(page, (r) => r.fulfill({ status: 403, json: { error: { status: "PERMISSION_DENIED" } } }));
  await correctS5(page);
  await expect.poll(() => posted.length).toBe(1);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nabu.reports.pending"))).toBeNull();
});

test("with no intake, nothing is sent and the forms say nothing about issues", async ({ page }) => {
  let sent = 0;
  await page.route("https://firestore.googleapis.com/**", (r) => {
    sent++;
    return r.fulfill({ json: {} });
  });
  await page.goto("/?sound=off#/fa/fa-Arab.standard/sentences");
  await page.locator('[data-correctable="s.5"] [data-action=mark-incorrect]').click();
  await expect(page.locator("[data-correction-dialog]")).toBeVisible();
  await expect(page.locator("[data-reports-public]")).toHaveCount(0);
  expect(sent).toBe(0);
});
