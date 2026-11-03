/**
 * Tone (gameplan §10.4 tier 3): per-syllable F0 contours, speaker-normalized, classified against
 * a tone system's templates. Expected tones come from the pinned surface readings (Jyutping
 * changed tones included), never from citation tones, so correct speech is not marked wrong.
 *
 * Scores are feedback, not verdicts (§10.4): each syllable reports what was heard and how sure
 * the classifier is. Without a calibration of the speaker's range, register (high, mid, low) is
 * unknowable from one syllable, so only the contour's shape is judged until there is one.
 */
import type { TaggedText } from "@nabu/schema";
import { semitones, type PitchTrack } from "./pitch.ts";

export type Shape = "level" | "rising" | "falling";

export interface ToneTemplate {
  /** Chao tone letters (1 low … 5 high) at the start, middle and end of the syllable. */
  readonly chao: readonly [number, number, number];
  readonly shape: Shape;
}

export interface ToneSystem {
  readonly id: string;
  /** The reading scheme whose syllables carry the tone number (jyutping). */
  readonly scheme: string;
  readonly tones: Readonly<Record<string, ToneTemplate>>;
  /** Where the tone number sits in a syllable of the scheme. */
  readonly toneOf: (syllable: string) => string | undefined;
}

/**
 * Cantonese (Hong Kong) in Jyutping: 1 high level (55; 53 heard as 1 too), 2 high rising (25/35),
 * 3 mid level (33), 4 low falling (21/11), 5 low rising (23/13), 6 low level (22). Checked
 * syllables (-p, -t, -k) carry 1, 3 or 6 in Jyutping and share those pitches. REVIEW: templates
 * from the standard descriptions (Chao letters); tune against native recordings.
 */
export const CANTONESE: ToneSystem = {
  id: "yue-jyutping",
  scheme: "jyutping",
  tones: {
    "1": { chao: [5, 5, 5], shape: "level" },
    "2": { chao: [2.5, 3.3, 5], shape: "rising" },
    "3": { chao: [3, 3, 3], shape: "level" },
    "4": { chao: [2.2, 1.6, 1], shape: "falling" },
    "5": { chao: [2, 2.3, 3], shape: "rising" },
    "6": { chao: [2, 2, 2], shape: "level" },
  },
  toneOf: (syllable) => /([1-6])$/u.exec(syllable)?.[1],
};

/** A speaker's pitch range: mean and spread of voiced frames, in semitones. */
export interface Calibration {
  readonly mean: number;
  readonly sd: number;
  /** Voiced frames it was computed from. */
  readonly frames: number;
}

/** Enough voiced speech (about a second) to trust a calibration. */
export const MIN_CALIBRATION_FRAMES = 100;

/** Folds tracks into a calibration (running: pass the previous one to extend it). */
export const calibrate = (tracks: readonly PitchTrack[], previous?: Calibration): Calibration => {
  let n = previous?.frames ?? 0;
  let sum = (previous?.mean ?? 0) * n;
  let sumSq = previous === undefined ? 0 : (previous.sd ** 2 + previous.mean ** 2) * n;
  for (const t of tracks) {
    for (const f of t.f0) {
      if (f === undefined) continue;
      const s = semitones(f);
      n += 1;
      sum += s;
      sumSq += s * s;
    }
  }
  const mean = n === 0 ? 0 : sum / n;
  const sd = n === 0 ? 0 : Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  return { mean, sd, frames: n };
};

/** Frame spans [start, end) of syllables: voiced runs, split or merged to the expected count. */
export const syllableSpans = (track: PitchTrack, count: number): readonly (readonly [number, number])[] | undefined => {
  const runs: [number, number][] = [];
  let start: number | undefined;
  let gap = 0;
  track.f0.forEach((f, i) => {
    if (f !== undefined) {
      start ??= i;
      gap = 0;
    } else if (start !== undefined && ++gap > 3) {
      runs.push([start, i - gap + 1]);
      start = undefined;
      gap = 0;
    }
  });
  if (start !== undefined) runs.push([start, track.f0.length - gap]);
  const spans = runs.filter(([a, b]) => b - a >= 5);
  if (spans.length === 0 || count <= 0) return undefined;
  // Too many runs: merge across the smallest gaps. Too few (connected speech): split the longest.
  while (spans.length > count) {
    let best = 0;
    for (let i = 1; i < spans.length - 1; i++) if ((spans[i + 1]?.[0] ?? 0) - (spans[i]?.[1] ?? 0) < (spans[best + 1]?.[0] ?? 0) - (spans[best]?.[1] ?? 0)) best = i;
    const [a, b] = [spans[best], spans[best + 1]];
    if (a === undefined || b === undefined) break;
    spans.splice(best, 2, [a[0], b[1]]);
  }
  while (spans.length < count) {
    let longest = 0;
    spans.forEach(([a, b], i) => {
      const [la, lb] = spans[longest] ?? [0, 0];
      if (b - a > lb - la) longest = i;
    });
    const [a, b] = spans[longest] ?? [0, 0];
    if (b - a < 10) return undefined; // too short to hold another syllable
    const mid = Math.round((a + b) / 2);
    spans.splice(longest, 1, [a, mid], [mid, b]);
  }
  return spans;
};

