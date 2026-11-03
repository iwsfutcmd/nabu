/**
 * Uploading the outbox (gameplan §14.2), shared by the app's sync and its service worker's
 * background sync (Phase 10): the oldest unacknowledged events go first, in batches the server
 * accepts; the server ignores ids it already has, so a batch sent twice changes nothing.
 */
import type { LearnerEvent } from "@nabu/schema";
import { request } from "./http.ts";

export const BATCH = 200;

export interface Outbox {
  /** The oldest events the server has not acknowledged, up to `limit`. */
  readonly pending: (limit: number) => Promise<readonly LearnerEvent[]>;
  /** The server has these events; `received` says when it first got each (ISO, by id). */
  readonly acknowledge: (ids: readonly string[], received?: Readonly<Record<string, string>>) => Promise<void>;
}

/** Where to send: the account's server and token. */
export interface Destination {
  readonly server: string;
  readonly token: string;
}

/** Uploads until the outbox is empty; returns the courses of the events sent. Throws on failure (the rest stays queued). */
export const uploadOutbox = async (outbox: Outbox, to: Destination, onBatch?: (sent: readonly LearnerEvent[]) => Promise<void>): Promise<ReadonlySet<string>> => {
  const courses = new Set<string>();
  for (;;) {
    const batch = await outbox.pending(BATCH);
    if (batch.length === 0) return courses;
    const result = await request<{ received?: Record<string, string> }>(to.server, "/v1/events", { token: to.token, body: { events: batch } });
    await outbox.acknowledge(
      batch.map((e) => e.id),
      result.received,
    );
    for (const e of batch) courses.add(e.course);
    await onBatch?.(batch);
  }
};
