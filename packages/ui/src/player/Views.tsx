/**
 * One view per template family (gameplan §8.2). Views render the exercise and
 * the current draft and dispatch PlayerEvents; grading and moving on belong to
 * the state machine. Target-language regions take the target script's
 * direction; everything a learner taps is language data rendered through <T>.
 */
import type {
  AudioRef,
  ChooseTranslation,
  CharRead,
  CompleteTranslation,
  GapFill,
  ListenSelect,
  ListenSpeak,
  ListenTap,
  ListenType,
  MatchPairs,
  MinimalPair,
  Outcome,
  ReadingDisambiguation,
  SelectImage,
  SelfRating,
  Speak,
  SpeakScored,
  StoryArrange,
  StoryChoose,
  StoryComplete,
  ToneIdentify,
  TranslateTap,
  TranslateType,
} from "@nabu/core/lesson";
import { calibrate, CANTONESE, pitchTrack, scoreTones, toneSystemOf, type SpeechResult, type ToneScore } from "@nabu/core/speech";
import { textOfSurface } from "@nabu/core/text";
import { directionOf } from "@nabu/i18n";
import type { TaggedText } from "@nabu/schema";
import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import { useOrthography, useTranslator } from "../context.tsx";
import { T } from "../T.tsx";
import { AnswerInput } from "./AnswerInput.tsx";
import { AudioButtons, useClipPlayer } from "./Audio.tsx";
import styles from "./Player.module.css";
import { toPcm16k, useRecorder, useSpeech, type Decoded } from "./speech.tsx";
import { effectiveWritingMode, type ViewProps } from "./shared.ts";

export interface ViewExtras {
  readonly outcome: Outcome | undefined;
  /** The course name, for "Write this in {$language}". */
  readonly language: string;
}

type Props<E extends ViewProps["ex"]> = ViewProps<E> & ViewExtras;

// ------------------------------------------------------------------------------------ choices

interface OptionsProps {
  readonly options: readonly ReactNode[];
  readonly selected: number | null;
  readonly answer: number;
  readonly outcome: Outcome | undefined;
  readonly locked: boolean;
  readonly grid?: boolean;
  readonly onSelect: (index: number) => void;
}

/** Radio choices (arrow keys follow the chrome direction), with number-key shortcuts. */
const Options = ({ options, selected, answer, outcome, locked, grid = false, onSelect }: OptionsProps): JSX.Element => {
  const t = useTranslator();
  const number = new Intl.NumberFormat(t.formattingLocale);
  return (
    <RadioGroup
      className={grid ? styles.optionGrid : styles.options}
      aria-label={t.format("player.options.label")}
      value={selected === null ? null : String(selected)}
      onChange={(v) => onSelect(Number(v))}
      isDisabled={locked}
      orientation={grid ? "horizontal" : "vertical"}
      data-options=""
    >
      {options.map((content, i) => (
        <Radio
          key={i}
          value={String(i)}
          autoFocus={i === 0}
          className={styles.option}
          data-option={i}
          data-correct={(outcome !== undefined && i === answer) || undefined}
          data-wrong={(outcome !== undefined && i === selected && i !== answer) || undefined}
        >
          <span className={styles.optionNumber} aria-hidden="true">
            {number.format(i + 1)}
          </span>
          {content}
        </Radio>
      ))}
    </RadioGroup>
  );
};

/** Registers this view's number-key and Backspace shortcuts with the player (§11.3). */
const useShortcuts = (props: ViewProps, digit: (i: number) => void, backspace?: () => void): void => {
  const { shortcuts, locked } = props;
  useEffect(() => {
    shortcuts.current = locked ? null : backspace === undefined ? { digit } : { digit, backspace };
    return () => {
      shortcuts.current = null;
    };
  });
};

const choose = (props: ViewProps, index: number): void => {
  if (!props.locked) props.dispatch({ tag: "input", draft: { tag: "choice", index } });
};

