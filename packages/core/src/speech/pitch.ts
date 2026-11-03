/**
 * Pitch tracking (gameplan §10.4 tier 3): the YIN estimator (de Cheveigné & Kawahara 2002) over
 * short frames. Pure arithmetic on PCM samples, so it runs on the device: the learner's audio
 * never has to leave it for tone feedback.
 */

export interface PitchOptions {
  /** Analysis window and hop, in milliseconds. */
  readonly windowMs?: number;
  readonly hopMs?: number;
  /** The F0 range searched, in Hz: wide enough for children and low voices. */
  readonly minHz?: number;
  readonly maxHz?: number;
  /** YIN's absolute threshold on the cumulative mean normalized difference. */
  readonly threshold?: number;
  /** Frames quieter than this RMS (relative to the loudest frame) are unvoiced. */
  readonly silence?: number;
}

export interface PitchTrack {
  readonly hopMs: number;
  /** F0 per frame in Hz, or undefined where the frame is unvoiced. */
  readonly f0: readonly (number | undefined)[];
  /** RMS energy per frame, for segmentation. */
  readonly energy: readonly number[];
}

const DEFAULTS: Required<PitchOptions> = { windowMs: 40, hopMs: 10, minHz: 60, maxHz: 500, threshold: 0.15, silence: 0.05 };

/** YIN on one frame: the period in samples (with parabolic interpolation), or undefined. */
const yin = (x: Float32Array, start: number, size: number, minLag: number, maxLag: number, threshold: number): number | undefined => {
  const d = new Float64Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < size - maxLag; i++) {
      const delta = (x[start + i] ?? 0) - (x[start + i + lag] ?? 0);
      sum += delta * delta;
    }
    d[lag] = sum;
  }
  // Cumulative mean normalized difference.
  const cmnd = new Float64Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag] ?? 0;
    cmnd[lag] = running === 0 ? 1 : ((d[lag] ?? 0) * lag) / running;
  }
  let lag = minLag;
  while (lag <= maxLag && (cmnd[lag] ?? 1) >= threshold) lag++;
  if (lag > maxLag) return undefined;
  while (lag + 1 <= maxLag && (cmnd[lag + 1] ?? 1) < (cmnd[lag] ?? 1)) lag++;
  // Parabolic interpolation around the minimum.
  const a = cmnd[lag - 1] ?? cmnd[lag] ?? 0;
  const b = cmnd[lag] ?? 0;
  const c = cmnd[lag + 1] ?? cmnd[lag] ?? 0;
  const denom = a - 2 * b + c;
  return denom === 0 ? lag : lag + (a - c) / (2 * denom);
};

/** F0 and energy per frame of mono PCM (−1…1). */
export const pitchTrack = (samples: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchTrack => {
  const o = { ...DEFAULTS, ...options };
  const size = Math.round((o.windowMs / 1000) * sampleRate);
  const hop = Math.max(1, Math.round((o.hopMs / 1000) * sampleRate));
  const minLag = Math.max(2, Math.floor(sampleRate / o.maxHz));
  const maxLag = Math.min(size - 2, Math.ceil(sampleRate / o.minHz));
  const energy: number[] = [];
  const periods: (number | undefined)[] = [];
  for (let start = 0; start + size <= samples.length; start += hop) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += (samples[start + i] ?? 0) ** 2;
    energy.push(Math.sqrt(sum / size));
    periods.push(yin(samples, start, size, minLag, maxLag, o.threshold));
  }
  const loudest = energy.reduce((m, e) => Math.max(m, e), 0);
  const f0 = periods.map((p, i) => (p === undefined || (energy[i] ?? 0) < loudest * o.silence ? undefined : sampleRate / p));
  return { hopMs: o.hopMs, f0, energy };
};

/** Semitones relative to 100 Hz: the log-F0 scale contours are compared on. */
export const semitones = (hz: number): number => 12 * Math.log2(hz / 100);
