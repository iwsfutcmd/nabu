/**
 * How long `replayGame` takes over a year of practice: a synthetic learner (seeded) who practises
 * most days, one to three sessions a day, at home in Berlin (DST both ways) with trips to New York
 * and Tokyo, sometimes offline for a day and a half. Times the replay as the device runs it (no
 * receipt times) and as the server does (receipt times), from sorted and from shuffled input.
 * Prints timings only; nothing here asserts a time (they vary by machine).
 *
 *   pnpm --filter @nabu/core bench:game
 *   pnpm --filter @nabu/core bench:game --runs 50 --dump /tmp/game.json   # also write the states
 */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { countable, DEFAULT_GAME, localDateOf, replayGame, type GameInput } from "../src/game/index.ts";

const { values } = parseArgs({ options: { runs: { type: "string", default: "30" }, days: { type: "string", default: "365" }, dump: { type: "string" } } });
const RUNS = Number(values.runs);
const DAYS = Number(values.days);

/** mulberry32: a small seeded generator, so every run builds the same year. */
const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const random = rng(20261112);
let counter = 0;
const uuid = (): string => `00000000-0000-7000-8000-${(++counter).toString(16).padStart(12, "0")}`;
const DAY = 86_400_000;
const START = Date.parse("2025-11-12T00:00:00Z");

/** Where the learner is on day `d`: home, two weeks in New York, a week in Tokyo. */
const zoneOn = (d: number): string => (d >= 120 && d < 134 ? "America/New_York" : d >= 260 && d < 267 ? "Asia/Tokyo" : "Europe/Berlin");

const TEMPLATES = ["choose-translation", "translate-tap.l2-l1", "listen-tap", "gap-fill", "translate-type.l1-l2"] as const;

const year = (): { readonly events: LearnerEvent[]; readonly received: Map<string, string> } => {
  const events: LearnerEvent[] = [];
  const received = new Map<string, string>();
  let offlineUntil = 0;
  for (let d = 0; d < DAYS; d += 1) {
    if (random() < 0.12) continue; // a day off
    const tz = zoneOn(d);
    const sessions = 1 + Math.floor(random() * 3);
    // Now and then the phone is offline from this morning until tomorrow evening.
    if (random() < 0.05) offlineUntil = START + (d + 1) * DAY + 20 * 3_600_000;
    for (let s = 0; s < sessions; s += 1) {
      // A wall-clock hour between 7:00 and 22:00, roughly; the zone's offset moves it in UTC.
      const at = START + d * DAY + (6 + s * 5 + random() * 4) * 3_600_000;
      const session = uuid();
      const mode = random() < 0.7 ? "lesson" : random() < 0.6 ? "review" : random() < 0.5 ? "story" : "mistakes";
      const answers = 12 + Math.floor(random() * 9);
      let t = at;
      const base = () => {
        const clientTime = new Date(t).toISOString();
        t += 4_000 + Math.floor(random() * 20_000);
        return { id: uuid(), schema: 1 as const, device: "d", course: "fa", orthography: "fa-Arab/standard" as OrthographyId, support: "en", bundle: "b", session, clientTime, localDate: localDateOf(clientTime, tz) ?? "", tz };
      };
      const logged: LearnerEvent[] = [{ ...base(), type: "session_started", mode, seed: 1, exercises: answers, planner: "t" } as unknown as LearnerEvent];
      let right = 0;
      for (let i = 0; i < answers; i += 1) {
        const ok = random() < 0.85;
        if (ok) right += 1;
        const answer = {
          ...base(),
          type: "answer_submitted",
          exercise: { id: `x${i}`, template: TEMPLATES[i % TEMPLATES.length], item: `s.${i}`, kcs: ["sense:salam"] },
          attempt: 1,
          input: { method: "choice", latencyMs: 1500 + Math.floor(random() * 6000) },
          outcome: { kind: ok ? "CORRECT" : "WRONG", notes: [], kcs: [{ kc: "sense:salam", status: ok ? "right" : "wrong" }] },
        } as unknown as LearnerEvent;
        logged.push(answer);
        // Once in a while the learner says a wrong answer should have been accepted.
        if (!ok && random() < 0.1) logged.push({ ...base(), type: "answer_reported", answer: answer.id, exercise: (answer as { exercise: unknown }).exercise, text: "x", claim: "accept" } as unknown as LearnerEvent);
      }
      logged.push({ ...base(), type: "session_completed", mode, summary: { completed: true, exercises: answers, correctFirstTry: right, retries: 0, skipped: 0 } } as unknown as LearnerEvent);
      for (const e of logged) {
        const happened = Date.parse(e.clientTime);
        received.set(e.id, new Date(happened < offlineUntil ? offlineUntil : happened + 2_000).toISOString());
      }
      events.push(...logged);
    }
  }
  return { events, received };
};

const { events, received } = year();
const last = events.at(-1) as LearnerEvent;
const clock = { today: last.localDate, now: new Date(Date.parse(last.clientTime) + 3_600_000).toISOString() };
const device: GameInput[] = events.map((event) => ({ event }));
const server: GameInput[] = events.map((event) => ({ event, receivedAt: received.get(event.id) }));
const shuffled = (inputs: readonly GameInput[]): GameInput[] => {
  const shuffle = rng(7);
  const out = [...inputs];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(shuffle() * (i + 1));
    [out[i], out[j]] = [out[j] as GameInput, out[i] as GameInput];
  }
  return out;
};

/** The first (cold) run, then the median and best of `RUNS` more. */
const time = (label: string, f: () => unknown): void => {
  const cold = performance.now();
  f();
  const first = performance.now() - cold;
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    f();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)] ?? 0;
  console.log(`${label.padEnd(36)} first ${first.toFixed(1).padStart(7)} ms   median ${median.toFixed(1).padStart(7)} ms   best ${(samples[0] ?? 0).toFixed(1).padStart(7)} ms`);
};

console.log(`${events.length} events over ${DAYS} days, ${RUNS} runs each`);
time("replayGame, device, sorted", () => replayGame(device, DEFAULT_GAME, clock));
time("replayGame, server, sorted", () => replayGame(server, DEFAULT_GAME, clock));
const mixed = shuffled(server);
time("replayGame, server, shuffled", () => replayGame(mixed, DEFAULT_GAME, clock));
time("countable, server, sorted", () => countable(server, DEFAULT_GAME, clock.now));

if (values.dump !== undefined) {
  const states = { device: replayGame(device, DEFAULT_GAME, clock), server: replayGame(server, DEFAULT_GAME, clock), shuffled: replayGame(mixed, DEFAULT_GAME, clock), countable: [...countable(server, DEFAULT_GAME, clock.now)] };
  writeFileSync(values.dump, `${JSON.stringify(states, null, 1)}\n`);
  console.log(`states → ${values.dump}`);
}
