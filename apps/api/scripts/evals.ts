/**
 * pnpm --filter @nabu/api evals            check the golden sets (no model; what CI runs)
 * pnpm --filter @nabu/api evals -- --run   judge every item with the configured model (NABU_LLM…)
 *                                          and write its gates into evals/gates.json
 *
 * A run spends model calls: one per item. Its gates hold only for that model and the judge
 * prompt's current hash; changing prompts/judge.md closes them until the next run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { EvalGate } from "@nabu/schema";
import { createCourses } from "../src/ai/courses.ts";
import { createGateway } from "../src/ai/gateway.ts";
import { providerFromEnv } from "../src/ai/providers.ts";
import { openDatabase } from "../src/db/index.ts";
import { check, EVALS, gatesOf, loadItems, mergeGates, run } from "../src/evals.ts";

const courses = createCourses();
const { items, problems } = loadItems();
const all = [...problems, ...check(items, courses)];
for (const p of all) console.error(p);
console.info(`${items.length} items, ${all.length} problems`);
if (all.length > 0) process.exit(1);

if (process.argv.includes("--run")) {
  const provider = providerFromEnv(process.env, (url, init) => fetch(url, init));
  if (provider === undefined) {
    console.error("No model: set NABU_LLM and NABU_LLM_MODEL (and a key for a hosted API) in the environment.");
    process.exit(2);
  }
  const { db, close } = await openDatabase({ pglite: "memory" });
  const gateway = createGateway({ db, provider, budgets: { perUser: Number.MAX_SAFE_INTEGER, perInstance: Number.MAX_SAFE_INTEGER }, log: () => undefined });
  const groups = await run(items, courses, gateway);
  await close();
  const gates = gatesOf(groups, gateway, new Date().toISOString());
  for (const g of groups) {
    const gate = gates.find((x) => x.course === g.course && x.orthography === g.orthography);
    const misses = g.results.filter((r) => (r.expect === "reject" ? r.accepted !== false : r.accepted !== true));
    console.info(
      `${g.orthography}: false accepts ${((gate?.falseAccept ?? 1) * 100).toFixed(1)}%, false rejects ${((gate?.falseReject ?? 1) * 100).toFixed(1)}% → judge ${gate?.enabled === true ? "ON" : "off"}`,
    );
    for (const m of misses) console.info(`  ${m.id} (${m.category}): expected ${m.expect}, got ${m.verdict === undefined ? "no valid verdict" : `${m.verdict.verdict} ${m.verdict.confidence}`}`);
  }
  const file = new URL("gates.json", EVALS);
  const merged = mergeGates(JSON.parse(readFileSync(file, "utf8")) as EvalGate[], gates);
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
  console.info(`wrote ${file.pathname}`);
}
