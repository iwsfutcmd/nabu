/**
 * Demo "exercise card" for the Phase 0 visual matrix (gameplan §16). It is
 * not the lesson player (Phase 3); it exists to exercise the three language
 * contexts at once:
 *
 * - UI chrome in the UI locale (lang/dir from the translator),
 * - the prompt in the support language (en-Latn, always LTR),
 * - answer row, word bank and input in the target orthography, whose
 *   direction and optional vertical mode come from the script and profile.
 */
import { tileGroups } from "@nabu/core/text";
import { courseName, directionOf } from "@nabu/i18n";
import type { OrthographyProfile, TaggedText } from "@nabu/schema";
import type { CSSProperties, JSX } from "react";
import { Button, Input, Label, ProgressBar, Switch, TextField } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { ArrowForwardIcon, CloseIcon, PlayIcon } from "../icons.tsx";
import { useReadings } from "../player/Readings.tsx";
import { T } from "../T.tsx";
import type { DemoExercise } from "./fixtures.ts";
import { DEMO_COURSE_NAMES } from "./names.ts";
import styles from "./ExerciseCard.module.css";

export type WritingMode = "horizontal-tb" | "vertical-rl" | "vertical-lr";

/**
 * The writing mode the target region actually uses: vertical only where the
 * profile allows it for the word bank (§11.4), and always for orthographies
 * that are only ever vertical (traditional Mongolian).
 */
export const effectiveWritingMode = (profile: OrthographyProfile, requested: WritingMode): WritingMode => {
  const layout = profile.layout;
  if (layout === undefined || layout.vertical === "none") return "horizontal-tb";
  if (layout.verticalPolicy === "always") return layout.vertical;
  const inScope = (layout.verticalScope ?? []).includes("wordbank");
  return requested === layout.vertical && inScope ? layout.vertical : "horizontal-tb";
};

/** Deterministic word-bank order: distractors interleaved after the first remaining tiles. */
const bankOrder = (remaining: readonly TaggedText[], distractors: readonly TaggedText[]): readonly TaggedText[] => {
  const out: TaggedText[] = [];
  const longest = Math.max(remaining.length, distractors.length);
  for (let i = 0; i < longest; i++) {
    const r = remaining[i];
    const d = distractors[i];
    if (r !== undefined) out.push(r);
    if (d !== undefined) out.push(d);
  }
  return out;
};

export interface ExerciseCardProps {
  readonly exercise: DemoExercise;
  readonly profile: OrthographyProfile;
  /** How many answer tiles are already placed (demo state). */
  readonly placed?: number;
  readonly writingMode?: WritingMode;
  readonly progress?: { readonly current: number; readonly total: number };
}

export const ExerciseCard = ({
  exercise,
  profile,
  placed = 1,
  writingMode = "horizontal-tb",
  progress = { current: 3, total: 10 },
}: ExerciseCardProps): JSX.Element => {
  const t = useTranslator();
  const mode = effectiveWritingMode(profile, writingMode);
  // The player's readings: what shows before the learner chooses, in vertical text too (ADR 0118).
  const readings = useReadings(profile);
  const layer = readings.layers[0]?.scheme;
  const ruby = readings.shown;
  const tiles = tileGroups(exercise.answer);
  const answerTiles = tiles.slice(0, placed);
  const bank = bankOrder(tiles.slice(placed), exercise.distractors);
  const targetDir = directionOf(exercise.answer.lang);
  const language = courseName(t, { id: exercise.course, target: exercise.answer.lang, names: DEMO_COURSE_NAMES[exercise.course] });
  const progressLabel = t.format("exercise.progress", progress);

  return (
    <section className={styles.card} data-exercise-card="" data-writing-mode={mode} data-vertical-denied={mode !== writingMode || undefined}>
      <header className={styles.header}>
        <Button className={styles.iconButton} aria-label={t.format("exercise.action.quit")}>
          <CloseIcon />
        </Button>
        <ProgressBar
          className={styles.progress}
          value={progress.current}
          minValue={0}
          maxValue={progress.total}
          aria-label={progressLabel}
          valueLabel={progressLabel}
        >
          {({ percentage }) => (
            <div className={styles.track} data-progress-track="">
              <div className={styles.fill} data-progress-fill="" style={{ "--nabu-progress": `${percentage ?? 0}%` } as CSSProperties} />
            </div>
          )}
        </ProgressBar>
      </header>

      <h2 className={styles.instruction}>{t.format("exercise.instruction.write-in", { language })}</h2>

      <div className={styles.promptRow}>
        <Button className={styles.iconButton} aria-label={t.format("exercise.action.play-audio")}>
          <PlayIcon />
        </Button>
        <div className={styles.prompt} data-ink-container="prompt" role="group" aria-label={t.format("exercise.prompt.label")}>
          <T as="p" text={exercise.prompt} />
        </div>
      </div>

      <div className={styles.target} dir={targetDir} data-target-region="" data-writing-mode={mode}>
        <div className={styles.answerRow} role="group" aria-label={t.format("exercise.answer.label")} data-answer-row="">
          {answerTiles.map((tile, i) => (
            <Button key={i} className={styles.tile} data-ink-container="tile">
              <T text={tile} ruby={ruby} />
            </Button>
          ))}
        </div>
        <div className={styles.bank} role="group" aria-label={t.format("exercise.wordbank.label")} data-word-bank="">
          {bank.map((tile, i) => (
            <Button key={i} className={styles.tile} data-ink-container="tile">
              <T text={tile} ruby={ruby} />
            </Button>
          ))}
        </div>
      </div>

      <div className={styles.meta}>
        <p className={styles.remaining}>{t.format("exercise.wordbank.remaining", { count: bank.length })}</p>
        {layer !== undefined && (
          <Switch className={styles.switch} isSelected={ruby !== false} onChange={(on) => readings.choose(on ? layer : false)}>
            <span className={styles.switchTrack} aria-hidden="true">
              <span className={styles.switchThumb} />
            </span>
            {t.format("exercise.readings.toggle")}
          </Switch>
        )}
      </div>

      <TextField className={styles.field}>
        <Label className={styles.label}>{t.format("exercise.answer.input-label", { language })}</Label>
        <Input
          className={styles.input}
          lang={exercise.answer.lang}
          dir={targetDir}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-answer-input=""
        />
      </TextField>

      <footer className={styles.footer}>
        <Button className={styles.secondary}>{t.format("exercise.action.skip")}</Button>
        <Button className={styles.primary}>
          {t.format("exercise.action.check")}
          <ArrowForwardIcon />
        </Button>
      </footer>
    </section>
  );
};
