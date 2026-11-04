/**
 * The corrections queue (ADR 0051): sentence_reported events from the learners' logs become one
 * row per distinct correction, counted once per learner; a learner's later correction of an item
 * replaces their earlier one; reviewers approve rows and export them for `nabu corrections apply`.
 * No model is configured: corrections need none.
 */
import { readFileSync } from "node:fs";
import { correctable, correctionOf, draftFrom, sentenceReportedOf, shownOf } from "@nabu/core/corrections";
import type { CorrectionFields, OrthographyId, SentenceReported } from "@nabu/schema";
import { Ajv2020 } from "ajv/dist/2020.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccounts } from "../src/accounts.ts";
import { createCourses } from "../src/ai/courses.ts";
import { createGateway } from "../src/ai/gateway.ts";
import { createApp, type App } from "../src/app.ts";
import { openDatabase, type Database } from "../src/db/index.ts";

const ADMIN = "review-token-for-tests";
const YUE = "yue-Hant-HK/standard" as OrthographyId;
const clock = Date.parse("2026-06-03T10:00:00Z");
const courses = createCourses();
const yue = courses.get("yue", YUE);
if (yue === undefined) throw new Error("the yue bundle is committed");

let database: Database;
let app: App;
beforeAll(async () => {
  database = await openDatabase({ pglite: "memory" });
  const gateway = createGateway({ db: database.db, provider: undefined });
  app = createApp({ db: database.db, accounts: createAccounts(database.db), now: () => clock, ai: { gateway, courses, gates: [] }, adminToken: ADMIN });
});
afterAll(async () => database.close());

const request = (method: string, body: unknown, token?: string): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

