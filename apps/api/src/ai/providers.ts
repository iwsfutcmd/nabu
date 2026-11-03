/**
 * Model providers behind one adapter (gameplan §13.1). Local first: Ollama, or any
 * OpenAI-compatible server (llama.cpp's llama-server, vLLM); hosted APIs (OpenAI, Anthropic)
 * only when an instance opts in with a key in its environment. Every call asks for JSON that
 * fits a schema; the gateway validates what comes back, since no provider guarantees it.
 *
 * Configuration (environment):
 *   NABU_LLM            ollama | openai | anthropic   (unset: no model, every AI feature off)
 *   NABU_LLM_MODEL      the model name (required; there is no default model)
 *   NABU_LLM_URL        base URL (ollama: http://127.0.0.1:11434; openai: https://api.openai.com/v1;
 *                       anthropic: https://api.anthropic.com)
 *   NABU_LLM_KEY        API key, else OPENAI_API_KEY / ANTHROPIC_API_KEY (never in files or logs)
 *   NABU_LLM_TIMEOUT_MS per call, default 20000
 */
import type { AiProvenance } from "@nabu/schema";

export type ProviderName = Exclude<AiProvenance["provider"], "fixture">;

export interface CompletionRequest {
  readonly system: string;
  readonly prompt: string;
  /** A self-contained JSON Schema (no external $ref) for the answer. */
  readonly schema: Readonly<Record<string, unknown>>;
  readonly schemaName: string;
  readonly maxTokens: number;
  readonly temperature: number;
}

export type ProviderError = { readonly code: "unavailable"; readonly status?: number } | { readonly code: "not-json" };

export type Completion = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: ProviderError };

export interface Provider {
  readonly name: ProviderName;
  readonly model: string;
  readonly complete: (request: CompletionRequest) => Promise<Completion>;
}

/** fetch, or a stand-in for tests. */
export type Transport = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
}>;

export interface ProviderConfig {
  readonly name: ProviderName;
  readonly model: string;
  readonly url?: string | undefined;
  readonly key?: string | undefined;
  readonly timeoutMs?: number | undefined;
}

const DEFAULT_URL: Readonly<Record<ProviderName, string>> = {
  ollama: "http://127.0.0.1:11434",
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

const parseJson = (text: unknown): Completion => {
  if (typeof text !== "string") return { ok: false, error: { code: "not-json" } };
  // Some models wrap JSON in a code fence despite being asked not to.
  const body = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u.exec(text)?.[1] ?? text;
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, error: { code: "not-json" } };
  }
};

const post = async (transport: Transport, url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<{ ok: true; json: unknown } | { ok: false; error: ProviderError }> => {
  try {
    const res = await transport(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, error: { code: "unavailable", status: res.status } };
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, error: { code: "unavailable" } };
  }
};

const field = (value: unknown, ...path: readonly (string | number)[]): unknown => {
  let at = value;
  for (const key of path) {
    if (typeof at !== "object" || at === null) return undefined;
    at = (at as Record<string | number, unknown>)[key];
  }
  return at;
};

export const createProvider = (config: ProviderConfig, transport: Transport): Provider => {
  const base = (config.url ?? DEFAULT_URL[config.name]).replace(/\/+$/u, "");
  const timeout = config.timeoutMs ?? 20_000;
  const { name, model } = config;
  switch (name) {
    case "ollama":
      return {
        name,
        model,
        complete: async (r) => {
          const res = await post(
            transport,
            `${base}/api/chat`,
            {},
            {
              model,
              stream: false,
              format: r.schema,
              options: { temperature: r.temperature, num_predict: r.maxTokens },
              messages: [
                { role: "system", content: r.system },
                { role: "user", content: r.prompt },
              ],
            },
            timeout,
          );
          return res.ok ? parseJson(field(res.json, "message", "content")) : res;
        },
      };
    case "openai":
      return {
        name,
        model,
        complete: async (r) => {
          const res = await post(
            transport,
            `${base}/chat/completions`,
            config.key === undefined ? {} : { Authorization: `Bearer ${config.key}` },
            {
              model,
              temperature: r.temperature,
              max_tokens: r.maxTokens,
              response_format: { type: "json_schema", json_schema: { name: r.schemaName, schema: r.schema, strict: false } },
              messages: [
                { role: "system", content: r.system },
                { role: "user", content: r.prompt },
              ],
            },
            timeout,
          );
          return res.ok ? parseJson(field(res.json, "choices", 0, "message", "content")) : res;
        },
      };
    case "anthropic":
      return {
        name,
        model,
        // Structured output through a forced tool call: the tool's input is the answer.
        complete: async (r) => {
          const res = await post(
            transport,
            `${base}/v1/messages`,
            { "x-api-key": config.key ?? "", "anthropic-version": "2023-06-01" },
            {
              model,
              max_tokens: r.maxTokens,
              temperature: r.temperature,
              system: r.system,
              tools: [{ name: r.schemaName, description: "Return the answer.", input_schema: r.schema }],
              tool_choice: { type: "tool", name: r.schemaName },
              messages: [{ role: "user", content: r.prompt }],
            },
            timeout,
          );
          if (!res.ok) return res;
          const content = field(res.json, "content");
          const use = Array.isArray(content) ? (content as unknown[]).find((c) => field(c, "type") === "tool_use") : undefined;
          const input = field(use, "input");
          return typeof input === "object" && input !== null ? { ok: true, value: input } : { ok: false, error: { code: "not-json" } };
        },
      };
  }
};

/** The instance's provider from its environment, or undefined when it runs without a model. */
export const providerFromEnv = (env: Readonly<Record<string, string | undefined>>, transport: Transport): Provider | undefined => {
  const name = env["NABU_LLM"];
  if (name !== "ollama" && name !== "openai" && name !== "anthropic") return undefined;
  const model = env["NABU_LLM_MODEL"];
  if (model === undefined || model === "") throw new Error("NABU_LLM is set but NABU_LLM_MODEL is not: name the model to use");
  const key = env["NABU_LLM_KEY"] ?? (name === "openai" ? env["OPENAI_API_KEY"] : name === "anthropic" ? env["ANTHROPIC_API_KEY"] : undefined);
  if (name === "anthropic" && (key === undefined || key === "")) throw new Error("NABU_LLM=anthropic needs ANTHROPIC_API_KEY (or NABU_LLM_KEY) in the environment");
  const timeout = Number(env["NABU_LLM_TIMEOUT_MS"] ?? 20_000);
  return createProvider({ name, model, url: env["NABU_LLM_URL"], key, timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20_000 }, transport);
};
