/**
 * Feedback sounds (§8.6), synthesized with Web Audio: no audio assets to
 * license. Two short tones, rising for correct and falling for wrong.
 */
let context: AudioContext | undefined;

/** Each of the two notes, in seconds. */
const NOTE_S = 0.12;

/** How long the feedback sound lasts: a clip said on answering waits for it (useSayWhenAnswered). */
export const FEEDBACK_SOUND_MS = 2 * NOTE_S * 1000;

export const playFeedbackSound = (kind: "correct" | "wrong"): void => {
  try {
    context ??= new AudioContext();
    const ctx = context;
    const notes = kind === "correct" ? [660, 880] : [330, 247];
    notes.forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * NOTE_S;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_S - 0.01);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + NOTE_S);
    });
  } catch {
    // No audio (blocked autoplay, no device): feedback is also visual and announced.
  }
};
