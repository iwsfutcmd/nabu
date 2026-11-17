/**
 * Which reading layer shows as ruby (ADR 0071). An orthography may pin several (Classical
 * Chinese: Pinyin, Jyutping and Baxter's Middle Chinese); the learner shows one or none. With one
 * layer the control is the switch it always was; with several it is a choice among them. The
 * choice holds in vertical text too, where ruby sits beside the column (ADR 0118).
 *
 * A layer that fades (`fade: by-facet`, ADR 0131: Jyutping over Cantonese, Schluessel over
 * Chaghatay) may show over every word or only over the words whose reading is still new; one such
 * layer is then a choice of three (All words, New words, Off), as vowel marks are.
 */
import { hasOpenLetters, readingScheme, readingTag } from "@nabu/core";
import { schemeName as nameOfScheme } from "@nabu/i18n";
import type { AnnotationLayer, OrthographyProfile, SchemeId, TaggedText } from "@nabu/schema";
import { useState, type JSX } from "react";
import { Switch, ToggleButton, ToggleButtonGroup, type Key } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import styles from "./Player.module.css";

/**
 * How a word's reading in a scheme is tagged as text of its own: the profile's reading layer names
 * its language (ADR 0071), else the scheme's data does (ADR 0109), else it takes the text it reads.
 */
export const readingTagIn = (profile: OrthographyProfile | undefined, scheme: string, base: Pick<TaggedText, "lang" | "orthography">): Pick<TaggedText, "lang" | "orthography"> => {
  const layer = profile?.annotations?.find((a) => a.kind === "reading" && a.scheme === scheme);
  if (layer?.lang !== undefined) return { lang: layer.lang, orthography: base.orthography };
  const lang = readingScheme(scheme)?.lang;
  return readingTag(scheme) ?? (lang === undefined ? base : { lang, orthography: base.orthography });
};

/** The profile's reading layers shown as ruby, in profile order. */
export const rubyLayersOf = (profile: OrthographyProfile | undefined): readonly (AnnotationLayer & { readonly scheme: SchemeId })[] =>
  (profile?.annotations ?? []).filter((a): a is AnnotationLayer & { readonly scheme: SchemeId } => a.kind === "reading" && a.render === "ruby" && a.scheme !== undefined);

/**
 * Readings over every word, or only over the words whose reading the learner has yet to show (ADR
 * 0131), or those and, over the words read before, only what the script leaves unwritten (ADR 0141).
 */
export type ReadingWords = "all" | "new" | "open";

/** Whether a reading layer may show over new words only: its reading is a skill the fold witnesses (ADR 0131). */
export const fades = (layer: AnnotationLayer | undefined): boolean => layer?.fade === "by-facet";

/**
 * Over which words readings show before the learner chooses: new words only where the profile's
 * first layer that fades says `on-for-new-words` (Cantonese, Chaghatay); else every word.
 */
export const defaultReadingWords = (profile: OrthographyProfile | undefined): ReadingWords =>
  rubyLayersOf(profile).some((l) => fades(l) && l.default === "on-for-new-words") ? "new" : "all";

/**
 * What shows before the learner chooses: their earlier choice where it is still a layer of this
 * profile; else the layer marked `default: on` (or on for new words); else, where every layer says
 * off, none; else (a profile that says nothing) its first layer, as before.
 */
export const defaultRuby = (profile: OrthographyProfile | undefined, chosen?: SchemeId | false): SchemeId | false => {
  const layers = rubyLayersOf(profile);
  if (chosen === false || (chosen !== undefined && layers.some((l) => l.scheme === chosen))) return chosen;
  const on = layers.find((l) => l.default === "on" || l.default === "on-for-new-words");
  if (on !== undefined) return on.scheme;
  if (layers.length > 0 && layers.every((l) => l.default !== undefined)) return false;
  return layers[0]?.scheme ?? false;
};

export interface Readings {
  readonly layers: readonly (AnnotationLayer & { readonly scheme: SchemeId })[];
  /** The layer shown as ruby now, or false: the same in horizontal and vertical text. */
  readonly shown: SchemeId | false;
  readonly choose: (scheme: SchemeId | false) => void;
}

export const useReadings = (profile: OrthographyProfile | undefined, chosen?: SchemeId | false, onChoose?: (scheme: SchemeId | false) => void): Readings => {
  const [shown, setShown] = useState<SchemeId | false>(() => defaultRuby(profile, chosen));
  return {
    layers: rubyLayersOf(profile),
    shown,
    choose: (scheme) => {
      setShown(scheme);
      onChoose?.(scheme);
    },
  };
};

const OFF = "off";

/** The which-words choice of a layer that fades: what is shown, and where a change goes. */
export interface WordsChoice {
  readonly shown: ReadingWords;
  readonly choose: (words: ReadingWords) => void;
}

