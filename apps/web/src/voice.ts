/**
 * Speech in the web app (gameplan §10.4): what can score a course's speaking, and the learner's
 * privacy choices. Words and phones are scored by the server's speech service when it has one and
 * the learner allows it; tones would be scored on this device, but that is off (ADR 0093).
 * Recordings are never kept anywhere. The only thing ever remembered is the learner's pitch range
 * (three numbers), on this device, until they forget it, and only while tones are scored here.
 */
import type { CourseView, ListenSpeak, SpeakScored } from "@nabu/core/lesson";
import type { Calibration } from "@nabu/core/speech";
import type { ServerHeard, SpeechServices } from "@nabu/ui/player";
import { useEffect, useState } from "react";
import { request, type Account } from "./sync.ts";

const CALIBRATION = "nabu.voice-calibration";
const SERVER = "nabu.voice-server";

/** The learner's pitch range on this device, if any (per-device convenience; storage may be off). */
export const loadCalibration = (): Calibration | undefined => {
  try {
    const raw = localStorage.getItem(CALIBRATION);
    const value = raw === null ? undefined : (JSON.parse(raw) as Partial<Calibration>);
    return typeof value?.mean === "number" && typeof value.sd === "number" && typeof value.frames === "number" ? { mean: value.mean, sd: value.sd, frames: value.frames } : undefined;
  } catch {
    return undefined;
  }
};

const saveCalibration = (c: Calibration): void => {
  try {
    localStorage.setItem(CALIBRATION, JSON.stringify(c));
  } catch {
    // Without storage the range lasts the page.
  }
};

export const forgetCalibration = (): void => {
  try {
    localStorage.removeItem(CALIBRATION);
  } catch {
    // nothing stored
  }
};

/** Whether the learner lets recordings go to the server's speech service (on unless turned off). */
export const serverAllowed = (): boolean => {
  try {
    return localStorage.getItem(SERVER) !== "off";
  } catch {
    return true;
  }
};

export const setServerAllowed = (allowed: boolean): void => {
  try {
    localStorage.setItem(SERVER, allowed ? "on" : "off");
  } catch {
    // the choice lasts the page
  }
};

/** The tiers the server can score for this course orthography (none without an account or a speech service). */
export const useSpeechTiers = (account: Account | undefined, course: string, orthography: string): readonly number[] => {
  const [tiers, setTiers] = useState<readonly number[]>([]);
  useEffect(() => {
    if (account === undefined || course === "") {
      setTiers([]);
      return;
    }
    let live = true;
    request<{ tiers: number[] }>(account.server, `/v1/speech/status?course=${encodeURIComponent(course)}&orthography=${encodeURIComponent(orthography)}`, { token: account.token }).then(
      (r) => live && setTiers(r.tiers),
      () => live && setTiers([]),
    );
    return () => {
      live = false;
    };
  }, [account, course, orthography]);
  return tiers;
};

const base64 = (pcm: Int16Array): string => {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** What the player can score speech with, for this course. */
export const speechServices = (course: CourseView, account: Account | undefined, tiers: readonly number[]): SpeechServices => ({
  calibration: loadCalibration(),
  onCalibration: saveCalibration,
  ...(account === undefined || tiers.length === 0 || !serverAllowed()
    ? {}
    : {
        score: (ex: SpeakScored | ListenSpeak, pcm: Int16Array): Promise<ServerHeard | undefined> =>
          request<ServerHeard>(account.server, "/v1/speech/score", {
            token: account.token,
            body: { course: course.id, orthography: course.orthography, item: ex.item, audio: base64(pcm), sampleRate: 16000 },
          }),
      }),
});
