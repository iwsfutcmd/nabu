/**
 * The age gate (gameplan §14.4, ADR 0069): with a minimum age, sign-up asks for the age, turns
 * away anyone younger, and keeps nothing of the answer; without one, nothing changes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccounts } from "../src/accounts.ts";
import { ageCheck, MAX_AGE, minAgeFromEnv } from "../src/age.ts";
import { createApp, type App } from "../src/app.ts";
import type { Database } from "../src/db/index.ts";
import { users } from "../src/db/schema.ts";
import { testDatabase } from "./database.ts";

let database: Database;
let gated: App;
let open: App;
const PASSWORD = "correct horse battery";
let clock = Date.parse("2026-03-01T09:00:00Z");

beforeAll(async () => {
  database = await testDatabase();
  const deps = { db: database.db, accounts: createAccounts(database.db), now: () => clock, clientOf: () => "one-address" };
  gated = createApp({ ...deps, minAge: 16, limits: { signUp: { max: 3, windowMs: 60_000 } } });
  open = createApp(deps);
});
afterAll(async () => database.close());

const signUp = (app: App, body: Record<string, unknown>): Promise<Response> =>
  Promise.resolve(app.request("/v1/auth/sign-up", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: PASSWORD, ...body }) }));
const errorOf = async (res: Response): Promise<unknown> => ((await res.json()) as { error?: unknown }).error;

describe("the age gate", () => {
  it("asks for the age, without using up an attempt", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await signUp(gated, { email: "asked@example.com" });
      expect(res.status).toBe(400);
      expect(await errorOf(res)).toBe("age-required");
    }
    expect(await database.db.select().from(users)).toEqual([]);
  });

  it("turns away anyone younger, creating nothing, and counts the attempt", async () => {
    const res = await signUp(gated, { email: "young@example.com", age: 15 });
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe("age");
    expect(await database.db.select().from(users)).toEqual([]);
  });

  it("refuses an age that is not a whole number of years", async () => {
    for (const age of [-1, 15.5, MAX_AGE + 1, "16", true, [16]]) {
      const res = await signUp(gated, { email: "odd@example.com", age });
      expect(res.status, JSON.stringify(age)).toBe(400);
      expect(await errorOf(res)).toBe("invalid-request");
      clock += 60_000;
    }
  });

  it("creates the account at the minimum age or over, and keeps no age", async () => {
    const res = await signUp(gated, { email: "old-enough@example.com", age: 16 });
    expect(res.status).toBe(201);
    const [row] = await database.db.select().from(users);
    // No column holds the age, and none is named for it. The time stamp and the password hash are
    // left out of the search: a sign-up at 13:16, or a random salt, holds a 16 by chance.
    const { createdAt: _created, passwordHash: _hash, ...kept } = row ?? {};
    expect(JSON.stringify(kept)).not.toMatch(/\b16\b/u);
    expect(Object.keys(row ?? {}).some((k) => /age|birth/iu.test(k))).toBe(false);
  });

  it("asks nothing without a minimum age, and ignores an age sent anyway", async () => {
    expect((await signUp(open, { email: "no-gate@example.com" })).status).toBe(201);
    expect((await signUp(open, { email: "no-gate-young@example.com", age: 9 })).status).toBe(201);
  });

  it("never gates signing in", async () => {
    const res = await gated.request("/v1/auth/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "no-gate@example.com", password: PASSWORD }) });
    expect(res.status).toBe(200);
  });
});

describe("the gate's rules", () => {
  it("decides on whole years", () => {
    expect(ageCheck(undefined, undefined)).toEqual({ ok: true });
    expect(ageCheck(13, undefined)).toEqual({ ok: false, error: "age-required" });
    expect(ageCheck(13, null)).toEqual({ ok: false, error: "age-required" });
    expect(ageCheck(13, 12)).toEqual({ ok: false, error: "age" });
    expect(ageCheck(13, 13)).toEqual({ ok: true });
    expect(ageCheck(13, 0)).toEqual({ ok: false, error: "age" });
    expect(ageCheck(13, Number.NaN)).toEqual({ ok: false, error: "invalid-request" });
  });

  it("reads NABU_MIN_AGE, empty meaning unset", () => {
    expect(minAgeFromEnv(undefined)).toBeUndefined();
    expect(minAgeFromEnv("")).toBeUndefined();
    expect(minAgeFromEnv(" ")).toBeUndefined();
    expect(minAgeFromEnv("13")).toBe(13);
    for (const bad of ["0", "-3", "13.5", "thirteen", "999"]) expect(() => minAgeFromEnv(bad), bad).toThrow(/NABU_MIN_AGE/u);
  });
});
