/**
 * core-cli protocol: one JSON request per line on stdin, one JSON response per
 * line on stdout, in order. The Python compiler keeps one process alive and
 * calls the same normalization and matching code that grades learners.
 */
import { graphemes } from "@nabu/core/text";

export type Request =
  | { readonly id: number | string; readonly op: "ping" }
  | { readonly id: number | string; readonly op: "graphemes"; readonly text: string; readonly locale?: string };

export type Response =
  | { readonly id: number | string | null; readonly ok: true; readonly result: unknown }
  | { readonly id: number | string | null; readonly ok: false; readonly error: string };

export const handle = (line: string): Response => {
  let request: Request;
  try {
    request = JSON.parse(line) as Request;
  } catch {
    return { id: null, ok: false, error: "invalid JSON" };
  }
  switch (request.op) {
    case "ping":
      return { id: request.id, ok: true, result: "pong" };
    case "graphemes":
      return { id: request.id, ok: true, result: graphemes(request.text, request.locale) };
    default:
      return { id: (request as { id?: number | string }).id ?? null, ok: false, error: `unknown op` };
  }
};
