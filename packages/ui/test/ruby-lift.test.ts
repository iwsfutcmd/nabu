/**
 * Readings set by each word's own ink (ADR 0131 amendment): lifted from where the reading's baseline
 * sits of its own accord to a gap over the word's ink, never below where it sits. The measuring itself
 * needs a browser (canvas, fonts, layout); without one a word has no lift and the stylesheet's
 * clearance holds.
 */
import { describe, expect, it } from "vitest";
import { RUBY_GAP, rubyLift } from "../src/ruby-lift.ts";

describe("a reading's lift", () => {
  it("puts the reading's baseline a gap over the word's ink", () => {
    // یکیتسن: ink to 2.04 em; an unlifted reading's baseline 1.07 em up (Chromium, chg's line height).
    expect(rubyLift(2.04, 1.07)).toBeCloseTo(2.04 + RUBY_GAP - 1.07);
  });

  it("never sets a reading lower than it sits of its own accord (a short word, سیز)", () => {
    expect(rubyLift(0.52, 1.07)).toBe(0);
  });
});
