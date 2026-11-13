/**
 * Uploading the outbox (gameplan §14.2), shared by the app's sync and its service worker's
 * background sync (Phase 10): the oldest unacknowledged events go first, in batches the server
 * accepts; the server ignores ids it already has, so a batch sent twice changes nothing.
 *
 * An event the server rejects (not a valid event to it, or not this account's) is set aside: it
 * leaves the outbox but stays in the device's log, where it still counts, and the app says how
 * many there are (S13 in the 2026-11 review). One bad event never holds back the ones after it.
 * It is sent again when the learner asks, when they sign in again, and once after each update of
 * the app (D10), never on its own every minute.
 */
import type { LearnerEvent } from "@nabu/schema";
import { isHttpError, request } from "./http.ts";

export const BATCH = 200;

/** Why the server would not take an event: its error code ("invalid-event", "foreign-event"). */
export interface SetAside {
  readonly id: string;
  readonly code: string;
}

export interface Outbox {
  /** The oldest events the server has not acknowledged, up to `limit`. */
  readonly pending: (limit: number) => Promise<readonly LearnerEvent[]>;
  /** The server has these events; `received` says when it first got each (ISO, by id). */
  readonly acknowledge: (ids: readonly string[], received?: Readonly<Record<string, string>>) => Promise<void>;
  /** The server rejected these events: out of the outbox, kept in the log and noted as set aside. */
  readonly setAside: (events: readonly SetAside[]) => Promise<void>;
}

/** The META key of the app build that last ran on this device. */
export const APP_BUILD = "app-build";

/** What retryAfterUpdate needs of the device's store. */
export interface HeldStore {
  readonly getMeta: (key: string) => Promise<unknown>;
  readonly setMeta: (key: string, value: unknown) => Promise<void>;
  /** Puts the events set aside back into the outbox; returns how many. */
  readonly releaseHeld: () => Promise<number>;
}

/**
 * The first time a build of the app runs on this device, the events set aside go back into the
 * outbox (D10): a rejection is usually an older app's mistake, which a newer app or the server it
 * now talks to may take. Rejected again, they wait for the next update. Returns how many went back.
 */
export const retryAfterUpdate = async (store: HeldStore, build: string): Promise<number> => {
  if ((await store.getMeta(APP_BUILD)) === build) return 0;
  const released = await store.releaseHeld();
  await store.setMeta(APP_BUILD, build);
  return released;
};

/** Where to send: the account's server and token. */
export interface Destination {
  readonly server: string;
  readonly token: string;
}

/** What POST /v1/events answers: `rejected` names, by index in the batch, the events it did not take. */
interface Uploaded {
  readonly received?: Readonly<Record<string, string>>;
  readonly rejected?: readonly { readonly index: number; readonly id?: string; readonly code: string }[];
}

/** The batch's events the answer rejects: by id where it names one of them, else by index. */
const rejectedOf = (batch: readonly LearnerEvent[], answer: Uploaded): SetAside[] => {
  const out = new Map<string, SetAside>();
  for (const r of answer.rejected ?? []) {
    const e = (r.id === undefined ? undefined : batch.find((b) => b.id === r.id)) ?? batch[r.index];
    if (e !== undefined) out.set(e.id, { id: e.id, code: r.code });
  }
  return [...out.values()];
};

/**
 * A server from before partial uploads refuses a whole batch over its first bad event, with a 400
 * naming it (`{error: {code, index}}`): that event, to set aside before sending the rest again.
 */
const namedByRefusal = (batch: readonly LearnerEvent[], e: unknown): SetAside | undefined => {
  if (!isHttpError(e) || e.status !== 400 || (e.code !== "invalid-event" && e.code !== "foreign-event")) return undefined;
  const index = typeof e.detail === "object" && e.detail !== null ? (e.detail as { index?: unknown }).index : undefined;
  const event = typeof index === "number" ? batch[index] : undefined;
  return event === undefined ? undefined : { id: event.id, code: e.code };
};

/**
 * Uploads until the outbox is empty; returns the courses of the events the server took. Throws on
 * any other failure (the rest stays queued). `onBatch` hears what each batch set aside too.
 */
export const uploadOutbox = async (
  outbox: Outbox,
  to: Destination,
  onBatch?: (sent: readonly LearnerEvent[], setAside: readonly SetAside[]) => Promise<void>,
): Promise<ReadonlySet<string>> => {
  const courses = new Set<string>();
  for (;;) {
    const batch = await outbox.pending(BATCH);
    if (batch.length === 0) return courses;
    let answer: Uploaded;
    try {
      answer = (await request<Uploaded | undefined>(to.server, "/v1/events", { token: to.token, body: { events: batch } })) ?? {};
    } catch (e) {
      const named = namedByRefusal(batch, e);
      if (named === undefined) throw e;
      await outbox.setAside([named]);
      await onBatch?.([], [named]);
      continue;
    }
    const rejected = rejectedOf(batch, answer);
    const out = new Set(rejected.map((r) => r.id));
    const sent = batch.filter((e) => !out.has(e.id));
    await outbox.acknowledge(
      sent.map((e) => e.id),
      answer.received,
    );
    if (rejected.length > 0) await outbox.setAside(rejected);
    for (const e of sent) courses.add(e.course);
    await onBatch?.(sent, rejected);
  }
};
