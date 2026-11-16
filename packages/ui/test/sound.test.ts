/**
 * Feedback tones (sound.ts): a phone may suspend the page's audio (a context made before the page
 * was touched, a call, the app in the background); the next tone wakes it, or none would sound again.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** A stand-in AudioContext that starts suspended and records what is asked of it. */
const fakeAudio = (): { readonly resumed: () => number; readonly started: () => number } => {
  let resumes = 0;
  let starts = 0;
  const param = { value: 0, setValueAtTime: () => param, exponentialRampToValueAtTime: () => param };
  class FakeContext {
    state: "suspended" | "running" = "suspended";
    currentTime = 0;
    destination = {};
    resume(): Promise<void> {
      resumes += 1;
      this.state = "running";
      return Promise.resolve();
    }
    createOscillator(): unknown {
      return { frequency: { value: 0 }, connect: (node: unknown) => node, start: () => (starts += 1), stop: () => undefined };
    }
    createGain(): unknown {
      return { gain: param, connect: (node: unknown) => node };
    }
  }
  vi.stubGlobal("AudioContext", FakeContext);
  return { resumed: () => resumes, started: () => starts };
};

describe("feedback tones", () => {
  it("wake audio a phone has suspended, and sound", async () => {
    const audio = fakeAudio();
    const { playFeedbackSound } = await import("../src/player/sound.ts");
    playFeedbackSound("correct");
    expect(audio.resumed()).toBe(1);
    expect(audio.started()).toBe(2);
    // Running now: nothing to wake.
    playFeedbackSound("wrong");
    expect(audio.resumed()).toBe(1);
    expect(audio.started()).toBe(4);
  });
});