/** A number key chooses an option and moves focus to it, so focus and selection agree. */
const chooseByKey = (props: ViewProps, index: number, count: number): void => {
  if (index >= count) return;
  choose(props, index);
  document.querySelector<HTMLElement>(`[data-lesson-player] [data-option="${index}"] input`)?.focus();
};

const selectedOf = (props: ViewProps): number | null => (props.draft.tag === "choice" ? props.draft.index : null);

export const SelectImageView = (props: Props<SelectImage>): JSX.Element => {
  const { ex, imageUrl } = props;
  const t = useTranslator();
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <div className={styles.prompt} role="group" aria-label={t.format("player.prompt.meaning")}>
        <T as="p" text={ex.prompt} />
      </div>
      <Options
        grid
        options={ex.options.map((o, i) => (
          <span key={i} className={styles.picture}>
            <img src={imageUrl(o.image)} alt="" className={styles.pictureImage} />
            <T text={o.text} ruby={props.ruby} marks={props.marks} />
          </span>
        ))}
        selected={selectedOf(props)}
        answer={ex.answer}
        outcome={props.outcome}
        locked={props.locked}
        onSelect={(i) => choose(props, i)}
      />
    </div>
  );
};

/** A target sentence in its own direction (and vertical where allowed); with its clip, a play button and karaoke. */
const TargetPrompt = ({ text, props, focus, ruby }: { text: TaggedText; props: ViewProps; focus?: ReadingDisambiguation["focus"]; ruby?: false }): JSX.Element => {
  const t = useTranslator();
  const profile = useOrthography(text.orthography);
  const mode = effectiveWritingMode(profile, props.writingMode, "prompt");
  const audio = props.course.audio[props.ex.item];
  const player = useClipPlayer(audio, props.imageUrl);
  return (
    <div className={styles.prompt} role="group" aria-label={t.format("exercise.prompt.label")} data-writing-mode={mode} data-ink-container="prompt">
      {audio !== undefined && <AudioButtons player={player} audio={audio} />}
      <T
        as="p"
        text={text}
        ruby={ruby ?? props.ruby}
        marks={props.marks}
        {...(focus === undefined ? {} : { focus })}
        {...(player.token === undefined ? {} : { highlight: [player.token] })}
      />
    </div>
  );
};

export const ChooseTranslationView = (props: Props<ChooseTranslation>): JSX.Element => {
  const { ex } = props;
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <TargetPrompt text={ex.prompt} props={props} />
      <Options
        options={ex.options.map((o, i) => <T key={i} text={o} />)}
        selected={selectedOf(props)}
        answer={ex.answer}
        outcome={props.outcome}
        locked={props.locked}
        onSelect={(i) => choose(props, i)}
      />
    </div>
  );
};

export const CharReadView = (props: Props<CharRead | ReadingDisambiguation>): JSX.Element => {
  const { ex } = props;
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <div className={styles.bigPrompt}>
        {ex.template === "char-read" ? (
          <TargetPrompt text={ex.prompt} props={props} ruby={false} />
        ) : (
          <TargetPrompt text={ex.context} props={props} ruby={false} focus={ex.focus} />
        )}
      </div>
      <Options
        grid
        options={ex.options.map((o, i) => <T key={i} text={o} />)}
        selected={selectedOf(props)}
        answer={ex.answer}
        outcome={props.outcome}
        locked={props.locked}
        onSelect={(i) => choose(props, i)}
      />
    </div>
  );
};

/** before ▢ after, in the target direction; the gap shows what is chosen or typed. */
const GapSentence = ({ before, after, fill, props }: { before: TaggedText; after: TaggedText; fill: TaggedText | undefined; props: ViewProps }): JSX.Element => {
  const t = useTranslator();
  return (
    <p className={styles.gapSentence} dir={directionOf(before.lang)} data-gap-sentence="" data-ink-container="prompt">
      <T text={before} ruby={props.ruby} marks={props.marks} />
      <span className={styles.gap} role="img" aria-label={t.format("player.blank.label")} data-gap="">
        {fill === undefined ? null : <T text={fill} ruby={props.ruby} marks={props.marks} />}
      </span>
      <T text={after} ruby={props.ruby} marks={props.marks} />
    </p>
  );
};

