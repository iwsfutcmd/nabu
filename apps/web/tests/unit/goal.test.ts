/**
 * The weekly goal is the account's (ADR 0107, D12): the event the app records passes the schema the
 * server checks uploads with, waits in the outbox like any event, and belongs to no course's log; a
 * goal a device kept before D12 goes into the log once, only if the log has none.
 */
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { afterEach, describe, expect, it } from "vitest";
import { validEvent } from "../../src/event-schema.ts";
import { deviceGoal, forgetDeviceGoal, goalEvent, goalToMigrate } from "../../src/goal.ts";
import { openStore } from "../../src/store.ts";

const answer: LearnerEvent = {
  id: "00000000-0000-7000-8000-000000000001",
  type: "answer_submitted",
  schema: 1,
  device: "phone",
  course: "fa",
  orthography: "fa-Arab/standard" as OrthographyId,
  support: "en",
  bundle: "0".repeat(64),
  session: "00000000-0000-7000-a000-000000000001",
  clientTime: "2026-11-12T09:00:00.000+01:00",
  localDate: "2026-11-12",
  tz: "Europe/Paris",
  exercise: { id: "choose-translation:s1", template: "choose-translation", item: "s1", kcs: [] },
  attempt: 1,
  input: { method: "choice", latencyMs: 2100 },
  outcome: { kind: "CORRECT", notes: [], kcs: [] },
};

/** A localStorage for the device's old goal (node has none). */
const withStorage = (entries: Record<string, string>): Map<string, string> => {
  const map = new Map(Object.entries(entries));
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v), removeItem: (k: string) => map.delete(k) },
  });
  return map;
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("the weekly goal", () => {
  it("is recorded as an event the server takes, which syncs and belongs to no course", async () => {
    const goal = goalEvent(5, "phone", new Date("2026-11-12T08:30:00Z"));
    expect(goal).toMatchObject({ type: "goal_set", days: 5, device: "phone", schema: 1 });
    expect(validEvent(goal)).toBe(true);
    expect(validEvent(goalEvent(null, "phone"))).toBe(true); // cleared
    expect(validEvent({ ...goal, days: 0 })).toBe(false);
    expect(validEvent({ ...goal, course: "fa" })).toBe(false);
    const store = await openStore();
    await store.append([answer, goal]);
    expect((await store.pending(10)).map((e) => e.id).sort()).toEqual([answer.id, goal.id].sort());
    expect((await store.eventsOf("fa")).map((e) => e.id)).toEqual([answer.id]);
    expect((await store.allEvents()).map((e) => e.id).sort()).toEqual([answer.id, goal.id].sort());
  });

  it("a device's goal from before goes into the log once, only if the log has none", () => {
    expect(goalToMigrate(5, { goal: undefined })).toBe(5);
    expect(goalToMigrate(5, { goal: 3 })).toBeUndefined(); // another device set one: it stands
    expect(goalToMigrate(5, { goal: null })).toBeUndefined(); // cleared on purpose
    expect(goalToMigrate(undefined, { goal: undefined })).toBeUndefined();
    const kept = withStorage({ "nabu.goal": "4" });
    expect(deviceGoal()).toBe(4);
    forgetDeviceGoal();
    expect(kept.has("nabu.goal")).toBe(false);
    expect(deviceGoal()).toBeUndefined();
    withStorage({ "nabu.goal": "9" });
    expect(deviceGoal()).toBeUndefined(); // not a goal the app offers
  });
});
