/**
 * The sentence list (ADR 0051): every sentence and story line of a course, one unit at a time,
 * each with a way to mark it as wrong. The learner's orthography comes first (with its ruby
 * readings, where the profile has them), then the course's other orthographies and the
 * translation, all through <T>. Items this device already corrected say so.
 *
 * With `review` (a reviewer, ADR 0072), each sentence and each story can be signed off ("Looks
 * right"), and a whole unit at once; items the source already marks reviewed say so instead.
 */
import { correctablesByUnit, correctionKey, signedOff, type Correctable, type SignOffKind, type UnitCorrectables } from "@nabu/core/corrections";
import type { CourseView } from "@nabu/core/lesson";
import type { SentenceReported, TaggedText } from "@nabu/schema";
import { useId, useMemo, type JSX, type ReactNode } from "react";
import { Button, ToggleButton } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { rubySchemeOf } from "../player/shared.ts";
import { T } from "../T.tsx";
import styles from "./Corrections.module.css";

/** How a signed-off item is known on the device: "sentence:<id>" or "story:<id>". */
export const signOffKey = (kind: SignOffKind, item: string): string => `${kind}:${item}`;

/** A reviewer's controls (ADR 0072): what this device signed off, and how to sign off more. */
export interface ReviewControls {
  readonly signed: ReadonlySet<string>;
  readonly onSignOff: (kind: SignOffKind, item: string, on: boolean) => void;
  /** Every item of the unit that is neither marked incorrect nor reviewed already. */
  readonly onSignOffUnit: (unit: UnitCorrectables) => void;
}

export interface SentenceListProps {
  readonly course: CourseView;
  /** This device's corrections, by correctionKey. */
  readonly corrections: ReadonlyMap<string, SentenceReported>;
  /** The unit shown (default: the first). */
  readonly unit?: string | undefined;
  readonly onUnit: (unit: string) => void;
  readonly onCorrect: (target: Correctable) => void;
  readonly review?: ReviewControls | undefined;
  /** More under each item: the review workspace's clip, accept sets and answer field (ADR 0074). */
  readonly details?: ((target: Correctable) => ReactNode) | undefined;
}

/** A sign-off toggle, or the badge of an item the source already marks reviewed. */
const SignOff = ({ kind, item, reviewed, review, label, describedBy }: { kind: SignOffKind; item: string; reviewed: boolean; review: ReviewControls; label: string; describedBy: string }): JSX.Element => {
  const t = useTranslator();
  if (reviewed) {
    return (
      <p className={styles.badge} data-reviewed="">
        {t.format("review.reviewed")}
      </p>
    );
  }
  const on = review.signed.has(signOffKey(kind, item));
  return (
    <ToggleButton className={styles.small} isSelected={on} onChange={(v) => review.onSignOff(kind, item, v)} aria-describedby={describedBy} data-action="sign-off" data-signed-off={on || undefined}>
      {label}
    </ToggleButton>
  );
};

interface ItemProps {
  readonly course: CourseView;
  readonly target: Correctable;
  readonly corrected: boolean;
  readonly onCorrect: (target: Correctable) => void;
  /** For a sentence, with a reviewer's controls: whether the source marks it reviewed. */
  readonly review?: { readonly controls: ReviewControls; readonly reviewed: boolean } | undefined;
  readonly details?: ((target: Correctable) => ReactNode) | undefined;
}

