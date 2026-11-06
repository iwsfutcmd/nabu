/**
 * <T>: the only way language data reaches the DOM (gameplan §11.1).
 *
 * - `lang` is the TaggedText's tag, so screen readers switch voice, Han glyphs
 *   follow the region (yue-Hant-HK vs zh-Hant-TW) and spellcheckers behave.
 * - `dir` comes from the script (Intl-independent CLDR table), never from the
 *   language name or the surrounding UI. An element with `dir` is a bidi
 *   isolate, so target text never reorders the chrome around it.
 * - Fonts and line height come from the orthography profile, else the script.
 * - Tokens are wrapped whole (§6.8): a cursive or conjunct-forming run is never
 *   split into per-letter elements. Ruby splits only at RubySegment bases.
 * - Vocalization (§6.6): text is stored vocalized; `marks="hide"` strips the
 *   profile's mark set for display only, never in the data.
 */
import { graphemeCount, parseExemplarSet } from "@nabu/core/text";
import { directionOf, fontStackFor, scriptOf } from "@nabu/i18n";
import type { SchemeId, TaggedText, Token } from "@nabu/schema";
import { Fragment, useMemo, type CSSProperties, type JSX } from "react";
import { useIsTarget, useOrthography } from "./context.tsx";
import styles from "./T.module.css";

export interface TProps {
  readonly text: TaggedText;
  readonly as?: "span" | "div" | "p";
  /** Which ruby layer to show, by scheme (e.g. "jyutping"). Off by default. */
  readonly ruby?: SchemeId | false;
  /** Show or hide the profile's vowel marks (harakat). Shown by default. */
  readonly marks?: "show" | "hide";
  /** Token indexes to mark (the parts of an answer that differ, §11.6). */
  readonly highlight?: readonly number[];
  /** A ruby segment (one Han character) to emphasize: reading-disambiguation. */
  readonly focus?: { readonly token: number; readonly segment: number };
  readonly className?: string;
  readonly id?: string;
  /**
   * Tap-for-gloss (Phase 6): word tokens become buttons that report their index. The token
   * stays whole (§6.8); `pressed` marks the one whose gloss is open.
   */
  readonly onTokenPress?: (index: number) => void;
  readonly pressed?: number | undefined;
}

const escape = (c: string): string => c.replace(/[\\\]^-]/gu, "\\$&");

/** A regex over the profile's mark set, for hiding vowel marks in display. */
const markStripper = (set: string | undefined): RegExp | undefined => {
  if (set === undefined) return undefined;
  const chars = parseExemplarSet(set);
  return chars.length === 0 ? undefined : new RegExp(`[${chars.map(escape).join("")}]`, "gu");
};

/** Numbers up to this many graphemes are set horizontally in vertical text (tate-chū-yoko). */
const TATE_CHU_YOKO_MAX = 2;

interface TokenViewProps {
  readonly token: Token;
  readonly index: number;
  readonly ruby: SchemeId | false;
  /** The ruby layer's own language tag (zh-Latn-pinyin), from the profile (ADR 0071). */
  readonly rubyLang: string | undefined;
  readonly strip: RegExp | undefined;
  readonly highlighted: boolean;
  readonly focus: number | undefined;
  readonly onPress: ((index: number) => void) | undefined;
  readonly pressed: boolean;
}

const TokenView = ({ token, index, ruby, rubyLang, strip, highlighted, focus, onPress, pressed }: TokenViewProps): JSX.Element => {
  const show = (text: string): string => (strip === undefined ? text : text.replace(strip, ""));
  const segments = ruby === false ? undefined : token.ruby?.[ruby];
  // A focused character needs the segment bases even when no reading layer is shown.
  const bases = segments ?? (focus === undefined ? undefined : Object.values(token.ruby ?? {})[0]);
  const tcy = token.kind === "number" && graphemeCount(token.surface) <= TATE_CHU_YOKO_MAX;
  const base = (text: string, i: number): JSX.Element | string => (i === focus ? <mark className={styles.focus}>{text}</mark> : text);
  const content =
    bases === undefined ? (
      show(token.surface)
    ) : segments === undefined ? (
      bases.map((segment, i) => <Fragment key={i}>{base(segment.base, i)}</Fragment>)
    ) : (
      <ruby className={styles.ruby}>
        {segments.map((segment, i) => (
          <Fragment key={i}>
            {base(segment.base, i)}
            <rt lang={rubyLang}>{segment.text}</rt>
          </Fragment>
        ))}
      </ruby>
    );
  if (onPress !== undefined && (token.kind === "word" || token.kind === "number")) {
    return (
      <button
        type="button"
        className={`${styles.token} ${styles.pressable}`}
        data-kind={token.kind}
        data-index={index}
        data-tcy={tcy || undefined}
        data-highlight={highlighted || undefined}
        aria-pressed={pressed}
        onClick={() => onPress(index)}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={styles.token} data-kind={token.kind} data-index={index} data-tcy={tcy || undefined} data-highlight={highlighted || undefined}>
      {content}
    </span>
  );
};

export const T = ({ text, as: Tag = "span", ruby = false, marks = "show", highlight, focus, className, id, onTokenPress, pressed }: TProps): JSX.Element => {
  const profile = useOrthography(text.orthography);
  const target = useIsTarget(text.orthography);
  const markSet = marks === "hide" ? profile?.match?.marks?.set : undefined;
  const strip = useMemo(() => markStripper(markSet), [markSet]);
  const font = fontStackFor(text.lang, profile?.fonts);
  const rubyLang = ruby === false ? undefined : profile?.annotations?.find((a) => a.kind === "reading" && a.scheme === ruby)?.lang;
  const style = {
    "--nabu-text-font": font.family,
    "--nabu-text-line-height": String(font.lineHeight),
    ...(rubyLang === undefined ? {} : { "--nabu-ruby-font": fontStackFor(rubyLang).family }),
    ...(font.scale === 1 ? {} : { "--nabu-text-scale": String(font.scale) }),
  } as CSSProperties;
  return (
    <Tag
      lang={text.lang}
      dir={directionOf(text.lang)}
      className={className === undefined ? styles.text : `${styles.text} ${className}`}
      data-nabu-text=""
      data-script={scriptOf(text.lang)}
      data-orthography={text.orthography}
      data-scaled={font.scale === 1 ? undefined : ""}
      data-target={target ? "" : undefined}
      id={id}
      style={style}
    >
      {text.tokens.map((token, index) => (
        <TokenView
          key={index}
          token={token}
          index={index}
          ruby={ruby}
          rubyLang={rubyLang}
          strip={strip}
          highlighted={highlight?.includes(index) ?? false}
          focus={focus?.token === index ? focus.segment : undefined}
          onPress={onTokenPress}
          pressed={pressed === index}
        />
      ))}
    </Tag>
  );
};
