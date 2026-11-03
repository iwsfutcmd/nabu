/**
 * Optional accounts and sync (gameplan §14.2). Without an account nothing
 * leaves the device. With one, the outbox is uploaded in batches (the server
 * ignores ids it already has, so retries are safe), events from the user's
 * other devices are pulled by cursor, and the device checks that the server's
 * projection of each course matches its own replay.
 *
 * Signing up uploads the existing local history: it is already in the outbox.
 */
import { replay } from "@nabu/core/learner";
import type { LearnerEvent } from "@nabu/schema";
import type { EventStore } from "./store.ts";

const BATCH = 200;
const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 1_000;

export interface Account {
  readonly server: string;
  readonly token: string;
  readonly user: { readonly id: string; readonly email: string };
}

/** Error codes from the server, plus the client's own. The UI turns them into messages. */
export type SyncError = "invalid-email" | "weak-password" | "email-taken" | "wrong-credentials" | "unreachable" | "signed-out" | "rejected" | "unknown";

export interface SyncState {
  /** The sync server, if this build or URL names one: without it the app is local-only. */
  readonly server: string | undefined;
  readonly account: Account | undefined;
  readonly phase: "idle" | "syncing" | "offline" | "error";
  readonly error: SyncError | undefined;
  /** Events recorded here that the server has not acknowledged. */
  readonly pending: number;
  /** After the last full sync, whether the server's projections matched the device's (undefined: not checked yet). */
  readonly verified: boolean | undefined;
  /** Bumped when events from another device arrive, so open views can replay. */
  readonly pulled: number;
}

export interface Sync {
  readonly get: () => SyncState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly signUp: (email: string, password: string) => Promise<SyncError | undefined>;
  readonly signIn: (email: string, password: string) => Promise<SyncError | undefined>;
  readonly signOut: () => Promise<void>;
  /** Sync soon (debounced), e.g. after recording an event. */
  readonly schedule: () => void;
  readonly syncNow: () => Promise<void>;
}

/** A failed request: the HTTP status and the server's error code. */
export type HttpError = Error & { readonly kind: "http"; readonly status: number; readonly code: string | undefined; readonly detail: unknown };

const httpError = (status: number, code: string | undefined, detail?: unknown): HttpError => Object.assign(new Error(`HTTP ${status}`), { kind: "http" as const, status, code, detail });

export const isHttpError = (e: unknown): e is HttpError => e instanceof Error && (e as Partial<HttpError>).kind === "http";

/** A JSON request to the sync server; errors carry the HTTP status and the server's error code. */
export const request = async <T>(server: string, path: string, init: { token?: string; body?: unknown; method?: "GET" | "POST" | "PUT" } = {}): Promise<T> => {
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

/**
 * Where two projections differ, or undefined when they agree. Numbers agree within a relative
 * 1e-9: Math.exp and Math.pow (FSRS, the performance model) are not specified to be correctly
 * rounded, so a browser's engine and the server's may differ in the last bit; the server's
 * projection stays authoritative.
 */
export const difference = (a: unknown, b: unknown, path = "$"): string | undefined => {
  if (typeof a === "number" && typeof b === "number") {
    return a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b)) ? undefined : `${path}: ${a} ≠ ${b}`;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: ${a.length} items ≠ ${b.length}`;
    for (const [i, x] of a.entries()) {
      const d = difference(x, b[i], `${path}[${i}]`);
      if (d !== undefined) return d;
    }
    return undefined;
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort();
    for (const k of keys) {
      const d = difference(ra[k], rb[k], `${path}.${k}`);
      if (d !== undefined) return d;
    }
    return undefined;
  }
  return Object.is(a, b) ? undefined : `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
};

/** JSON with object keys sorted: two projections are equal when these strings are. */
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );

const ACCOUNT = "account";
const CURSOR = "cursor";

const errorOf = (e: unknown): SyncError => {
  if (isHttpError(e)) {
    if (e.status === 401 && e.code === "unauthorized") return "signed-out";
    const known: readonly SyncError[] = ["invalid-email", "weak-password", "email-taken", "wrong-credentials"];
    if (known.includes(e.code as SyncError)) return e.code as SyncError;
    return e.status === 400 ? "rejected" : "unknown";
  }
  return e instanceof TypeError ? "unreachable" : "unknown";
};

