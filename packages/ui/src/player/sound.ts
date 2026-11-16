/**
 * Sound effects (§8.6), synthesized with Web Audio: no audio assets to license.
 *
 * - **Right:** a bell-like chime, a note and the fifth above it. Each right answer in a row steps it
 *   up the major pentatonic scale, up to a sixth higher; a wrong answer starts it over.
 * - **Wrong:** two soft, low notes, falling: a nudge, never a buzzer.
 * - **Finished:** a rising arpeggio as a lesson ends.
 *
 * What to play is a plan of notes (`notesOf`, pure and tested); `playSoundEffect` plays a plan. The
 * learner turns them off apart from the rest of the sound (Preferences: Sound effects), and nothing
 * plays with sound off.
 */
let context: AudioContext | undefined;

export type SoundEffect = "correct" | "wrong" | "finished";

/** One note of an effect: when it starts (seconds from now), its pitch, loudness and ring. */
export interface Note {
  readonly at: number;
  readonly frequency: number;
  /** Peak gain of its fundamental (0–1). */
  readonly gain: number;
  /** Seconds until it has died away. */
  readonly decay: number;
  /** Bell-like overtones (the octave and the twelfth), or a plain, softer sine. */
  readonly bell: boolean;
}

/** The major pentatonic, in semitones: each right answer in a row takes the chime a step up it. */
const STEPS = [0, 2, 4, 7, 9] as const;
/** G5: the chime's first note before a streak. */
const CHIME_ROOT = 783.99;
const FIFTH = 1.5;

const semitones = (frequency: number, n: number): number => frequency * 2 ** (n / 12);

/** What an effect plays; `streak` is how many right answers in a row came before this one. */
export const notesOf = (effect: SoundEffect, streak = 0): readonly Note[] => {
  switch (effect) {
    case "correct": {
      const root = semitones(CHIME_ROOT, STEPS[Math.min(Math.max(streak, 0), STEPS.length - 1)] ?? 0);
      return [
        { at: 0, frequency: root, gain: 0.16, decay: 0.3, bell: true },
        { at: 0.075, frequency: root * FIFTH, gain: 0.14, decay: 0.42, bell: true },
      ];
    }
    case "wrong":
      return [
        { at: 0, frequency: 311.13, gain: 0.1, decay: 0.16, bell: false },
        { at: 0.13, frequency: 233.08, gain: 0.1, decay: 0.22, bell: false },
      ];
    case "finished":
      return [783.99, 987.77, 1174.66, 1567.98].map((frequency, i) => ({ at: i * 0.09, frequency, gain: 0.13, decay: i === 3 ? 0.7 : 0.3, bell: true }));
  }
};

/**
 * How long an answer's sound holds the floor: a clip said on answering waits this long
 * (useSayWhenAnswered), so the two never sound together. The chime's ring fades under it.
 */
export const FEEDBACK_SOUND_MS = Math.round(Math.max(...(["correct", "wrong"] as const).flatMap((e) => notesOf(e).map((n) => n.at + 0.2))) * 1000);

/** The overtones of a bell-like note: [ratio to the fundamental, relative gain]. */
const BELL: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 0.35],
  [3, 0.1],
];
const SINE: readonly (readonly [number, number])[] = [[1, 1]];

/** Plays a plan of notes now. Without audio (no device, blocked), nothing happens: feedback is also shown and announced. */
export const playNotes = (notes: readonly Note[]): void => {
  try {
    context ??= new AudioContext();
    const ctx = context;
    // A context made before the page was touched starts suspended (phones): wake it.
    if (ctx.state === "suspended") void ctx.resume();
    for (const note of notes) {
      const at = ctx.currentTime + note.at;
      for (const [ratio, weight] of note.bell ? BELL : SINE) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = note.frequency * ratio;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(note.gain * weight, at + 0.006);
        // Higher overtones die away sooner, as a struck bell's do.
        gain.gain.exponentialRampToValueAtTime(0.0001, at + note.decay / ratio ** 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + note.decay + 0.05);
      }
    }
  } catch {
    // No audio: nothing to do.
  }
};

/** Plays a sound effect; `streak`: right answers in a row before this one. */
export const playSoundEffect = (effect: SoundEffect, streak = 0): void => playNotes(notesOf(effect, streak));

/** The feedback sound of an answer (the player's `sound` effect). */
export const playFeedbackSound = (kind: "correct" | "wrong", streak = 0): void => playSoundEffect(kind, streak);
