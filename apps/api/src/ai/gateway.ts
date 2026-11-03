/**
 * The LLM gateway (gameplan §13.1). Every model call goes through `call`, which:
 *  - refuses features or languages the instance has switched off (NABU_AI_KILL);
 *  - answers from the cache when the same request was made before (no cost, no budget);
 *  - enforces a daily budget per learner and per instance;
 *  - validates the model's JSON against schemas/ai.schema.json, asking once more if it is invalid;
 *  - stamps the output with provenance (provider, model, prompt id and hash, time);
 *  - logs only the feature, course, model, timing and outcome: never who asked, never their text.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AiProvenance } from "@nabu/schema";
import { Ajv2020 } from "ajv/dist/2020.js";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { llmCache, llmUsage, serverKeys } from "../db/schema.ts";
import { loadPrompt, render, type Prompt } from "./prompts.ts";
import type { Provider } from "./providers.ts";

export type Feature = "judge" | "explain" | "roleplay";
export type OutputDef = "JudgeOutput" | "ExplanationOutput" | "RoleplayOutput";

const SCHEMAS = new URL("../../../../schemas/", import.meta.url);
const schemaFile = (file: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(file, SCHEMAS), "utf8")) as Record<string, unknown>;
const AI = schemaFile("ai.schema.json");
const DEFS = AI["$defs"] as Record<string, unknown>;

/** A $defs entry with its local references inlined: providers take one self-contained schema. */
export const standalone = (def: string): Record<string, unknown> => {
  const inline = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(inline);
    if (typeof node !== "object" || node === null) return node;
    const ref = (node as { $ref?: unknown }).$ref;
    if (typeof ref === "string" && ref.startsWith("#/$defs/")) return inline(DEFS[ref.slice(8)]);
    return Object.fromEntries(Object.entries(node).filter(([k]) => k !== "description" && k !== "title").map(([k, v]) => [k, inline(v)]));
  };
  return inline(DEFS[def]) as Record<string, unknown>;
};

const ajv = new Ajv2020({ strict: true, allErrors: false, validateFormats: false });
ajv.addKeyword({ keyword: "tsType", schemaType: "string" });
ajv.addSchema(schemaFile("common.schema.json"));
ajv.addSchema(schemaFile("tagged-text.schema.json"));
ajv.addSchema(AI);
/** Validates a value against an ai.schema.json definition. */
export const validAi = (def: string, value: unknown): boolean => {
  const validate = ajv.getSchema(`${AI["$id"] as string}#/$defs/${def}`);
  if (validate === undefined) throw new Error(`no schema ${def}`);
  return validate(value) as boolean;
};

export type GatewayError = "off" | "killed" | "budget" | "unavailable" | "invalid-output";

export interface CallResult<T> {
  readonly output: T;
  readonly provenance: AiProvenance;
  readonly cached: boolean;
}

export interface Call {
  readonly feature: Feature;
  readonly prompt: string;
  readonly vars: Readonly<Record<string, string>>;
  readonly output: OutputDef;
  /** Who asks, as a salted hash (`subject`): budgets count per subject. */
  readonly subject: string;
  readonly course: string;
  readonly orthography: string;
  /** What makes two requests the same (without the model and prompt hash, which are added). Undefined: never cached. */
  readonly cacheKey?: readonly string[] | undefined;
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
}

export interface Budgets {
  /** Model calls per learner per day, per feature. */
  readonly perUser: number;
  /** Model calls per instance per day, all features. */
  readonly perInstance: number;
}

export const DEFAULT_BUDGETS: Budgets = { perUser: 100, perInstance: 5000 };

/** NABU_AI_KILL: comma-separated `feature`, `feature:course` or `feature:course/orthography`; `*` matches any feature. */
export const killSwitch = (spec: string | undefined): ((feature: Feature, course: string, orthography: string) => boolean) => {
  const rules = (spec ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r !== "");
  return (feature, course, orthography) =>
    rules.some((rule) => {
      const [f = "", scope] = rule.split(/:(.*)/su);
      if (f !== "*" && f !== feature) return false;
      return scope === undefined || scope === course || scope === `${course}/${orthography.split("/")[0] ?? ""}` || scope === `${course}/${orthography}`;
    });
};

export interface Gateway {
  readonly provider: Provider | undefined;
  readonly promptHash: (id: string) => string;
  readonly killed: (feature: Feature, course: string, orthography: string) => boolean;
  /** A salted hash of a user id: what budgets, votes and ratings store instead of the id. */
  readonly subjectOf: (user: string) => Promise<string>;
  readonly call: <T>(call: Call) => Promise<{ ok: true; value: CallResult<T> } | { ok: false; error: GatewayError }>;
}

