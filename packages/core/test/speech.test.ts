/**
 * Phase 9 tier 3 on synthetic signals with known pitch: harmonic tones whose F0 follows a chosen
 * contour, so the expected answer is exact. These test the arithmetic (pitch, segmentation,
 * normalization, classification); how well it hears people is what the tone evaluation measures.
 */
import { readFileSync } from "node:fs";
import type { TaggedText } from "@nabu/schema";
import { describe, expect, it } from "vitest";
import { creditOf } from "../src/learner/index.ts";
import { allSentences, createGrader, gradeExercise, seededRng } from "../src/lesson/index.ts";
import { makeSpeakScored } from "../src/lesson/templates.ts";
import { calibrate, CANTONESE, classify, decodeWav, evaluateTones, expectedSyllables, gradeSpeech, pitchTrack, scoreTones, semitones, syllableSpans, type PitchTrack } from "../src/speech/index.ts";
import { loadCourse } from "./learner-fixtures.ts";

const RATE = 16_000;

/** A voiced sound: three harmonics on an F0 that moves from `from` to `to` Hz (linearly in semitones). */
const voiced = (ms: number, from: number, to: number = from): number[] => {
  const n = Math.round((ms / 1000) * RATE);
  const out: number[] = [];
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = from * 2 ** ((Math.log2(to / from) * i) / n);
    phase += (2 * Math.PI * f) / RATE;
    // A soft attack and release, like a syllable.
    const env = Math.min(1, i / (0.02 * RATE), (n - i) / (0.02 * RATE));
    out.push(env * (0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase)));
  }
  return out;
};
const silence = (ms: number): number[] => new Array<number>(Math.round((ms / 1000) * RATE)).fill(0);
const pcm = (...parts: number[][]): Float32Array => Float32Array.from(parts.flat());

/** Hz at Chao level `c` for a speaker whose mean is 150 Hz and spread 3 semitones. */
const SPEAKER = { mean: semitones(150), sd: 3 };
const hz = (c: number): number => 100 * 2 ** ((SPEAKER.mean + (c - 3) * SPEAKER.sd) / 12);
const say = (tone: string, ms = 260): number[] => {
  const t = CANTONESE.tones[tone];
  if (t === undefined) throw new Error(tone);
  return voiced(ms, hz(t.chao[0]), hz(t.chao[2]));
};

describe("pitch tracking (YIN)", () => {
  it("finds a steady F0 within 1%", () => {
    for (const f of [90, 150, 220, 330]) {
      const track = pitchTrack(pcm(voiced(400, f)), RATE);
      const found = track.f0.filter((x): x is number => x !== undefined);
      expect(found.length).toBeGreaterThan(20);
      const median = [...found].sort((a, b) => a - b)[Math.floor(found.length / 2)] ?? 0;
      expect(Math.abs(median - f) / f).toBeLessThan(0.01);
    }
  });

  it("follows a glide and leaves silence unvoiced", () => {
    const track = pitchTrack(pcm(silence(200), voiced(500, 120, 240), silence(200)), RATE);
    const voicedFrames = track.f0.flatMap((f, i) => (f === undefined ? [] : [[i, f] as const]));
    expect(voicedFrames[0]?.[0]).toBeGreaterThanOrEqual(17);
    expect(track.f0.slice(0, 15).every((f) => f === undefined)).toBe(true);
    const first = voicedFrames[3]?.[1] ?? 0;
    const last = voicedFrames.at(-4)?.[1] ?? 0;
    expect(first).toBeLessThan(140);
    expect(last).toBeGreaterThan(210);
  });
});

describe("syllables", () => {
  it("splits on pauses, and splits connected speech to the expected count", () => {
    const track = pitchTrack(pcm(voiced(250, 150), silence(120), voiced(250, 180), silence(120), voiced(250, 130)), RATE);
    expect(syllableSpans(track, 3)).toHaveLength(3);
    const joined = pitchTrack(pcm(voiced(500, 150, 200)), RATE);
    expect(syllableSpans(joined, 2)).toHaveLength(2);
    expect(syllableSpans(pitchTrack(pcm(silence(500)), RATE), 1)).toBeUndefined();
  });

  it("shares speech out evenly when its runs are too short to split, and gives up only when there is too little", () => {
    // Choppy voicing (a noisy phone): short runs, more syllables expected than splitting can reach.
    const choppy = pitchTrack(pcm(...Array.from({ length: 6 }, () => [voiced(90, 150), silence(60)]).flat()), RATE);
    const spans = syllableSpans(choppy, 9);
    expect(spans).toHaveLength(9);
    expect(spans?.every(([a, b]) => b > a)).toBe(true);
    // One short word against a long sentence: not enough speech to score.
    expect(syllableSpans(pitchTrack(pcm(voiced(120, 150)), RATE), 9)).toBeUndefined();
  });

  it("is not silenced by a click: loudness is measured on pitched frames", () => {
    // Tapping Stop: a loud, unpitched burst far above the speech.
    const click = Array.from({ length: Math.round(0.02 * RATE) }, (_, i) => (i % 2 === 0 ? 0.95 : -0.95));
    const quiet = voiced(500, 150).map((x) => x * 0.03);
    const track = pitchTrack(pcm(quiet, silence(100), click), RATE);
    expect(track.f0.filter((f) => f !== undefined).length).toBeGreaterThan(30);
  });
});

