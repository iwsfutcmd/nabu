/**
 * Writes simulated learners' event logs as JSONL (one event per line): 30 days
 * each, on every fixture course and orthography, weak to strong. First tries
 * carry the planner's p̂, so the log feeds the calibration notebook before any
 * real learner exists:
 *
 *   pnpm --filter @nabu/core simulate --out /tmp/simulated.jsonl
 *   cd pipeline && uv run nabu calibration /tmp/simulated.jsonl
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { LearnerEvent } from "@nabu/schema";
import { simulate } from "../test/simulator.ts";

const { values } = parseArgs({ options: { out: { type: "string", default: "simulated-events.jsonl" } } });
const LEARNERS: readonly (readonly [string, string | undefined, number])[] = [
  ["fa", undefined, 1.0],
  ["fa", undefined, 2.0],
  ["yue", undefined, 1.3],
  ["uz", "uz-Latn/standard", 1.6],
  ["uz", "uz-Cyrl/standard", 1.0],
  ["apc", "apc-Arab/standard", 1.6],
  ["apc", "apc-Latn/arabizi", 1.3],
];
const lines: string[] = [];
for (const [i, [course, orthography, ability]] of LEARNERS.entries()) {
  const user = `00000000-0000-7000-9000-${(i + 1).toString(16).padStart(12, "0")}`;
  // Each learner's ids get their own prefix, so the logs can be pooled.
  const prefix = (i + 1).toString(16).padStart(8, "0");
  simulate(course, orthography, 100 + i, ability, (e: LearnerEvent) => lines.push(JSON.stringify({ ...e, id: `${prefix}${e.id.slice(8)}`, user })));
}
writeFileSync(values.out, `${lines.join("\n")}\n`);
console.log(`${lines.length} events from ${LEARNERS.length} learners → ${values.out}`);