const WORDS: readonly (readonly [ReadingWords, "player.readings.all" | "player.readings.new" | "player.readings.open"])[] = [
  ["all", "player.readings.all"],
  ["new", "player.readings.new"],
  ["open", "player.readings.open"],
];

/** The word choices a layer offers: "open" only where its scheme says what the script leaves unwritten (ADR 0141). */
const wordsFor = (scheme: SchemeId | undefined): typeof WORDS => WORDS.filter(([value]) => value !== "open" || (scheme !== undefined && hasOpenLetters(scheme)));

/** The name of a reading scheme in the UI language, from its data (ADR 0109): Pinyin, Jyutping, Middle Chinese (Baxter). */
export const schemeName = (t: ReturnType<typeof useTranslator>, scheme: SchemeId): string => nameOfScheme(t, readingScheme(scheme)?.names) ?? scheme;

/**
 * The readings control: a switch for one layer, a choice of layers (or none) for several. A layer
 * that fades, given `words`, adds where it shows: one such layer is a choice of All words, New
 * words and Off under its name; among several, the words choice follows the layer chosen.
 */
export const ReadingsControl = ({ readings, words }: { readonly readings: Readings; readonly words?: WordsChoice | undefined }): JSX.Element | null => {
  const t = useTranslator();
  const { layers, shown, choose } = readings;
  const only = layers.length === 1 ? layers[0] : undefined;
  if (only !== undefined && words !== undefined && fades(only)) {
    const label = schemeName(t, only.scheme);
    const selected = shown === false ? OFF : words.shown;
    return (
      <div className={styles.readings} data-toggle="readings" data-readings-shown={selected}>
        <span className={styles.readingsLabel} aria-hidden="true">
          {label}
        </span>
        <ToggleButtonGroup
          className={styles.segments}
          aria-label={label}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[selected]}
          onSelectionChange={(keys: Set<Key>) => {
            const [key] = [...keys];
            if (key === OFF) choose(false);
            else if (key === "all" || key === "new" || key === "open") {
              words.choose(key);
              choose(only.scheme);
            }
          }}
        >
          {wordsFor(only.scheme).map(([value, message]) => (
            <ToggleButton key={value} id={value} className={styles.segment} data-reading={value}>
              {t.format(message)}
            </ToggleButton>
          ))}
          <ToggleButton id={OFF} className={styles.segment} data-reading={OFF}>
            {t.format("player.readings.off")}
          </ToggleButton>
        </ToggleButtonGroup>
      </div>
    );
  }
  if (only !== undefined) {
    return (
      <Switch className={styles.switch} isSelected={shown !== false} onChange={(on) => choose(on ? only.scheme : false)} data-toggle="readings">
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchThumb} />
        </span>
        {t.format("exercise.readings.toggle")}
      </Switch>
    );
  }
  if (layers.length === 0) return null;
  const label = t.format("player.readings.label");
  return (
    <div className={styles.readings} data-toggle="readings">
      <span className={styles.readingsLabel} aria-hidden="true">
        {label}
      </span>
      <ToggleButtonGroup
        className={styles.segments}
        aria-label={label}
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[shown === false ? OFF : shown]}
        onSelectionChange={(keys: Set<Key>) => {
          const [key] = [...keys];
          if (key !== undefined) choose(key === OFF ? false : (String(key) as SchemeId));
        }}
      >
        <ToggleButton id={OFF} className={styles.segment} data-reading={OFF}>
          {t.format("player.readings.off")}
        </ToggleButton>
        {layers.map((l) => (
          <ToggleButton key={l.scheme} id={l.scheme} className={styles.segment} data-reading={l.scheme}>
            {schemeName(t, l.scheme)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {words !== undefined && fades(layers.find((l) => l.scheme === shown)) && <WordsControl words={words} scheme={shown === false ? undefined : shown} />}
    </div>
  );
};

/** Over which words the layer chosen among several shows (ADR 0131): All words or New words. */
const WordsControl = ({ words, scheme }: { readonly words: WordsChoice; readonly scheme: SchemeId | undefined }): JSX.Element => {
  const t = useTranslator();
  const label = t.format("player.readings.words");
  return (
    <ToggleButtonGroup
      className={styles.segments}
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[words.shown]}
      onSelectionChange={(keys: Set<Key>) => {
        const [key] = [...keys];
        if (key === "all" || key === "new" || key === "open") words.choose(key);
      }}
      data-reading-words={words.shown}
    >
      {wordsFor(scheme).map(([value, message]) => (
        <ToggleButton key={value} id={value} className={styles.segment} data-reading-words-choice={value}>
          {t.format(message)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
};
