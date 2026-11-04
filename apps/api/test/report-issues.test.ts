/**
 * Filing the report intake as GitHub issues (ADR 0055), against fake Firestore and GitHub
 * endpoints. The job signs in as the service account, opens one issue per item, comments on it
 * for later reports (reopening a closed one), and rejects what does not match the schema.
 */
import { createVerify, generateKeyPairSync } from "node:crypto";
import { submissionOf } from "@nabu/core/reports";
import type { AnswerReported, OrthographyId, SentenceReported } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { createCourses } from "../src/ai/courses.ts";
import { fileReports, ISSUES_COLLECTION } from "../src/report-issues.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const ROOT = "https://firestore.googleapis.com/v1/projects/nabu-test/databases/(default)/documents";
const meta = { schema: 1 as const, device: "d", session: "00000000-0000-7000-8000-00000000abcd", clientTime: "2026-11-04T15:08:00.000+02:00", localDate: "2026-11-04", tz: "Asia/Beirut", bundle: "b".repeat(64) };

const correction = (id: string): SentenceReported => ({
  ...meta,
  id,
  type: "sentence_reported",
  course: "fa",
  orthography: "fa-Arab/standard" as OrthographyId,
  support: "en",
  item: "s.6",
  shown: { forms: { "fa-Arab/standard": { text: "سلام مریم!" } } },
  correction: { forms: { "fa-Arab/standard": { text: "سلام، مریم!" } } },
});
const claim: AnswerReported = {
  ...meta,
  id: "00000000-0000-7000-8000-000000000009",
  type: "answer_reported",
  course: "fa",
  orthography: "fa-Arab/standard" as OrthographyId,
  support: "en",
  answer: "00000000-0000-7000-8000-000000000010",
  exercise: { id: "translate-type.l1-l2:s.6", template: "translate-type.l1-l2", item: "s.6", kcs: [] },
  text: "درود مریم",
};

interface Call {
  readonly method: string;
  readonly url: string;
  readonly body: unknown;
}

/** Fake Google, Firestore and GitHub endpoints, recording every call. */
const fakes = (reports: readonly { readonly id: string; readonly payload: string }[], issueState = "closed") => {
  const calls: Call[] = [];
  const mapped = new Map<string, number>();
  let next = 41;
  const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const parse = (raw: string | undefined): unknown => {
    try {
      return raw === undefined ? undefined : (JSON.parse(raw) as unknown);
    } catch {
      return raw;
    }
  };
  const respond = (input: string | URL | Request, init?: RequestInit): Response => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    const body = parse(typeof init?.body === "string" ? init.body : undefined);
    calls.push({ method, url, body });
    if (url === "https://oauth2.googleapis.com/token") return json({ access_token: "google-token" });
    if (url === `${ROOT}:runQuery`) return json(reports.map((r) => ({ document: { name: `projects/nabu-test/databases/(default)/documents/nabu_reports/${r.id}`, fields: { payload: { stringValue: r.payload } } } })));
    const key = url.startsWith(`${ROOT}/${ISSUES_COLLECTION}/`) ? url.slice(`${ROOT}/${ISSUES_COLLECTION}/`.length).split("?")[0] ?? "" : undefined;
    if (key !== undefined && method === "GET") return mapped.has(key) ? json({ fields: { issue: { integerValue: String(mapped.get(key)) } } }) : json({}, 404);
    if (key !== undefined && method === "PATCH") {
      mapped.set(key, Number((body as { fields: { issue: { integerValue: string } } }).fields.issue.integerValue));
      return json({});
    }
    if (url.includes("/documents/nabu_reports/") && method === "PATCH") return json({});
    if (url === "https://api.github.com/repos/iwsfutcmd/nabu/issues" && method === "POST") return json({ number: next++ });
    if (/\/issues\/\d+$/u.test(url) && method === "GET") return json({ state: issueState });
    if (url.startsWith("https://api.github.com/")) return json({});
    return json({ error: `unexpected ${method} ${url}` }, 500);
  };
  const fetchFake: typeof fetch = (input, init) => Promise.resolve(respond(input, init));
  return { calls, fetch: fetchFake };
};

