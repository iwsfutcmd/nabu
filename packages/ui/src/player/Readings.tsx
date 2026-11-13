/**
 * Which reading layer shows as ruby (ADR 0071). An orthography may pin several (Classical
 * Chinese: Pinyin, Jyutping and Baxter's Middle Chinese); the learner shows one or none. With one
 * layer the control is the switch it always was; with several it is a choice among them. The
 * choice holds in vertical text too, where ruby sits beside the column (ADR 0118).
 */
import { readingScheme } from "@nabu/core";
import { localName } from "@nabu/i18n";
import type { AnnotationLayer, OrthographyProfile, SchemeId } from "@nabu/schema";
import { useState, type JSX } from "react";
import { Switch, ToggleButton, ToggleButtonGroup, type Key } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import styles from "./Player.module.css";

/** The profile's reading layers shown as ruby, in profile order. */
export const rubyLayersOf = (profile: OrthographyProfile | undefined): readonly (AnnotationLayer & { readonly scheme: SchemeId })[] =>
  (profile?.annotations ?? []).filter((a): a is AnnotationLayer & { readonly scheme: SchemeId } => a.kind === "reading" && a.render === "ruby" && a.scheme !== undefined);

/**
 * What shows before the learner chooses: their earlier choice where it is still a layer of this
 * profile; else the layer marked `default: on`; else, where every layer says off, none; else (a
 * profile that says nothing, yue) its first layer, as before.
 */
export const defaultRuby = (profile: OrthographyProfile | undefined, chosen?: SchemeId | false): SchemeId | false => {
  const layers = rubyLayersOf(profile);
  if (chosen === false || (chosen !== undefined && layers.some((l) => l.scheme === chosen))) return chosen;
  const on = layers.find((l) => l.default === "on");
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

/** The name of a reading scheme in the UI language, from its data (ADR 0109): Pinyin, Jyutping, Middle Chinese (Baxter). */
export const schemeName = (t: ReturnType<typeof useTranslator>, scheme: SchemeId): string => localName(t, readingScheme(scheme)?.name, `reading.scheme.${scheme}`) ?? scheme;

/** The readings control: a switch for one layer, a choice of layers (or none) for several. */
export const ReadingsControl = ({ readings }: { readonly readings: Readings }): JSX.Element | null => {
  const t = useTranslator();
  const { layers, shown, choose } = readings;
  const only = layers.length === 1 ? layers[0] : undefined;
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
    </div>
  );
};