export const GapFillView = (props: Props<GapFill>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  const selected = selectedOf(props);
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <div className={styles.hint} role="group" aria-label={t.format("player.prompt.hint")}>
        <T as="p" text={ex.hint} />
      </div>
      <GapSentence before={ex.before} after={ex.after} fill={selected === null ? undefined : ex.options[selected]} props={props} />
      <Options
        grid
        options={ex.options.map((o, i) => <T key={i} text={o} ruby={props.ruby} marks={props.marks} />)}
        selected={selected}
        answer={ex.answer}
        outcome={props.outcome}
        locked={props.locked}
        onSelect={(i) => choose(props, i)}
      />
    </div>
  );
};

// ------------------------------------------------------------------------------------ word bank

/**
 * Word bank (§11.6): tap a tile to place it, tap a placed tile to take it back;
 * number keys place tiles in reading order and Backspace takes the last one
 * back; tiles can also be dragged into the answer row. The answer row and bank
 * run in the answer language's direction, and become columns in vertical text.
 */
/** The answer row and the bank of tiles (translate-tap and listen-tap). */
const WordBank = ({ props, ex }: { props: Props<TranslateTap | ListenTap | StoryArrange>; ex: TranslateTap | ListenTap | StoryArrange }): JSX.Element => {
  const { locked, dispatch } = props;
  const t = useTranslator();
  const order = props.draft.tag === "tiles" ? props.draft.order : [];
  const placed = new Set(order);
  const answerProfile = useOrthography(ex.canonical.orthography);
  const intoTarget = ex.template !== "translate-tap.l2-l1";
  const mode = intoTarget ? effectiveWritingMode(answerProfile, props.writingMode, "wordbank") : "horizontal-tb";
  const set = (next: readonly number[]): void => {
    if (!locked) dispatch({ tag: "input", draft: { tag: "tiles", order: next } });
  };
  const add = (i: number): void => {
    if (!placed.has(i)) set([...order, i]);
  };
  const remaining = ex.tiles.map((_, i) => i).filter((i) => !placed.has(i));
  useShortcuts(
    props,
    (k) => {
      const tile = remaining[k];
      if (tile !== undefined) add(tile);
    },
    () => set(order.slice(0, -1)),
  );
  const tileRuby = intoTarget ? props.ruby : false;
  return (
    <div className={styles.target} dir={directionOf(ex.canonical.lang)} data-target-region="" data-writing-mode={mode}>
      <div
        className={styles.answerRow}
        role="group"
        aria-label={t.format("player.wordbank.answer-label")}
        data-answer-row=""
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const i = Number(e.dataTransfer.getData("text/plain"));
          if (Number.isInteger(i)) add(i);
        }}
      >
        {order.map((tileIndex, position) => (
          <button
            key={`${tileIndex}`}
            type="button"
            className={styles.tile}
            disabled={locked}
            data-ink-container="tile"
            data-placed-tile={tileIndex}
            onClick={() => set(order.filter((_, p) => p !== position))}
          >
            <T text={ex.tiles[tileIndex] as TaggedText} ruby={tileRuby} marks={props.marks} />
          </button>
        ))}
      </div>
      <div className={styles.bank} role="group" aria-label={t.format("exercise.wordbank.label")} data-word-bank="">
        {ex.tiles.map((tile, i) =>
          placed.has(i) ? (
            <span key={i} className={`${styles.tile} ${styles.tileSlot}`} aria-hidden="true">
              <T text={tile} ruby={tileRuby} marks={props.marks} />
            </span>
          ) : (
            <button
              key={i}
              type="button"
              className={styles.tile}
              disabled={locked}
              draggable={!locked}
              autoFocus={i === remaining[0] && order.length === 0}
              data-ink-container="tile"
              data-tile={i}
              onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
              onClick={() => add(i)}
            >
              <T text={tile} ruby={tileRuby} marks={props.marks} />
            </button>
          ),
        )}
      </div>
    </div>
  );
};

