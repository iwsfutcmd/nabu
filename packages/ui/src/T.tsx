/**
 * <T>: the only way language data reaches the DOM (gameplan §11.1).
 *
 * - `lang` is the TaggedText's tag, so screen readers switch voice, Han glyphs
 *   follow the region (yue-Hant-HK vs zh-Hant-TW) and spellcheckers behave.
 * - `dir` comes from the script (Intl-independent CLDR table), never from the
 *   language name or the surrounding UI. An element with `dir` is a bidi
 *   isolate, so target text never reorders the chrome around it.
 * - Fonts and line height come from the orthography profile, else the script. A
 *   family whose stylesheet loads with its text (fonts.ts: the Han families) is
 *   loaded when text first names it.
 * - Tokens are wrapped whole (§6.8): a cursive or conjunct-forming run is never
 *   split into per-letter elements. Ruby splits only at RubySegment bases.
 * - Vocalization (§6.6): text is stored vocalized; `marks="hide"` strips the
 *   profile's mark set for display only, never in the data.
 */
import { openLetters, schemeSpelling } from "@nabu/core";
import { lexemeIdsOf } from "@nabu/core/lesson";
import { graphemeCount, parseExemplarSet } from "@nabu/core/text";
import { directionOf, fontStackFor, italicAllowed, scriptOf } from "@nabu/i18n";
import type { SchemeId, TaggedText, Token } from "@nabu/schema";
import { Fragment, useCallback, useMemo, useRef, type CSSProperties, type JSX } from "react";
import { useIsTarget, useOrthography } from "./context.tsx";
import { useFonts } from "./fonts.ts";
import { useHomograph, useOpenLettersKept, useReadingFaded, useWordStatus, type Marks } from "./marks.tsx";
import { useRubyLift } from "./ruby-lift.ts";
import styles from "./T.module.css";

export interface TProps {
  readonly text: TaggedText;
  readonly as?: "span" | "div" | "p";
  /** Which ruby layer to show, by scheme (e.g. "jyutping"). Off by default. */
  readonly ruby?: SchemeId | false;
  /**
   * Show or hide the profile's vowel marks (harakat), or show them only on the words the learner is
   * still learning ("new", P12: WordStatusProvider says which). Shown by default.
   */
  readonly marks?: Marks;
  /**
   * Token indexes to mark as wrong (the parts of an answer that differ, §11.6): the error style. A
   * marked word keeps its reading where readings fade (ADR 0131): it is the word to look at again.
   */
  readonly highlight?: readonly number[];
  /**
   * The token a clip is saying right now (karaoke): marked in the focus style, never in the error
   * style of `highlight`, so a sentence read out after a right answer shows no "mistakes" (P7).
   */
  readonly current?: number | undefined;
  /**
   * Token indexes a card asks about (the word whose vowel marks or reading to write, ADR 0095):
   * marked in the focus style, never the style of a wrong answer, and as a <mark> for screen readers.
   */
  readonly emphasis?: readonly number[];
  /** A ruby segment (one Han character) to emphasize: reading-disambiguation. */
  readonly focus?: { readonly token: number; readonly segment: number };
  readonly className?: string;
  readonly id?: string;
  /**
   * Tap-for-gloss (Phase 6): lexical tokens become buttons that report their index. The token
   * stays whole (§6.8); `pressed` marks the one whose gloss is open. A pressed word keeps its
   * reading where readings fade (ADR 0131): tapping is how a faded reading is looked up.
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

/**
 * Scripts whose readings are lifted by each word's ink (ruby-lift.ts), as T.module.css lifts them:
 * Arabic, where Nastaliq stacks letters far over the em box.
 */
const INK_LIFTED: ReadonlySet<string> = new Set(["Arab"]);

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
  readonly emphasized: boolean;
  /** Being said by a clip right now (karaoke). */
  readonly spoken: boolean;
  readonly focus: number | undefined;
  readonly onPress: ((index: number) => void) | undefined;
  readonly pressed: boolean;
  /** How far its own reading needs lifting over where the browser sets it, in its em (ruby-lift.ts), once measured: its line's readings then take the most any needs. */
  readonly lift: number | undefined;
  /** Its reading keeps only what the script leaves unwritten (ADR 0141): the word's reading has faded. */
  readonly open: boolean;
  /** Its spelling is read more than one way in the course (ADR 0140). */
  readonly homograph: boolean;
  /** The orthography it is written in: a scheme stated `of` it reads what each segment's letters leave open (ADR 0148). */
  readonly orthography: string;
}

