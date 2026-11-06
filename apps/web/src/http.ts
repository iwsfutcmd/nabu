/**
 * JSON requests to the sync server, shared by the app and its service worker (which uploads the
 * outbox in the background). Window- and worker-safe: only fetch.
 */

/** A failed request: the HTTP status and the server's error code. */
export type HttpError = Error & { readonly kind: "http"; readonly status: number; readonly code: string | undefined; readonly detail: unknown };

const httpError = (status: number, code: string | undefined, detail?: unknown): HttpError => Object.assign(new Error(`HTTP ${status}`), { kind: "http" as const, status, code, detail });

export const isHttpError = (e: unknown): e is HttpError => e instanceof Error && (e as Partial<HttpError>).kind === "http";

/** A JSON request to the sync server; errors carry the HTTP status and the server's error code. */
export const request = async <T>(server: string, path: string, init: { token?: string; body?: unknown; method?: "GET" | "POST" | "PUT" | "DELETE" } = {}): Promise<T> => {
  const response = await fetch(`${server}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(init.token === undefined ? {} : { Authorization: `Bearer ${init.token}` }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: unknown };
    const code = typeof body.error === "string" ? body.error : typeof body.error === "object" && body.error !== null ? String((body.error as { code?: unknown }).code) : undefined;
    throw httpError(response.status, code, body.error);
  }
  // 201 and 204 may come without a body.
  const text = await response.text();
  return (text === "" ? undefined : JSON.parse(text)) as T;
};