export const TilesView = (props: Props<TranslateTap>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  return (
    <div className={styles.body}>
      {ex.template === "translate-tap.l2-l1" ? (
        <TargetPrompt text={ex.prompt} props={props} />
      ) : (
        <div className={styles.prompt} role="group" aria-label={t.format("exercise.prompt.label")} data-ink-container="prompt">
          <T as="p" text={ex.prompt} />
        </div>
      )}
      <WordBank props={props} ex={ex} />
    </div>
  );
};

// ------------------------------------------------------------------------------------ typing

const TypedAnswer = ({ props, label, answer }: { props: ViewProps & ViewExtras; label: string; answer: TaggedText }): JSX.Element => {
  const { course, dispatch, locked, ex } = props;
  const profile = course.profiles.get(ex.orthography)?.source;
  const text = props.draft.tag === "text" ? props.draft.text : "";
  return (
    <AnswerInput
      value={text}
      base={answer}
      dir={directionOf(answer.lang)}
      label={label}
      disabled={locked}
      extraKeys={profile?.input?.extraKeys ?? []}
      onInput={(value) => dispatch({ tag: "input", draft: { tag: "text", text: value } })}
      onCompositionStart={() => dispatch({ tag: "compositionstart" })}
      onCompositionEnd={(value) => dispatch({ tag: "compositionend", text: value })}
      onSubmit={() => dispatch({ tag: "submit" })}
    />
  );
};

export const TranslateTypeView = (props: Props<TranslateType>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  return (
    <div className={styles.body}>
      <div className={styles.prompt} role="group" aria-label={t.format("exercise.prompt.label")} data-ink-container="prompt">
        <T as="p" text={ex.prompt} />
      </div>
      <TypedAnswer props={props} label={t.format("exercise.answer.input-label", { language: props.language })} answer={ex.canonical} />
    </div>
  );
};

export const CompleteTranslationView = (props: Props<CompleteTranslation>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  const typed = props.draft.tag === "text" && props.draft.text !== "" ? textOfSurface(ex.blank, props.draft.text) : undefined;
  return (
    <div className={styles.body}>
      <div className={styles.hint} role="group" aria-label={t.format("player.prompt.hint")}>
        <T as="p" text={ex.prompt} />
      </div>
      <GapSentence before={ex.before} after={ex.after} fill={typed} props={props} />
      <TypedAnswer props={props} label={t.format("player.blank.label")} answer={ex.blank} />
    </div>
  );
};

// ------------------------------------------------------------------------------------ pairs