const TokenView = ({ token, index, ruby, rubyLang, strip, highlighted, emphasized, spoken, focus, onPress, pressed, lift, open, homograph, orthography }: TokenViewProps): JSX.Element => {
  const show = (text: string): string => (strip === undefined ? text : text.replace(strip, ""));
  const full = ruby === false ? undefined : token.ruby?.[ruby];
  // Minimal ruby (ADR 0141): each segment's unwritten letters, a dot for the rest; none where nothing is open.
  // With the letters under it, only what they leave open (ADR 0148).
  const minimal =
    ruby === false || !open || full === undefined ? full : full.map((segment) => ({ ...segment, text: openLetters(ruby, segment.text, schemeSpelling(ruby, orthography, segment.base)) }));
  const segments = minimal !== undefined && minimal.every((segment) => segment.text === "") ? undefined : minimal;
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
      <ruby className={styles.ruby} data-lift={lift?.toFixed(3)} style={lift === undefined ? undefined : ({ "--nabu-ruby-lift": lift.toFixed(3) } as CSSProperties)}>
        {segments.map((segment, i) => (
          <Fragment key={i}>
            {base(segment.base, i)}
            <rt lang={rubyLang} data-script={rubyLang === undefined ? undefined : scriptOf(rubyLang)}>
              {segment.text}
            </rt>
          </Fragment>
        ))}
      </ruby>
    );
  if (onPress !== undefined && (token.kind === "lexical" || token.kind === "number")) {
    return (
      <button
        type="button"
        className={`${styles.token} ${styles.pressable}`}
        data-kind={token.kind}
        data-index={index}
        data-tcy={tcy || undefined}
        data-highlight={highlighted || undefined}
        data-emphasis={emphasized || undefined}
        data-current={spoken || undefined}
        data-homograph={homograph || undefined}
        data-open-letters={(open && segments !== undefined) || undefined}
        aria-pressed={pressed}
        onClick={() => onPress(index)}
      >
        {content}
      </button>
    );
  }
  const Tag = emphasized ? "mark" : "span";
  return (
    <Tag
      className={styles.token}
      data-kind={token.kind}
      data-index={index}
      data-tcy={tcy || undefined}
      data-highlight={highlighted || undefined}
      data-emphasis={emphasized || undefined}
      data-current={spoken || undefined}
      data-homograph={homograph || undefined}
      data-open-letters={(open && segments !== undefined) || undefined}
    >
      {content}
    </Tag>
  );
};

/**
 * Whether <T> shows any reading of a text here in a scheme: a word that has one, and whose reading has
 * not faded (ADR 0131: readings on new words only, inside a lesson or story).
 */
export const useShowsRuby = (): ((text: TaggedText, scheme: SchemeId) => boolean) => {
  const faded = useReadingFaded();
  const keepOpen = useOpenLettersKept();
  // A faded word may keep what the script leaves unwritten (ADR 0141).
  const shows = (t: Token, scheme: SchemeId, orthography: string): boolean =>
    !faded(lexemeIdsOf(t), t.surface, orthography) || (keepOpen && (t.ruby?.[scheme] ?? []).some((segment) => openLetters(scheme, segment.text, schemeSpelling(scheme, orthography, segment.base)) !== ""));
  return (text, scheme) => text.tokens.some((t) => (t.ruby?.[scheme]?.length ?? 0) > 0 && shows(t, scheme, text.orthography));
};