export interface GatewayDeps {
  readonly db: Db;
  readonly provider: Provider | undefined;
  readonly budgets?: Budgets | undefined;
  readonly kill?: string | undefined;
  readonly now?: (() => number) | undefined;
  readonly log?: ((entry: Readonly<Record<string, unknown>>) => void) | undefined;
  readonly prompts?: URL | undefined;
}

const SYSTEM = "You are a careful assistant inside a language-learning app. Follow the task exactly and answer with JSON only.";

export const createGateway = ({ db, provider, budgets = DEFAULT_BUDGETS, kill, now = Date.now, log = (e) => console.info(JSON.stringify(e)), prompts }: GatewayDeps): Gateway => {
  const killed = killSwitch(kill);
  const prompt = (id: string): Prompt => (prompts === undefined ? loadPrompt(id) : loadPrompt(id, prompts));
  let salt: Promise<Buffer> | undefined;
  const saltOf = (): Promise<Buffer> =>
    (salt ??= (async () => {
      const fresh = randomBytes(32).toString("base64url");
      await db.insert(serverKeys).values({ name: "ai-subject-salt", value: fresh }).onConflictDoNothing();
      const [row] = await db.select().from(serverKeys).where(eq(serverKeys.name, "ai-subject-salt"));
      return Buffer.from(row?.value ?? fresh, "base64url");
    })());

  /** Counts a call against a subject's budget; false when the budget is spent. */
  const spend = async (subject: string, feature: Feature, limit: number): Promise<boolean> => {
    const day = new Date(now()).toISOString().slice(0, 10);
    const [row] = await db
      .insert(llmUsage)
      .values({ subject, day, feature, calls: 1 })
      .onConflictDoUpdate({ target: [llmUsage.subject, llmUsage.day, llmUsage.feature], set: { calls: sql`${llmUsage.calls} + 1` } })
      .returning({ calls: llmUsage.calls });
    return (row?.calls ?? 1) <= limit;
  };
  const instanceCalls = async (): Promise<number> => {
    const day = new Date(now()).toISOString().slice(0, 10);
    const rows = await db.select({ calls: llmUsage.calls }).from(llmUsage).where(and(eq(llmUsage.subject, "instance"), eq(llmUsage.day, day)));
    return rows.reduce((n, r) => n + r.calls, 0);
  };

  return {
    provider,
    promptHash: (id) => prompt(id).hash,
    killed,
    subjectOf: async (user) => createHmac("sha256", await saltOf()).update(user).digest("hex").slice(0, 32),
    call: async <T>(c: Call) => {
      const started = now();
      const entry = { feature: c.feature, course: c.course, orthography: c.orthography, provider: provider?.name, model: provider?.model };
      if (provider === undefined) return { ok: false, error: "off" } as const;
      if (killed(c.feature, c.course, c.orthography)) return { ok: false, error: "killed" } as const;
      const template = prompt(c.prompt);
      const key =
        c.cacheKey === undefined ? undefined : createHash("sha256").update(JSON.stringify([c.feature, provider.name, provider.model, template.hash, ...c.cacheKey])).digest("hex");
      if (key !== undefined) {
        const [hit] = await db.select().from(llmCache).where(eq(llmCache.key, key));
        if (hit !== undefined) {
          log({ ...entry, cached: true, ms: now() - started, outcome: "ok" });
          return { ok: true, value: { ...(hit.output as { output: T; provenance: AiProvenance }), cached: true } } as const;
        }
      }
      if ((await instanceCalls()) >= budgets.perInstance || !(await spend(c.subject, c.feature, budgets.perUser))) {
        log({ ...entry, cached: false, ms: now() - started, outcome: "budget" });
        return { ok: false, error: "budget" } as const;
      }
      await spend("instance", c.feature, Number.POSITIVE_INFINITY);
      const request = {
        system: SYSTEM,
        prompt: render(template.source, c.vars),
        schema: standalone(c.output),
        schemaName: c.output,
        maxTokens: c.maxTokens ?? 600,
        temperature: c.temperature ?? 0,
      };
      let outcome: GatewayError | "ok" = "invalid-output";
      let output: unknown;
      for (let attempt = 0; attempt < 2 && outcome === "invalid-output"; attempt++) {
        const res = await provider.complete(request);
        if (!res.ok && res.error.code === "unavailable") outcome = "unavailable";
        else if (res.ok && validAi(c.output, res.value)) {
          outcome = "ok";
          output = res.value;
        }
      }
      log({ ...entry, cached: false, ms: now() - started, outcome });
      if (outcome !== "ok") return { ok: false, error: outcome } as const;
      const provenance: AiProvenance = { provider: provider.name, model: provider.model, prompt: template.id, promptHash: template.hash, createdAt: new Date(now()).toISOString() };
      if (key !== undefined) await db.insert(llmCache).values({ key, feature: c.feature, output: { output, provenance } }).onConflictDoNothing();
      return { ok: true, value: { output: output as T, provenance, cached: false } } as const;
    },
  };
};