/** Match-pairs: pick one word and one meaning; right pairs lock, wrong ones count as mistakes. */
export const MatchPairsView = (props: Props<MatchPairs>): JSX.Element => {
  const { ex, dispatch, locked } = props;
  const t = useTranslator();
  const [picked, setPicked] = useState<{ readonly side: "left" | "right"; readonly index: number } | null>(null);
  const [miss, setMiss] = useState<readonly [number, number] | null>(null);
  const matched = props.draft.tag === "pairs" ? props.draft.matched : [];
  const mistakes = props.draft.tag === "pairs" ? props.draft.mistakes : 0;
  const matchedRight = new Set(matched.map((l) => ex.pairs[l]));

  const attempt = (left: number, right: number): void => {
    setPicked(null);
    if (ex.pairs[left] === right) {
      const next = [...matched, left];
      dispatch({ tag: "input", draft: { tag: "pairs", matched: next, mistakes } });
      if (next.length === ex.left.length) dispatch({ tag: "submit" });
    } else {
      setMiss([left, right]);
      dispatch({ tag: "input", draft: { tag: "pairs", matched, mistakes: mistakes + 1 } });
    }
  };
  const pick = (side: "left" | "right", index: number): void => {
    if (locked) return;
    setMiss(null);
    if (picked === null || picked.side === side) setPicked({ side, index });
    else attempt(side === "left" ? index : picked.index, side === "right" ? index : picked.index);
  };
  const column = (side: "left" | "right", items: readonly TaggedText[], label: string): JSX.Element => (
    <div className={styles.pairColumn} role="group" aria-label={label} data-pair-column={side}>
      {items.map((item, i) => {
        const done = side === "left" ? matched.includes(i) : matchedRight.has(i);
        const isPicked = picked?.side === side && picked.index === i;
        const isMiss = miss !== null && (side === "left" ? miss[0] === i : miss[1] === i);
        return (
          <button
            key={i}
            type="button"
            className={styles.pair}
            disabled={locked || done}
            aria-pressed={isPicked}
            autoFocus={side === "left" && i === 0}
            data-pair={`${side}-${i}`}
            data-matched={done || undefined}
            data-miss={isMiss || undefined}
            data-ink-container="tile"
            onClick={() => pick(side, i)}
          >
            <T text={item} ruby={side === "left" ? props.ruby : false} marks={props.marks} />
          </button>
        );
      })}
    </div>
  );
  return (
    <div className={styles.body}>
      <div className={styles.pairs}>
        {column("left", ex.left, t.format("player.pairs.words", { language: props.language }))}
        {column("right", ex.right, t.format("player.pairs.meanings"))}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------------ speaking

type Recording = { readonly tag: "idle" } | { readonly tag: "recording" } | { readonly tag: "done"; readonly url: string } | { readonly tag: "unavailable" };

/**
 * Speak, tier 0 (§10.4): read the sentence aloud, optionally record and play it
 * back, then rate yourself. Nothing is checked automatically and nothing is
 * stored: the recording lives in this component only.
 */
export const SpeakView = (props: Props<Speak>): JSX.Element => {
  const { ex, dispatch, locked } = props;
  const t = useTranslator();
  const [recording, setRecording] = useState<Recording>({ tag: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const supported = typeof navigator !== "undefined" && navigator.mediaDevices !== undefined && typeof MediaRecorder !== "undefined";
  // A recording still running stops when the card goes away, and only then: an effect on
  // `recording` would stop each recording the moment it started.
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );
  // A finished recording's URL is freed when another replaces it or the card goes away.
  useEffect(
    () => () => {
      if (recording.tag === "done") URL.revokeObjectURL(recording.url);
    },
    [recording],
  );
  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording({ tag: "done", url: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })) });
      };
      recorder.current = rec;
      rec.start();
      setRecording({ tag: "recording" });
    } catch {
      setRecording({ tag: "unavailable" });
    }
  };
  const rate = (rating: SelfRating): void => {
    if (locked) return;
    dispatch({ tag: "input", draft: { tag: "self-rating", rating } });
    dispatch({ tag: "submit" });
  };
  const ratings: readonly [SelfRating, "player.speak.rate.good" | "player.speak.rate.hard" | "player.speak.rate.again"][] = [
    ["good", "player.speak.rate.good"],
    ["hard", "player.speak.rate.hard"],
    ["again", "player.speak.rate.again"],
  ];
  return (
    <div className={styles.body}>
      <TargetPrompt text={ex.prompt} props={props} />
      <div className={styles.hint}>
        <T as="p" text={ex.translation} />
      </div>
      <div className={styles.recorder} data-recorder={recording.tag}>
        {!supported || recording.tag === "unavailable" ? (
          <p className={styles.muted}>{t.format("player.speak.unavailable")}</p>
        ) : recording.tag === "recording" ? (
          <>
            <span role="status">{t.format("player.speak.recording")}</span>
            <button type="button" className={styles.secondary} onClick={() => recorder.current?.stop()} data-action="stop">
              {t.format("player.speak.stop")}
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.secondary} disabled={locked} onClick={() => void startRecording()} data-action="record">
              {t.format("player.speak.record")}
            </button>
            {recording.tag === "done" && (
              <button type="button" className={styles.secondary} onClick={() => void new Audio(recording.url).play()} data-action="play-recording">
                {t.format("player.speak.play")}
              </button>
            )}
          </>
        )}
      </div>
      <div className={styles.ratings} role="group" aria-label={t.format("player.speak.rate")}>
        <p className={styles.label}>{t.format("player.speak.rate")}</p>
        {ratings.map(([rating, message], i) => (
          <button key={rating} type="button" className={styles.secondary} disabled={locked} autoFocus={i === 0} data-rating={rating} onClick={() => rate(rating)}>
            {t.format(message)}
          </button>
        ))}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------------ scored speaking (Phase 9)

