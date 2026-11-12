/**
 * The AI endpoints (gameplan §13, §14.1). All need an account: budgets count per learner.
 *
 *   GET  /v1/ai/status?course=&orthography=  → {judge, explain, roleplay}: what this instance offers
 *   POST /v1/ai/judge         {answer: AnswerSubmitted} → {verdict, revision?}
 *   POST /v1/ai/explain       {answer: AnswerSubmitted} → {explanation, key}
 *   POST /v1/ai/explain/rate  {key, rating: "up" | "down"}
 *   POST /v1/ai/roleplay      {course, orthography, support, scenario, history} → {turn}
 *
 * Without a model (NABU_LLM unset) every feature reports off and the app hides it: the judge
 * falls back to accept sets plus reports (§13.1).
 */
import { acceptForJudge, accepts, answerUnitsPrompt, checkTurn, explanationOf, gateOpen, judgeable, knownForms, productionAccept, provisionalOutcome, autoTokens, ROLEPLAY_HISTORY, type ExplanationContext } from "@nabu/core/ai";
import { localDateOf } from "@nabu/core/game";
import { replay } from "@nabu/core/learner";
import { allSentences, type CourseView } from "@nabu/core/lesson";
import { surfaceOf } from "@nabu/core/text";
import type { AnswerSubmitted, BundleScenario, BundleSentence, EvalGate, ExplanationOutput, JudgeOutput, JudgeVerdict, OutcomeRevised, RoleplayOutput, RoleplayTurn, TaggedText } from "@nabu/schema";
import { createHash } from "node:crypto";
import type { Context, Hono } from "hono";
import type { Env } from "../app.ts";
import type { Db } from "../db/index.ts";
import { explanationRatings } from "../db/schema.ts";
import { uuidv7 } from "../ids.ts";
import { append, eventsOf, validEvent } from "../log.ts";
import { fileReport, normalizedAnswer } from "../reports.ts";
import type { Courses } from "./courses.ts";
import { asData } from "./prompts.ts";
import type { Gateway, GatewayError } from "./gateway.ts";

export interface AiDeps {
  readonly db: Db;
  readonly gateway: Gateway;
  readonly courses: Courses;
  /** Judge gates (evals/gates.json): the judge runs only where one is open for the current model and prompt. */
  readonly gates: readonly EvalGate[];
  readonly now: () => number;
}

/** Templates Explain My Answer covers: translations, typed or built from tiles. */
const EXPLAINED = new Set(["translate-type.l1-l2", "translate-tap.l1-l2", "translate-tap.l2-l1"]);
/** New words a roleplay turn may use beyond the learner's known vocabulary (§13.4 k). */
export const ROLEPLAY_NEW_WORDS = 1;
const ROLEPLAY_ATTEMPTS = 3;
/**
 * A request with more turns than this is not a conversation and is refused. Longer ones are fine:
 * the model sees only the latest ROLEPLAY_HISTORY turns, and the app sends no more than those.
 */
const MAX_TURNS = 200;

const names = new Intl.DisplayNames(["en"], { type: "language" });
/** A language tag as the English name prompts use ("Cantonese (Traditional, Hong Kong)"). */
export const languageName = (tag: string): string => {
  try {
    return names.of(tag) ?? tag;
  } catch {
    return tag;
  }
};

const failure = (c: Context, error: GatewayError) => {
  switch (error) {
    case "off":
    case "killed":
      return c.json({ error: "ai-off" }, 404);
    case "budget":
      return c.json({ error: "ai-budget" }, 429);
    case "unavailable":
      return c.json({ error: "ai-unavailable" }, 503);
    case "invalid-output":
      return c.json({ error: "ai-invalid-output" }, 502);
  }
};

/** What the judge prompt is filled with (§13.2): the course's own sentence and accept set, the answer as data. */
export const judgeVars = (sentence: BundleSentence, orthography: string, supportKey: string, accept: string, raw: string): Record<string, string> => {
  const support = sentence.translations[supportKey];
  return {
    from: languageName(support?.text.lang ?? supportKey),
    to: languageName(sentence.forms[orthography]?.text.lang ?? orthography),
    prompt: text(support?.text),
    accept: acceptForJudge(accept).join("\n"),
    register: sentence.register ?? "everyday",
    answer: asData(raw),
  };
};

