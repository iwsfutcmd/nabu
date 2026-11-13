/**
 * Optional accounts and sync (gameplan §14.2). Without an account nothing
 * leaves the device. With one, events from the user's other devices are pulled
 * by cursor and the outbox is uploaded in batches (the server ignores ids it
 * already has, so retries are safe). Each upload says where the pulls are, and
 * the server's answer moves them past the device's own events when nothing else
 * came in between, so a pull never brings back what the device just sent.
 *
 * The device checks that the server's projections (each course's state, and the
 * game state) match its own replays, but not after every answer: both sides
 * replay the whole log for it. It checks after signing in, then once a local day
 * when something was uploaded or pulled since the last check (ADR 0112). The last
 * check's verdict is kept on the device.
 *
 * Signing up uploads the device's whole log (ADR 0123): what was never synced is in the outbox
 * already, and what an earlier account acknowledged goes back into it, so a new account after a
 * deletion or a forgotten password has everything this device holds. Signing in sends the outbox.
 *
 * Offline (Phase 10): a sync that cannot reach the server asks the service worker for a
 * Background Sync, so the outbox goes up when the network is back even if the app is closed
 * (where the browser supports it). The app also syncs when it comes back online, when it is shown
 * again (a phone unlocked, the native app resumed), and every minute while events are pending.
 *
 * A server that no longer takes the session (it expired after 180 days, or the account was deleted on
 * another device) signs the device out: the session goes as when the learner signs out, and the device
 * remembers who was signed in (`signedOut`), so Home says so, across reloads, and the form asks them to
 * sign in again, until they do or choose to stay signed out (ADR 0123).
 *
 * Events the server rejects are set aside (outbox.ts): kept on the device, counted in `held`, and
 * sent again only when the learner asks, signs in again, or first runs an updated app (D10). The
 * check against the server's projections leaves them out, since the server never took them.
 */
import type { AnswerSubmitted, LearnerEvent } from "@nabu/schema";
import type { GameConfig } from "@nabu/core/game";
import { isSyncedMessage, OUTBOX_SYNC } from "./caches.ts";
import { checkProjections, errorFrom, type CheckAnswer, type CheckOrder } from "./check.ts";
import { localDate } from "./clock.ts";
import { isHttpError, request } from "./http.ts";
import { retryAfterUpdate, uploadOutbox, type PullCursor } from "./outbox.ts";
import type { EventStore } from "./store.ts";

export { canonical, difference } from "./compare.ts";
export { isHttpError, request, type HttpError } from "./http.ts";

const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 1_000;

export interface Account {
  readonly server: string;
  readonly token: string;
  readonly user: { readonly id: string; readonly email: string };
}

/**
 * Who was signed in when the server ended the device's session (ADR 0123): it expired, or the
 * account was deleted on another device. Kept until the learner signs in again or stays signed out.
 */
export interface SignedOut {
  readonly server: string;
  readonly email: string;
}

/** Error codes from the server, plus the client's own. The UI turns them into messages. */
export type SyncError =
  | "invalid-email"
  | "weak-password"
  | "email-taken"
  | "wrong-credentials"
  | "rate-limited"
  /** The server's age gate (ADR 0069) needs the person's age. */
  | "age-required"
  /** The server's age gate turned the person away. */
  | "age"
  | "unreachable"
  | "signed-out"
  | "rejected"
  | "unknown";

