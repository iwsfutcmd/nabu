/**
 * Every feedback note or verdict the grader can produce has an MF2 message
 * (gameplan §8.6): feedback.note.<id>, feedback.verdict.<verdict>.
 */
import { asciiLowercase } from "@nabu/core/text";
import { sourceCatalog } from "@nabu/i18n";
import { describe, expect, it } from "vitest";
import { loadRawProfiles } from "../src/load.ts";

const keys = new Set(Object.keys(sourceCatalog().messages));
const ENGINE_DEFAULTS = ["marks", "variant", "zwnj", "apostrophe", "script-mismatch", "ime-homophone"];
const VERDICTS = ["CORRECT", "CORRECT_ALT", "CORRECT_MARKS", "CORRECT_VARIANT", "CORRECT_WITH_TYPO", "CORRECT_PROVISIONAL", "PARTIAL", "WRONG_WORD", "WRONG", "SKIPPED"];

const profileNotes = (): string[] =>
  loadRawProfiles().flatMap((p) => {
    const m = p.match ?? {};
    return [
      m.zwnj?.note,
      m.marks?.note,
      m.variants?.note,
      m.scriptMismatch?.note,
      m.apostrophe?.note,
      ...(m.equivalences ?? []).map((e) => (e.policy === "accept" || e.policy === "ignore" ? undefined : (e.note ?? e.id))),
    ].filter((n): n is string => n !== undefined);
  });

describe("feedback messages", () => {
  it.each([...new Set([...profileNotes(), ...ENGINE_DEFAULTS])])("feedback.note.%s exists", (id) => {
    expect(keys.has(`feedback.note.${id}`)).toBe(true);
  });
  it.each(VERDICTS)("feedback.verdict for %s exists", (v) => {
    expect(keys.has(`feedback.verdict.${asciiLowercase(v).replaceAll("_", "-")}`)).toBe(true);
  });
});
