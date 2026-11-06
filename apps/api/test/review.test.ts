/**
 * The review workspace's API (ADR 0074): an admin grants reviewer accounts, scoped to courses;
 * a reviewer decides reports and corrections, signs items off and adds accepted answers, only
 * for their courses; sign-offs export as the file `nabu review apply` reads.
 */
import { readFileSync } from "node:fs";
import type { OrthographyId, SignOffs } from "@nabu/schema";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccounts } from "../src/accounts.ts";
import { createCourses } from "../src/ai/courses.ts";
import { createGateway } from "../src/ai/gateway.ts";
import { createApp, type App } from "../src/app.ts";
import type { Database } from "../src/db/index.ts";
import { fileReport, REVIEWER_TEMPLATE } from "../src/reports.ts";
import { testDatabase } from "./database.ts";

const ADMIN = "review-token-for-tests";
const YUE = "yue-Hant-HK/standard" as OrthographyId;
const FA = "fa-Arab/standard" as OrthographyId;
const clock = Date.parse("2026-11-06T10:00:00Z");
const courses = createCourses();
const yue = courses.get("yue", YUE);
if (yue === undefined) throw new Error("the yue bundle is committed");
/** A yue sentence with a target-language accept set: what an accepted answer is added to. */
const sentence = yue.units.flatMap((u) => u.sentences).find((s) => s.forms[YUE]?.reverse !== undefined);
if (sentence === undefined) throw new Error("yue has reverse accept sets");
const SHOWN = "a".repeat(64);

const ajv = new Ajv2020({ strict: false });
const signOffsValid = ajv.compile(JSON.parse(readFileSync(new URL("../../../schemas/signoffs.schema.json", import.meta.url), "utf8")) as object);

let database: Database;
let app: App;
beforeAll(async () => {
  database = await testDatabase();
  const gateway = createGateway({ db: database.db, provider: undefined });
  app = createApp({ db: database.db, accounts: createAccounts(database.db), now: () => clock, ai: { gateway, courses, gates: [] }, adminToken: ADMIN });
});
afterAll(async () => database.close());

const request = (method: string, body: unknown, token?: string): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const admin = (method: string, body?: unknown): RequestInit => request(method, body, ADMIN);

let accounts = 0;
const signUp = async (): Promise<{ email: string; token: string }> => {
  const email = `reviewer${String(++accounts)}@example.org`;
  const res = await app.request("/v1/auth/sign-up", request("POST", { email, password: "correct horse battery" }));
  expect(res.status).toBe(201);
  return { email, token: ((await res.json()) as { token: string }).token };
};

describe("reviewer accounts", () => {
  it("are granted by the admin, to existing accounts, with a handle no one else has", async () => {
    const a = await signUp();
    const b = await signUp();
    expect((await app.request("/admin/v1/reviewers", request("PUT", { email: a.email, handle: "mei", courses: ["yue"] }))).status).toBe(401);
    expect((await app.request("/admin/v1/reviewers", admin("PUT", { email: a.email, handle: "has space", courses: ["yue"] }))).status).toBe(400);
    expect((await app.request("/admin/v1/reviewers", admin("PUT", { email: a.email, handle: "mei", courses: [] }))).status).toBe(400);
    expect((await app.request("/admin/v1/reviewers", admin("PUT", { email: "nobody@example.org", handle: "mei", courses: ["yue"] }))).status).toBe(404);
    const granted = await app.request("/admin/v1/reviewers", admin("PUT", { email: a.email, handle: "mei", courses: ["yue"] }));
    expect(granted.status).toBe(200);
    expect(((await granted.json()) as { reviewer: { handle: string; courses: string[] } }).reviewer).toMatchObject({ handle: "mei", courses: ["yue"] });
    expect((await app.request("/admin/v1/reviewers", admin("PUT", { email: b.email, handle: "mei", courses: ["fa"] }))).status).toBe(409);
    // Handles in any script: provenance names people as they write their names.
    expect((await app.request("/admin/v1/reviewers", admin("PUT", { email: b.email, handle: "مریم", courses: ["*", "fa"] }))).status).toBe(200);
    const list = (await (await app.request("/admin/v1/reviewers", admin("GET"))).json()) as { reviewers: { handle: string; courses: string[]; email: string }[] };
    expect(list.reviewers.map((r) => [r.handle, r.courses])).toEqual(
      expect.arrayContaining([
        ["mei", ["yue"]],
        ["مریم", ["*"]],
      ]),
    );

    expect(await (await app.request("/v1/review/me", request("GET", undefined, a.token))).json()).toEqual({ handle: "mei", courses: ["yue"] });
    const learner = await signUp();
    const me = await app.request("/v1/review/me", request("GET", undefined, learner.token));
    expect(me.status).toBe(403);
    expect(await me.json()).toEqual({ error: "not-a-reviewer" });
  });
});