export interface SyncState {
  /** The sync server, if this build or URL names one: without it the app is local-only. */
  readonly server: string | undefined;
  readonly account: Account | undefined;
  readonly phase: "idle" | "syncing" | "offline" | "error";
  readonly error: SyncError | undefined;
  /** Events recorded here that the server has not acknowledged. */
  readonly pending: number;
  /** Events the server rejected, set aside on this device (S13 in the 2026-11 review). */
  readonly held: number;
  /**
   * Whether the server's projections matched the device's at the last check (after signing in, then
   * daily: ADR 0112); undefined: not checked yet for this account.
   */
  readonly verified: boolean | undefined;
  /** Bumped when events from another device arrive, so open views can replay. */
  readonly pulled: number;
  /** Bumped when a queued second check (the judge) revised an answer: open views replay in place. */
  readonly revised: number;
  /** This server's age gate turned the person away (ADR 0069): the device remembers, and offers no new account there. */
  readonly ageRefused: boolean;
  /** The server ended the session (ADR 0123): Home says so, across reloads, and the form asks to sign in again. */
  readonly signedOut: SignedOut | undefined;
}

export interface Sync {
  readonly get: () => SyncState;
  readonly subscribe: (listener: () => void) => () => void;
  /** `age` in years, when the server asks for it (ADR 0069); it is sent for that check alone. */
  readonly signUp: (email: string, password: string, age?: number) => Promise<SyncError | undefined>;
  readonly signIn: (email: string, password: string) => Promise<SyncError | undefined>;
  readonly signOut: () => Promise<void>;
  /** After the server ended the session: the learner lets it go, and the device forgets who was signed in. */
  readonly staySignedOut: () => Promise<void>;
  /** Everything the server holds for the account (§14.4), as GET /v1/export gives it. */
  readonly exportAccount: () => Promise<{ readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly error: SyncError }>;
  /** Deletes the account and its data on the server (the password confirms it); this device keeps its progress. */
  readonly deleteAccount: (password: string) => Promise<SyncError | undefined>;
  /** Sync soon (debounced), e.g. after recording an event. */
  readonly schedule: () => void;
  readonly syncNow: () => Promise<void>;
  /** Sends the events set aside again (the learner asked), then syncs. */
  readonly retryHeld: () => Promise<void>;
  /**
   * Events joined the log from outside this app's sessions (a restored file, S6): open views
   * replay, as for events pulled from another device, and the next sync sends them.
   */
  readonly added: () => void;
}

const SIGN_UP = "/v1/auth/sign-up";
const SIGN_IN = "/v1/auth/sign-in";

const ACCOUNT = "account";
/** The servers whose age gate turned the person away (ADR 0069). */
const AGE_REFUSED = "age-refused";
/** Where the pulls are: the device holds every event of the account up to this cursor. */
const CURSOR = "cursor";
/** The last check of the server's projections (ADR 0112): for which account, on which local date, and its verdict. */
const CHECKED = "checked";
/** The courses with events uploaded or pulled since the last check: the next check compares them. */
const UNCHECKED = "unchecked";
/** Who the server signed out (SignedOut), until they sign in again or stay signed out. */
const SIGNED_OUT = "signed-out";

interface Checked {
  readonly user: string;
  readonly date: string;
  readonly verified: boolean;
}

const errorOf = (e: unknown): SyncError => {
  if (isHttpError(e)) {
    if (e.status === 401 && e.code === "unauthorized") return "signed-out";
    if (e.status === 429) return "rate-limited";
    const known: readonly SyncError[] = ["invalid-email", "weak-password", "email-taken", "wrong-credentials", "age-required", "age"];
    if (known.includes(e.code as SyncError)) return e.code as SyncError;
    return e.status === 400 ? "rejected" : "unknown";
  }
  return e instanceof TypeError ? "unreachable" : "unknown";
};

const JUDGE_QUEUE = "judge-queue";

/** Queues an answer for the judge while offline; the next sync asks for it (§8.3). */
export const queueJudge = async (store: EventStore, answer: AnswerSubmitted): Promise<void> => {
  const queued = ((await store.getMeta(JUDGE_QUEUE)) ?? []) as AnswerSubmitted[];
  if (!queued.some((a) => a.id === answer.id)) await store.setMeta(JUDGE_QUEUE, [...queued, answer]);
};

/**
 * Asks the judge about every queued answer. A revision joins the log (the server issued it, so
 * it is already synced). Answers stay queued only while the server is unreachable; any answer
 * the server refuses or the judge declines leaves the queue. Returns the courses revised.
 */
