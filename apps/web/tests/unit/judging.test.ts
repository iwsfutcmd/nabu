/**
 * While the judge may still accept an answer, its feedback holds back lexical, grammatical and order
 * (ADR 0148): for a typed card the server judges, graded WRONG, until the judge answers no.
 */
import type { AnswerSubmitted } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { judgeMayAccept } from "../../src/judging.ts";

const typed = { id: "translate-type.l1-l2:s.1", template: "translate-type.l1-l2" } as const;
const answer = (raw: string): AnswerSubmitted => ({ exercise: { id: typed.id, template: typed.template }, outcome: { kind: "WRONG" }, input: { raw } }) as unknown as AnswerSubmitted;
const none: ReadonlySet<string> = new Set();

describe("judgeMayAccept", () => {
  it("a typed answer graded WRONG, where the server judges and the learner is signed in: held, before and after it is recorded", () => {
    expect(judgeMayAccept(true, true, none, typed, "WRONG", undefined)).toBe(true);
    expect(judgeMayAccept(true, true, none, typed, "WRONG", answer("Quiero bolver"))).toBe(true);
  });

  it("once the judge has answered no: not held", () => {
    expect(judgeMayAccept(true, true, new Set([typed.id]), typed, "WRONG", answer("Quiero bolver"))).toBe(false);
  });

  it("nothing to wait for: no judge, no account, no text, a verdict it is never asked of, a card it does not judge", () => {
    expect(judgeMayAccept(false, true, none, typed, "WRONG", undefined)).toBe(false);
    expect(judgeMayAccept(true, false, none, typed, "WRONG", undefined)).toBe(false);
    expect(judgeMayAccept(true, true, none, typed, "WRONG", answer("  "))).toBe(false);
    expect(judgeMayAccept(true, true, none, typed, "WRONG_WORD", undefined)).toBe(false);
    expect(judgeMayAccept(true, true, none, { id: "choose-translation:s.1", template: "choose-translation" }, "WRONG", undefined)).toBe(false);
  });
});