let accounts = 0;
const signUp = async (): Promise<string> => {
  const res = await app.request("/v1/auth/sign-up", request("POST", { email: `fix${String(++accounts)}@example.org`, password: "correct horse battery" }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { token: string }).token;
};

let ids = 0;
/** A learner's correction of s.6 (早晨呀！): the particle's reading, or the translation. */
const correct = (edit: { reading?: string; translation?: string; note?: string }, item = "s.6"): SentenceReported => {
  const target = correctable(yue, item);
  if (target === undefined) throw new Error(`yue has ${item}`);
  const shown = shownOf(target);
  const draft = draftFrom(shown);
  const form = draft.forms[YUE] ?? { text: "", readings: [] };
  const made = correctionOf(shown, {
    ...draft,
    forms: { [YUE]: { ...form, readings: edit.reading === undefined ? form.readings : [form.readings[0] ?? "", edit.reading] } },
    translation: edit.translation ?? draft.translation,
    note: edit.note ?? "",
  });
  if (!made.ok) throw new Error(made.error.code);
  const n = ++ids;
  return sentenceReportedOf(yue, target, shown, made.value, {
    id: `00000000-0000-7000-b000-${n.toString(16).padStart(12, "0")}`,
    clientTime: new Date(clock + n * 1000).toISOString(),
    localDate: "2026-06-03",
    tz: "Asia/Hong_Kong",
    device: "d",
    session: "00000000-0000-7000-b000-ffffffffffff",
    bundle: "0".repeat(64),
  });
};

const upload = async (token: string, events: readonly unknown[]): Promise<{ accepted: number; duplicates: number }> => {
  const res = await app.request("/v1/events", request("POST", { events }, token));
  expect(res.status).toBe(200);
  return (await res.json()) as { accepted: number; duplicates: number };
};

interface Row {
  readonly id: string;
  readonly item: string;
  readonly correction: CorrectionFields;
  readonly reports: number;
  readonly notes: readonly string[];
  readonly status: string;
}
const queue = async (query = ""): Promise<Row[]> => {
  const res = await app.request(`/admin/v1/corrections${query}`, request("GET", undefined, ADMIN));
  expect(res.status).toBe(200);
  return ((await res.json()) as { corrections: Row[] }).corrections;
};
const readingOf = (r: Row): string | undefined => r.correction.forms?.[YUE]?.readings?.[0]?.reading;

describe("the corrections queue", () => {
  it("files the same correction from two learners as one row, with both notes", async () => {
    const [a, b] = [await signUp(), await signUp()];
    await upload(a, [correct({ reading: "aa4", note: "rising tone here" })]);
    await upload(b, [correct({ reading: "aa4", note: "should be aa4" })]);
    const rows = (await queue("?status=pending")).filter((r) => r.item === "s.6" && readingOf(r) === "aa4");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reports).toBe(2);
    expect([...(rows[0]?.notes ?? [])].sort()).toEqual(["rising tone here", "should be aa4"]);
  });

  it("lets a learner's later correction replace their earlier one, even if an upload is retried", async () => {
    const [a, b] = [await signUp(), await signUp()];
    const first = correct({ translation: "Morning to you!" });
    await upload(a, [first]);
    await upload(b, [correct({ translation: "Morning to you!" })]);
    const later = correct({ translation: "Good morning to you!" });
    await upload(a, [later]);
    // The device never heard back about its first upload and sends it again: nothing moves.
    expect(await upload(a, [first])).toMatchObject({ accepted: 0, duplicates: 1 });
    const byText = (t: string): Row | undefined => (rows ?? []).find((r) => r.correction.translation === t);
    let rows = await queue();
    expect(byText("Morning to you!")?.reports).toBe(1);
    expect(byText("Good morning to you!")?.reports).toBe(1);
    // Once nobody stands behind a pending correction, it leaves the queue.
    await upload(b, [correct({ translation: "Good morning to you!" })]);
    rows = await queue();
    expect(byText("Morning to you!")).toBeUndefined();
    expect(byText("Good morning to you!")?.reports).toBe(2);
  });

  it("keeps the event but queues nothing for an item the course does not have", async () => {
    const token = await signUp();
    const stray = { ...correct({ note: "?" }), item: "s.9999" };
    expect(await upload(token, [stray])).toMatchObject({ accepted: 1 });
    expect((await queue()).some((r) => r.item === "s.9999")).toBe(false);
  });

  it("is for reviewers: approve a row, export approved rows as valid JSON Lines, mark them applied", async () => {
    expect((await app.request("/admin/v1/corrections", request("GET", undefined, "wrong"))).status).toBe(401);
    expect((await app.request("/admin/v1/corrections?status=maybe", request("GET", undefined, ADMIN))).status).toBe(400);
    const row = (await queue()).find((r) => readingOf(r) === "aa4");
    expect((await app.request(`/admin/v1/corrections/${row?.id ?? ""}`, request("POST", { status: "pending" }, ADMIN))).status).toBe(400);
    expect((await app.request(`/admin/v1/corrections/${row?.id ?? ""}`, request("POST", { status: "approved" }, ADMIN))).status).toBe(204);
    expect((await app.request("/admin/v1/corrections/00000000-0000-7000-b000-000000000000", request("POST", { status: "approved" }, ADMIN))).status).toBe(404);

    const res = await app.request("/admin/v1/corrections.jsonl?status=approved", request("GET", undefined, ADMIN));
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as unknown);
    const ajv = new Ajv2020({ strict: true, validateFormats: false });
    ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
    const schema = (file: string): object => JSON.parse(readFileSync(new URL(`../../../schemas/${file}`, import.meta.url), "utf8")) as object;
    ajv.addSchema(schema("common.schema.json"));
    ajv.addSchema(schema("correction.schema.json"));
    const valid = ajv.compile({ $ref: "https://nabu.invalid/schemas/v0/correction.schema.json#/$defs/SentenceCorrection" });
    expect(lines).toHaveLength(1);
    expect(lines.every((l) => valid(l))).toBe(true);
    expect(lines[0]).toMatchObject({ item: "s.6", status: "approved", reports: 2, shown: { forms: { [YUE]: { text: "早晨呀！" } } } });

    expect((await app.request(`/admin/v1/corrections/${row?.id ?? ""}`, request("POST", { status: "applied" }, ADMIN))).status).toBe(204);
    expect((await queue("?status=applied")).map((r) => r.id)).toEqual([row?.id]);
  });
});
