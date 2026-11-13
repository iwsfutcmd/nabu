/**
 * Browser entry for the grading benchmark. Every sample is cold: the profile
 * and accept set are compiled afresh (untimed), so no comparison, fold or
 * letter cache is warm when grade() runs. That is the worst case for grade()
 * itself; a session's first answer also builds the course's lexicon, which
 * `nabuFirstAnswers` measures on whole courses.
 */
import { compileAcceptSet, compileProfile, grade, type ProfileData } from "@nabu/core";
import { allSentences, assembleCourse, createGrader, prepareGrading, type CourseView } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { BundleManifest, OrthographyProfile } from "@nabu/schema";

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

/** A course bundle as the app loads it: the manifest and every non-media file, parsed. */
export interface CourseCase {
  readonly name: string;
  readonly orthography: string;
  readonly manifest: BundleManifest;
  readonly files: readonly (readonly [string, unknown])[];
}

export interface FirstAnswerResult {
  readonly name: string;
  /** A session's first answer on a course just loaded, its lexicon not built yet: each sample. */
  readonly cold: readonly number[];
  /** A session's first answer (a new grader) once the app has prepared the course. */
  readonly warm: Omit<BenchResult, "name">;
}

/**
 * The first answer of a session (the review's R5): every session makes a grader, and the course's
 * lexicon (every word it writes, for WRONG_WORD) is built on its first answer unless the app has
 * prepared it (`prepareGrading`, while the learner looks at the course). The answer is the first
 * sentence's text, typed as shown; the accept set is compiled in the timed call, as in the app.
 */
const firstAnswers = (numberingSystems: Readonly<Record<string, string>>, cases: readonly CourseCase[], iterations: number): FirstAnswerResult[] =>
  cases.map((c) => {
    const files = new Map(c.files);
    // Each assembly is a course just loaded: new units, so no lexicon yet.
    const assemble = (): CourseView => {
      const course = assembleCourse({ manifest: c.manifest, files, numberingSystems }, c.orthography);
      if (!course.ok) throw new Error(JSON.stringify(course.error));
      return course.value;
    };
    const first = (course: CourseView): number => {
      const sentence = allSentences(course).find((s) => s.forms[course.orthography]?.reverse !== undefined && !s.id.startsWith("drill."));
      const form = sentence?.forms[course.orthography];
      if (form?.reverse === undefined) throw new Error(`${c.name}: no sentence to answer`);
      const start = performance.now();
      createGrader(course).grade(course.orthography, form.reverse, surfaceOf(form.text));
      return performance.now() - start;
    };
    for (let i = 0; i < 2; i++) first(assemble()); // the JIT, as for the grading cases
    const cold = [0, 1, 2].map(() => first(assemble()));
    const prepared = assemble();
    prepareGrading(prepared);
    for (let i = 0; i < WARMUP; i++) first(prepared);
    const times = Array.from({ length: iterations }, () => first(prepared)).sort((x, y) => x - y);
    const at = (q: number): number => times[Math.min(times.length - 1, Math.floor(q * times.length))] as number;
    return { name: c.name, cold, warm: { samples: times.length, p50: at(0.5), p95: at(0.95), max: at(1) } };
  });

(globalThis as unknown as { nabuFirstAnswers: typeof firstAnswers }).nabuFirstAnswers = firstAnswers;
