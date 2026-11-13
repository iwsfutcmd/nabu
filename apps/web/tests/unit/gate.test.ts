/**
 * What the app says while a deployment's gate keeps lessons closed (M5): that it is empty, and when a
 * lesson may start again; where practice refills it, that too. With the gate open it says nothing.
 */
import { DEFAULT_GAME, ENERGY, gameConfig, HEARTS, replayGame, type GameConfig, type GameState } from "@nabu/core/game";
import { createTranslator, sourceCatalog } from "@nabu/i18n";
import type { LearnerEvent, OrthographyId } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { gateClosed, gateTime, sessionAllowed } from "../../src/game.tsx";

const t = createTranslator({ locale: "en", catalogs: [sourceCatalog()] });
const AT = Date.parse("2026-05-12T09:00:00Z");

let n = 0;
const uuid = (): string => `00000000-0000-7000-8000-${(++n).toString(16).padStart(12, "0")}`;

/** A lesson as a device logs it: `wrong` answers wrong, a second apart, from `at`. */
const lesson = (at: number, wrong: number): LearnerEvent[] => {
  const session = uuid();
  const base = (offset: number) => {
    const time = new Date(at + offset * 1000).toISOString();
    return { id: uuid(), schema: 1 as const, device: "unit", course: "fa", orthography: "fa-Arab/standard" as OrthographyId, support: "en", bundle: "0".repeat(64), session, clientTime: time, localDate: time.slice(0, 10), tz: "UTC" };
  };
  return [
    { ...base(0), type: "session_started", mode: "lesson", node: "fa.greetings", seed: 1, exercises: wrong, planner: "unit" },
    ...Array.from({ length: wrong }, (_, i) => ({
      ...base(1 + i),
      type: "answer_submitted",
      exercise: { id: `x${i}`, template: "choose-translation", item: "s.1", kcs: ["sense:salam"] },
      attempt: 1,
      input: { method: "choice", latencyMs: 3000 },
      outcome: { kind: "WRONG", notes: [], kcs: [{ kc: "sense:salam", status: "wrong" }] },
    })),
    { ...base(2 + wrong), type: "session_completed", mode: "lesson", node: "fa.greetings", summary: { completed: true, exercises: wrong, correctFirstTry: 0, retries: 0, skipped: 0 } },
  ] as unknown as LearnerEvent[];
};

/** A placeholder as the formatter isolates it (FSI … PDI). */
const isolated = (text: string): string => `\u2068${text}\u2069`;

const gameOf = (events: readonly LearnerEvent[], config: GameConfig, now: number): GameState =>
  replayGame(
    events.map((event) => ({ event })),
    config,
    { today: new Date(now).toISOString().slice(0, 10), now: new Date(now).toISOString() },
  );

describe("the gate in words (M5)", () => {
  const now = new Date(AT + 60_000);

  it("says nothing while lessons are open, or with the gate off", () => {
    expect(gateClosed(t, gameOf(lesson(AT, 2), gameConfig({ gate: HEARTS }), now.getTime()), gameConfig({ gate: HEARTS }), now)).toBeUndefined();
    expect(gateClosed(t, gameOf(lesson(AT, 9), DEFAULT_GAME, now.getTime()), DEFAULT_GAME, now)).toBeUndefined();
  });

  it("hearts gone: practice refills them, or a lesson may start when the first comes back", () => {
    const config = gameConfig({ gate: HEARTS });
    const state = gameOf(lesson(AT, 5), config, now.getTime());
    const opensAt = state.gate.opensAt ?? "";
    expect(Date.parse(opensAt)).toBe(AT + 1000 + 300 * 60_000);
    expect(gateClosed(t, state, config, now)).toBe(`You're out of hearts for now. Practise reviews or mistakes to refill, or start your next lesson at ${isolated(gateTime(t, opensAt, now))}.`);
    // Where practice does not refill them, only the time.
    const waiting = gameConfig({ gate: { ...HEARTS, refillByPractice: false } as typeof HEARTS });
    expect(gateClosed(t, gameOf(lesson(AT, 5), waiting, now.getTime()), waiting, now)).toBe(`You're out of hearts for now. Your next lesson can start at ${isolated(gateTime(t, opensAt, now))}. Reviews and mistakes stay open.`);
    // Practice is open all the while; a lesson once the time has come, from the same state.
    expect(sessionAllowed(state, "review", config, now)).toBe(true);
    expect(sessionAllowed(state, "lesson", config, now)).toBe(false);
    expect(sessionAllowed(state, "lesson", config, new Date(opensAt))).toBe(true);
    expect(gateClosed(t, state, config, new Date(opensAt))).toBeUndefined();
  });

  it("energy gone: says so", () => {
    const config = gameConfig({ gate: ENERGY });
    const state = gameOf(lesson(AT, 25), config, now.getTime());
    expect(gateClosed(t, state, config, now)).toMatch(/^You're out of energy for now\. Practise reviews or mistakes to refill, or start your next lesson at .+\.$/u);
  });

  it("names the time of day, and the weekday too when it is not today", () => {
    const today = gateTime(t, new Date(now.getTime() + 3_600_000).toISOString(), now);
    expect(today).toBe(new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(now.getTime() + 3_600_000));
    const later = new Date(now.getTime() + 2 * 86_400_000);
    expect(gateTime(t, later.toISOString(), now)).toBe(new Intl.DateTimeFormat("en", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(later));
  });
});
