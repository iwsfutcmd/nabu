/**
 * Uploading the outbox (S13 in the 2026-11 review): an event the server rejects is set aside, kept
 * in the log, and never sent again on its own, so it cannot hold back the events after it. Runs on
 * the in-memory store (Node has no IndexedDB), with the server stubbed at fetch.
 */
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { retryAfterUpdate, uploadOutbox } from "../../src/outbox.ts";
import { openStore, type EventStore } from "../../src/store.ts";

const SERVER = "https://nabu.invalid";
const to = { server: SERVER, token: "token" };

const event = (n: number, course = "fa"): LearnerEvent => ({
  id: `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  type: "session_started",
  schema: 1,
  device: "unit",
  course,
  orthography: "fa-Arab/standard" as OrthographyId,
  support: "en",
  bundle: "0".repeat(64),
  session: "00000000-0000-7000-9000-000000000001",
  clientTime: `2026-11-12T09:00:0${n}.000+00:00`,
  localDate: "2026-11-12",
  tz: "UTC",
  mode: "review",
  seed: 1,
  exercises: 5,
  planner: "unit",
});

/** A stubbed server: each upload's events, and an answer per call. */
const server = (...answers: ((events: readonly LearnerEvent[]) => Response | Promise<Response>)[]): { readonly uploads: (readonly LearnerEvent[])[] } => {
  const uploads: (readonly LearnerEvent[])[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit & { body: string }) => {
    expect(url).toBe(`${SERVER}/v1/events`);
    const { events } = JSON.parse(init.body) as { events: LearnerEvent[] };
    uploads.push(events);
    const answer = answers[uploads.length - 1];
    if (answer === undefined) throw new Error(`an unexpected upload of ${events.length} events`);
    return Promise.resolve(answer(events));
  });
  return { uploads };
};

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const taken = (events: readonly LearnerEvent[], rejected: readonly { index: number; id?: string; code: string }[] = []): Response =>
  json(200, {
    accepted: events.length - rejected.length,
    duplicates: 0,
    cursor: 1,
    received: Object.fromEntries(events.filter((_, i) => !rejected.some((r) => r.index === i)).map((e) => [e.id, "2026-11-12T09:01:00.000Z"])),
    refused: 0,
    rejected,
  });

const deviceWith = async (events: readonly LearnerEvent[]): Promise<EventStore> => {
  const store = await openStore();
  expect(store.persistent).toBe(false); // the in-memory store
  await store.append(events);
  return store;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploading the outbox", () => {
  it("sets aside what the server rejects, sends the rest, and does not send it again", async () => {
    const [a, b, c] = [event(1), event(2, "es"), event(3)];
    const store = await deviceWith([a, b, c]);
    const { uploads } = server((events) => taken(events, [{ index: 1, id: b.id, code: "invalid-event" }]));
    expect([...(await uploadOutbox(store, to))].sort()).toEqual(["fa"]);
    expect(uploads).toHaveLength(1);
    expect(await store.pendingCount()).toBe(0);
    expect(Object.keys(await store.held())).toEqual([b.id]);
    expect((await store.held())[b.id]?.code).toBe("invalid-event");
    // Kept on the device, where it still counts.
    expect((await store.eventsOf("es")).map((e) => e.id)).toEqual([b.id]);
    expect((await store.receivedTimes()).has(a.id)).toBe(true);
    // The next pass has nothing to send: the rejected event is not retried every minute.
    await uploadOutbox(store, to);
    expect(uploads).toHaveLength(1);
  });

  it("keeps going after an older server's refusal of a whole batch, which names one event", async () => {
    const [a, b, c] = [event(1), event(2), event(3)];
    const store = await deviceWith([a, b, c]);
    const { uploads } = server(
      () => json(400, { error: { code: "foreign-event", index: 1 } }),
      (events) => taken(events),
    );
    await uploadOutbox(store, to);
    expect(uploads.map((u) => u.map((e) => e.id))).toEqual([
      [a.id, b.id, c.id],
      [a.id, c.id],
    ]);
    expect(Object.keys(await store.held())).toEqual([b.id]);
    expect(await store.pendingCount()).toBe(0);
  });

  it("sets nothing aside when the failure names no event: the outbox stays for the next pass", async () => {
    const store = await deviceWith([event(1), event(2)]);
    server(() => json(400, { error: { code: "invalid-batch" } }));
    await expect(uploadOutbox(store, to)).rejects.toMatchObject({ status: 400, code: "invalid-batch" });
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(uploadOutbox(store, to)).rejects.toBeInstanceOf(TypeError);
    expect(await store.pendingCount()).toBe(2);
    expect(await store.held()).toEqual({});
  });

  it("sends what was set aside once more after an update of the app, and only then (D10)", async () => {
    const [a, b] = [event(1), event(2)];
    const store = await deviceWith([a, b]);
    expect(await retryAfterUpdate(store, "build 1")).toBe(0); // nothing held yet: this build is noted
    server((events) => taken(events, [{ index: 0, code: "invalid-event" }]));
    await uploadOutbox(store, to);
    expect(Object.keys(await store.held())).toEqual([a.id]);
    // The same build starting again: it stays aside.
    expect(await retryAfterUpdate(store, "build 1")).toBe(0);
    expect(await store.pendingCount()).toBe(0);
    // A new build: back in the outbox, once; rejected again, it waits for the next update.
    expect(await retryAfterUpdate(store, "build 2")).toBe(1);
    expect((await store.pending(10)).map((e) => e.id)).toEqual([a.id]);
    server((events) => taken(events, [{ index: 0, code: "invalid-event" }]));
    await uploadOutbox(store, to);
    expect(await retryAfterUpdate(store, "build 2")).toBe(0);
    expect(Object.keys(await store.held())).toEqual([a.id]);
  });

  it("sends what was set aside again when asked", async () => {
    const [a, b] = [event(1), event(2)];
    const store = await deviceWith([a, b]);
    server(
      (events) => taken(events, [{ index: 0, code: "invalid-event" }]),
      (events) => taken(events),
    );
    await uploadOutbox(store, to);
    expect(Object.keys(await store.held())).toEqual([a.id]);
    expect(await store.releaseHeld()).toBe(1);
    expect(await store.held()).toEqual({});
    expect((await store.pending(10)).map((e) => e.id)).toEqual([a.id]);
    await uploadOutbox(store, to);
    expect(await store.pendingCount()).toBe(0);
  });
});
