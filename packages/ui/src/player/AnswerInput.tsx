/**
 * The typed-answer field, IME-safe (gameplan §6.7):
 * - the value is stored exactly as typed: never normalized, never rewritten;
 * - Enter submits only outside composition (isComposing / keyCode 229);
 * - compositionend hands the settled text to the state machine;
 * - `lang` and `dir` are the target orthography's, not the UI's.
 *
 * The special-character bar inserts at the caret and keeps focus in the field.
 * Typing itself is left to the device's keyboard or IME, which cover these
 * scripts well on phones; an on-screen keyboard is deferred (ADR 0034).
 */
import { textOfSurface } from "@nabu/core/text";
import { fontStackFor, type Direction } from "@nabu/i18n";
import type { TaggedText } from "@nabu/schema";
import { useId, useLayoutEffect, useRef, type CSSProperties, type JSX, type KeyboardEvent } from "react";
import { useIsTarget, useOrthography, useTranslator } from "../context.tsx";
import { T } from "../T.tsx";
import styles from "./Player.module.css";

const ZWNJ = "\u200c";
const ZWJ = "\u200d";
const TATWEEL = "ـ";
const DOTTED_CIRCLE = "◌";
const MARK_ONLY = /^\p{M}+$/u;
const ARABIC = /\p{Script=Arabic}/u;

interface KeyProps {
  readonly value: string;
  readonly base: Pick<TaggedText, "lang" | "orthography">;
  readonly onInsert: (value: string) => void;
  readonly disabled: boolean;
  readonly className: string;
}

/** A combining mark's spoken name (player.key.mark.<code point>), where the catalog has one. */
const markName = (value: string): string | undefined => {
  const cp = value.codePointAt(0);
  return MARK_ONLY.test(value) && cp !== undefined ? `player.key.mark.${cp.toString(16).padStart(4, "0")}` : undefined;
};

/** One insertable key. Invisible characters get a visible name; marks sit on a carrier and get a spoken one. */
const InsertKey = ({ value, base, onInsert, disabled, className }: KeyProps): JSX.Element => {
  const t = useTranslator();
  const invisible = value === ZWNJ ? "zwnj" : value === ZWJ ? "zwj" : undefined;
  const mark = markName(value);
  const spoken = mark !== undefined && t.has(mark) ? t.format(mark) : undefined;
  const carrier = ARABIC.test(base.lang) || base.lang.includes("-Arab") ? TATWEEL : DOTTED_CIRCLE;
  const shown = MARK_ONLY.test(value) ? `${carrier}${value}` : value;
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      data-key={value}
      aria-label={
        invisible === undefined
          ? undefined
          : t.format(invisible === "zwnj" ? "player.key.zwnj" : "player.key.zwj", { short: t.format(invisible === "zwnj" ? "player.key.zwnj.short" : "player.key.zwj.short") })
      }
      // Keep the caret and focus in the answer field.
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onInsert(value)}
    >
      {invisible === undefined && spoken !== undefined ? (
        // A mark on its carrier says little to a screen reader: its name is read instead.
        <>
          <span aria-hidden="true">
            <T text={textOfSurface(base, shown)} />
          </span>
          <span className={styles.spokenName}>{spoken}</span>
        </>
      ) : invisible === undefined ? (
        <T text={textOfSurface(base, shown)} />
      ) : (
        <span aria-hidden="true" className={styles.keyName}>
          {t.format(invisible === "zwnj" ? "player.key.zwnj.short" : "player.key.zwj.short")}
        </span>
      )}
    </button>
  );
};

export interface AnswerInputProps {
  readonly value: string;
  /** Language and orthography of the answer: the field's lang, and key labels. */
  readonly base: Pick<TaggedText, "lang" | "orthography">;
  readonly dir: Direction;
  readonly label: string;
  /** Ids of what the field is described by: the card's instruction and prompt (P10). */
  readonly describedBy?: string | undefined;
  readonly disabled: boolean;
  readonly extraKeys: readonly string[];
  readonly onInput: (text: string) => void;
  readonly onCompositionStart: () => void;
  readonly onCompositionEnd: (text: string) => void;
  readonly onSubmit: () => void;
}

export const AnswerInput = ({
  value,
  base,
  dir,
  label,
  describedBy,
  disabled,
  extraKeys,
  onInput,
  onCompositionStart,
  onCompositionEnd,
  onSubmit,
}: AnswerInputProps): JSX.Element => {
  const t = useTranslator();
  const id = useId();
  const scale = fontStackFor(base.lang, useOrthography(base.orthography)?.fonts).scale;
  const target = useIsTarget(base.orthography);
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const caret = useRef<number | null>(null);

  // Put the caret back after an insertion from the bar.
  useLayoutEffect(() => {
    const el = input.current;
    if (el !== null && caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });

  const replaceSelection = (make: (before: string, after: string) => readonly [string, string]): void => {
    const el = input.current;
    if (el === null || composing.current || disabled) return;
    const startAt = el.selectionStart ?? value.length;
    const endAt = el.selectionEnd ?? value.length;
    const [before, after] = make(value.slice(0, startAt), value.slice(endAt));
    caret.current = before.length;
    onInput(`${before}${after}`);
    el.focus();
  };

  const insert = (chars: string): void => replaceSelection((before, after) => [`${before}${chars}`, after]);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    // keyCode 229: legacy IMEs that do not set isComposing.
    if (e.key !== "Enter" || e.nativeEvent.isComposing || e.keyCode === 229 || composing.current) return;
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        ref={input}
        className={styles.input}
        style={scale === 1 ? undefined : ({ "--nabu-input-scale": String(scale) } as CSSProperties)}
        data-target={target ? "" : undefined}
        value={value}
        lang={base.lang}
        dir={dir}
        aria-describedby={describedBy}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        autoFocus
        data-answer-input=""
        onChange={(e) => onInput(e.currentTarget.value)}
        onCompositionStart={() => {
          composing.current = true;
          onCompositionStart();
        }}
        onCompositionEnd={(e) => {
          composing.current = false;
          onCompositionEnd(e.currentTarget.value);
        }}
        onKeyDown={onKeyDown}
      />
      {extraKeys.length > 0 && (
        <div className={styles.charBar} role="group" aria-label={t.format("player.chars.label")} data-char-bar="">
          {extraKeys.map((key) => (
            <InsertKey key={key} value={key} base={base} onInsert={insert} disabled={disabled} className={styles.charKey} />
          ))}
        </div>
      )}
    </div>
  );
};
