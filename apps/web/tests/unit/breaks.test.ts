/**
 * Listening and speaking off (S8): for an hour after "Can't listen now", or until turned back on in
 * Preferences. Either keeps those exercises out of new sessions, and with listening off nothing
 * plays by itself; turning one back on ends both.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { BREAK_MS, isOff, offFor, playsUnasked, setBreakUntil, setTurnedOff, turnedOff, turnOn } from "../../src/breaks.ts";

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