describe("the review workspace", () => {
  let token = "";
  let email = "";
  beforeAll(async () => {
    ({ token, email } = await signUp());
    expect((await app.request("/admin/v1/reviewers", admin("PUT", { email, handle: "wing", courses: ["yue"] }))).status).toBe(200);
  });
  const as = (method: string, body?: unknown): RequestInit => request(method, body, token);

  it("shows and decides the reports of the reviewer's courses only", async () => {
    const base = { orthography: YUE, template: "translate-type.l1-l2", item: sentence.id, subject: "s1", source: "report" as const };
    const mine = await fileReport(database.db, courses, { ...base, course: "yue", answer: "早晨" }, clock);
    const theirs = await fileReport(database.db, courses, { ...base, course: "fa", orthography: FA, item: "s.1", answer: "سلام" }, clock);
    const listed = (await (await app.request("/v1/review/reports?course=yue&status=pending", as("GET"))).json()) as { reports: { id: string }[] };
    expect(listed.reports.map((r) => r.id)).toContain(mine);
    expect((await app.request("/v1/review/reports?course=fa", as("GET"))).status).toBe(403);
    expect((await app.request("/v1/review/reports", as("GET"))).status).toBe(400);
    expect((await app.request(`/v1/review/reports/${theirs}`, as("POST", { status: "approved" }))).status).toBe(403);
    expect((await app.request(`/v1/review/reports/${mine}`, as("POST", { status: "promoted" }))).status).toBe(400);
    expect((await app.request(`/v1/review/reports/${mine}`, as("POST", { status: "approved" }))).status).toBe(204);
    expect((await app.request("/v1/review/reports/00000000-0000-7000-8000-000000000000", as("POST", { status: "approved" }))).status).toBe(404);
    const approved = (await (await app.request("/v1/review/reports?course=yue&status=approved", as("GET"))).json()) as { reports: { id: string }[] };
    expect(approved.reports.map((r) => r.id)).toContain(mine);
    expect(((await (await app.request("/v1/review/corrections?course=yue", as("GET"))).json()) as { corrections: unknown[] }).corrections).toEqual([]);
    expect((await app.request("/v1/review/corrections?course=fa", as("GET"))).status).toBe(403);
  });

  it("keeps sign-offs until they are applied, and exports them as the file apply reads", async () => {
    const at = "2026-11-06T09:30:00Z";
    expect((await app.request("/v1/review/signoffs", as("PUT", { course: "yue", signoffs: [{ item: "s.1", kind: "sentence", shown: "short", at }] }))).status).toBe(400);
    expect((await app.request("/v1/review/signoffs", as("PUT", { course: "yue", signoffs: [{ item: "s.1", kind: "sentence", shown: SHOWN, at: "yesterday" }] }))).status).toBe(400);
    expect((await app.request("/v1/review/signoffs", as("PUT", { course: "fa", signoffs: [] }))).status).toBe(403);
    const put = await app.request(
      "/v1/review/signoffs",
      as("PUT", {
        course: "yue",
        signoffs: [
          { item: "s.2", kind: "sentence", shown: SHOWN, at },
          { item: "s.1", kind: "sentence", shown: SHOWN, at },
          { item: "story.1", kind: "story", shown: SHOWN, at },
        ],
      }),
    );
    expect(await put.json()).toEqual({ stored: 3 });
    expect((await app.request("/v1/review/signoffs/yue/sentence/s.2", as("DELETE"))).status).toBe(204);
    expect((await app.request("/v1/review/signoffs/yue/sentence/s.2", as("DELETE"))).status).toBe(404);
    const file = (await (await app.request("/v1/review/signoffs?course=yue", as("GET"))).json()) as SignOffs;
    expect(signOffsValid(file)).toBe(true);
    expect(file).toEqual({
      course: "yue",
      reviewer: "human:wing",
      signoffs: [
        { item: "s.1", kind: "sentence", shown: SHOWN, at: "2026-11-06T09:30:00.000Z" },
        { item: "story.1", kind: "story", shown: SHOWN, at: "2026-11-06T09:30:00.000Z" },
      ],
    });
    const all = (await (await app.request("/admin/v1/signoffs?course=yue", admin("GET"))).json()) as { files: SignOffs[] };
    expect(all.files.find((f) => f.reviewer === "human:wing")?.signoffs).toHaveLength(2);
    expect(all.files.every((f) => signOffsValid(f))).toBe(true);
  });

  it("adds an accepted answer to a sentence's target-language accept set, approved for promote", async () => {
    const add = { course: "yue", orthography: YUE, item: sentence.id, answer: " 早晨呀 " };
    expect((await app.request("/v1/review/accepts", as("POST", { ...add, item: "no.such.sentence" }))).status).toBe(404);
    expect((await app.request("/v1/review/accepts", as("POST", { ...add, answer: "  " }))).status).toBe(400);
    expect((await app.request("/v1/review/accepts", as("POST", { ...add, course: "fa", orthography: FA }))).status).toBe(403);
    const res = await app.request("/v1/review/accepts", as("POST", add));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    const jsonl = await (await app.request("/admin/v1/reports.jsonl?status=approved&course=yue", admin("GET"))).text();
    const row = jsonl
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { id: string; template: string; answer: string; claim: string; reports: number })
      .find((r) => r.id === id);
    expect(row).toMatchObject({ template: REVIEWER_TEMPLATE, answer: "早晨呀", claim: "accept", reports: 0 });
  });

  it("a new handle carries the sign-offs; revoking keeps them; the account's export and deletion include them", async () => {
    expect((await app.request("/admin/v1/reviewers", admin("PUT", { email, handle: "wing.c", courses: ["yue"] }))).status).toBe(200);
    expect(((await (await app.request("/v1/review/signoffs?course=yue", as("GET"))).json()) as SignOffs).reviewer).toBe("human:wing.c");
    const exported = (await (await app.request("/v1/export", as("GET"))).json()) as { review: { reviewer: { handle: string } | null; signoffs: unknown[] } };
    expect(exported.review.reviewer?.handle).toBe("wing.c");
    expect(exported.review.signoffs).toHaveLength(2);

    expect((await app.request("/admin/v1/reviewers/wing.c", admin("DELETE"))).status).toBe(204);
    expect((await app.request("/admin/v1/reviewers/wing.c", admin("DELETE"))).status).toBe(404);
    expect((await app.request("/v1/review/me", as("GET"))).status).toBe(403);
    expect((await app.request("/v1/review/signoffs?course=yue", as("GET"))).status).toBe(403);
    const kept = (await (await app.request("/admin/v1/signoffs?course=yue", admin("GET"))).json()) as { files: SignOffs[] };
    expect(kept.files.map((f) => f.reviewer)).toContain("human:wing.c");

    expect((await app.request("/v1/account", as("DELETE", { password: "correct horse battery" }))).status).toBe(204);
    const gone = (await (await app.request("/admin/v1/signoffs?course=yue", admin("GET"))).json()) as { files: SignOffs[] };
    expect(gone.files.map((f) => f.reviewer)).not.toContain("human:wing.c");
  });
});
