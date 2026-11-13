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
  Transcribe,
  Vocalize,
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
import { isCorrect } from "@nabu/core/lesson";
import { CANTONESE, hearOnDevice, type SpeechResult, type ToneScore } from "@nabu/core/speech";
import { textOfSurface } from "@nabu/core/text";
import { directionOf, type MessageId, orthographyName } from "@nabu/i18n";
import type { Persons, TaggedText } from "@nabu/schema";
import { useEffect, useId, useLayoutEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Radio, RadioGroup } from "react-aria-components";
import { useOrthography, useTranslator } from "../context.tsx";
import { T, type TProps } from "../T.tsx";
import { AnswerInput } from "./AnswerInput.tsx";
import { AudioButtons, useClipElements, useClipPlayer, type ClipPlayer } from "./Audio.tsx";
import styles from "./Player.module.css";
import { FEEDBACK_SOUND_MS, playFeedbackSound } from "./sound.ts";
import { toPcm16k, useRecorder, useSpeech, type Decoded } from "./speech.tsx";
import { describedBy, effectiveWritingMode, partId, type ViewProps } from "./shared.ts";

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
  /** The instruction and prompt, read as focus lands on the first option (P10). */
  readonly describedBy?: string | undefined;
}

/** Radio choices (arrow keys follow the chrome direction), with number-key shortcuts. */
const Options = ({ options, selected, answer, outcome, locked, grid = false, onSelect, describedBy: description }: OptionsProps): JSX.Element => {
  const t = useTranslator();
  const number = new Intl.NumberFormat(t.formattingLocale);
  return (
    <RadioGroup
      className={grid ? styles.optionGrid : styles.options}
      aria-label={t.format("player.options.label")}
      {...(description === undefined ? {} : { "aria-describedby": description })}
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
const useShortcuts = (props: ViewProps, digit: ((i: number) => void) | undefined, backspace?: () => void): void => {
  const { shortcuts, locked } = props;
  useEffect(() => {
    shortcuts.current = locked ? null : { ...(digit === undefined ? {} : { digit }), ...(backspace === undefined ? {} : { backspace }) };
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

/**
 * When a card's target text may be tapped for its words' meanings (P1): `always` where they give
 * nothing away (a gap sentence's other words, a sentence to say, whose translation is shown), or
 * once `answered` where they would be the answer (what a sentence means, how a word is read or
 * vocalized, what was heard). Options, tiles and pairs are never tappable: they are the answer.
 */
export type GlossWhen = "always" | "answered";

/** <T>'s tap props for a text of the card, where the lesson glosses it now. */
const tapsOn = (props: ViewProps & Partial<ViewExtras>, key: string, text: TaggedText, when: GlossWhen | undefined): Pick<TProps, "onTokenPress" | "pressed"> => {
  const glossing = props.glossing;
  if (glossing === undefined || when === undefined || (when === "answered" && props.outcome === undefined)) return {};
  return { onTokenPress: (token) => glossing.onTap({ key, text, token }), pressed: glossing.tapped?.key === key ? glossing.tapped.token : undefined };
};

/**
 * How long after an answer its clip is said: once the feedback sound is over, so the two never
 * overlap (the clip's first word was lost under it).
 */
const SAY_AFTER_ANSWER_MS = FEEDBACK_SOUND_MS + 60;

/** Once the card is answered, its clip is said (once), if sound is on: whatever the card asked. */
const useSayWhenAnswered = (player: ClipPlayer, props: ViewProps & ViewExtras, audio: AudioRef | undefined): void => {
  const answered = props.outcome !== undefined;
  const said = useRef(false);
  const { play } = player;
  useEffect(() => {
    if (!answered || said.current || audio === undefined || props.sound === false) return;
    const timer = setTimeout(() => {
      said.current = true;
      play();
    }, SAY_AFTER_ANSWER_MS);
    return () => clearTimeout(timer);
  }, [answered, audio, play, props.sound]);
};

/**
 * For a card whose prompt is not the target text (it is the answer): once answered, the target
 * text is said, with buttons to hear it again, normal or slow. The buttons' room is kept from the
 * start, hidden until the answer, so nothing on the card moves when they appear (P15).
 */
const AnswerAudio = ({ props }: { props: ViewProps & ViewExtras }): JSX.Element | null => {
  const audio = props.course.audio[props.ex.item];
  const player = useClipPlayer(audio, props.imageUrl, { preload: true });
  useSayWhenAnswered(player, props, audio);
  if (audio === undefined) return null;
  const answered = props.outcome !== undefined;
  return (
    <div className={styles.answerAudio} data-answer-audio="" data-hidden={answered ? undefined : ""}>
      <AudioButtons player={player} audio={audio} />
    </div>
  );
};

export const SelectImageView = (props: Props<SelectImage>): JSX.Element => {
  const { ex, imageUrl } = props;
  const t = useTranslator();
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <div className={styles.prompt} role="group" aria-label={t.format("player.prompt.meaning")} id={partId(props.ids, "prompt")}>
        <T as="p" text={ex.prompt} />
      </div>
      <AnswerAudio props={props} />
      <Options
        grid
        describedBy={describedBy(props.ids, ["prompt"])}
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

/**
 * A target sentence in its own direction (and vertical where allowed); with its clip, a play button and karaoke.
 * A card that asks how the text is read keeps the clip until it is answered (`clipWhenAnswered`, W9): hearing it
 * would answer the question, turning a reading card into a listening one. Its buttons' room is kept meanwhile.
 */
const TargetPrompt = ({
  text,
  props,
  focus,
  ruby,
  clipWhenAnswered = false,
  labelId = "exercise.prompt.label",
  gloss,
}: {
  text: TaggedText;
  props: ViewProps & ViewExtras;
  focus?: ReadingDisambiguation["focus"];
  ruby?: false;
  clipWhenAnswered?: boolean;
  /** What the prompt is to the learner (P10): a sentence to translate, to say, a text to read. */
  labelId?: MessageId;
  /** When its words may be tapped for their meanings (P1); never without. */
  gloss?: GlossWhen;
}): JSX.Element => {
  const t = useTranslator();
  const profile = useOrthography(text.orthography);
  const mode = effectiveWritingMode(profile, props.writingMode, "prompt");
  const audio = props.course.audio[props.ex.item];
  const player = useClipPlayer(audio, props.imageUrl, { preload: true });
  useSayWhenAnswered(player, props, audio);
  const withheld = clipWhenAnswered && props.outcome === undefined;
  return (
    <div className={styles.prompt} role="group" aria-label={t.format(labelId)} id={partId(props.ids, "prompt")} data-writing-mode={mode} data-ink-container="prompt">
      {audio !== undefined && (
        <div className={styles.answerAudio} data-prompt-audio="" data-hidden={withheld ? "" : undefined}>
          <AudioButtons player={player} audio={audio} />
        </div>
      )}
      <T
        as="p"
        text={text}
        ruby={ruby ?? props.ruby}
        marks={props.marks}
        {...(focus === undefined ? {} : { focus })}
        current={player.token}
        {...tapsOn(props, "prompt", text, gloss)}
      />
    </div>
  );
};

export const ChooseTranslationView = (props: Props<ChooseTranslation>): JSX.Element => {
  const { ex } = props;
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <TargetPrompt text={ex.prompt} props={props} gloss="answered" />
      <Options
        describedBy={describedBy(props.ids, ["prompt"])}
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

/**
 * How is this read? A word in its sentence, a character in its word, a letter or a word of a script
 * track: choose its reading. The clip is said only once answered (W9): before, it would be the answer.
 */
export const CharReadView = (props: Props<CharRead | ReadingDisambiguation>): JSX.Element => {
  const { ex } = props;
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  const inSentence = ex.template === "char-read" && ex.word !== undefined;
  return (
    <div className={styles.body}>
      {ex.template === "char-read" && ex.word !== undefined ? (
        // A word in its sentence (ADR 0098): the sentence decides the reading.
        <>
          <WordInSentence sentence={ex.prompt} word={ex.word} translation={ex.translation ?? ex.prompt} ruby={false} ids={props.ids} taps={tapsOn(props, "sentence", ex.prompt, "answered")} />
          <AnswerAudio props={props} />
        </>
      ) : (
        <div className={styles.bigPrompt}>
          {ex.template === "reading-disambiguation" ? (
            <TargetPrompt text={ex.context} props={props} ruby={false} focus={ex.focus} clipWhenAnswered labelId="player.prompt.read" gloss="answered" />
          ) : (
            <TargetPrompt text={ex.prompt} props={props} ruby={false} clipWhenAnswered labelId="player.prompt.read" gloss="answered" />
          )}
        </div>
      )}
      <Options
        grid
        describedBy={describedBy(props.ids, inSentence ? ["prompt", "hint"] : ["prompt"])}
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

/**
 * before ▢ after, in the target direction; the gap shows what is chosen or typed. The words around
 * the gap may be tapped for their meanings (`gloss`, P1): the gap's own word is not among them.
 */
const GapSentence = ({ before, after, fill, props, gloss }: { before: TaggedText; after: TaggedText; fill: TaggedText | undefined; props: ViewProps & Partial<ViewExtras>; gloss?: GlossWhen }): JSX.Element => {
  const t = useTranslator();
  return (
    <p className={styles.gapSentence} dir={directionOf(before.lang)} id={partId(props.ids, "gap")} data-gap-sentence="" data-ink-container="prompt">
      <T text={before} ruby={props.ruby} marks={props.marks} {...tapsOn(props, "before", before, gloss)} />
      <span className={styles.gap} role="img" aria-label={t.format("player.blank.label")} data-gap="">
        {fill === undefined ? null : <T text={fill} ruby={props.ruby} marks={props.marks} />}
      </span>
      <T text={after} ruby={props.ruby} marks={props.marks} {...tapsOn(props, "after", after, gloss)} />
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
      <div className={styles.hint} role="group" aria-label={t.format("player.prompt.hint")} id={partId(props.ids, "hint")}>
        <T as="p" text={ex.hint} />
        <PersonsNote persons={ex.persons} prompt={ex.hint} />
      </div>
      <AnswerAudio props={props} />
      <GapSentence before={ex.before} after={ex.after} fill={selected === null ? undefined : ex.options[selected]} props={props} gloss="always" />
      <Options
        grid
        describedBy={describedBy(props.ids, ["hint", "gap"])}
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
/** Where focus goes once the tiles change under it (P10), so it never falls back to the page. */
type FocusNext = { readonly kind: "bank"; readonly tile: number } | { readonly kind: "placed"; readonly position: number } | { readonly kind: "check" };

/**
 * The answer row and the bank of tiles (translate-tap, listen-tap, story-arrange, word-write).
 * Keyboard and screen readers (P10): a tile that is placed or taken back from under the focus hands
 * it on (to the next tile in the bank, the tile that takes its place, or Check once the bank is
 * empty), so the next Enter never submits half an answer; the bank is described by the instruction
 * and prompt (`parts`), and a placed tile says that pressing it takes it back. Number keys place the
 * bank's tiles in reading order, and the numbers show where a keyboard is likely.
 */
const WordBank = ({ props, ex, parts }: { props: Props<TranslateTap | ListenTap | StoryArrange>; ex: TranslateTap | ListenTap | StoryArrange; parts: readonly ("prompt" | "gap" | "hint")[] }): JSX.Element => {
  const { locked, dispatch } = props;
  const t = useTranslator();
  const number = new Intl.NumberFormat(t.formattingLocale);
  const removeHint = useId();
  const region = useRef<HTMLDivElement>(null);
  const focusNext = useRef<FocusNext | null>(null);
  const order = props.draft.tag === "tiles" ? props.draft.order : [];
  const placed = new Set(order);
  const answerProfile = useOrthography(ex.canonical.orthography);
  const intoTarget = ex.template !== "translate-tap.l2-l1";
  const mode = intoTarget ? effectiveWritingMode(answerProfile, props.writingMode, "wordbank") : "horizontal-tb";
  const remaining = ex.tiles.map((_, i) => i).filter((i) => !placed.has(i));
  const set = (next: readonly number[]): void => {
    if (!locked) dispatch({ tag: "input", draft: { tag: "tiles", order: next } });
  };
  const has = (selector: string): boolean => document.activeElement !== null && document.activeElement === region.current?.querySelector(selector);
  /** Places bank tile `i`; `handOn`: it has the focus, which goes on to the next tile (or Check). */
  const add = (i: number, handOn: boolean): void => {
    if (placed.has(i) || locked) return;
    if (handOn) {
      const next = remaining.find((j) => j > i) ?? remaining.findLast((j) => j < i);
      focusNext.current = next === undefined ? { kind: "check" } : { kind: "bank", tile: next };
    }
    set([...order, i]);
  };
  /** Takes back the placed tile at `position`; `handOn`: it has the focus, which goes to the tile taking its place. */
  const remove = (position: number, handOn: boolean): void => {
    const tile = order[position];
    if (tile === undefined || locked) return;
    if (handOn) focusNext.current = order.length > 1 ? { kind: "placed", position: Math.min(position, order.length - 2) } : { kind: "bank", tile };
    set(order.filter((_, p) => p !== position));
  };
  useLayoutEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    const root = region.current;
    if (next === null || root === null) return;
    const el =
      next.kind === "check"
        ? root.closest("[data-lesson-player], [data-story-reader]")?.querySelector<HTMLElement>("[data-action=check]")
        : next.kind === "bank"
          ? root.querySelector<HTMLElement>(`[data-tile="${next.tile}"]`)
          : root.querySelectorAll<HTMLElement>("[data-placed-tile]")[next.position];
    el?.focus({ preventScroll: true });
  });
  useShortcuts(
    props,
    (k) => {
      const tile = remaining[k];
      if (tile !== undefined) add(tile, has(`[data-tile="${tile}"]`));
    },
    () => remove(order.length - 1, has(`[data-placed-tile="${order.at(-1) ?? -1}"]`)),
  );
  const tileRuby = intoTarget ? props.ruby : false;
  return (
    <div ref={region} className={styles.target} dir={directionOf(ex.canonical.lang)} data-target-region="" data-writing-mode={mode}>
      <div
        className={styles.answerRow}
        role="group"
        aria-label={t.format("player.wordbank.answer-label")}
        data-answer-row=""
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const i = Number(e.dataTransfer.getData("text/plain"));
          if (Number.isInteger(i)) add(i, false);
        }}
      >
        <span id={removeHint} hidden>
          {t.format("player.wordbank.remove")}
        </span>
        {order.map((tileIndex, position) => (
          <button
            key={`${tileIndex}`}
            type="button"
            className={styles.tile}
            disabled={locked}
            aria-describedby={removeHint}
            data-ink-container="tile"
            data-placed-tile={tileIndex}
            onClick={() => remove(position, true)}
          >
            <T text={ex.tiles[tileIndex] as TaggedText} ruby={tileRuby} marks={props.marks} />
          </button>
        ))}
      </div>
      <div className={styles.bank} role="group" aria-label={t.format("exercise.wordbank.label")} aria-describedby={describedBy(props.ids, parts)} data-word-bank="">
        {ex.tiles.map((tile, i) => {
          const key = remaining.indexOf(i);
          return placed.has(i) ? (
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
              onClick={() => add(i, true)}
            >
              {key >= 0 && key < 9 && (
                <span className={styles.tileNumber} aria-hidden="true" data-tile-key={key + 1}>
                  {number.format(key + 1)}
                </span>
              )}
              <T text={tile} ruby={tileRuby} marks={props.marks} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

const SPEAKER: Readonly<Record<NonNullable<Persons["speaker"]>, MessageId>> = { m: "player.persons.speaker.m", f: "player.persons.speaker.f" };
const ADDRESSEE: Readonly<Record<NonNullable<Persons["addressee"]>, MessageId>> = {
  m: "player.persons.addressee.m",
  f: "player.persons.addressee.f",
  sg: "player.persons.addressee.sg",
  du: "player.persons.addressee.du",
  pl: "player.persons.addressee.pl",
};

/**
 * Who speaks and who is spoken to, under a prompt in the support language, where the target
 * language marks it and the prompt cannot (a feminine or plural "you" in Arabic, a singular one
 * in Cantonese): the accept set holds only the forms that fit.
 */
const PersonsNote = ({ persons, prompt }: { readonly persons: Persons | undefined; readonly prompt: TaggedText }): JSX.Element | null => {
  const t = useTranslator();
  if (persons === undefined) return null;
  const tags = [...(persons.speaker === undefined ? [] : [SPEAKER[persons.speaker]]), ...(persons.addressee === undefined ? [] : [ADDRESSEE[persons.addressee]])];
  const data = [persons.speaker === undefined ? [] : [`speaker:${persons.speaker}`], persons.addressee === undefined ? [] : [`addressee:${persons.addressee}`]].flat().join(" ");
  return (
    // Lined up under the prompt (its direction), each tag in the UI's language and direction.
    <p className={styles.persons} dir={directionOf(prompt.lang)} data-persons={data}>
      {tags.map((id) => (
        <span key={id} className={styles.personTag} lang={t.locale} dir={t.dir}>
          {t.format(id)}
        </span>
      ))}
    </p>
  );
};

export const TilesView = (props: Props<TranslateTap>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  return (
    <div className={styles.body}>
      {ex.template === "translate-tap.l2-l1" ? (
        <TargetPrompt text={ex.prompt} props={props} gloss="answered" />
      ) : (
        <div
          className={styles.prompt}
          role="group"
          aria-label={t.format(ex.template === "word-write" ? "player.prompt.spell" : "exercise.prompt.label")}
          id={partId(props.ids, "prompt")}
          data-ink-container="prompt"
        >
          <T as="p" text={ex.prompt} />
          <PersonsNote persons={ex.persons} prompt={ex.prompt} />
        </div>
      )}
      {ex.template !== "translate-tap.l2-l1" && <AnswerAudio props={props} />}
      <WordBank props={props} ex={ex} parts={["prompt"]} />
    </div>
  );
};

// ------------------------------------------------------------------------------------ typing

const TypedAnswer = ({
  props,
  label,
  answer,
  keys,
  parts,
}: {
  props: ViewProps & ViewExtras;
  label: string;
  answer: TaggedText;
  keys?: readonly string[];
  /** The parts of the prompt the field is described by, after the instruction (P10). */
  parts: readonly ("prompt" | "gap" | "hint")[];
}): JSX.Element => {
  const { course, dispatch, locked, ex } = props;
  const profile = course.profiles.get(ex.orthography)?.source;
  const text = props.draft.tag === "text" ? props.draft.text : "";
  return (
    <AnswerInput
      value={text}
      base={answer}
      dir={directionOf(answer.lang)}
      label={label}
      describedBy={describedBy(props.ids, parts)}
      disabled={locked}
      extraKeys={keys ?? profile?.input?.extraKeys ?? []}
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
      <div className={styles.prompt} role="group" aria-label={t.format("exercise.prompt.label")} id={partId(props.ids, "prompt")} data-ink-container="prompt">
        <T as="p" text={ex.prompt} />
        <PersonsNote persons={ex.persons} prompt={ex.prompt} />
      </div>
      <AnswerAudio props={props} />
      <TypedAnswer props={props} label={t.format("exercise.answer.input-label", { language: props.language })} answer={ex.canonical} parts={["prompt"]} />
    </div>
  );
};

/**
 * What a typed gap shows: what is typed, until the answer is accepted as the sentence's own word
 * (exactly, or with a typo, its marks or a variant spelling). Then the sentence's word itself, so its
 * reading shows as ruby as the rest of the sentence's does. Another accepted word (CORRECT_ALT) stays
 * as typed: the course pins no reading for it, and the feedback shows the sentence's word.
 */
export const gapFillOf = (ex: CompleteTranslation, draft: ViewProps["draft"], outcome: Outcome | undefined): TaggedText | undefined => {
  if (outcome !== undefined && isCorrect(outcome.verdict) && outcome.verdict !== "CORRECT_ALT" && outcome.verdict !== "CORRECT_PROVISIONAL") return ex.blank;
  return draft.tag === "text" && draft.text !== "" ? textOfSurface(ex.blank, draft.text) : undefined;
};

export const CompleteTranslationView = (props: Props<CompleteTranslation>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  return (
    <div className={styles.body}>
      <div className={styles.hint} role="group" aria-label={t.format("player.prompt.hint")} id={partId(props.ids, "hint")}>
        <T as="p" text={ex.prompt} />
        <PersonsNote persons={ex.persons} prompt={ex.prompt} />
      </div>
      <AnswerAudio props={props} />
      <GapSentence before={ex.before} after={ex.after} fill={gapFillOf(ex, props.draft, props.outcome)} props={props} gloss="always" />
      <TypedAnswer props={props} label={t.format("player.blank.label")} answer={ex.blank} parts={["hint", "gap"]} />
    </div>
  );
};

// ------------------------------------------------------------------------------------ pronunciation (ADR 0054)

/** The sentence with the word asked about marked, and what the sentence means (ADR 0095). */
const WordInSentence = ({
  sentence,
  word,
  translation,
  ruby,
  ids,
  taps,
}: {
  sentence: TaggedText;
  word: number;
  translation: TaggedText;
  ruby: false | undefined;
  ids: ViewProps["ids"];
  /** Tap-for-gloss on the sentence, once answered (P1): a gloss shows the word's marks and reading. */
  taps: Pick<TProps, "onTokenPress" | "pressed">;
}): JSX.Element => {
  const t = useTranslator();
  return (
    <>
      <div className={styles.prompt} role="group" aria-label={t.format("player.word-in-sentence.label")} id={partId(ids, "prompt")} data-ink-container="prompt" data-pronounce-word="">
        <T as="p" text={sentence} emphasis={[word]} marks="show" {...(ruby === false ? { ruby: false } : {})} {...taps} />
      </div>
      <div className={styles.hint} role="group" aria-label={t.format("player.meaning.label")} id={partId(ids, "hint")} data-pronounce-meaning="">
        <T as="p" text={translation} />
      </div>
    </>
  );
};

/**
 * Vowel marks (ADR 0098): the word with its marks, chosen among other vocalizations of its letters.
 * Where an orthography of the course writes the vowels (Arabizi), the learner may type the word in it
 * instead; the number keys then type, not choose.
 */
export const VocalizeView = (props: Props<Vocalize>): JSX.Element => {
  const { ex, dispatch, locked } = props;
  const t = useTranslator();
  const [spelling, setSpelling] = useState(false);
  const spelled = ex.spelled;
  const typing = spelling && spelled !== undefined;
  useShortcuts(props, typing ? undefined : (i) => chooseByKey(props, i, ex.options.length));
  const name = spelled === undefined ? "" : orthographyName(t, props.course, spelled.orthography);
  const switchTo = (on: boolean): void => {
    setSpelling(on);
    dispatch({ tag: "input", draft: on ? { tag: "text", text: "" } : { tag: "choice", index: null } });
  };
  return (
    <div className={styles.body}>
      <WordInSentence sentence={ex.prompt} word={ex.word} translation={ex.translation} ruby={undefined} ids={props.ids} taps={tapsOn(props, "sentence", ex.prompt, "answered")} />
      <AnswerAudio props={props} />
      {typing ? (
        <TypedAnswer props={props} label={t.format("player.vocalize.spelled-label", { orthography: name })} answer={spelled} keys={[]} parts={["prompt", "hint"]} />
      ) : (
        <Options
          grid
          describedBy={describedBy(props.ids, ["prompt", "hint"])}
          options={ex.options.map((o, i) => <T key={i} text={o} marks="show" />)}
          selected={selectedOf(props)}
          answer={ex.answer}
          outcome={props.outcome}
          locked={locked}
          onSelect={(i) => choose(props, i)}
        />
      )}
      {spelled !== undefined && !locked && (
        <button type="button" className={styles.secondary} onClick={() => switchTo(!spelling)} aria-pressed={spelling} data-action="vocalize-spelled">
          {spelling ? t.format("player.vocalize.use-options") : t.format("player.vocalize.use-spelled", { orthography: name })}
        </button>
      )}
    </div>
  );
};

/** A reading: the sentence without ruby (the word's ruby is the answer), typed in the scheme's letters. */
export const TranscribeView = (props: Props<Transcribe>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  const scheme = `player.transcribe.label.${ex.scheme}`;
  const label: MessageId = t.has(scheme) ? scheme : "player.transcribe.label";
  return (
    <div className={styles.body}>
      <WordInSentence sentence={ex.prompt} word={ex.word} translation={ex.translation} ruby={false} ids={props.ids} taps={tapsOn(props, "sentence", ex.prompt, "answered")} />
      <AnswerAudio props={props} />
      <TypedAnswer props={props} label={t.format(label)} answer={ex.reading} keys={[]} parts={["prompt", "hint"]} />
    </div>
  );
};

// ------------------------------------------------------------------------------------ pairs

/**
 * Match-pairs: pick one word and one meaning; right pairs lock, wrong ones count as mistakes. For the
 * keyboard and screen readers (P10): a pair that locks hands the focus on to the next open word in
 * its column (never back to the page), and each try is announced, a miss with its sound too.
 */
export const MatchPairsView = (props: Props<MatchPairs>): JSX.Element => {
  const { ex, dispatch, locked } = props;
  const t = useTranslator();
  const [picked, setPicked] = useState<{ readonly side: "left" | "right"; readonly index: number } | null>(null);
  const [miss, setMiss] = useState<readonly [number, number] | null>(null);
  // What the last try was, for the live region; `n` makes the same news twice in a row news again.
  const [news, setNews] = useState<{ readonly n: number; readonly kind: "match" | "miss" } | null>(null);
  const pairsRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<string | null>(null);
  const matched = props.draft.tag === "pairs" ? props.draft.matched : [];
  const mistakes = props.draft.tag === "pairs" ? props.draft.mistakes : 0;
  const matchedRight = new Set(matched.map((l) => ex.pairs[l]));
  // A word says itself when tapped, if it has a clip and sound is on; the clips load with the card.
  const voice = useRef<HTMLAudioElement | null>(null);
  const voices = useClipElements();
  const { element: voiceFor, release } = voices;
  const clipOf = (i: number) => props.course.audio[ex.kcs[i] ?? ""]?.normal;
  const { imageUrl, sound } = props;
  useEffect(() => {
    if (sound === false) return;
    for (const kc of ex.kcs) {
      const clip = props.course.audio[kc]?.normal;
      if (clip !== undefined) voiceFor(clip, imageUrl(clip.path));
    }
  }, [ex.kcs, imageUrl, props.course.audio, sound, voiceFor]);
  useEffect(() => release, [release]);
  const say = (i: number): void => {
    const clip = clipOf(i);
    if (clip === undefined || props.sound === false) return;
    voice.current?.pause();
    const el = voiceFor(clip, props.imageUrl(clip.path));
    el.currentTime = 0;
    voice.current = el;
    void el.play().catch(() => undefined);
  };

  useLayoutEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    if (next !== null) pairsRef.current?.querySelector<HTMLElement>(`[data-pair="${next}"]`)?.focus({ preventScroll: true });
  });

  /** The next open word after `index` in a column (else before it), once `left` and `right` are matched. */
  const openAfter = (side: "left" | "right", index: number, left: number, right: number): string | undefined => {
    const open = (side === "left" ? ex.left : ex.right).map((_, i) => i).filter((i) => (side === "left" ? i !== left && !matched.includes(i) : i !== right && !matchedRight.has(i)));
    const next = open.find((i) => i > index) ?? open.findLast((i) => i < index);
    return next === undefined ? undefined : `${side}-${next}`;
  };
  const attempt = (left: number, right: number, by: "left" | "right"): void => {
    setPicked(null);
    setNews((n) => ({ n: (n?.n ?? 0) + 1, kind: ex.pairs[left] === right ? "match" : "miss" }));
    if (ex.pairs[left] === right) {
      const next = [...matched, left];
      // The button pressed locks. The focus goes where the next pair starts: the next open item in the
      // column the learner picked from first (a word, usually), else in the other one.
      const first = by === "left" ? "right" : "left";
      focusNext.current = openAfter(first, first === "left" ? left : right, left, right) ?? openAfter(by, by === "left" ? left : right, left, right) ?? null;
      dispatch({ tag: "input", draft: { tag: "pairs", matched: next, mistakes } });
      if (next.length === ex.left.length) dispatch({ tag: "submit" });
    } else {
      setMiss([left, right]);
      if (props.sound !== false) playFeedbackSound("wrong");
      dispatch({ tag: "input", draft: { tag: "pairs", matched, mistakes: mistakes + 1 } });
    }
  };
  const pick = (side: "left" | "right", index: number): void => {
    if (locked) return;
    if (side === "left") say(index);
    setMiss(null);
    if (picked === null || picked.side === side) setPicked({ side, index });
    else attempt(side === "left" ? index : picked.index, side === "right" ? index : picked.index, side);
  };
  const column = (side: "left" | "right", items: readonly TaggedText[], label: string): JSX.Element => (
    <div className={styles.pairColumn} role="group" aria-label={label} aria-describedby={side === "left" ? describedBy(props.ids, []) : undefined} data-pair-column={side}>
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
            data-clip={side === "left" ? clipOf(i)?.path : undefined}
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
      <div ref={pairsRef} className={styles.pairs}>
        {column("left", ex.left, t.format("player.pairs.words", { language: props.language }))}
        {column("right", ex.right, t.format("player.pairs.meanings"))}
      </div>
      <p className={styles.spokenName} role="status" data-pairs-news={news?.kind}>
        {news !== null && <span key={news.n}>{t.format(news.kind === "match" ? "player.pairs.match" : "player.pairs.miss")}</span>}
      </p>
    </div>
  );
};

// ------------------------------------------------------------------------------------ speaking

type Recording = { readonly tag: "idle" } | { readonly tag: "recording" } | { readonly tag: "done"; readonly url: string } | { readonly tag: "unavailable" };

/**
 * The model to imitate on a self-rated speaking card (P5): the sentence's clip, said when the card
 * opens (before the learner speaks, not after rating) and said again once rated (ADR 0064).
 */
const ModelAudio = ({ props }: { props: Props<Speak> }): JSX.Element | null => {
  const audio = props.course.audio[props.ex.item];
  const player = useClipPlayer(audio, props.imageUrl, { preload: true });
  const { play } = player;
  // Said as the card opens, unless nothing may play by itself (sound off, or can't listen: P6).
  const { sound } = props;
  useEffect(() => {
    if (audio !== undefined && sound !== false) play("normal");
  }, [play, audio, sound]);
  useSayWhenAnswered(player, props, audio);
  return audio === undefined ? null : (
    <div data-model-audio="">
      <AudioButtons player={player} audio={audio} />
    </div>
  );
};

/**
 * Speak, tier 0 (§10.4): hear the model, read the sentence aloud, optionally record and play it
 * back, then rate yourself. Nothing is checked automatically and nothing is stored: the recording
 * lives in this component only. Record has the focus, so a stray Enter never rates the card.
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
  const description = describedBy(props.ids, ["prompt", "hint"]);
  return (
    <div className={styles.body}>
      <TargetPrompt text={ex.prompt} props={props} labelId="player.prompt.say" gloss="always" />
      <div className={styles.hint} id={partId(props.ids, "hint")}>
        <T as="p" text={ex.translation} />
      </div>
      <ModelAudio props={props} />
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
            <button type="button" className={styles.secondary} disabled={locked} autoFocus={!locked} aria-describedby={description} onClick={() => void startRecording()} data-action="record">
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
          <button
            key={rating}
            type="button"
            className={styles.secondary}
            disabled={locked}
            autoFocus={i === 0 && !supported}
            aria-describedby={i === 0 && !supported ? description : undefined}
            data-rating={rating}
            onClick={() => rate(rating)}
          >
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
  const recorder = useRecorder((audio: Decoded) => {
    setScoring("scoring");
    void (async () => {
      // Voice or silence; tones and the pitch range only where the device scores them (off: ADR 0093).
      const device = hearOnDevice(audio.samples, audio.sampleRate, ex.prompt, services.calibration);
      if (device.tag !== "heard") {
        setScoring(device.tag);
        return;
      }
      const server = services.score === undefined ? undefined : await toPcm16k(audio).then((pcm) => services.score?.(ex, pcm)).catch(() => undefined);
      if (device.calibration !== undefined) services.onCalibration?.(device.calibration);
      const result: SpeechResult = { silent: false, tone: device.tone, words: server?.words, phones: server?.phones };
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
  const description = describedBy(props.ids, ex.template === "speak" ? ["prompt", "hint"] : []);
  return (
    <div className={styles.body}>
      {ex.template === "listen-speak" ? (
        <ListenPrompt audio={ex.audio} props={props} transcript={ex.prompt} translation={ex.translation} />
      ) : (
        <TargetPrompt text={ex.prompt} props={props} labelId="player.prompt.say" gloss="always" />
      )}
      {ex.template === "speak" && (
        <div className={styles.hint} id={partId(props.ids, "hint")}>
          <T as="p" text={ex.translation} />
        </div>
      )}
      {outcome === undefined && (
        <div className={styles.recorder} data-recorder={recorder.state} data-scoring={scoring}>
          {recorder.state === "unavailable" ? (
            <div className={styles.ratings} role="group" aria-label={t.format("player.speech.rate-instead")}>
              <p className={styles.label}>{t.format("player.speech.rate-instead")}</p>
              {(["good", "hard", "again"] as const).map((rating, i) => (
                <button
                  key={rating}
                  type="button"
                  className={styles.secondary}
                  disabled={locked}
                  autoFocus={i === 0 && !locked}
                  aria-describedby={i === 0 ? description : undefined}
                  data-rating={rating}
                  onClick={() => rate(rating)}
                >
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
              // Record has the focus, as on a self-rated card: a stray Enter never rates anything.
              autoFocus={!locked}
              aria-describedby={description}
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
      <ListenPrompt audio={ex.audio} props={props} transcript={ex.syllable} translation={ex.translation} />
      <Options
        describedBy={describedBy(props.ids, [])}
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
 * The clip of a listening exercise: plays once when the exercise opens (with sound on), again on
 * request (normal or slow), and again once answered, as the transcript appears and follows it. Once
 * answered, the translation shows under the transcript: what was heard, and what it means.
 */
const ListenPrompt = ({ audio, props, transcript, translation }: { audio: AudioRef; props: Props<ViewProps["ex"]>; transcript?: TaggedText | undefined; translation?: TaggedText | undefined }): JSX.Element => {
  const t = useTranslator();
  const player = useClipPlayer(audio, props.imageUrl, { preload: true });
  const { play } = player;
  const answered = props.outcome !== undefined;
  // It starts by itself unless nothing may (sound off: P6); its big button plays it either way.
  const { sound } = props;
  useEffect(() => {
    if (sound !== false) play("normal");
  }, [play, sound]);
  useSayWhenAnswered(player, props, audio);
  return (
    <div className={styles.listen} role="group" aria-label={t.format("player.audio.label")} data-listen-prompt="">
      <AudioButtons player={player} audio={audio} size="large" />
      {answered && transcript !== undefined && (
        <div className={styles.transcript} dir={directionOf(transcript.lang)} data-transcript="">
          <T as="p" text={transcript} ruby={props.ruby} marks={props.marks} current={player.token} {...tapsOn(props, "transcript", transcript, "answered")} />
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
      <WordBank props={props} ex={ex} parts={[]} />
    </div>
  );
};

export const ListenTypeView = (props: Props<ListenType>): JSX.Element => {
  const { ex } = props;
  const t = useTranslator();
  return (
    <div className={styles.body}>
      <ListenPrompt audio={ex.audio} props={props} transcript={ex.canonical} translation={ex.translation} />
      <TypedAnswer props={props} label={t.format("player.listen.type-label", { language: props.language })} answer={ex.canonical} parts={[]} />
    </div>
  );
};

/** Hear a word, choose how it is written (listen-select), or which of two near-homophones it is (minimal-pair). */
export const ListenChoiceView = (props: Props<ListenSelect | MinimalPair>): JSX.Element => {
  const { ex } = props;
  useShortcuts(props, (i) => chooseByKey(props, i, ex.options.length));
  return (
    <div className={styles.body}>
      <ListenPrompt audio={ex.audio} props={props} transcript={ex.options[ex.answer]} translation={ex.translation} />
      <Options
        describedBy={describedBy(props.ids, [])}
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
const SupportPrompt = ({ text, ids, labelId }: { text: TaggedText; ids: ViewProps["ids"]; labelId: MessageId }): JSX.Element => {
  const t = useTranslator();
  return (
    <div className={styles.prompt} role="group" aria-label={t.format(labelId)} id={partId(ids, "prompt")} data-ink-container="prompt">
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
      <SupportPrompt text={ex.prompt} ids={props.ids} labelId="player.prompt.question" />
      <Options
        describedBy={describedBy(props.ids, ["prompt"])}
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
        describedBy={describedBy(props.ids, ["gap"])}
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
      <SupportPrompt text={ex.prompt} ids={props.ids} labelId="exercise.prompt.label" />
      <WordBank props={props} ex={ex} parts={["prompt"]} />
    </div>
  );
};
