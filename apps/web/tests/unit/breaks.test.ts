/**
 * Listening and speaking off (S8): for an hour after "Can't listen now", or until turned back on in
 * Preferences. Either keeps those exercises out of new sessions, and with listening off nothing
 * plays by itself; turning one back on ends both. Listening turned off for good is also left out of
 * known words and what is due (D41); a break is not.
 */
import { LISTENING, SPEAKING } from "@nabu/core/lesson";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BREAK_MS, exclusionsOf, facetsOffOf, isOff, offFor, offNow, playsUnasked, setBreakUntil, setTurnedOff, turnedOff, turnOn } from "../../src/breaks.ts";

/** A localStorage for the device (node has none). */
const withStorage = (): Map<string, string> => {
  const map = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => map.set(k, v), removeItem: (k: string) => map.delete(k) },
  });
  return map;
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
  vi.useRealTimers();
});

describe("listening and speaking off", () => {
  it("are on until a break or the learner's choice puts them off", () => {
    withStorage();
    expect(offFor("listening")).toBeUndefined();
    expect(offFor("speaking")).toBeUndefined();
    expect(playsUnasked(true)).toBe(true);
  });

  it("a break lasts an hour; the choice in Preferences lasts until it is changed", () => {
    vi.useFakeTimers({ now: new Date("2026-11-12T09:00:00Z") });
    const stored = withStorage();
    setBreakUntil("listening", Date.now() + BREAK_MS);
    expect(offFor("listening")).toBe("break");
    vi.setSystemTime(Date.now() + BREAK_MS + 1);
    expect(offFor("listening")).toBeUndefined();

    setTurnedOff("speaking", true);
    expect(stored.get("nabu.speaking")).toBe("off");
    vi.setSystemTime(Date.now() + 30 * BREAK_MS);
    expect(offFor("speaking")).toBe("setting");
    expect(isOff("speaking")).toBe(true);
    expect(isOff("listening")).toBe(false);
  });

  it("the choice says why, over a break; on again ends both", () => {
    vi.useFakeTimers({ now: new Date("2026-11-12T09:00:00Z") });
    const stored = withStorage();
    setBreakUntil("listening", Date.now() + BREAK_MS);
    setTurnedOff("listening", true);
    expect(offFor("listening")).toBe("setting");
    turnOn("listening");
    expect(offFor("listening")).toBeUndefined();
    expect(turnedOff("listening")).toBe(false);
    expect([...stored.keys()]).toEqual([]);
  });

  it("with listening off, nothing plays by itself, whatever the sound", () => {
    withStorage();
    setTurnedOff("listening", true);
    expect(playsUnasked(true)).toBe(false);
    setTurnedOff("speaking", true);
    turnOn("listening");
    expect(playsUnasked(true)).toBe(true);
    expect(playsUnasked(false)).toBe(false);
  });

  it("without storage, the choice lasts the page", () => {
    setTurnedOff("listening", true);
    expect(offFor("listening")).toBe("setting");
    turnOn("listening");
    expect(offFor("listening")).toBeUndefined();
  });
});

describe("what sessions, known words and what is due leave out", () => {
  it("off either way, sessions leave out the exercises", () => {
    vi.useFakeTimers({ now: new Date("2026-11-12T09:00:00Z") });
    withStorage();
    expect(exclusionsOf(offNow())).toEqual(new Set());
    setBreakUntil("listening", Date.now() + BREAK_MS);
    expect(exclusionsOf(offNow())).toEqual(LISTENING);
    setTurnedOff("speaking", true);
    expect(exclusionsOf(offNow())).toEqual(new Set([...LISTENING, ...SPEAKING]));
  });

  it("only listening turned off for good leaves listening out of known words and what is due (D41)", () => {
    vi.useFakeTimers({ now: new Date("2026-11-12T09:00:00Z") });
    withStorage();
    expect(facetsOffOf(offNow())).toEqual(new Set());
    // A break, and speaking off for good, leave out their exercises and nothing more.
    setBreakUntil("listening", Date.now() + BREAK_MS);
    setTurnedOff("speaking", true);
    expect(facetsOffOf(offNow())).toEqual(new Set());
    setTurnedOff("listening", true);
    expect(facetsOffOf(offNow())).toEqual(new Set(["listen"]));
    // The same set each time, so a memo that depends on it keeps what it worked out.
    expect(facetsOffOf(offNow())).toBe(facetsOffOf({ listening: "setting" }));
    expect(facetsOffOf({})).toBe(facetsOffOf({ listening: "break" }));
    turnOn("listening");
    expect(facetsOffOf(offNow())).toEqual(new Set());
  });
});