/** Start, middle and end pitch of a span in semitones (edges trimmed, medians over narrow windows). */
export const contourOf = (track: PitchTrack, [start, end]: readonly [number, number]): readonly [number, number, number] | undefined => {
  const voiced = track.f0.slice(start, end).flatMap((f) => (f === undefined ? [] : [semitones(f)]));
  if (voiced.length < 5) return undefined;
  const trim = Math.floor(voiced.length * 0.1);
  const core = voiced.slice(trim, voiced.length - trim);
  const median = (xs: readonly number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)] ?? 0;
  };
  // Narrow windows: wide ones flatten rises and falls.
  const w = Math.max(1, Math.floor(core.length / 8));
  const at = (center: number): number => median(core.slice(Math.max(0, center - w), Math.min(core.length, center + w + 1)));
  return [at(0), at(Math.floor(core.length / 2)), at(core.length - 1)];
};

/**
 * Chao steps per standard deviation of a speaker's voiced frames. Over speech that uses every tone,
 * the frames spread about 1.2 Chao steps per SD (the six tones' levels have that spread).
 */
export const CHAO_PER_SD = 1.2;

/** Chao letters of a pitch under a calibration: the speaker's mean is 3. */
const toChao = (st: number, c: { readonly mean: number; readonly sd: number }): number => 3 + (CHAO_PER_SD * (st - c.mean)) / Math.max(c.sd, 1);

const shapeOf = (contour: readonly [number, number, number]): Shape => {
  const rise = contour[2] - contour[0];
  return rise > 1.5 ? "rising" : rise < -1.5 ? "falling" : "level";
};

export interface HeardTone {
  /** The best template (undefined when only the shape could be judged). */
  readonly tone?: string | undefined;
  readonly shape: Shape;
  /** 0–1: how far the best template is ahead of the next. */
  readonly confidence: number;
}

/** Classifies one contour: by full template under a calibration, else by shape alone. */
export const classify = (contour: readonly [number, number, number], system: ToneSystem, calibration?: { readonly mean: number; readonly sd: number }): HeardTone => {
  const shape = shapeOf(contour);
  if (calibration === undefined) return { shape, confidence: 0 };
  const chao = contour.map((s) => toChao(s, calibration));
  const distance = (t: ToneTemplate): number => {
    const point = t.chao.reduce((sum, v, i) => sum + (v - (chao[i] ?? 0)) ** 2, 0);
    const slope = (t.chao[2] - t.chao[0] - ((chao[2] ?? 0) - (chao[0] ?? 0))) ** 2;
    return point + 2 * slope;
  };
  const ranked = Object.entries(system.tones)
    .map(([tone, t]) => ({ tone, d: distance(t) }))
    .sort((a, b) => a.d - b.d);
  const [best, next] = ranked;
  if (best === undefined) return { shape, confidence: 0 };
  const confidence = next === undefined || next.d === 0 ? 1 : Math.max(0, Math.min(1, 1 - best.d / next.d));
  return { tone: best.tone, shape, confidence };
};

export interface ExpectedSyllable {
  /** Token of the text the syllable belongs to (for per-KC credit). */
  readonly token: number;
  readonly syllable: string;
  readonly tone: string;
}

/** The syllables a text should be said with, from its pinned readings in the system's scheme. */
export const expectedSyllables = (text: TaggedText, system: ToneSystem): readonly ExpectedSyllable[] =>
  text.tokens.flatMap((t, token) =>
    (t.readings?.[system.scheme as keyof NonNullable<typeof t.readings>] ?? "")
      .split(/\s+/u)
      .filter((s) => s !== "")
      .flatMap((syllable) => {
        const tone = system.toneOf(syllable);
        return tone === undefined ? [] : [{ token, syllable, tone }];
      }),
  );

export interface SyllableScore extends ExpectedSyllable {
  readonly heard: HeardTone | undefined;
  /** The expected tone (or, uncalibrated, its shape) was heard. */
  readonly ok: boolean;
}

export interface ToneScore {
  readonly syllables: readonly SyllableScore[];
  /** Whether register could be judged: a calibration, or a long enough utterance to normalize itself. */
  readonly calibrated: boolean;
  /** No speech found where syllables were expected. */
  readonly silent: boolean;
}

/**
 * Scores a recording of `text`. Normalization: the speaker's calibration when it has enough
 * frames; otherwise the utterance itself when it has three or more syllables; otherwise none.
 */
export const scoreTones = (track: PitchTrack, text: TaggedText, system: ToneSystem, calibration?: Calibration): ToneScore => {
  const expected = expectedSyllables(text, system);
  const spans = syllableSpans(track, expected.length);
  if (spans === undefined) return { syllables: expected.map((e) => ({ ...e, heard: undefined, ok: false })), calibrated: false, silent: true };
  const contours = spans.map((span) => contourOf(track, span));
  const self = calibrate([track]);
  const norm = calibration !== undefined && calibration.frames >= MIN_CALIBRATION_FRAMES ? calibration : expected.length >= 3 && self.frames >= 20 ? self : undefined;
  const syllables = expected.map((e, i): SyllableScore => {
    const contour = contours[i];
    if (contour === undefined) return { ...e, heard: undefined, ok: false };
    const heard = classify(contour, system, norm);
    const ok = norm === undefined ? heard.shape === system.tones[e.tone]?.shape : heard.tone === e.tone;
    return { ...e, heard, ok };
  });
  return { syllables, calibrated: norm !== undefined, silent: false };
};
