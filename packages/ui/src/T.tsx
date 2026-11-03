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
 */
import { graphemeCount } from "@nabu/core/text";
import { directionOf, fontStackFor, scriptOf } from "@nabu/i18n";
import type { SchemeId, TaggedText, Token } from "@nabu/schema";
import { Fragment, type CSSProperties, type JSX } from "react";
import { useOrthography } from "./context.tsx";
import styles from "./T.module.css";

export interface TProps {
  readonly text: TaggedText;
  readonly as?: "span" | "div" | "p";
  /** Which ruby layer to show, by scheme (e.g. "jyutping"). Off by default. */
  readonly ruby?: SchemeId | false;
  readonly className?: string;
  readonly id?: string;
}

/** Numbers up to this many graphemes are set horizontally in vertical text (tate-chū-yoko). */
const TATE_CHU_YOKO_MAX = 2;

const TokenView = ({ token, index, ruby }: { token: Token; index: number; ruby: SchemeId | false }): JSX.Element => {
  const segments = ruby === false ? undefined : token.ruby?.[ruby];
  const tcy = token.kind === "number" && graphemeCount(token.surface) <= TATE_CHU_YOKO_MAX;
  return (
    <span className={styles.token} data-kind={token.kind} data-index={index} data-tcy={tcy || undefined}>
      {segments === undefined ? (
        token.surface
      ) : (
        <ruby className={styles.ruby}>
          {segments.map((segment, i) => (
            <Fragment key={i}>
              {segment.base}
              <rt>{segment.text}</rt>
            </Fragment>
          ))}
        </ruby>
      )}
    </span>
  );
};

export const T = ({ text, as: Tag = "span", ruby = false, className, id }: TProps): JSX.Element => {
  const profile = useOrthography(text.orthography);
  const font = fontStackFor(text.lang, profile?.fonts);
  const style = {
    "--nabu-text-font": font.family,
    "--nabu-text-line-height": String(font.lineHeight),
  } as CSSProperties;
  return (
    <Tag
      lang={text.lang}
      dir={directionOf(text.lang)}
      className={className === undefined ? styles.text : `${styles.text} ${className}`}
      data-nabu-text=""
      data-script={scriptOf(text.lang)}
      data-orthography={text.orthography}
      id={id}
      style={style}
    >
      {text.tokens.map((token, index) => (
        <TokenView key={index} token={token} index={index} ruby={ruby} />
      ))}
    </Tag>
  );
};
