import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { draftCount, sentenceSignoffText, signedOff, storySignoffText } from "../src/corrections/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

/** apc's s.1 as the app shows it: pinned here and in pipeline/tests/test_review.py (the Python twin). */
const APC_S1 = ["sentence\ts.1", "form\tapc-Arab/standard\t\u0645\u064E\u0631\u0652\u062D\u064E\u0628\u0627!", "form\tapc-Latn/arabizi\tmar7aba!", "translation\ten\tHello!"].join("\n");

describe("sign-off text (ADR 0072)", () => {
  const apc = loadCourse("apc");
  const sentences = apc.units.flatMap((u) => u.sentences);
  const stories = apc.units.flatMap((u) => u.stories ?? []);

  it("pins a sentence: every form and translation, as compiled", () => {
    const s1 = sentences.find((s) => s.id === "s.1");
    expect(s1 && sentenceSignoffText(s1)).toBe(APC_S1);
  });

  it("pins a story by its lines, in order, and leaves its questions out", () => {
    const story = stories[0];
    if (story === undefined) throw new Error("apc has stories");
    const text = storySignoffText(story);
    expect(text.startsWith(`story\t${story.id}\nline\t0\nform\t`)).toBe(true);
    const lines = story.steps.filter((s) => s.line !== undefined).length;
    expect(text.split("\n").filter((l) => l.startsWith("line\t"))).toHaveLength(lines);
  });

  it("tells every item apart", () => {
    const all = [...sentences.map(sentenceSignoffText), ...stories.map(storySignoffText)];
    const hashes = new Set(all.map((t) => createHash("sha256").update(t, "utf8").digest("hex")));
    expect(hashes.size).toBe(all.length);
  });

  it("knows a signed-off provenance", () => {
    expect(signedOff({ author: "llm:x@y", status: "draft" })).toBe(false);
    expect(signedOff({ author: "llm:x@y", status: "reviewed", reviewedBy: "human:ben", reviewedAt: "2026-11-06" })).toBe(true);
    expect(signedOff(undefined)).toBe(false);
  });

  it("counts the sentences no reviewer has signed off, story lines included", () => {
    const lines = stories.reduce((n, story) => n + story.steps.filter((s) => s.line !== undefined).length, 0);
    const reviewed = sentences.filter((s) => signedOff(s.provenance)).length;
    expect(draftCount(apc.units)).toEqual({ drafts: sentences.length - reviewed + lines, total: sentences.length + lines });
    const signed = apc.units.map((u) => ({
      ...u,
      sentences: u.sentences.map((s) => ({ ...s, provenance: { author: "llm:x@y", status: "reviewed" as const } })),
      stories: (u.stories ?? []).map((s) => ({ ...s, provenance: { author: "llm:x@y", status: "published" as const } })),
    }));
    expect(draftCount(signed)).toEqual({ drafts: 0, total: sentences.length + lines });
  });
});
