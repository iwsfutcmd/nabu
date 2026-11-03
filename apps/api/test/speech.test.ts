/**
 * Phase 9 on the server: speech scoring tiers 1–2 through the speech service. A stand-in service
 * answers here (the real one is tested in the pipeline with the models, NABU_SPEECH=1); this
 * tests the plumbing: per-orthography tiers, grading the transcript with the course's own accept
 * set, bounds on the audio, the budget, failures, and that no audio or transcript is kept.
 */
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAccounts } from "../src/accounts.ts";
import { createCourses } from "../src/ai/courses.ts";
import { createGateway } from "../src/ai/gateway.ts";
import type { Transport } from "../src/ai/providers.ts";
import { createApp, type App } from "../src/app.ts";
import { openDatabase, type Database } from "../src/db/index.ts";

let database: Database;
let app: App;
let reply: { status: number; body: unknown } = { status: 200, body: {} };
const sent: Record<string, unknown>[] = [];
const service: Transport = (_url, init) => {
  sent.push(JSON.parse(init.body) as Record<string, unknown>);
  return Promise.resolve({ ok: reply.status < 400, status: reply.status, json: () => Promise.resolve(reply.body) });
};

beforeAll(async () => {
  database = await openDatabase({ pglite: "memory" });
  const ai = { gateway: createGateway({ db: database.db, provider: undefined }), courses: createCourses(), gates: [] };
  app = createApp({ db: database.db, accounts: createAccounts(database.db), ai, speech: { url: "http://speech.invalid", transport: service, budget: 3 } });
});
afterAll(async () => database.close());

const request = (method: string, body: unknown, token?: string): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json", ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
let n = 0;
const signUp = async (): Promise<string> => ((await (await app.request("/v1/auth/sign-up", request("POST", { email: `speaker${++n}@example.org`, password: "correct horse battery" }))).json()) as { token: string }).token;

const audio = Buffer.alloc(16000 * 2).toString("base64"); // one second of 16 kHz silence
const fa = { course: "fa", orthography: "fa-Arab/standard", item: "s.13", audio, sampleRate: 16000 }; // من مریم هستم

describe("speech status", () => {
  it("offers the tiers an orthography can be scored on", async () => {
    const token = await signUp();
    const tiers = async (course: string, orthography: string) => ((await (await app.request(`/v1/speech/status?course=${course}&orthography=${encodeURIComponent(orthography)}`, request("GET", undefined, token))).json()) as { tiers: number[] }).tiers;
    expect(await tiers("fa", "fa-Arab/standard")).toEqual([1, 2]);
    expect(await tiers("yue", "yue-Hant-HK/standard")).toEqual([1, 2]);
    expect(await tiers("apc", "apc-Arab/standard")).toEqual([1]);
    expect(await tiers("apc", "apc-Latn/arabizi")).toEqual([]);
    const off = createApp({ db: database.db, accounts: createAccounts(database.db), ai: { gateway: createGateway({ db: database.db, provider: undefined }), courses: createCourses(), gates: [] }, speech: { url: undefined, transport: service } });
    expect(await (await off.request("/v1/speech/status?course=fa&orthography=fa-Arab%2Fstandard", request("GET", undefined, token))).json()).toEqual({ tiers: [] });
  });
});

describe("speech scoring", () => {
  it("grades the transcript with the sentence's own accept set, and passes phones through", async () => {
    const token = await signUp();
    reply = { status: 200, body: { transcript: "من مریم هستم", phones: { errorRate: 0.1, offTokens: [], heard: ["m", "a", "n"] } } };
    const res = await app.request("/v1/speech/score", request("POST", fa, token));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { words: { verdict: string; heard: { lang: string } }; phones: unknown };
    expect(body.words.verdict).toBe("CORRECT");
    expect(body.words.heard.lang).toMatch(/^fa/u);
    expect(body.phones).toEqual({ errorRate: 0.1, offTokens: [] }); // the recognizer's raw phones stay on the server
    // The service got the language, the tokens (for expected phones) and the tiers, and nothing to prompt with.
    expect(sent.at(-1)).toMatchObject({ language: "fa", voice: "fa", tiers: [1, 2], sampleRate: 16000 });
    expect(sent.at(-1)).not.toHaveProperty("prompt");
    reply = { status: 200, body: { transcript: "خداحافظ" } };
    const wrong = (await (await app.request("/v1/speech/score", request("POST", fa, token))).json()) as { words: { verdict: string } };
    expect(wrong.words.verdict).toBe("WRONG");
  });

  it("refuses audio it cannot take, and says when the service fails", async () => {
    const token = await signUp();
    expect((await app.request("/v1/speech/score", request("POST", { ...fa, audio: "AAAA" }, token))).status).toBe(400);
    expect((await app.request("/v1/speech/score", request("POST", { ...fa, audio: Buffer.alloc(16000 * 2 * 31).toString("base64") }, token))).status).toBe(400);
    expect((await app.request("/v1/speech/score", request("POST", { ...fa, item: "s.999" }, token))).status).toBe(404);
    expect((await app.request("/v1/speech/score", request("POST", { ...fa, course: "apc", orthography: "apc-Latn/arabizi", item: "s.1" }, token))).status).toBe(404);
    reply = { status: 503, body: {} };
    expect((await app.request("/v1/speech/score", request("POST", fa, token))).status).toBe(503);
  });

  it("stops at the learner's daily budget, and needs an account", async () => {
    const token = await signUp();
    reply = { status: 200, body: { transcript: "من مریم هستم" } };
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await app.request("/v1/speech/score", request("POST", fa, token))).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect((await app.request("/v1/speech/score", request("POST", fa))).status).toBe(401);
  });
});

describe("speech privacy", () => {
  it("keeps no audio and no transcript: nothing from the request is in any table or any log", async () => {
    const token = await signUp();
    // A recognizable second of audio (a ramp), so any stored copy, raw or base64, would show.
    const pcm = Buffer.alloc(16000 * 2);
    for (let i = 0; i < 16000; i++) pcm.writeInt16LE(((i * 37) % 20000) - 10000, i * 2);
    const marked = pcm.toString("base64");
    reply = { status: 200, body: { transcript: "من مریم هستم", phones: { errorRate: 0.1, offTokens: [], heard: ["m", "a", "n"] } } };
    const logged: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(" "));
      }),
    );
    try {
      expect((await app.request("/v1/speech/score", request("POST", { ...fa, audio: marked }, token))).status).toBe(200);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    const probes = [marked.slice(1000, 1064), pcm.subarray(1000, 1048).toString("hex"), "مریم"];
    const rowsOf = async <R>(query: Parameters<Database["db"]["execute"]>[0]): Promise<R[]> => {
      const result: unknown = await database.db.execute(query);
      return (result as { rows: R[] }).rows;
    };
    const tables = await rowsOf<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'public'`);
    expect(tables.length).toBeGreaterThan(5);
    for (const { table_name: table } of tables) {
      const rows = await rowsOf<{ j: string }>(sql.raw(`select row_to_json(t)::text as j from "${table}" t`));
      for (const { j } of rows) for (const probe of probes) expect(j, table).not.toContain(probe);
    }
    for (const probe of probes) expect(logged.join("\n")).not.toContain(probe);
  });
});