const flushJudgeQueue = async (store: EventStore, base: string, token: string): Promise<string[]> => {
  const queued = ((await store.getMeta(JUDGE_QUEUE)) ?? []) as AnswerSubmitted[];
  if (queued.length === 0) return [];
  const left: AnswerSubmitted[] = [];
  const revised: string[] = [];
  for (const answer of queued) {
    try {
      const res = await request<{ revision?: LearnerEvent }>(base, "/v1/ai/judge", { token, body: { answer } });
      if (res.revision !== undefined) {
        await store.append([res.revision], { synced: true });
        revised.push(answer.course);
      }
    } catch (e) {
      if (!isHttpError(e) || e.status === 503) left.push(answer);
    }
  }
  await store.setMeta(JUDGE_QUEUE, left);
  return revised;
};

/** Runs the check in a worker of its own (check-worker.ts), which ends with its answer. */
const inWorker = (order: CheckOrder): Promise<CheckAnswer> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./check-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<CheckAnswer>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage(order);
  });

/** Asks the browser to wake the service worker to upload the outbox when the network is back. */
const requestBackgroundSync = async (): Promise<void> => {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    await (registration as { sync?: { register: (tag: string) => Promise<void> } } | undefined)?.sync?.register(OUTBOX_SYNC);
  } catch {
    // No Background Sync here (or refused): the online and visibility triggers still sync.
  }
};

export interface SyncOptions {
  /** The deployment's game rules, to check the server's game projection against the device's. */
  readonly gameConfig?: () => Promise<GameConfig>;
}

/** Back in view within this long of the last pass, with nothing pending: no new pass. */
const VISIBLE_QUIET_MS = 30_000;

