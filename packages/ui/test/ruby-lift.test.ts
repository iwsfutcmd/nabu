/**
 * Readings set by each word's own ink (ADR 0131 amendment): lifted from where the browser sets ruby to
 * just over the word's ink, never below where the browser sets it. The measuring itself needs a browser
 * (canvas, fonts, layout); without one a word has no lift and the stylesheet's clearance holds.
 */
import { describe, expect, it } from "vitest";
import { RUBY_GAP, rubyLift } from "../src/ruby-lift.ts";

describe("a reading's lift", () => {
  it("puts the reading a gap over the word's ink, from where the browser sets it", () => {
    // یکیتسن: ink to 2.06 em; Chromium sets ruby on the em box, 0.8 em up.
    expect(rubyLift(2.06, 0.8)).toBeCloseTo(2.06 + RUBY_GAP - 0.8);
  });

  it("never sets a reading lower than the browser would (a short word, سن)", () => {
    expect(rubyLift(0.4, 0.8)).toBe(0);
  });
});
