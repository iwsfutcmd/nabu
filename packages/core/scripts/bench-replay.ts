/**
 * How long `replay` takes over a year of practice (ADR 0119): a simulated es learner
 * (test/simulator.ts) who practises three times a day for a year, with an exercise_presented before
 * each answer as the app logs it. Times the replay from sorted and from shuffled input; with
 * --check, also compares the state, as JSON, with the fold before ADR 0119 (test/fold-before-r2.ts).
 * Simulating the year takes minutes: --log keeps it in a file, and reads it from there next time.
 * Prints timings only; nothing here asserts a time (they vary by machine).
 *
 *   pnpm --filter @nabu/core bench:replay --log /tmp/es-year.json
 *   pnpm --filter @nabu/core bench:replay --log /tmp/es-year.json --check
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import type { LearnerEvent } from "@nabu/schema";
import { replay } from "../src/learner/index.ts";
import { seededRng } from "../src/lesson/index.ts";
import { replayBefore } from "../test/fold-before-r2.ts";
import { simulate } from "../test/simulator.ts";

const { values } = parseArgs({ options: { days: { type: "string", default: "365" }, runs: { type: "string", default: "7" }, log: { type: "string" }, check: { type: "boolean", default: false } } });
const RUNS = Number(values.runs);

const simulated = (): LearnerEvent[] => {
  const log: LearnerEvent[] = [];
  let shown = 0;
  const started = performance.now();
  const record = (e: LearnerEvent): void => {
    // The app logs each exercise as it is shown, then the answer.
    if (e.type === "answer_submitted") {
      const { attempt: _attempt, input: _input, outcome: _outcome, ...rest } = e;
      const clientTime = new Date(Date.parse(e.clientTime) - 3000).toISOString();
      log.push({ ...rest, type: "exercise_presented", id: `00000000-0000-7000-a000-${(++shown).toString(16).padStart(12, "0")}`, clientTime, localDate: clientTime.slice(0, 10) });
    }
    log.push(e);
  };
  simulate("es", undefined, 12, 1.3, record, { days: Number(values.days), hours: [8, 13, 19] });
  console.log(`simulated ${values.days} days in ${((performance.now() - started) / 1000).toFixed(0)} s`);
  return log;
};

const stored = values.log !== undefined && existsSync(values.log);
const log = stored ? (JSON.parse(readFileSync(values.log as string, "utf8")) as LearnerEvent[]) : simulated();
if (values.log !== undefined && !stored) writeFileSync(values.log, JSON.stringify(log));

const median = (xs: readonly number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
const time = (events: readonly LearnerEvent[]): number[] =>
  Array.from({ length: RUNS }, () => {
    const t = performance.now();
    replay(events);
    return performance.now() - t;
  });

const state = replay(log);
console.log(`${log.length} events; ${Object.keys(state.cards).length} cards, ${Object.keys(state.performance.kc).length} KCs and ${Object.keys(state.performance.item).length} items in the model`);
for (const [name, events] of [
  ["sorted", log],
  ["shuffled", seededRng(5).shuffle(log)],
] as const) {
  const ms = time(events);
  console.log(`${name}: median ${median(ms).toFixed(0)} ms over ${RUNS} runs (${ms.map((m) => m.toFixed(0)).join(", ")})`);
}
if (values.check) {
  const t = performance.now();
  const before = JSON.stringify(replayBefore(log));
  const same = before === JSON.stringify(state);
  console.log(`the fold before ADR 0119: ${((performance.now() - t) / 1000).toFixed(1)} s, ${same ? "the same state" : "A DIFFERENT STATE"}`);
  if (!same) process.exitCode = 1;
}
