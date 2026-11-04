/**
 * Filing the report intake as GitHub issues (ADR 0055): what the scheduled job does.
 *
 * Every network call is injected, so tests run it against fakes. Each run:
 * 1. Signs in to Google as the job's service account and reads up to `limit` reports with status
 *    `new` from the intake collection.
 * 2. Checks each against schemas/report.schema.json. A report that fails is marked `rejected`,
 *    with the reason.
 * 3. Files one issue per sentence or story line: the first report opens it, and later ones are
 *    comments (a closed issue is reopened). The issue for each item is remembered in the
 *    `nabu_report_issues` collection.
 * 4. Marks the report `filed`, with its issue number.
 *
 * A report is marked only after its issue or comment exists. A run that fails partway leaves the
 * rest `new` for the next run, and at worst repeats one comment.
 */
import { createHash, createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import type { CourseView } from "@nabu/core/lesson";
import { issueKeyOf, issueOf, labelsOf, REPORTS_COLLECTION, reportSection } from "@nabu/core/reports";
import type { ReportSubmission } from "@nabu/schema";
import { Ajv2020 } from "ajv/dist/2020.js";

const SCHEMAS = new URL("../../../schemas/", import.meta.url);
const schema = (file: string): object => JSON.parse(readFileSync(new URL(file, SCHEMAS), "utf8")) as object;

const ajv = new Ajv2020({ strict: true, allErrors: false });
ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
ajv.addSchema(schema("common.schema.json"));
ajv.addSchema(schema("correction.schema.json"));
ajv.addSchema(schema("report.schema.json"));
const validate = ajv.getSchema("https://nabu.invalid/schemas/v0/report.schema.json#/$defs/ReportSubmission");
if (validate === undefined) throw new Error("schemas/report.schema.json has no ReportSubmission");
const isReport = (data: unknown): data is ReportSubmission => validate(data) === true;

export const ISSUES_COLLECTION = "nabu_report_issues";

/** A Google service account's key file (the fields used here). */
export interface ServiceAccount {
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
}

export interface FilingEnv {
  /** The Firebase (Google Cloud) project that holds the intake. */
  readonly project: string;
  readonly serviceAccount: ServiceAccount;
  /** owner/name of the repository the issues go to. */
  readonly repository: string;
  readonly githubToken: string;
  readonly collection?: string | undefined;
  /** Reports handled in one run. */
  readonly limit?: number | undefined;
}

export interface FilingDeps {
  readonly fetch: typeof fetch;
  /** Seconds since the epoch (token times). */
  readonly now: () => number;
  /** The current bundle's view of a course, to quote the item. */
  readonly course: (course: string, orthography: string) => CourseView | undefined;
  readonly log: (line: string) => void;
}

export interface FilingResult {
  readonly opened: number;
  readonly commented: number;
  readonly rejected: number;
}

const base64url = (data: string | Buffer): string => Buffer.from(data).toString("base64url");

/** An OAuth access token for the service account (JWT bearer grant, RS256). */
export const googleToken = async (sa: ServiceAccount, deps: Pick<FilingDeps, "fetch" | "now">): Promise<string> => {
  const iat = Math.floor(deps.now());
  const aud = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud, iat, exp: iat + 3600 }))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key);
  const res = await deps.fetch(aud, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }).toString(),
  });
  if (!res.ok) throw new Error(`Google sign-in failed: ${String(res.status)} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
};

type Fields = Readonly<Record<string, { readonly stringValue?: string; readonly integerValue?: string }>>;
interface Doc {
  readonly name: string;
  readonly fields?: Fields;
}

export const fileReports = async (env: FilingEnv, deps: FilingDeps): Promise<FilingResult> => {
  const collection = env.collection ?? REPORTS_COLLECTION;
  const root = `https://firestore.googleapis.com/v1/projects/${env.project}/databases/(default)/documents`;
  const token = await googleToken(env.serviceAccount, deps);
  const firestore = async (url: string, init: RequestInit = {}): Promise<Response> =>
    deps.fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const github = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await deps.fetch(`https://api.github.com/repos/${env.repository}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${env.githubToken}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    });
    if (!res.ok) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${String(res.status)} ${await res.text()}`);
    return (await res.json()) as T;
  };
  const mark = async (doc: Doc, fields: Readonly<Record<string, { stringValue: string } | { integerValue: string }>>): Promise<void> => {
    const mask = Object.keys(fields)
      .map((f) => `updateMask.fieldPaths=${f}`)
      .join("&");
    const res = await firestore(`https://firestore.googleapis.com/v1/${doc.name}?${mask}`, { method: "PATCH", body: JSON.stringify({ fields }) });
    if (!res.ok) throw new Error(`Firestore update ${doc.name}: ${String(res.status)} ${await res.text()}`);
  };

  const query = await firestore(`${root}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "new" } } },
        limit: env.limit ?? 50,
      },
    }),
  });
  if (!query.ok) throw new Error(`Firestore query: ${String(query.status)} ${await query.text()}`);
  const docs = ((await query.json()) as { document?: Doc }[]).flatMap((r) => (r.document === undefined ? [] : [r.document]));

  let opened = 0;
  let commented = 0;
  let rejected = 0;
  for (const doc of docs) {
    let report: unknown;
    try {
      report = JSON.parse(doc.fields?.["payload"]?.stringValue ?? "");
    } catch {
      report = undefined;
    }
    if (!isReport(report)) {
      const why = validate.errors?.[0];
      await mark(doc, { status: { stringValue: "rejected" }, reason: { stringValue: why === undefined ? "not JSON" : `${why.instancePath} ${why.message ?? ""}`.slice(0, 500) } });
      deps.log(`rejected ${doc.name}`);
      rejected++;
      continue;
    }
    const key = issueKeyOf(report);
    const keyDoc = `${root}/${ISSUES_COLLECTION}/${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
    const known = await firestore(keyDoc);
    let issue: number;
    if (known.ok) {
      issue = Number(((await known.json()) as Doc).fields?.["issue"]?.integerValue);
      const current = await github<{ state: string }>(`/issues/${String(issue)}`);
      await github(`/issues/${String(issue)}/comments`, { method: "POST", body: JSON.stringify({ body: reportSection(report) }) });
      await github(`/issues/${String(issue)}/labels`, { method: "POST", body: JSON.stringify({ labels: labelsOf(report) }) });
      if (current.state === "closed") await github(`/issues/${String(issue)}`, { method: "PATCH", body: JSON.stringify({ state: "open" }) });
      commented++;
    } else if (known.status === 404) {
      const draft = issueOf(report, deps.course(report.course, report.orthography));
      issue = (await github<{ number: number }>("/issues", { method: "POST", body: JSON.stringify(draft) })).number;
      const saved = await firestore(`${keyDoc}?currentDocument.exists=false`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { key: { stringValue: key }, issue: { integerValue: String(issue) } } }),
      });
      if (!saved.ok) throw new Error(`Firestore issue map ${key}: ${String(saved.status)} ${await saved.text()}`);
      opened++;
    } else {
      throw new Error(`Firestore read ${key}: ${String(known.status)} ${await known.text()}`);
    }
    await mark(doc, { status: { stringValue: "filed" }, issue: { integerValue: String(issue) } });
    deps.log(`filed ${report.id} → #${String(issue)} (${key})`);
  }
  return { opened, commented, rejected };
};