/** What a speaker's calibration looks like after saying all six tones. */
const sixTones = calibrate([pitchTrack(pcm(...["1", "2", "3", "4", "5", "6"].flatMap((t) => [say(t, 300), silence(100)])), RATE)]);

describe("Cantonese tones", () => {
  it("expects the pinned surface tones, syllable by syllable", () => {
    const text = {
      lang: "yue-Hant-HK",
      orthography: "yue-Hant-HK/standard",
      tokens: [
        { surface: "我", kind: "word", readings: { jyutping: "ngo5" } },
        { surface: "學生", kind: "word", readings: { jyutping: "hok6 saang1" } },
        { surface: "。", kind: "punct" },
      ],
    } as unknown as TaggedText;
    expect(expectedSyllables(text, CANTONESE).map((s) => [s.token, s.tone])).toEqual([
      [0, "5"],
      [1, "6"],
      [1, "1"],
    ]);
  });

  it("classifies each tone of a calibrated speaker", () => {
    for (const tone of Object.keys(CANTONESE.tones)) {
      const track = pitchTrack(pcm(say(tone)), RATE);
      const span = syllableSpans(track, 1)?.[0];
      expect(span).toBeDefined();
      const voicedSt = track.f0.flatMap((f) => (f === undefined ? [] : [semitones(f)]));
      const contour = [voicedSt[5] ?? 0, voicedSt[Math.floor(voicedSt.length / 2)] ?? 0, voicedSt.at(-6) ?? 0] as const;
      expect(classify(contour, CANTONESE, sixTones).tone, `tone ${tone}`).toBe(tone);
    }
  });

  it("judges only the shape without a calibration", () => {
    const rising = classify([semitones(150), semitones(165), semitones(200)], CANTONESE);
    expect(rising).toEqual({ shape: "rising", confidence: 0 });
    expect(classify([semitones(200), semitones(170), semitones(140)], CANTONESE).shape).toBe("falling");
  });

  const SENTENCE = {
    lang: "yue-Hant-HK",
    orthography: "yue-Hant-HK/standard",
    tokens: [
      { surface: "我", kind: "word", readings: { jyutping: "ngo5" } },
      { surface: "係", kind: "word", readings: { jyutping: "hai6" } },
      { surface: "學生", kind: "word", readings: { jyutping: "hok6 saang1" } },
    ],
  } as unknown as TaggedText;
  const calibration = sixTones;

  it("scores a sentence said right, and catches a wrong tone", () => {
    const right = pitchTrack(pcm(say("5"), silence(100), say("6"), silence(100), say("6"), silence(100), say("1")), RATE);
    const score = scoreTones(right, SENTENCE, CANTONESE, calibration);
    expect(score.calibrated).toBe(true);
    expect(score.syllables.map((s) => [s.heard?.tone, s.ok])).toEqual([
      ["5", true],
      ["6", true],
      ["6", true],
      ["1", true],
    ]);
    // 係 said with tone 2 (high rising) instead of 6.
    const wrong = pitchTrack(pcm(say("5"), silence(100), say("2"), silence(100), say("6"), silence(100), say("1")), RATE);
    const off = scoreTones(wrong, SENTENCE, CANTONESE, calibration);
    expect(off.syllables[1]).toMatchObject({ syllable: "hai6", ok: false, heard: { tone: "2" } });
    expect(off.syllables.filter((s) => s.ok)).toHaveLength(3);
  });

  it("says when there was nothing to hear", () => {
    const quiet: PitchTrack = pitchTrack(pcm(silence(800)), RATE);
    expect(scoreTones(quiet, SENTENCE, CANTONESE, calibration)).toMatchObject({ silent: true, calibrated: false });
  });
});