export const createSync = async (store: EventStore, server: string | undefined): Promise<Sync> => {
  const saved = (await store.getMeta(ACCOUNT)) as Account | undefined;
  let state: SyncState = {
    server: saved?.server ?? server,
    account: saved,
    phase: "idle",
    error: undefined,
    pending: await store.pendingCount(),
    verified: undefined,
    pulled: 0,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<SyncState>): void => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };

  let running: Promise<void> | undefined;
  let again = false;

  const pass = async (account: Account): Promise<void> => {
    const { server: base, token } = account;
    const touched = new Set<string>();
    // Upload the outbox, oldest first.
    for (;;) {
      const batch = await store.pending(BATCH);
      if (batch.length === 0) break;
      await request(base, "/v1/events", { token, body: { events: batch } });
      await store.acknowledge(batch.map((e) => e.id));
      for (const e of batch) touched.add(e.course);
      set({ pending: await store.pendingCount() });
    }
    // Pull what other devices uploaded.
    let cursor = Number((await store.getMeta(CURSOR)) ?? 0);
    let fresh = 0;
    for (;;) {
      const page = await request<{ events: LearnerEvent[]; cursor: number; more: boolean }>(base, `/v1/events?since=${cursor}`, { token });
      const added = await store.append(page.events, { synced: true });
      fresh += added.length;
      for (const e of page.events) if (added.includes(e.id)) touched.add(e.course);
      cursor = page.cursor;
      await store.setMeta(CURSOR, cursor);
      if (!page.more) break;
    }
    // The server is authoritative; the device checks that it agrees (§14.2).
    let verified = true;
    for (const course of touched) {
      const server = await request<{ state: unknown }>(base, `/v1/state?course=${encodeURIComponent(course)}`, { token });
      const { seen: _seen, ...local } = replay(await store.eventsOf(course));
      const differs = difference(server.state, JSON.parse(JSON.stringify(local)));
      if (differs !== undefined) {
        verified = false;
        console.warn(`nabu sync: the server's projection of ${course} differs from this device's at ${differs}`);
      }
    }
    set({ phase: "idle", error: undefined, pending: await store.pendingCount(), ...(touched.size > 0 ? { verified } : {}), ...(fresh > 0 ? { pulled: state.pulled + 1 } : {}) });
  };

  const syncNow = async (): Promise<void> => {
    if (running !== undefined) {
      again = true;
      return running;
    }
    const account = state.account;
    if (account === undefined) return;
    set({ phase: "syncing", pending: await store.pendingCount() });
    running = pass(account)
      .catch(async (e: unknown) => {
        const error = errorOf(e);
        if (error === "signed-out") {
          await store.deleteMeta(ACCOUNT);
          set({ account: undefined });
        }
        set({ phase: error === "unreachable" ? "offline" : "error", error, pending: await store.pendingCount() });
      })
      .finally(() => {
        running = undefined;
        if (again) {
          again = false;
          void syncNow();
        }
      });
    return running;
  };

  const enter = async (path: string, email: string, password: string): Promise<SyncError | undefined> => {
    const base = state.server;
    if (base === undefined) return "unreachable";
    try {
      const result = await request<{ user: Account["user"]; token: string }>(base, path, { body: { email, password } });
      const account: Account = { server: base, token: result.token, user: result.user };
      await store.setMeta(ACCOUNT, account);
      await store.deleteMeta(CURSOR);
      set({ account, error: undefined });
      await syncNow();
      return undefined;
    } catch (e) {
      return errorOf(e);
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    void store.pendingCount().then((pending) => set({ pending }));
    if (state.account === undefined) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  };

  window.addEventListener("online", () => void syncNow());
  setInterval(() => {
    if (state.account !== undefined && state.pending > 0) void syncNow();
  }, INTERVAL_MS);
  if (state.account !== undefined) void syncNow();

  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signUp: (email, password) => enter("/v1/auth/sign-up", email, password),
    signIn: (email, password) => enter("/v1/auth/sign-in", email, password),
    signOut: async () => {
      const account = state.account;
      if (account !== undefined) await request(account.server, "/v1/auth/sign-out", { token: account.token, body: {} }).catch(() => undefined);
      await store.deleteMeta(ACCOUNT);
      await store.deleteMeta(CURSOR);
      set({ account: undefined, phase: "idle", error: undefined, verified: undefined });
    },
    schedule,
    syncNow,
  };
};
