/**
 * Restoring a downloaded file (S6 in the 2026-11 review): every event checked against the event
 * schema, as the server checks uploads; what the device has already left as it is; a second restore
 * of the same file changes nothing.
 */
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { validEvent } from "../../src/event-schema.ts";
import { eventValidator, readEventsFile, restoreEvents } from "../../src/restore.ts";
import { openStore } from "../../src/store.ts";

const event = (n: number): LearnerEvent => ({
  id: `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  type: "answer_submitted",
  schema: 1,
  device: "phone",
  course: n % 2 === 0 ? "fa" : "yue",
  orthography: (n % 2 === 0 ? "fa-Arab/standard" : "yue-Hant-HK/standard") as OrthographyId,
  support: "en",
  bundle: "0".repeat(64),
  session: "00000000-0000-7000-a000-000000000001",
  clientTime: `2026-11-12T09:00:${String(n).padStart(2, "0")}.000+01:00`,
  localDate: "2026-11-12",
  tz: "Europe/Paris",
  exercise: { id: `choose-translation:s${n}`, template: "choose-translation", item: `s${n}`, kcs: [] },
  attempt: 1,
  input: { method: "choice", latencyMs: 2100 },
  outcome: { kind: "CORRECT", notes: [], kcs: [] },
});

/** As "Download my learning data" writes it: one event per line. */
const lines = (events: readonly unknown[]): string => events.map((e) => `${JSON.stringify(e)}\n`).join("");

describe("reading a downloaded file", () => {
  it("takes the events, one per line, and counts what is not one", () => {
    const [a, b] = [event(1), event(2)];
    const text = `${lines([a])}not json at all\n\n${JSON.stringify({ ...b, clientTime: "yesterday" })}\n${lines([b, a])}`;
    const file = readEventsFile(text, validEvent);
    expect(file.events.map((e) => e.id)).toEqual([a.id, b.id]);
    expect(file.invalid).toBe(2);
  });

  it("reads the account's download ({events}), a list, and a single event", () => {
    const events = [event(1), event(2), event(3)];
    expect(readEventsFile(JSON.stringify({ user: { email: "a@b.example" }, events, courses: [] }, null, 2), validEvent)).toEqual({ events, invalid: 0 });
    expect(readEventsFile(JSON.stringify(events), validEvent)).toEqual({ events, invalid: 0 });
    expect(readEventsFile(JSON.stringify(events[0]), validEvent)).toEqual({ events: [events[0]], invalid: 0 });
  });

  it("holds an event to the schema the server holds uploads to", async () => {
    const valid = await eventValidator();
    expect(valid(event(1))).toBe(true);
    expect(valid({ ...event(1), appVersion: "2" })).toBe(false); // a field the schema does not know
    expect(valid({ ...event(1), id: "not a uuid" })).toBe(false);
    expect(readEventsFile("a photo, perhaps\n", valid)).toEqual({ events: [], invalid: 1 });
  });
});

describe("restoring", () => {
  it("adds what the device lacks, keeps what it has, and a second restore changes nothing", async () => {
    const store = await openStore();
    const [a, b, c] = [event(1), event(2), event(3)];
    await store.append([a]);
    const { events } = readEventsFile(lines([a, b, c]), validEvent);
    const have = await store.ids();
    const fresh = events.filter((e) => !have.has(e.id));
    expect(fresh.map((e) => e.id)).toEqual([b.id, c.id]);
    expect(await restoreEvents(store.append, fresh)).toBe(2);
    expect((await store.allEvents()).map((e) => e.id).sort()).toEqual([a.id, b.id, c.id]);
    expect(await restoreEvents(store.append, events)).toBe(0);
    // In the outbox like any event recorded here: an account sends them on the next sync.
    expect(await store.pendingCount()).toBe(3);
  });

  it("goes in chunks, and counts across them", async () => {
    const store = await openStore();
    const many = Array.from({ length: 1234 }, (_, i) => event(i + 1));
    const chunks: number[] = [];
    const added = await restoreEvents(async (events) => {
      chunks.push(events.length);
      return store.append(events);
    }, many);
    expect(added).toBe(1234);
    expect(chunks).toEqual([500, 500, 234]);
  });
});
