/**
 * Speech in the player (gameplan §10.4): recording, decoding and what can score it. Tones are
 * scored on the device (tier 3); the app may add a server scorer for words and phones (tiers 1–2).
 * A recording lives in memory for one scoring and is dropped: nothing here keeps audio.
 */
import type { ListenSpeak, SpeakScored } from "@nabu/core/lesson";
import type { Calibration, PhonesHeard, WordsHeard } from "@nabu/core/speech";
import type { TaggedText } from "@nabu/schema";
import { createContext, useContext, useEffect, useRef, useState, type JSX, type ReactNode } from "react";

export interface ServerHeard {
  readonly words?: (WordsHeard & { readonly heard?: TaggedText | undefined }) | undefined;
  readonly phones?: PhonesHeard | undefined;
}

export interface SpeechServices {
  /** Words and phones from the server, when the app has a speech service and the learner allows it. */
  readonly score?: ((ex: SpeakScored | ListenSpeak, pcm16k: Int16Array) => Promise<ServerHeard | undefined>) | undefined;
  /** The learner's pitch range, learned on this device from their recordings (numbers only). */
  readonly calibration?: Calibration | undefined;
  readonly onCalibration?: ((calibration: Calibration) => void) | undefined;
}

const SpeechContext = createContext<SpeechServices>({});

export const SpeechProvider = ({ value, children }: { value: SpeechServices | undefined; children: ReactNode }): JSX.Element => (
  <SpeechContext.Provider value={value ?? {}}>{children}</SpeechContext.Provider>
);

export const useSpeech = (): SpeechServices => useContext(SpeechContext);

export interface Decoded {
  readonly samples: Float32Array;
  readonly sampleRate: number;
}

/** A recording, decoded to mono samples. */
const decode = async (blob: Blob): Promise<Decoded> => {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    return { samples: buffer.getChannelData(0).slice(), sampleRate: buffer.sampleRate };
  } finally {
    void context.close();
  }
};

/** 16 kHz 16-bit PCM, what the speech service takes. */
export const toPcm16k = async ({ samples, sampleRate }: Decoded): Promise<Int16Array> => {
  const length = Math.max(1, Math.round((samples.length * 16000) / sampleRate));
  const offline = new OfflineAudioContext(1, length, 16000);
  const buffer = offline.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(Float32Array.from(samples), 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const rendered = (await offline.startRendering()).getChannelData(0);
  const pcm = new Int16Array(rendered.length);
  for (let i = 0; i < rendered.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round((rendered[i] ?? 0) * 32767)));
  return pcm;
};

export type RecorderState = "idle" | "recording" | "unavailable";

export interface Recorder {
  /** Unavailable: the microphone was refused or failed, or what it recorded could not be used. */
  readonly state: RecorderState;
  /** Whether the browser can record at all (a microphone API and MediaRecorder). */
  readonly supported: boolean;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
}

/** Whether the browser can record at all: a microphone API and MediaRecorder. */
const canRecord = (): boolean => typeof navigator !== "undefined" && navigator.mediaDevices !== undefined && typeof MediaRecorder !== "undefined";

/**
 * The one recorder of speaking cards: one recording at a time, and what it recorded handed to
 * `onDone` once it stops, with `unusable` for a recording that cannot be used (the recorder then
 * says it is unavailable). `audio` is what the microphone is asked for. The microphone is released
 * as each recording stops; a recording still running stops when the card goes away, and only then.
 */
export const useRecording = (audio: MediaTrackConstraints | true, onDone: (recording: Blob, unusable: () => void) => void): Recorder => {
  const [state, setState] = useState<RecorderState>("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );
  const start = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorder.current = null;
        setState("idle");
        done.current(new Blob(chunks, { type: rec.mimeType }), () => setState("unavailable"));
      };
      recorder.current = rec;
      rec.start();
      setState("recording");
    } catch {
      setState("unavailable");
    }
  };
  return { state, supported: canRecord(), start, stop: () => recorder.current?.stop() };
};

/**
 * A recording to score: decoded to mono samples and handed to `onDone`, with echo cancellation and
 * noise suppression asked for. Where the browser cannot record, the recorder is unavailable.
 */
export const useRecorder = (onDone: (audio: Decoded) => void): Recorder => {
  const done = useRef(onDone);
  done.current = onDone;
  const recording = useRecording({ echoCancellation: true, noiseSuppression: true }, (blob, unusable) => {
    void decode(blob).then((audio) => done.current(audio), unusable);
  });
  return recording.supported ? recording : { ...recording, state: "unavailable" };
};