export const T = ({ text, as: Tag = "span", ruby = false, marks = "show", highlight, emphasis, current, focus, className, id, onTokenPress, pressed }: TProps): JSX.Element => {
  const profile = useOrthography(text.orthography);
  const target = useIsTarget(text.orthography);
  const status = useWordStatus();
  const faded = useReadingFaded();
  const keepOpen = useOpenLettersKept();
  const homograph = useHomograph();
  const markSet = marks === "show" ? undefined : profile?.match?.marks?.set;
  const strip = useMemo(() => markStripper(markSet), [markSet]);
  // "new": a word the learner knows loses its marks; one still being learned (or unknown) keeps them.
  const known = (token: Token): boolean => status !== null && !status.isNew(lexemeIdsOf(token), token.surface, text.orthography);
  // Readings on new words only (ADR 0131): a word whose reading the learner has shown goes without,
  // unless it is marked (the word feedback corrects) or tapped (the word looked up): those show it.
  const looked = (index: number): boolean => highlight?.includes(index) === true || pressed === index;
  const fadedAt = (token: Token, index: number): boolean => ruby !== false && !looked(index) && faded(lexemeIdsOf(token), token.surface, text.orthography);
  // A faded reading goes, or keeps only what the script leaves unwritten (ADR 0141).
  const rubyOf = (token: Token, index: number): SchemeId | false => (fadedAt(token, index) && !keepOpen ? false : ruby);
  const stripOf = (token: Token): RegExp | undefined => (marks === "hide" || (marks === "new" && known(token)) ? strip : undefined);
  const font = fontStackFor(text.lang, profile?.fonts);
  useFonts(font.family);
  const rubyLang = ruby === false ? undefined : profile?.annotations?.find((a) => a.kind === "reading" && a.scheme === ruby)?.lang;
  // A layer in another script than its text loads that script's face too: the characters over
  // Jyutping (ADR 0126) need the Han font that Latin text would never load.
  const rubyFont = rubyLang === undefined ? undefined : fontStackFor(rubyLang).family;
  useFonts(rubyFont ?? "");
  // Readings over a script whose ink rises far over the em box (Nastaliq) stand a gap over their line's tallest word.
  const script = scriptOf(text.lang) ?? "";
  const element = useRef<HTMLElement | null>(null);
  const setElement = useCallback((el: HTMLElement | null): void => {
    element.current = el;
  }, []);
  const liftOf = useRubyLift({ family: font.family, lineHeight: font.lineHeight, ruby: rubyFont, script }, ruby !== false && INK_LIFTED.has(script), element);
  const liftFor = (token: Token, index: number): number | undefined => {
    const scheme = rubyOf(token, index);
    const strip = stripOf(token);
    return scheme === false || token.ruby?.[scheme] === undefined ? undefined : liftOf(strip === undefined ? token.surface : token.surface.replace(strip, ""));
  };
  const style = {
    "--nabu-text-font": font.family,
    "--nabu-text-line-height": String(font.lineHeight),
    ...(rubyFont === undefined ? {} : { "--nabu-ruby-font": rubyFont }),
    ...(font.scale === 1 ? {} : { "--nabu-text-scale": String(font.scale) }),
  } as CSSProperties;
  return (
    <Tag
      lang={text.lang}
      dir={directionOf(text.lang)}
      className={className === undefined ? styles.text : `${styles.text} ${className}`}
      data-nabu-text=""
      data-script={scriptOf(text.lang)}
      data-upright={italicAllowed(text.lang) ? undefined : ""}
      data-orthography={text.orthography}
      data-scaled={font.scale === 1 ? undefined : ""}
      data-target={target ? "" : undefined}
      id={id}
      style={style}
      ref={setElement}
    >
      {text.tokens.map((token, index) => (
        <TokenView
          key={index}
          token={token}
          index={index}
          ruby={rubyOf(token, index)}
          rubyLang={rubyLang}
          strip={stripOf(token)}
          lift={liftFor(token, index)}
          highlighted={highlight?.includes(index) ?? false}
          emphasized={emphasis?.includes(index) ?? false}
          spoken={current === index}
          focus={focus?.token === index ? focus.segment : undefined}
          onPress={onTokenPress}
          pressed={pressed === index}
          open={keepOpen && fadedAt(token, index)}
          homograph={token.kind === "lexical" && homograph(token.surface, text.orthography)}
          orthography={text.orthography}
        />
      ))}
    </Tag>
  );
};