const env = { project: "nabu-test", serviceAccount: { client_email: "filer@nabu-test.iam.gserviceaccount.com", private_key: privateKey }, repository: "iwsfutcmd/nabu", githubToken: "gh-token" };
const courses = createCourses();
const deps = (f: typeof fetch) => ({ fetch: f, now: () => 1_800_000_000, course: (c: string, o: string) => courses.get(c, o), log: () => undefined });

describe("filing the report intake", () => {
  it("signs in as the service account with an RS256 JWT", async () => {
    const { calls, fetch } = fakes([]);
    await fileReports(env, deps(fetch));
    const assertion = new URLSearchParams(calls[0]?.body as string).get("assertion") ?? "";
    const [header, claims, signature] = assertion.split(".");
    expect(JSON.parse(Buffer.from(claims ?? "", "base64url").toString())).toMatchObject({ iss: env.serviceAccount.client_email, scope: "https://www.googleapis.com/auth/datastore", iat: 1_800_000_000, exp: 1_800_003_600 });
    expect(createVerify("RSA-SHA256").update(`${header ?? ""}.${claims ?? ""}`).verify(publicKey, Buffer.from(signature ?? "", "base64url"))).toBe(true);
  });

  it("opens one issue per item, comments for later reports, and marks each filed", async () => {
    const first = submissionOf(correction("00000000-0000-7000-8000-000000000001"));
    const second = submissionOf(claim);
    const { calls, fetch } = fakes([
      { id: first.id, payload: JSON.stringify(first) },
      { id: second.id, payload: JSON.stringify(second) },
    ]);
    const result = await fileReports(env, deps(fetch));
    expect(result).toEqual({ opened: 1, commented: 1, rejected: 0 });

    const opened = calls.find((c) => c.method === "POST" && c.url.endsWith("/repos/iwsfutcmd/nabu/issues"))?.body as { title: string; body: string; labels: string[] };
    expect(opened.title).toMatch(/^\[fa\] s\.6/u);
    expect(opened.labels).toEqual(["report", "course:fa", "correction"]);
    // The issue quotes the sentence from the bundle, with its accept sets.
    expect(opened.body).toContain("Accepted answers in fa-Arab/standard");
    // The second report is a comment on the same issue, which is reopened (it was closed).
    const comment = calls.find((c) => c.method === "POST" && c.url.endsWith("/issues/41/comments"))?.body as { body: string };
    expect(comment.body).toContain("Should have been accepted");
    expect(calls.some((c) => c.method === "PATCH" && c.url.endsWith("/issues/41") && (c.body as { state: string }).state === "open")).toBe(true);
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/issues/41/labels"))).toBe(true);
    // Both reports are marked filed with the issue's number.
    const marked = calls.filter((c) => c.method === "PATCH" && c.url.includes("/documents/nabu_reports/"));
    expect(marked.map((c) => (c.body as { fields: { status: { stringValue: string }; issue: { integerValue: string } } }).fields)).toEqual([
      { status: { stringValue: "filed" }, issue: { integerValue: "41" } },
      { status: { stringValue: "filed" }, issue: { integerValue: "41" } },
    ]);
    expect(marked[0]?.url).toContain("updateMask.fieldPaths=status&updateMask.fieldPaths=issue");
  });

  it("rejects what is not a report, and files nothing for it", async () => {
    const bad = { ...submissionOf(claim), device: "sneaky" };
    const { calls, fetch } = fakes([
      { id: "x1", payload: "not json" },
      { id: "x2", payload: JSON.stringify(bad) },
    ]);
    expect(await fileReports(env, deps(fetch))).toEqual({ opened: 0, commented: 0, rejected: 2 });
    expect(calls.some((c) => c.url.startsWith("https://api.github.com/"))).toBe(false);
    const reasons = calls.filter((c) => c.method === "PATCH").map((c) => (c.body as { fields: { status: { stringValue: string } } }).fields.status.stringValue);
    expect(reasons).toEqual(["rejected", "rejected"]);
  });
});