export const createSync = async (store: EventStore, server: string | undefined, options: SyncOptions = {}): Promise<Sync> => {
  const saved = (await store.getMeta(ACCOUNT)) as Account | undefined;
  const refused = ((await store.getMeta(AGE_REFUSED)) ?? []) as string[];
  const checked = (await store.getMeta(CHECKED)) as Checked | undefined;
  // Who the server signed out, if it is this build's server and no one has signed in since.
  const ended = (await store.getMeta(SIGNED_OUT)) as SignedOut | undefined;
  // An updated app sends once more what the server rejected before (D10).
  await retryAfterUpdate(store, typeof __NABU_BUILD__ === "string" ? __NABU_BUILD__ : "unknown");
  const heldCount = async (): Promise<number> => Object.keys(await store.held()).length;
  let state: SyncState = {
    server: saved?.server ?? server,
    account: saved,
    phase: "idle",
    error: undefined,
    pending: await store.pendingCount(),
    held: await heldCount(),
    verified: saved !== undefined && checked?.user === saved.user.id ? checked.verified : undefined,
    pulled: 0,
    revised: 0,
    ageRefused: refused.includes(saved?.server ?? server ?? ""),
    signedOut: saved === undefined && ended !== undefined && ended.server === server ? ended : undefined,
  };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<SyncState>): void => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };

  let running: Promise<void> | undefined;
  let again = false;
  let lastPass = 0;

  /**
   * The check of the server's projections (check.ts): in a worker where the browser has one and
   * the log is in IndexedDB, so its replays never hold up the page; else here.
   */
  const check = async (account: Account, courses: ReadonlySet<string>): Promise<boolean> => {
    const order: CheckOrder = { server: account.server, token: account.token, courses: [...courses], gameConfig: await options.gameConfig?.(), now: new Date().toISOString() };
    if (store.persistent && typeof Worker === "function") {
      const answer = await inWorker(order).catch(() => undefined);
      if (answer !== undefined && "failed" in answer) throw errorFrom(answer.failed);
      if (answer !== undefined && "verified" in answer) return answer.verified;
    }
    return checkProjections(store, order);
  };

  const pass = async (account: Account): Promise<void> => {
    const { server: base, token } = account;
    const touched = new Set<string>();
    const cursor: PullCursor = { get: async () => Number((await store.getMeta(CURSOR)) ?? 0), set: (at) => store.setMeta(CURSOR, at) };
    // Pull what other devices uploaded, first: the upload then starts from the newest cursor, so its
    // answer can move the cursor past this device's own events (ADR 0112).
    let at = await cursor.get();
    let fresh = 0;
    for (;;) {
      const page = await request<{ events: LearnerEvent[]; cursor: number; more: boolean; received?: Record<string, string> }>(base, `/v1/events?since=${at}`, { token });
      const added = await store.append(page.events, { synced: true, ...(page.received === undefined ? {} : { received: page.received }) });
      fresh += added.length;
      // Every course the pull returns is checked: events this device uploaded in the background
      // come back here too (the service worker's uploads leave the cursor where it is).
      for (const e of page.events) if (e.type !== "goal_set") touched.add(e.course);
      at = page.cursor;
      await cursor.set(at);
      if (!page.more) break;
    }
    // Upload the outbox, oldest first; what the server rejects is set aside.
    const uploaded = await uploadOutbox(store, account, async (_sent, aside) => set({ pending: await store.pendingCount(), ...(aside.length > 0 ? { held: await heldCount() } : {}) }), cursor);
    for (const course of uploaded) touched.add(course);
    // Second checks queued while offline (§8.3): the judge may revise answers retroactively.
    const revisedCourses = await flushJudgeQueue(store, base, token);
    for (const c of revisedCourses) touched.add(c);
    if (revisedCourses.length > 0) set({ revised: state.revised + 1 });
    // The check (ADR 0112): after signing in, then on the first pass of a local date with anything
    // uploaded or pulled since the last one; the courses wait on the device until it runs.
    const unchecked = new Set([...(((await store.getMeta(UNCHECKED)) ?? []) as string[]), ...touched]);
    const last = (await store.getMeta(CHECKED)) as Checked | undefined;
    const today = localDate(new Date());
    const due = last?.user !== account.user.id || (last.date !== today && unchecked.size > 0);
    if (touched.size > 0) await store.setMeta(UNCHECKED, [...unchecked]);
    let verified: boolean | undefined;
    if (due) {
      verified = await check(account, unchecked);
      await store.setMeta(CHECKED, { user: account.user.id, date: today, verified } satisfies Checked);
      await store.deleteMeta(UNCHECKED);
    }
    lastPass = Date.now();
    set({
      phase: "idle",
      error: undefined,
      pending: await store.pendingCount(),
      held: await heldCount(),
      ...(verified === undefined ? {} : { verified }),
      ...(fresh > 0 ? { pulled: state.pulled + 1 } : {}),
    });
  };

  /** This device no longer has an account: the session, the sync cursor and the last check go; its own log stays. */
  const forget = async (): Promise<void> => {
    await store.deleteMeta(ACCOUNT);
    await store.deleteMeta(CURSOR);
    await store.deleteMeta(CHECKED);
    await store.deleteMeta(UNCHECKED);
    set({ account: undefined, phase: "idle", error: undefined, verified: undefined });
  };

  /**
   * The server no longer takes the session `account` signed in with (it expired, or the account was
   * deleted on another device): forget it as signing out does, and remember who it was, so Home says
   * so until the learner signs in again or stays signed out (ADR 0123). A session the learner has left
   * since (a pass that was under way as they signed out) is not theirs to end.
   */
  const endedByServer = async (account: Account): Promise<void> => {
    if (state.account?.token !== account.token) return;
    await forget();
    const signedOut: SignedOut = { server: account.server, email: account.user.email };
    await store.setMeta(SIGNED_OUT, signedOut);
    set({ signedOut });
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
          await endedByServer(account);
          return;
        }
        const pending = await store.pendingCount();
        if (error === "unreachable" && pending > 0) void requestBackgroundSync();
        set({ phase: error === "unreachable" ? "offline" : "error", error, pending });
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

  const enter = async (path: typeof SIGN_UP | typeof SIGN_IN, email: string, password: string, age?: number): Promise<SyncError | undefined> => {
    const base = state.server;
    if (base === undefined) return "unreachable";
    try {
      const result = await request<{ user: Account["user"]; token: string }>(base, path, { body: age === undefined ? { email, password } : { email, password, age } });
      const account: Account = { server: base, token: result.token, user: result.user };
      await store.setMeta(ACCOUNT, account);
      await store.deleteMeta(SIGNED_OUT);
      // The cursor and the last check were the last account's: this one starts from the beginning, and is checked at once.
      await store.deleteMeta(CURSOR);
      await store.deleteMeta(CHECKED);
      await store.deleteMeta(UNCHECKED);
      // A new account takes the device's whole log (ADR 0123), what an earlier account acknowledged too:
      // after a deletion, or a forgotten password, everything on this device goes with it. Signing in
      // sends the outbox, as ever. Either way, another account, or another server, may take what the
      // last one rejected: send it again.
      if (path === SIGN_UP) await store.requeue();
      else await store.releaseHeld();
      set({ account, signedOut: undefined, error: undefined, held: 0, verified: undefined, pending: await store.pendingCount() });
      await syncNow();
      return undefined;
    } catch (e) {
      const error = errorOf(e);
      if (error === "age") {
        const servers = ((await store.getMeta(AGE_REFUSED)) ?? []) as string[];
        if (!servers.includes(base)) await store.setMeta(AGE_REFUSED, [...servers, base]);
        set({ ageRefused: true });
      }
      return error;
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    void store.pendingCount().then((pending) => set({ pending }));
    if (state.account === undefined) return;
    if (!navigator.onLine) void requestBackgroundSync();
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), DEBOUNCE_MS);
  };

  window.addEventListener("online", () => void syncNow());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && (state.pending > 0 || Date.now() - lastPass > VISIBLE_QUIET_MS)) void syncNow();
  });
  // The service worker uploaded in the background: count again, pull and check.
  navigator.serviceWorker?.addEventListener("message", (e: MessageEvent<unknown>) => {
    if (!isSyncedMessage(e.data)) return;
    void store.pendingCount().then((pending) => set({ pending }));
    void syncNow();
  });
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
    signUp: (email, password, age) => enter(SIGN_UP, email, password, age),
    signIn: (email, password) => enter(SIGN_IN, email, password),
    signOut: async () => {
      const account = state.account;
      if (account !== undefined) await request(account.server, "/v1/auth/sign-out", { token: account.token, body: {} }).catch(() => undefined);
      await forget();
    },
    staySignedOut: async () => {
      await store.deleteMeta(SIGNED_OUT);
      set({ signedOut: undefined });
    },
    exportAccount: async () => {
      const account = state.account;
      if (account === undefined) return { ok: false, error: "signed-out" };
      try {
        return { ok: true, data: await request<unknown>(account.server, "/v1/export", { token: account.token }) };
      } catch (e) {
        const error = errorOf(e);
        if (error === "signed-out") await endedByServer(account);
        return { ok: false, error };
      }
    },
    deleteAccount: async (password) => {
      const account = state.account;
      if (account === undefined) return "signed-out";
      try {
        await request(account.server, "/v1/account", { token: account.token, method: "DELETE", body: { password } });
      } catch (e) {
        const error = errorOf(e);
        if (error === "signed-out") await endedByServer(account);
        return error;
      }
      // The session went with the account: forget it here too, as signing out does.
      await forget();
      return undefined;
    },
    schedule,
    syncNow,
    retryHeld: async () => {
      await store.releaseHeld();
      set({ held: 0, pending: await store.pendingCount() });
      await syncNow();
    },
    added: () => {
      set({ pulled: state.pulled + 1 });
      schedule();
    },
  };
};