/** silent: no voice in the recording; partial: voice, but too little for every syllable. */
type Scoring = "idle" | "scoring" | "silent" | "partial";

/** One syllable's feedback: the syllable (its reading) and what was heard. */
const SyllableNote = ({ syllable, score, ex }: { syllable: ToneScore["syllables"][number]; score: ToneScore; ex: SpeakScored | ListenSpeak }): JSX.Element => {
  const t = useTranslator();
  const reading: TaggedText = { lang: "yue-Latn-HK-jyutping" as TaggedText["lang"], orthography: ex.orthography as TaggedText["orthography"], tokens: [{ surface: syllable.syllable, kind: "word" }] };
  const expected = CANTONESE.tones[syllable.tone]?.shape ?? "level";
  return (
    <li data-syllable={syllable.syllable} data-heard={syllable.heard?.tone ?? syllable.heard?.shape ?? "-"}>
      <T text={reading} />{" "}
      {score.calibrated && syllable.heard?.tone !== undefined
        ? t.format("player.speech.tone-off", { heard: Number(syllable.heard.tone), expected: Number(syllable.tone) })
        : t.format("player.speech.contour-off", { expected: t.format(`player.speech.contour.${expected}`) })}
    </li>
  );
};

/**
 * Speak, scored (§10.4): record, and the device scores tones where the course has them while the
 * server (if the app has one) scores words and phones; the recording is dropped after. Without a
 * microphone, the learner rates themselves as at tier 0.
 */
