/**
 * Feedback sounds (§8.6), synthesized with Web Audio: no audio assets to
 * license. Two short tones, rising for correct and falling for wrong.
 */
let context: AudioContext | undefined;

export const playFeedbackSound = (kind: "correct" | "wrong"): void => {
  try {
    context ??= new AudioContext();
    const ctx = context;
    const notes = kind === "correct" ? [660, 880] : [330, 247];
    notes.forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.12;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.12);
    });
  } catch {
    // No audio (blocked autoplay, no device): feedback is also visual and announced.
  }
};