describe("grading speech", () => {
  const syllable = (token: number, ok: boolean) => ({ token, syllable: "x1", tone: "1", heard: { tone: ok ? "1" : "4", shape: "level" as const, confidence: 0.8 }, ok });
  const tones = (calibrated: boolean, ...oks: boolean[]) => ({ calibrated, silent: false, syllables: oks.map((ok, i) => syllable(i, ok)) });

  it("is feedback, not a verdict: only words, silence or a calibrated majority of wrong tones fail", () => {
    expect(gradeSpeech({ silent: true })).toMatchObject({ verdict: "WRONG", notes: ["speech-silent"] });
    expect(gradeSpeech({ silent: false })).toEqual({ verdict: "CORRECT", notes: [], offTokens: [] });
    expect(gradeSpeech({ silent: false, words: { verdict: "WRONG" } })).toMatchObject({ verdict: "WRONG", notes: ["speech-words"] });
    expect(gradeSpeech({ silent: false, tone: tones(true, true, false, true) })).toEqual({ verdict: "PARTIAL", notes: ["speech-tones"], offTokens: [1] });
    expect(gradeSpeech({ silent: false, tone: tones(true, false, false, true) }).verdict).toBe("WRONG");
    expect(gradeSpeech({ silent: false, tone: tones(false, false, false, false) })).toMatchObject({ verdict: "PARTIAL", notes: ["speech-tone-shapes"] });
    expect(gradeSpeech({ silent: false, phones: { errorRate: 0.3, offTokens: [2] } })).toEqual({ verdict: "CORRECT", notes: ["speech-phones"], offTokens: [2] });
    expect(gradeSpeech({ silent: false, phones: { errorRate: 0.9, offTokens: [0, 2] } }).verdict).toBe("PARTIAL");
  });

  it("debits the words said wrong and credits the rest", () => {
    const yue = loadCourse("yue");
    const sentence = allSentences(yue).find((x) => x.id === "s.12"); // 我係學生。
    const ex = sentence === undefined ? undefined : makeSpeakScored({ course: yue, rng: seededRng(1), introduced: [] }, sentence);
    if (ex === undefined) throw new Error("no speak exercise");
    const words = ex.prompt.tokens.flatMap((t, i) => (t.sense === undefined ? [] : [i]));
    const [first, second] = words;
    if (first === undefined || second === undefined) throw new Error("need two words");
    const outcome = gradeExercise(ex, { tag: "speech", result: { silent: false, tone: tones(true, ...words.map((w) => w !== first)) } }, createGrader(yue));
    expect(outcome.verdict).toBe("PARTIAL");
    const credit = creditOf(ex, outcome, yue.profiles);
    const kcOf = (i: number) => `sense:${ex.prompt.tokens[i]?.sense ?? ""}`;
    expect(credit.find((c) => c.kc === kcOf(first))?.status).toBe("wrong");
    expect(credit.find((c) => c.kc === kcOf(second))?.status).toBe("right");
  });
});

describe("tone evaluation harness", () => {
  /**
   * On the committed synthetic set (eSpeak NG, labelled synthetic): a regression floor for the
   * classifier and a check that the harness reads WAV sets. It says nothing about native speech;
   * the Phase 9 acceptance runs `pnpm --filter @nabu/core tone-eval` on recorded speakers.
   */
  it("reports per-tone accuracy and wrong-tone detection on the synthetic set", () => {
    const dir = new URL("../../../evals/tones/synthetic-espeak/", import.meta.url);
    const index = JSON.parse(readFileSync(new URL("index.json", dir), "utf8")) as { synthetic: boolean; speakers: { clips: { file: string; expected: string; said: string; kind: "native" | "wrong" }[] }[] };
    expect(index.synthetic).toBe(true);
    const speakers = index.speakers.map((s) =>
      s.clips.map((c) => {
        const wav = decodeWav(readFileSync(new URL(c.file, dir)));
        if (wav === undefined) throw new Error(c.file);
        return { ...wav, expected: c.expected, said: c.said, kind: c.kind };
      }),
    );
    const report = evaluateTones(speakers, CANTONESE);
    expect(Object.keys(report.perTone)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(report.perTone["1"]?.native.n).toBe(5);
    expect(report.nativeAccuracy).toBeGreaterThanOrEqual(0.7);
    expect(report.wrongDetection).toBeGreaterThanOrEqual(0.9);
  });

  it("decodes only mono 16-bit WAV", () => {
    expect(decodeWav(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});
