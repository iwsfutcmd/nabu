/**
 * Prompt templates (gameplan §13.1): versioned in the repository's prompts/ directory and
 * referenced by hash, the first 12 hex digits of the file's SHA-256. Placeholders are {{name}};
 * rendering refuses a missing value, so a template change can't silently send a hole. Learner
 * text sits between markers and is stripped of anything that could close them.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { graphemes } from "@nabu/core/text";

export const PROMPTS = new URL("../../../../prompts/", import.meta.url);

export interface Prompt {
  readonly id: string;
  readonly source: string;
  readonly hash: string;
}

export const promptHash = (source: string): string => createHash("sha256").update(source, "utf8").digest("hex").slice(0, 12);

const cache = new Map<string, Prompt>();

export const loadPrompt = (id: string, dir: URL = PROMPTS): Prompt => {
  const key = `${dir.href}${id}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const source = readFileSync(new URL(`${id}.md`, dir), "utf8");
  const prompt = { id, source, hash: promptHash(source) };
  cache.set(key, prompt);
  return prompt;
};

const PLACEHOLDER = /\{\{([a-z][a-zA-Z0-9]*)\}\}/gu;

/** The placeholders a template uses. */
export const placeholders = (source: string): readonly string[] => [...new Set([...source.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ""))];

/** Fills a template. Throws on a placeholder without a value: that is a bug, not input. */
export const render = (source: string, vars: Readonly<Record<string, string>>): string =>
  source.replace(PLACEHOLDER, (_, name: string) => {
    const value = vars[name];
    if (value === undefined) throw new Error(`prompt placeholder {{${name}}} has no value`);
    return value;
  });


/** Learner text as data: NFC, no marker sequences, no control characters but newlines, at most `max` grapheme clusters. */
export const asData = (text: string, max = 500): string =>
  graphemes(text.normalize("NFC").replace(/<<<|>>>/gu, "").replace(/\p{Cc}/gu, (c) => (c === "\n" ? c : " ")))
    .slice(0, max)
    .join("")
    .trim();
