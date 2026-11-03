/**
 * The tone evaluation (gameplan §16 Phase 9): accuracy per tone on a set of single-syllable clips
 * labelled with the tone expected and the tone said, per speaker.
 *
 * - Native clips (said = expected): the classifier should hear the tone said.
 * - Deliberately wrong clips (said ≠ expected): the classifier should flag them (hear ≠ expected).
 *
 * Protocol: each speaker is calibrated on their own native clips, as a learner is calibrated on
 * their own speech. Pure: the caller decodes the audio.
 */
import { pitchTrack } from "./pitch.ts";
import { calibrate, classify, contourOf, syllableSpans, type ToneSystem } from "./tone.ts";

export interface EvalClip {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly expected: string;
  readonly said: string;
  readonly kind: "native" | "wrong";
}

export interface ToneCounts {
  readonly native: { readonly n: number; readonly correct: number };
  readonly wrong: { readonly n: number; readonly flagged: number };
}

export interface ToneReport {
  readonly perTone: Readonly<Record<string, ToneCounts>>;
  /** Native clips heard as said, over all native clips. */
  readonly nativeAccuracy: number;
  /** Wrong clips flagged, over all wrong clips. */
  readonly wrongDetection: number;
  /** said → heard → count, native clips ("-" for no syllable found). */
  readonly confusion: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export const evaluateTones = (speakers: readonly (readonly EvalClip[])[], system: ToneSystem): ToneReport => {
  const tones = Object.keys(system.tones);
  const native = new Map(tones.map((t) => [t, { n: 0, correct: 0 }]));
  const wrong = new Map(tones.map((t) => [t, { n: 0, flagged: 0 }]));
  const confusion: Record<string, Record<string, number>> = Object.fromEntries(tones.map((t) => [t, {}]));
  for (const clips of speakers) {
    const tracks = clips.map((c) => pitchTrack(c.samples, c.sampleRate));
    const calibration = calibrate(tracks.filter((_, i) => clips[i]?.kind === "native"));
    clips.forEach((clip, i) => {
      const track = tracks[i];
      const span = track === undefined ? undefined : syllableSpans(track, 1)?.[0];
      const contour = track === undefined || span === undefined ? undefined : contourOf(track, span);
      const heard = contour === undefined ? undefined : classify(contour, system, calibration).tone;
      if (clip.kind === "native") {
        const c = native.get(clip.said);
        if (c !== undefined) {
          c.n += 1;
          if (heard === clip.said) c.correct += 1;
        }
        const row = confusion[clip.said];
        if (row !== undefined) row[heard ?? "-"] = (row[heard ?? "-"] ?? 0) + 1;
      } else {
        const c = wrong.get(clip.expected);
        if (c !== undefined) {
          c.n += 1;
          if (heard !== clip.expected) c.flagged += 1;
        }
      }
    });
  }
  const sum = (xs: Iterable<number>): number => [...xs].reduce((a, b) => a + b, 0);
  const nativeN = sum([...native.values()].map((c) => c.n));
  const wrongN = sum([...wrong.values()].map((c) => c.n));
  return {
    perTone: Object.fromEntries(tones.map((t) => [t, { native: native.get(t) ?? { n: 0, correct: 0 }, wrong: wrong.get(t) ?? { n: 0, flagged: 0 } }])),
    nativeAccuracy: nativeN === 0 ? 0 : sum([...native.values()].map((c) => c.correct)) / nativeN,
    wrongDetection: wrongN === 0 ? 0 : sum([...wrong.values()].map((c) => c.flagged)) / wrongN,
    confusion,
  };
};

/** Mono 16-bit PCM WAV → samples. Undefined for anything else (the sets are WAV by design). */
export const decodeWav = (bytes: Uint8Array): { readonly samples: Float32Array; readonly sampleRate: number } | undefined => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return undefined;
  let at = 12;
  let rate = 0;
  let channels = 0;
  let bits = 0;
  while (at + 8 <= bytes.length) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      channels = view.getUint16(at + 10, true);
      rate = view.getUint32(at + 12, true);
      bits = view.getUint16(at + 22, true);
    } else if (id === "data") {
      if (channels !== 1 || bits !== 16) return undefined;
      const n = Math.floor(Math.min(size, bytes.length - at - 8) / 2);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = view.getInt16(at + 8 + i * 2, true) / 32768;
      return { samples, sampleRate: rate };
    }
    at += 8 + size + (size % 2);
  }
  return undefined;
};
