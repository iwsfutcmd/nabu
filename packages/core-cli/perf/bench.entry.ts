/**
 * Browser entry for the grading benchmark. Every sample is cold: the profile
 * and accept set are compiled afresh (untimed), so no comparison, fold or
 * letter cache is warm when grade() runs. That is the worst case: a learner's
 * first answer in a session.
 */
import { compileAcceptSet, compileProfile, grade, type ProfileData } from "@nabu/core";
import type { OrthographyProfile } from "@nabu/schema";

export interface BenchCase {
  readonly name: string;
  readonly profile: string;
  readonly accept: string;
  readonly answers: readonly string[];
}

export interface BenchResult {
  readonly name: string;
  readonly samples: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}

const WARMUP = 30;

const run = (profiles: readonly OrthographyProfile[], data: ProfileData, cases: readonly BenchCase[], iterations: number): BenchResult[] =>
  cases.map((c) => {
    const raw = profiles.find((p) => p.id === c.profile);
    if (raw === undefined) throw new Error(`no profile ${c.profile}`);
    const fresh = () => {
      const profile = compileProfile(raw, data);
      if (!profile.ok) throw new Error(JSON.stringify(profile.error));
      const set = compileAcceptSet(c.accept, profile.value);
      if (!set.ok) throw new Error(JSON.stringify(set.error));
      return set.value;
    };
    // Warm the JIT (not the caches: each timed sample below starts from fresh ones).
    for (let i = 0; i < WARMUP; i++) for (const a of c.answers) grade(fresh(), a);
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      for (const a of c.answers) {
        const set = fresh();
        const start = performance.now();
        grade(set, a);
        times.push(performance.now() - start);
      }
    }
    times.sort((x, y) => x - y);
    const at = (q: number): number => times[Math.min(times.length - 1, Math.floor(q * times.length))] as number;
    return { name: c.name, samples: times.length, p50: at(0.5), p95: at(0.95), max: at(1) };
  });

(globalThis as unknown as { nabuBench: typeof run }).nabuBench = run;
