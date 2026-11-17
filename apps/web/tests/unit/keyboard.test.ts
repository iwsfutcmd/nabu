/**
 * Which languages a focused field asks the device keyboard for (ADR 0143): its own `data-keyboard`
 * where its orthography is known, else the language it is tagged with; nothing for a field that
 * takes no words.
 */
import { describe, expect, it } from "vitest";
import { keyboardFor, type FocusedField } from "../../src/keyboard.ts";

/** A field with these attributes, inside an element tagged `above` (or nothing). */
const field = (tagName: string, attrs: Readonly<Record<string, string>>, above?: string): FocusedField => ({
  tagName,
  getAttribute: (name) => attrs[name] ?? null,
  closest: (selector) => {
    if (selector !== "[lang]") return null;
    if (attrs["lang"] !== undefined) return { getAttribute: (name) => (name === "lang" ? (attrs["lang"] ?? null) : null) };
    return above === undefined ? null : { getAttribute: (name) => (name === "lang" ? above : null) };
  },
});

describe("keyboardFor", () => {
  it("takes the languages the field names, from its orthography's profile", () => {
    expect(keyboardFor(field("INPUT", { lang: "hbo-Hebr", "data-keyboard": "hbo he und-Hebr" }), "en")).toEqual(["hbo", "he", "und-Hebr"]);
  });

  it("otherwise asks for the language the field is tagged with, or the one above it, or the page's", () => {
    expect(keyboardFor(field("TEXTAREA", { lang: "yue-Hant-HK" }), "en")).toEqual(["yue-HK", "zh-Hant-HK", "und-Hant"]);
    expect(keyboardFor(field("INPUT", { type: "search" }, "fa"), "en")).toEqual(["fa", "und-Arab"]);
    expect(keyboardFor(field("INPUT", {}), "ar")).toEqual(["ar", "und-Arab"]);
  });

  it("leaves the keyboard alone for anything that takes no words", () => {
    expect(keyboardFor(field("INPUT", { type: "password", lang: "fa" }), "en")).toBeUndefined();
    expect(keyboardFor(field("INPUT", { type: "email" }), "en")).toBeUndefined();
    expect(keyboardFor(field("BUTTON", { lang: "fa" }), "en")).toBeUndefined();
  });
});
