export { pitchTrack, semitones, type PitchOptions, type PitchTrack } from "./pitch.ts";
export {
  calibrate,
  CANTONESE,
  CHAO_PER_SD,
  classify,
  contourOf,
  expectedSyllables,
  MIN_CALIBRATION_FRAMES,
  scoreTones,
  syllableSpans,
  type Calibration,
  type ExpectedSyllable,
  type HeardTone,
  type Shape,
  type SyllableScore,
  type ToneScore,
  type ToneSystem,
  type ToneTemplate,
} from "./tone.ts";
export { DEVICE_TONE_SCORING, gradeSpeech, PHONES_NOTE, PHONES_PARTIAL, TONE_SYSTEMS, toneSystemOf, type PhonesHeard, type SpeechOutcome, type SpeechResult, type WordsHeard } from "./score.ts";
export { decodeWav, evaluateTones, type EvalClip, type ToneCounts, type ToneReport } from "./evaluate.ts";