const Item = ({ course, target, corrected, onCorrect, review, details }: ItemProps): JSX.Element | null => {
  const t = useTranslator();
  const textId = useId();
  const own = target.forms[course.orthography];
  const ruby = useMemo(() => rubySchemeOf(course.profiles.get(course.orthography)?.source) ?? false, [course]);
  if (own === undefined) return null;
  const others = Object.entries(target.forms)
    .filter(([o]) => o !== course.orthography)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return (
    <li className={styles.item} data-correctable={correctionKey(target.item, target.step)} data-corrected={corrected || undefined}>
      <div className={styles.texts} id={textId} data-ink-container={correctionKey(target.item, target.step)}>
        <T as="p" className={styles.target} text={own} ruby={ruby} />
        {others.map(([o, text]) => (
          <T key={o} as="p" className={styles.other} text={text} />
        ))}
        {target.translation !== undefined && <T as="p" className={styles.translation} text={target.translation} />}
        {corrected && (
          <p className={styles.badge} data-correction-pending="">
            {t.format("corrections.pending")}
          </p>
        )}
        {details?.(target)}
      </div>
      <div className={styles.itemActions}>
        {review !== undefined && target.kind === "sentence" && (
          <SignOff kind="sentence" item={target.item} reviewed={review.reviewed} review={review.controls} label={t.format("review.looks-right")} describedBy={textId} />
        )}
        <Button className={styles.small} onPress={() => onCorrect(target)} aria-describedby={textId} data-action="mark-incorrect">
          {t.format(corrected ? "corrections.edit" : "corrections.mark")}
        </Button>
      </div>
    </li>
  );
};

const titleOf = (title: Readonly<Record<string, TaggedText>> | undefined, key: string): TaggedText | undefined => title?.[key];

export const SentenceList = ({ course, corrections, unit, onUnit, onCorrect, review, details }: SentenceListProps): JSX.Element => {
  const t = useTranslator();
  // Units with nothing to correct (the generated number drills) are left out.
  const units = useMemo(() => correctablesByUnit(course).filter((u) => u.sentences.length > 0 || u.stories.some((s) => s.lines.length > 0)), [course]);
  const current = units.find((u) => u.unit.id === unit) ?? units[0];
  const unitName = (n: number, title: TaggedText | undefined): JSX.Element => (title === undefined ? <>{t.format("corrections.page.unit", { number: n + 1 })}</> : <T text={title} />);
  const reviewedSentences = useMemo(() => new Set(course.units.flatMap((u) => u.sentences.filter((s) => signedOff(s.provenance)).map((s) => s.id))), [course]);
  const item = (target: Correctable): JSX.Element => (
    <Item
      key={correctionKey(target.item, target.step)}
      course={course}
      target={target}
      corrected={corrections.has(correctionKey(target.item, target.step))}
      onCorrect={onCorrect}
      review={review === undefined ? undefined : { controls: review, reviewed: reviewedSentences.has(target.item) }}
      details={details}
    />
  );
  return (
    <div className={styles.list} data-sentence-list={course.id}>
      <nav aria-label={t.format("corrections.page.units")}>
        <ul className={styles.units}>
          {units.map(({ unit: u }, n) => (
            <li key={u.id}>
              <Button className={styles.unit} onPress={() => onUnit(u.id)} {...(u.id === current?.unit.id ? { "aria-current": "true" as const } : {})} data-unit={u.id}>
                {unitName(n, titleOf(u.title, course.supportKey))}
              </Button>
            </li>
          ))}
        </ul>
      </nav>
      {current !== undefined && (
        <section aria-labelledby={`unit-${current.unit.id}`} data-unit-items={current.unit.id}>
          <h2 className={styles.heading} id={`unit-${current.unit.id}`}>
            {unitName(units.indexOf(current), titleOf(current.unit.title, course.supportKey))}
          </h2>
          {review !== undefined && (
            <Button className={styles.small} onPress={() => review.onSignOffUnit(current)} data-action="sign-off-unit">
              {t.format("review.unit")}
            </Button>
          )}
          <ol className={styles.items}>{current.sentences.map(item)}</ol>
          {current.stories.map(({ story, lines }) => {
            const title = story.title[course.supportKey];
            return (
              <section key={story.id} aria-labelledby={`story-${story.id}`} data-story-items={story.id}>
                <h3 className={styles.storyHeading} id={`story-${story.id}`}>
                  <span>{t.format("corrections.page.story")}</span>
                  {title !== undefined && <T text={title} />}
                </h3>
                {review !== undefined && (
                  <SignOff kind="story" item={story.id} reviewed={signedOff(story.provenance)} review={review} label={t.format("review.story-looks-right")} describedBy={`story-${story.id}`} />
                )}
                <ol className={styles.items}>{lines.map(item)}</ol>
              </section>
            );
          })}
        </section>
      )}
    </div>
  );
};
