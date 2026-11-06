/**
 * The judge's golden sets and evaluation harness (§13.6). CI runs check mode on every change:
 * every item must be a real judge case. Run mode is exercised with a scripted model to check
 * the gate arithmetic and the gates file; real gates come only from a real model's run.
 */
import { readFileSync } from "node:fs";
import { GATE_MIN_ADVERSARIAL } from "@nabu/core/ai";
import type { EvalGate } from "@nabu/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCourses } from "../src/ai/courses.ts";
import { createGateway, validAi } from "../src/ai/gateway.ts";
import type { Provider } from "../src/ai/providers.ts";
import type { Database } from "../src/db/index.ts";
import { testDatabase } from "./database.ts";
import { check, EVALS, gatesOf, loadItems, mergeGates, run } from "../src/evals.ts";

const courses = createCourses();
const { items, problems } = loadItems();

describe("golden sets (check mode)", () => {
  it("are valid judge cases, enough of them per course orthography", () => {
    expect([...problems, ...check(items, courses)]).toEqual([]);
    const orthographies = new Set(items.map((i) => i.item.orthography));
    expect([...orthographies].sort()).toEqual(["apc-Arab/standard", "apc-Latn/arabizi", "fa-Arab/standard", "uz-Cyrl/standard", "uz-Latn/standard", "yue-Hant-HK/standard"]);
    for (const o of orthographies) expect(items.filter((i) => i.item.orthography === o && i.item.expect === "reject").length).toBeGreaterThanOrEqual(GATE_MIN_ADVERSARIAL);
  });

  it("catch an item the grader already decides", () => {
    const [first] = items;
    if (first === undefined) throw new Error("no items");
    const solved = { ...first, item: { ...first.item, id: "x.1", answer: "سلام", item: "s.1", orthography: "fa-Arab/standard" as const, course: "fa" }, file: "fa.jsonl" };
    expect(check([solved as never], courses)[0]).toMatch(/the grader says CORRECT/u);
  });

  it("the committed gates file is valid, and opens no gate without a run behind it", () => {
    const gates = JSON.parse(readFileSync(new URL("gates.json", EVALS), "utf8")) as unknown[];
    for (const g of gates) expect(validAi("EvalGate", g)).toBe(true);
    for (const g of gates as EvalGate[]) if (g.enabled) expect(g.n).toBeGreaterThanOrEqual(GATE_MIN_ADVERSARIAL);
  });
});

describe("run mode", () => {
  let database: Database;
  beforeAll(async () => {
    database = await testDatabase();
  });
  afterAll(async () => database.close());

  /** A model that rejects everything except the items listed, and fails on others. */
  const model = (accept: ReadonlySet<string>, broken: ReadonlySet<string>): Provider => ({
    name: "ollama",
    model: "scripted",
    complete: (r) => {
      const answer = /<<<LEARNER\n([\s\S]*?)\nLEARNER>>>/u.exec(r.prompt)?.[1] ?? "";
      if (broken.has(answer)) return Promise.resolve({ ok: true, value: { verdict: "perhaps" } });
      return Promise.resolve({ ok: true, value: accept.has(answer) ? { verdict: "accept", confidence: 0.95, category: "paraphrase" } : { verdict: "reject", confidence: 0.95, category: "meaning-change" } });
    },
  });

  it("computes each orthography's gate for the model and prompt hash", async () => {
    const yue = items.filter((i) => i.item.course === "yue");
    const paraphrases = new Set(yue.filter((i) => i.item.expect === "accept").map((i) => i.item.answer));
    const gateway = createGateway({ db: database.db, provider: model(paraphrases, new Set()), budgets: { perUser: 1e6, perInstance: 1e6 }, log: () => undefined });
    const [result] = await run(yue, courses, gateway);
    const [gate] = gatesOf(result === undefined ? [] : [result], gateway, "2026-06-01T00:00:00Z");
    expect(gate).toMatchObject({ course: "yue", orthography: "yue-Hant-HK/standard", model: "scripted", falseAccept: 0, falseReject: 0, enabled: true, promptHash: gateway.promptHash("judge") });
    expect(validAi("EvalGate", gate)).toBe(true);
  });

  it("closes the gate on one false accept in 26, or on an adversarial item without a valid verdict", async () => {
    const fa = items.filter((i) => i.item.course === "fa");
    const adversarial = fa.filter((i) => i.item.expect === "reject").map((i) => i.item.answer);
    const leaky = createGateway({ db: database.db, provider: model(new Set([adversarial[0] ?? ""]), new Set()), budgets: { perUser: 1e6, perInstance: 1e6 }, log: () => undefined });
    const [leak] = gatesOf(await run(fa, courses, leaky), leaky, "2026-06-01T00:00:00Z");
    expect(leak?.enabled).toBe(false);
    const flaky = createGateway({ db: database.db, provider: model(new Set(), new Set([adversarial[1] ?? ""])), budgets: { perUser: 1e6, perInstance: 1e6 }, log: () => undefined });
    const [flake] = gatesOf(await run(fa, courses, flaky), flaky, "2026-06-01T00:00:00Z");
    expect(flake?.enabled).toBe(false);
  });

  it("merges a run into the gates file, replacing the same model's gate", () => {
    const g = (model: string, enabled: boolean): EvalGate => ({ course: "fa", orthography: "fa-Arab/standard" as EvalGate["orthography"], provider: "ollama", model, promptHash: "0123456789ab", falseAccept: 0, falseReject: 0, n: 30, enabled, evaluatedAt: "2026-06-01T00:00:00Z" });
    expect(mergeGates([g("a", true), g("b", true)], [g("a", false)])).toEqual([g("a", false), g("b", true)]);
  });
});