export const sentenceOf = (course: CourseView, id: string): BundleSentence | undefined => allSentences(course).find((s) => s.id === id);
const scenarioOf = (course: CourseView, id: string): BundleScenario | undefined => course.units.flatMap((u) => u.scenarios ?? []).find((s) => s.id === id);
const text = (t: TaggedText | undefined): string => (t === undefined ? "" : surfaceOf(t));

/** An answer event from a request body, if it is valid and this user's. */
const answerOf = (body: unknown, user: string): AnswerSubmitted | undefined => {
  const e = typeof body === "object" && body !== null ? (body as { answer?: unknown }).answer : undefined;
  if (!validEvent(e) || e.type !== "answer_submitted" || (e.user !== undefined && e.user !== user)) return undefined;
  return e;
};

export const aiRoutes = (app: Hono<Env>, deps: AiDeps): void => {
  const { db, gateway, courses, gates, now } = deps;
  const judgeOn = (course: string, orthography: string): boolean => {
    const p = gateway.provider;
    return p !== undefined && !gateway.killed("judge", course, orthography) && gateOpen(gates, course, orthography, { provider: p.name, model: p.model, promptHash: gateway.promptHash("judge") });
  };

  app.get("/v1/ai/status", (c) => {
    const course = c.req.query("course") ?? "";
    const orthography = c.req.query("orthography") ?? "";
    const view = courses.get(course, orthography);
    const on = gateway.provider !== undefined && view !== undefined;
    return c.json({
      judge: on && judgeOn(course, orthography),
      explain: on && !gateway.killed("explain", course, orthography),
      roleplay: on && !gateway.killed("roleplay", course, orthography) && view.units.some((u) => (u.scenarios ?? []).length > 0),
    });
  });

  app.post("/v1/ai/judge", async (c) => {
    const user = c.get("user").id;
    const e = answerOf(await c.req.json().catch(() => undefined), user);
    if (e === undefined) return c.json({ error: "invalid-answer" }, 400);
    if (!judgeable(e)) return c.json({ error: "not-judgeable" }, 422);
    const course = courses.get(e.course, e.orthography);
    const sentence = course === undefined ? undefined : sentenceOf(course, e.exercise.item);
    const accept = sentence === undefined ? undefined : productionAccept(sentence, e.orthography);
    if (course === undefined || sentence === undefined || accept === undefined) return c.json({ error: "unknown-item" }, 404);
    if (!judgeOn(e.course, e.orthography)) return c.json({ verdict: null, reason: "off" });
    const raw = e.input.raw ?? "";
    const result = await gateway.call<JudgeOutput>({
      feature: "judge",
      prompt: "judge",
      output: "JudgeOutput",
      subject: await gateway.subjectOf(user),
      course: e.course,
      orthography: e.orthography,
      cacheKey: [e.course, e.orthography, e.exercise.template, sentence.id, normalizedAnswer(courses, e.course, e.orthography, raw)],
      vars: judgeVars(sentence, e.orthography, e.support, accept, raw),
    });
    if (!result.ok) return failure(c, result.error);
    const { output, provenance } = result.value;
    const verdict: JudgeVerdict = { ...output, provenance };
    if (!accepts(output)) return c.json({ verdict });
    // An accept revises the answer (§8.3): the server issues the revision into the learner's log.
    const at = now();
    const iso = new Date(at).toISOString();
    const revision: OutcomeRevised = {
      id: uuidv7(at),
      type: "outcome_revised",
      schema: 1,
      device: "server",
      user,
      course: e.course,
      orthography: e.orthography,
      support: e.support,
      bundle: e.bundle,
      session: e.session,
      clientTime: iso,
      localDate: localDateOf(iso, e.tz) ?? iso.slice(0, 10),
      tz: e.tz,
      answer: e.id,
      outcome: provisionalOutcome(e),
      by: "judge",
      judge: { model: provenance.model, promptHash: provenance.promptHash, confidence: output.confidence },
    };
    await append(db, user, [revision], new Date(at));
    await fileReport(
      db,
      courses,
      { course: e.course, orthography: e.orthography, template: e.exercise.template, item: e.exercise.item, answer: raw, subject: await gateway.subjectOf(user), source: "judge", judge: verdict },
      at,
    );
    return c.json({ verdict, revision });
  });

  app.post("/v1/ai/explain", async (c) => {
    const user = c.get("user").id;
    const e = answerOf(await c.req.json().catch(() => undefined), user);
    if (e === undefined) return c.json({ error: "invalid-answer" }, 400);
    const raw = e.input.raw ?? "";
    if (!EXPLAINED.has(e.exercise.template) || e.outcome.kind.startsWith("CORRECT") || raw.trim() === "") return c.json({ error: "not-explainable" }, 422);
    const course = courses.get(e.course, e.orthography);
    const sentence = course === undefined ? undefined : sentenceOf(course, e.exercise.item);
    const target = sentence?.forms[e.orthography];
    const support = sentence?.translations[e.support];
    if (course === undefined || sentence === undefined || target === undefined || support === undefined) return c.json({ error: "unknown-item" }, 404);
    const intoTarget = e.exercise.template.endsWith("l1-l2");
    const lang = (t: TaggedText): Pick<TaggedText, "lang" | "orthography"> => ({ lang: t.lang, orthography: t.orthography });
    const ctx: ExplanationContext = { support: lang(support.text), target: lang(target.text), answer: raw, answerIn: intoTarget ? lang(target.text) : lang(support.text) };
    const solution = intoTarget ? (acceptForJudge(target.reverse ?? text(target.text))[0] ?? text(target.text)) : (acceptForJudge(support.accept)[0] ?? text(support.text));
    const normalized = normalizedAnswer(courses, e.course, e.orthography, raw);
    const key = createHash("sha256").update(JSON.stringify([e.course, e.orthography, e.support, e.exercise.template, sentence.id, normalized])).digest("hex").slice(0, 32);
    const result = await gateway.call<ExplanationOutput>({
      feature: "explain",
      prompt: "explain",
      output: "ExplanationOutput",
      subject: await gateway.subjectOf(user),
      course: e.course,
      orthography: e.orthography,
      cacheKey: [e.course, e.orthography, e.support, e.exercise.template, sentence.id, normalized],
      temperature: 0.2,
      vars: {
        support: languageName(new Intl.Locale(support.text.lang).language),
        from: languageName(intoTarget ? support.text.lang : target.text.lang),
        to: languageName(intoTarget ? target.text.lang : support.text.lang),
        prompt: intoTarget ? text(support.text) : text(target.text),
        solution,
        notes: e.outcome.notes.length === 0 ? "none" : e.outcome.notes.join(", "),
        answer: asData(raw),
        units: answerUnitsPrompt(ctx),
      },
    });
    if (!result.ok) return failure(c, result.error);
    const explanation = explanationOf(result.value.output, ctx, result.value.provenance);
    if (!explanation.ok) return c.json({ error: "ai-invalid-output" }, 502);
    return c.json({ explanation: explanation.value, key });
  });

  app.post("/v1/ai/explain/rate", async (c) => {
    const b = (await c.req.json().catch(() => undefined)) as { key?: unknown; rating?: unknown } | undefined;
    if (typeof b?.key !== "string" || !/^[0-9a-f]{32}$/u.test(b.key) || (b.rating !== "up" && b.rating !== "down")) return c.json({ error: "invalid-request" }, 400);
    const rating = b.rating === "up" ? 1 : -1;
    await db
      .insert(explanationRatings)
      .values({ key: b.key, subject: await gateway.subjectOf(c.get("user").id), rating })
      .onConflictDoUpdate({ target: [explanationRatings.key, explanationRatings.subject], set: { rating } });
    return c.body(null, 204);
  });

  app.post("/v1/ai/roleplay", async (c) => {
    const user = c.get("user").id;
    const b = (await c.req.json().catch(() => undefined)) as Record<string, unknown> | undefined;
    const { course: courseId, orthography, support: supportKey, scenario: scenarioId, history } = b ?? {};
    if (typeof courseId !== "string" || typeof orthography !== "string" || typeof supportKey !== "string" || typeof scenarioId !== "string" || !Array.isArray(history) || history.length > MAX_TURNS)
      return c.json({ error: "invalid-request" }, 400);
    const lines: { role: "learner" | "character"; text: string }[] = [];
    for (const h of (history as unknown[]).slice(-ROLEPLAY_HISTORY)) {
      const { role, text: line } = (h ?? {}) as { role?: unknown; text?: unknown };
      if ((role !== "learner" && role !== "character") || typeof line !== "string" || line.trim() === "") return c.json({ error: "invalid-request" }, 400);
      lines.push({ role, text: asData(line, 300) });
    }
    const course = courses.get(courseId, orthography);
    const scenario = course === undefined ? undefined : scenarioOf(course, scenarioId);
    if (course === undefined || scenario === undefined) return c.json({ error: "unknown-scenario" }, 404);
    const card = (field: "title" | "setting" | "character" | "goal"): string => text(scenario[field][supportKey] ?? Object.values(scenario[field])[0]);
    const state = replay(await eventsOf(db, user, courseId));
    if (!state.completedNodes.includes(scenario.after)) return c.json({ error: "scenario-locked" }, 403);
    const at = new Date(now()).toISOString();
    const known = knownForms(course, state, at);
    const target = profileLang(course, orthography);
    const subject = await gateway.subjectOf(user);
    let last: GatewayError | "checks" = "checks";
    for (let attempt = 1; attempt <= ROLEPLAY_ATTEMPTS; attempt++) {
      const result = await gateway.call<RoleplayOutput>({
        feature: "roleplay",
        prompt: "roleplay",
        output: "RoleplayOutput",
        subject,
        course: courseId,
        orthography,
        temperature: 0.8,
        maxTokens: 300,
        vars: {
          language: languageName(target),
          orthography: `${languageName(target)} as written in ${orthography}`,
          setting: card("setting"),
          character: card("character"),
          goal: card("goal"),
          known: known.length === 0 ? "(none yet)" : known.join("\n"),
          budget: String(ROLEPLAY_NEW_WORDS),
          history: lines.length === 0 ? "(nothing yet: you speak first)" : lines.map((l) => `${l.role === "learner" ? "Learner" : "You"}: ${l.text}`).join("\n"),
          support: languageName(new Intl.Locale(supportTag(course)).language),
        },
      });
      if (!result.ok) {
        last = result.error;
        if (result.error !== "invalid-output") break;
        continue;
      }
      // Every model turn is checked before it is shown (§13.4); a turn over budget is generated again.
      const checks = checkTurn(course, result.value.output.reply, known, ROLEPLAY_NEW_WORDS);
      if (!checks.ok) continue;
      const { reply, translation } = result.value.output;
      const turn: RoleplayTurn = {
        text: autoTokens(reply, { lang: target, orthography: orthography as TaggedText["orthography"] }),
        ...(translation === undefined || translation.trim() === "" ? {} : { translation: autoTokens(translation, { lang: supportTag(course), orthography: course.support as TaggedText["orthography"] }) }),
        checks: { unknown: [...checks.unknown], outOfScript: [...checks.outOfScript], words: checks.words },
        attempts: attempt,
        provenance: result.value.provenance,
      };
      return c.json({ turn });
    }
    return last === "checks" ? c.json({ error: "ai-no-turn" }, 503) : failure(c, last);
  });
};

type Lang = TaggedText["lang"];
/** The BCP 47 tag of an orthography's text (from its profile). */
const profileLang = (course: CourseView, orthography: string): Lang => (course.profiles.get(orthography)?.lang ?? orthography.split("/")[0] ?? orthography) as Lang;
/** The support orthography's language tag. */
const supportTag = (course: CourseView): Lang => (course.profiles.get(course.support)?.lang ?? course.support.split("/")[0] ?? "en") as Lang;
