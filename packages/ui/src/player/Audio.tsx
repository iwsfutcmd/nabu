/**
 * Audio in the player (gameplan §10, §11.5): play a clip at normal or slow speed and follow
 * along. While a clip plays, the token being said is highlighted (karaoke): each animation
 * frame reads the audio element's own clock and looks the time up in the clip's token
 * timings, so the highlight is never more than a frame behind the sound.
 *
 * Synthesized clips are labelled as synthetic (responsible-use marking of generated speech).
 */
import type { AudioRef } from "@nabu/core/lesson";
import type { BundleClip } from "@nabu/schema";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { Button } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { PlayIcon, SlowIcon } from "../icons.tsx";
import styles from "./Player.module.css";

export type Speed = "normal" | "slow";

/** The token a clip is saying at `ms`, if any. */
export const tokenAt = (clip: BundleClip, ms: number): number | undefined =>
  clip.timings?.find((t) => t.startMs <= ms && ms < t.endMs)?.token;

export interface ClipPlayer {
  readonly play: (speed?: Speed) => void;
  readonly stop: () => void;
  readonly playing: Speed | undefined;
  /** The token being said right now (karaoke). */
  readonly token: number | undefined;
}

/** One audio element per clip; `url` maps a bundle path to a URL. */
export const useClipPlayer = (audio: AudioRef | undefined, url: (path: string) => string): ClipPlayer => {
  const element = useRef<HTMLAudioElement | null>(null);
  const frame = useRef(0);
  const [playing, setPlaying] = useState<Speed | undefined>(undefined);
  const [token, setToken] = useState<number | undefined>(undefined);

  const stop = useCallback((): void => {
    cancelAnimationFrame(frame.current);
    element.current?.pause();
    setPlaying(undefined);
    setToken(undefined);
  }, []);

  useEffect(() => stop, [stop, audio]);

  const play = useCallback(
    (speed: Speed = "normal"): void => {
      const clip = speed === "slow" ? (audio?.slow ?? audio?.normal) : audio?.normal;
      if (clip === undefined) return;
      stop();
      const el = new Audio(url(clip.path));
      element.current = el;
      el.dataset["clip"] = clip.path;
      const tick = (): void => {
        setToken(tokenAt(clip, el.currentTime * 1000));
        if (!el.paused && !el.ended) frame.current = requestAnimationFrame(tick);
      };
      el.addEventListener("playing", () => {
        frame.current = requestAnimationFrame(tick);
      });
      el.addEventListener("ended", () => {
        cancelAnimationFrame(frame.current);
        setPlaying(undefined);
        setToken(undefined);
      });
      setPlaying(speed);
      void el.play().catch(() => setPlaying(undefined));
    },
    [audio, stop, url],
  );

  return { play, stop, playing, token };
};

export interface AudioButtonsProps {
  readonly player: ClipPlayer;
  readonly audio: AudioRef;
  /** The big button of a listening exercise, or the small one beside a prompt. */
  readonly size?: "large" | "small";
  /** Say "Synthetic voice" here (default); a story says it once instead of on every line. */
  readonly label?: boolean;
}

/** Play and play-slowly buttons, with the synthetic-voice label when the clip is synthesized. */
export const AudioButtons = ({ player, audio, size = "small", label = true }: AudioButtonsProps): JSX.Element => {
  const t = useTranslator();
  return (
    <div className={styles.audio} data-audio-buttons="" data-size={size}>
      <Button
        className={size === "large" ? styles.playLarge : styles.play}
        aria-label={t.format("player.audio.play")}
        onPress={() => player.play("normal")}
        data-action="play"
        data-playing={player.playing === "normal" || undefined}
      >
        <PlayIcon size={size === "large" ? 36 : 20} />
      </Button>
      {audio.slow !== undefined && (
        <Button className={styles.play} aria-label={t.format("player.audio.slow")} onPress={() => player.play("slow")} data-action="play-slow" data-playing={player.playing === "slow" || undefined}>
          <SlowIcon size={20} />
        </Button>
      )}
      {label && audio.normal.synthetic && <span className={styles.synthetic}>{t.format("player.audio.synthetic")}</span>}
    </div>
  );
};
