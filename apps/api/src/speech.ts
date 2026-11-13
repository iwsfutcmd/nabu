/**
 * Speech scoring on the server (gameplan §10.4, tiers 1 and 2), when an instance runs the speech
 * service (`nabu speech serve`, NABU_SPEECH_URL). Tier 3 (tone) runs on the learner's device.
 *
 *   GET  /v1/speech/status?course=&orthography=   → {tiers: number[]}: what the server can score
 *   POST /v1/speech/score {course, orthography, item, audio, sampleRate}
 *                                                  → {words?: {verdict, heard}, phones?: {errorRate, offTokens}}
 *
 * Tier 1: the service transcribes (never prompted with the sentence); this server grades the
 * transcript against the sentence's own accept set with the same grader as typed answers.
 * Tier 2: the service aligns recognized phones to the expected surface phones.
 *
 * Privacy (§10.4, §14.4): audio passes through memory to the service and is never stored or
 * logged, here or there. Calls count against a daily budget per learner (hashed id).
 */
import { autoTokens, textBase } from "@nabu/core/ai";
import { allSentences, createGrader, type CourseView, type Grader } from "@nabu/core/lesson";
import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import type { Courses } from "./ai/courses.ts";
import type { Gateway } from "./ai/gateway.ts";
import type { Transport } from "./ai/providers.ts";
import type { Env } from "./app.ts";
import type { Db } from "./db/index.ts";
import { llmUsage } from "./db/schema.ts";

/**
 * What each orthography can be scored on. Tier 1 needs the recognizer to write the orthography's
 * own script (Whisper writes Uzbek in Latin and Lebanese in Arabic script); tier 2 needs expected
 * phones it can trust (pinned Jyutping, or eSpeak NG phonemes of a spelling it reads).
 * REVIEW: per-language choices, to revisit with recorded learners.
 */
export const SPEECH_SETUP: Readonly<Record<string, { readonly language: string; readonly tiers: readonly (1 | 2)[]; readonly voice?: string; readonly reading?: string }>> = {
  "fa-Arab/standard": { language: "fa", tiers: [1, 2], voice: "fa" },
  "yue-Hant-HK/standard": { language: "yue", tiers: [1, 2], voice: "yue", reading: "jyutping" },
  "uz-Latn/standard": { language: "uz", tiers: [1, 2], voice: "uz" },
  "uz-Cyrl/standard": { language: "uz", tiers: [] },
  "apc-Arab/standard": { language: "ar", tiers: [1] },
  "apc-Latn/arabizi": { language: "ar", tiers: [] },
};

export const SPEECH_BUDGET = 200;
const MAX_SECONDS = 30;

export interface SpeechDeps {
  readonly db: Db;
  readonly courses: Courses;
  readonly gateway: Gateway;
  /** The speech service's base URL (unset: tiers 1–2 off). */
  readonly url: string | undefined;
  readonly transport: Transport;
  readonly now: () => number;
  readonly budget?: number | undefined;
}

interface ServiceResult {
  readonly transcript?: string;
  readonly phones?: { readonly errorRate: number; readonly offTokens: readonly number[] };
}

const graders = new WeakMap<CourseView, Grader>();
const graderOf = (course: CourseView): Grader => {
  let g = graders.get(course);
  if (g === undefined) {
    g = createGrader(course);
    graders.set(course, g);
  }
  return g;
};

/** Base64 of 16-bit mono PCM, decoded and bounded; undefined when it is not that. */
const pcmOf = (audio: unknown, rate: unknown): Buffer | undefined => {
  if (typeof audio !== "string" || typeof rate !== "number" || !Number.isInteger(rate) || rate < 8000 || rate > 48000) return undefined;
  const pcm = Buffer.from(audio, "base64");
  return pcm.length === 0 || pcm.length % 2 !== 0 || pcm.length > MAX_SECONDS * rate * 2 ? undefined : pcm;
};

export const speechRoutes = (app: Hono<Env>, deps: SpeechDeps): void => {
  const { db, courses, gateway, url, transport, now } = deps;
  const tiersFor = (orthography: string): readonly (1 | 2)[] => (url === undefined ? [] : (SPEECH_SETUP[orthography]?.tiers ?? []));

  app.get("/v1/speech/status", (c) => {
    const course = courses.get(c.req.query("course") ?? "", c.req.query("orthography") ?? "");
    return c.json({ tiers: course === undefined ? [] : tiersFor(course.orthography) });
  });

  app.post("/v1/speech/score", async (c) => {
    const b = (await c.req.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    const course = typeof b?.["course"] === "string" && typeof b["orthography"] === "string" ? courses.get(b["course"], b["orthography"]) : undefined;
    const sentence = course === undefined ? undefined : allSentences(course).find((s) => s.id === b?.["item"]);
    const form = sentence?.forms[course?.orthography ?? ""];
    const pcm = pcmOf(b?.["audio"], b?.["sampleRate"]);
    if (course === undefined || sentence === undefined || form === undefined) return c.json({ error: "unknown-item" }, 404);
    if (pcm === undefined) return c.json({ error: "invalid-audio" }, 400);
    const setup = SPEECH_SETUP[course.orthography];
    const tiers = tiersFor(course.orthography);
    if (url === undefined || setup === undefined || tiers.length === 0) return c.json({ error: "speech-off" }, 404);
    // A daily budget per learner, counted like the AI features (salted hash, never the id).
    const subject = await gateway.subjectOf(c.get("user").id);
    const day = new Date(now()).toISOString().slice(0, 10);
    const [used] = await db
      .insert(llmUsage)
      .values({ subject, day, feature: "speech", calls: 1 })
      .onConflictDoUpdate({ target: [llmUsage.subject, llmUsage.day, llmUsage.feature], set: { calls: sql`${llmUsage.calls} + 1` } })
      .returning({ calls: llmUsage.calls });
    if ((used?.calls ?? 1) > (deps.budget ?? SPEECH_BUDGET)) return c.json({ error: "speech-budget" }, 429);
    let result: ServiceResult;
    try {
      const res = await transport(`${url.replace(/\/+$/u, "")}/v1/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: pcm.toString("base64"),
          sampleRate: b?.["sampleRate"],
          language: setup.language,
          tokens: form.text.tokens,
          tiers,
          ...(setup.voice === undefined ? {} : { voice: setup.voice }),
          ...(setup.reading === undefined ? {} : { reading: setup.reading }),
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) return c.json({ error: res.status === 422 ? "speech-unscorable" : "speech-unavailable" }, res.status === 422 ? 422 : 503);
      result = (await res.json()) as ServiceResult;
    } catch {
      return c.json({ error: "speech-unavailable" }, 503);
    }
    const accept = form.reverse;
    const words =
      result.transcript === undefined || accept === undefined
        ? undefined
        : {
            verdict: graderOf(course).grade(course.orthography, accept, result.transcript).verdict,
            heard: autoTokens(result.transcript, textBase(course.profiles, form.text)),
          };
    return c.json({
      ...(words === undefined ? {} : { words }),
      ...(result.phones === undefined ? {} : { phones: { errorRate: result.phones.errorRate, offTokens: result.phones.offTokens } }),
    });
  });
};
