/**
 * Expected failures as values. Every failure is an HTTP status and a stable error code (what the
 * `nabu refs` client switches on), with optional detail for whoever reads the logs.
 */
export type Failure = { readonly status: number; readonly error: string; readonly detail?: string };

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: Failure };

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

export const fail = (status: number, error: string, detail?: string): Outcome<never> => ({
  ok: false,
  failure: detail === undefined ? { status, error } : { status, error, detail },
});

const NO_STORE = { "cache-control": "no-store" };

export const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...NO_STORE, ...headers },
  });

export const failure = (f: Failure): Response => json(f.status, f.detail === undefined ? { error: f.error } : f);
