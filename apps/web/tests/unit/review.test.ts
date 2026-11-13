/**
 * The reviewer check (D11 in the 2026-11 review): GET /v1/review/me answers an account that reviews
 * nothing with no role, and the app takes that as "not a reviewer" rather than an error.
 */
import { describe, expect, it } from "vitest";
import { reviewerIn } from "../../src/Review.tsx";

describe("what /v1/review/me says of an account", () => {
  it("a reviewer, with the courses they review", () => {
    expect(reviewerIn({ role: "reviewer", handle: "mei", courses: ["yue"] })).toEqual({ handle: "mei", courses: ["yue"] });
    // A server from before D11 sent no role with a reviewer's answer.
    expect(reviewerIn({ handle: "مریم", courses: ["*"] })).toEqual({ handle: "مریم", courses: ["*"] });
  });

  it("no role: an account that reviews nothing", () => {
    expect(reviewerIn({ role: null })).toBeNull();
    expect(reviewerIn(undefined)).toBeNull();
    expect(reviewerIn({ role: "reviewer", handle: "mei", courses: [3] })).toBeNull();
  });
});