export const SpeechView = (props: Props<SpeakScored | ListenSpeak>): JSX.Element => {
  const { ex, dispatch, locked, outcome } = props;
  const t = useTranslator();
  const services = useSpeech();
  const [scoring, setScoring] = useState<Scoring>("idle");
  const system = toneSystemOf(ex.prompt);
  const recorder = useRecorder((audio: Decoded) => {
    setScoring("scoring");
    void (async () => {
      const track = pitchTrack(audio.samples, audio.sampleRate);
      const voiced = track.f0.filter((f) => f !== undefined).length;
      const tone = system === undefined ? undefined : scoreTones(track, ex.prompt, system, services.calibration);
      if (voiced < 10 || tone?.silent === true) {
        setScoring(voiced < 10 ? "silent" : "partial");
        return;
      }
      const server = services.score === undefined ? undefined : await toPcm16k(audio).then((pcm) => services.score?.(ex, pcm)).catch(() => undefined);
      services.onCalibration?.(calibrate([track], services.calibration));
      const result: SpeechResult = { silent: false, tone, words: server?.words, phones: server?.phones };
      setScoring("idle");
      dispatch({ tag: "input", draft: { tag: "speech", result } });
      dispatch({ tag: "submit" });
    })();
  });
  const result = props.draft.tag === "speech" ? props.draft.result : null;
  const off = result?.tone?.syllables.filter((s) => !s.ok) ?? [];
  const heard = (result?.words as { heard?: TaggedText } | undefined)?.heard;
  const rate = (rating: SelfRating): void => {
    if (locked) return;
    dispatch({ tag: "input", draft: { tag: "self-rating", rating } });
    dispatch({ tag: "submit" });
  };
  return (
    <div className={styles.body}>
      {ex.template === "listen-speak" ? <ListenPrompt audio={ex.audio} props={props} transcript={ex.prompt} translation={ex.translation} /> : <TargetPrompt text={ex.prompt} props={props} />}
      {ex.template === "speak" && (
        <div className={styles.hint}>
          <T as="p" text={ex.translation} />
        </div>
      )}
      {outcome === undefined && (
        <div className={styles.recorder} data-recorder={recorder.state} data-scoring={scoring}>
          {recorder.state === "unavailable" ? (
            <div className={styles.ratings} role="group" aria-label={t.format("player.speech.rate-instead")}>
              <p className={styles.label}>{t.format("player.speech.rate-instead")}</p>
              {(["good", "hard", "again"] as const).map((rating) => (
                <button key={rating} type="button" className={styles.secondary} disabled={locked} data-rating={rating} onClick={() => rate(rating)}>
                  {t.format(`player.speak.rate.${rating}`)}
                </button>
              ))}
            </div>
          ) : recorder.state === "recording" ? (
            <>
              <span role="status">{t.format("player.speak.recording")}</span>
              <button type="button" className={styles.secondary} onClick={recorder.stop} data-action="stop">
                {t.format("player.speak.stop")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.secondary}
              disabled={locked || scoring === "scoring"}
              onClick={() => {
                setScoring("idle");
                void recorder.start();
              }}
              data-action="record"
            >
              {t.format("player.speak.record")}
            </button>
          )}
          <p className={styles.muted} role="status" data-speech-status={scoring}>
            {scoring === "scoring"
              ? t.format("player.speech.checking")
              : scoring === "silent"
                ? t.format("player.speech.silent")
                : scoring === "partial"
                  ? t.format("player.speech.partial")
                  : ""}
          </p>
        </div>
      )}
      {outcome !== undefined && result !== null && (
        <div className={styles.solution} data-speech-result="" data-ink-container="speech">
          {heard !== undefined && (
            <>
              <span className={styles.label}>{t.format("player.speech.heard")}</span>
              <T as="p" text={heard} />
            </>
          )}
          {result.tone !== undefined && !result.tone.calibrated && <p className={styles.muted}>{t.format("player.speech.calibrating")}</p>}
          {result.tone !== undefined && off.length > 0 && (
            <ul className={styles.notes} data-tone-feedback="">
              {off.map((s, i) => (
                <SyllableNote key={i} syllable={s} score={result.tone as ToneScore} ex={ex} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/** Which tone? Hear one syllable, pick its tone; the syllable and its reading show after. */
export const ToneIdentifyView = (props: Props<ToneIdentify>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  useShortcuts(props, (i) => chooseByKey(props, i, ex.tones.length));
  const label = (tone: string): string => {
    const id = `player.tone.${ex.system}.${tone}`;
    return t.has(id) ? t.format(id) : tone;
  };
  return (
    <div className={styles.body}>
      <ListenPrompt audio={ex.audio} props={props} transcript={ex.syllable} />
      <Options
        options={ex.tones.map((tone) => (
          <span key={tone} data-tone={tone}>
            {label(tone)}
          </span>
        ))}
        selected={selectedOf(props)}
        answer={ex.answer}
        outcome={props.outcome}
        locked={props.locked}
        grid
        onSelect={(i) => choose(props, i)}
      />
    </div>
  );
};

// ------------------------------------------------------------------------------------ listening

/**
 * The clip of a listening exercise: plays once when the exercise opens, again on request (normal
 * or slow). After the answer, the transcript appears and follows the clip as it replays.
 */
const ListenPrompt = ({ audio, props, transcript, translation }: { audio: AudioRef; props: Props<ViewProps["ex"]>; transcript?: TaggedText; translation?: TaggedText }): JSX.Element => {
  const t = useTranslator();
  const player = useClipPlayer(audio, props.imageUrl);
  const { play } = player;
  const answered = props.outcome !== undefined;
  useEffect(() => {
    play("normal");
  }, [play]);
  return (
    <div className={styles.listen} role="group" aria-label={t.format("player.audio.label")} data-listen-prompt="">
      <AudioButtons player={player} audio={audio} size="large" />
      {answered && transcript !== undefined && (
        <div className={styles.transcript} dir={directionOf(transcript.lang)} data-transcript="">
          <T as="p" text={transcript} ruby={props.ruby} marks={props.marks} {...(player.token === undefined ? {} : { highlight: [player.token] })} />
          {translation !== undefined && <T as="p" text={translation} className={styles.translation} />}
        </div>
      )}
    </div>
  );
};

/** Hear a sentence, build it from tiles: the word bank of TilesView under a clip instead of a prompt. */
export const ListenTapView = (props: Props<ListenTap>): JSX.Element => {
  const { ex } = props;
  return (
    <div className={styles.body}>
      <ListenPrompt audio={ex.audio} props={props} transcript={ex.canonical} translation={ex.translation} />
      <WordBank props={props} ex={ex} />
    </div>
  );
};

export const ListenTypeView = (props: Props<ListenType>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  return (
    <div className={styles.body}>
      <ListenPrompt audio={ex.audio} props={props} transcript={ex.canonical} translation={ex.translation} />
      <TypedAnswer props={props} label={t.format("player.listen.type-label", { language: props.language })} answer={ex.canonical} />
    </div>
  );
};

/** Hear a word, choose how it is written (listen-select), or which of two near-homophones it is (minimal-pair). */
export const ListenChoiceView = (props: Props<ListenSelect | MinimalPair>): JSX.Element => {
  const { ex } = props;
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <ListenPrompt audio={ex.audio} props={props} />
      <Options
        options={ex.options.map((o, i) => <T key={i} text={o} ruby={props.ruby} marks={props.marks} />)}
        selected={selectedOf(props)}
        answer={ex.answer}
        outcome={props.outcome}
        locked={props.locked}
        onSelect={(i) => choose(props, i)}
      />
    </div>
  );
};


// ------------------------------------------------------------------------------------ stories (Phase 6)

/** A support-language prompt (a question, or a line's translation). */
const SupportPrompt = ({ text }: { text: TaggedText }): JSX.Element => {
  const t = useTranslator();
  return (
    <div className={styles.prompt} role="group" aria-label={t.format("exercise.prompt.label")} data-ink-container="prompt">
      <T as="p" text={text} />
    </div>
  );
};

/** A comprehension question about the story, in the support language. */
export const StoryChooseView = (props: Props<StoryChoose>): JSX.Element => {
  const { ex } = props;
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <SupportPrompt text={ex.prompt} />
      <Options
        options={ex.options.map((o, i) => <T key={i} text={o} />)}
        selected={selectedOf(props)}
        answer={ex.answer}
        outcome={props.outcome}
        locked={props.locked}
        onSelect={(i) => choose(props, i)}
      />
    </div>
  );
};

/** The story's next line with a word missing: choose it. */
export const StoryCompleteView = (props: Props<StoryComplete>): JSX.Element => {
  const { ex } = props;
  const selected = selectedOf(props);
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <GapSentence before={ex.before} after={ex.after} fill={selected === null ? undefined : ex.options[selected]} props={props} />
      <Options
        grid
        options={ex.options.map((o, i) => <T key={i} text={o} ruby={props.ruby} marks={props.marks} />)}
        selected={selected}
        answer={ex.answer}
        outcome={props.outcome}
        locked={props.locked}
        onSelect={(i) => choose(props, i)}
      />
    </div>
  );
};

/** The story's next line, given its translation: build it from its words. */
export const StoryArrangeView = (props: Props<StoryArrange>): JSX.Element => {
  const { ex } = props;
  return (
    <div className={styles.body}>
      <SupportPrompt text={ex.prompt} />
      <WordBank props={props} ex={ex} />
    </div>
  );
};
