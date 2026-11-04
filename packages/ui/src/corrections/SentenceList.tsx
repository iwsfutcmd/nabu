/**
 * The sentence list (ADR 0051): every sentence and story line of a course, one unit at a time,
 * each with a way to mark it as wrong. The learner's orthography comes first (with its ruby
 * readings, where the profile has them), then the course's other orthographies and the
 * translation, all through <T>. Items this device already corrected say so.
 */
import { correctablesByUnit, correctionKey, type Correctable } from "@nabu/core/corrections";
import type { CourseView } from "@nabu/core/lesson";
import type { SentenceReported, TaggedText } from "@nabu/schema";
import { useId, useMemo, type JSX } from "react";
import { Button } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { rubySchemeOf } from "../player/shared.ts";
import { T } from "../T.tsx";
import styles from "./Corrections.module.css";

export interface SentenceListProps {
  readonly course: CourseView;
  /** This device's corrections, by correctionKey. */
  readonly corrections: ReadonlyMap<string, SentenceReported>;
  /** The unit shown (default: the first). */
  readonly unit?: string | undefined;
  readonly onUnit: (unit: string) => void;
  readonly onCorrect: (target: Correctable) => void;
}

interface ItemProps {
  readonly course: CourseView;
  readonly target: Correctable;
  readonly corrected: boolean;
  readonly onCorrect: (target: Correctable) => void;
}

const Item = ({ course, target, corrected, onCorrect }: ItemProps): JSX.Element | null => {
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
      </div>
      <Button className={styles.small} onPress={() => onCorrect(target)} aria-describedby={textId} data-action="mark-incorrect">
        {t.format(corrected ? "corrections.edit" : "corrections.mark")}
      </Button>
    </li>
  );
};

const titleOf = (title: Readonly<Record<string, TaggedText>> | undefined, key: string): TaggedText | undefined => title?.[key];

export const SentenceList = ({ course, corrections, unit, onUnit, onCorrect }: SentenceListProps): JSX.Element => {
  const t = useTranslator();
  // Units with nothing to correct (the generated number drills) are left out.
  const units = useMemo(() => correctablesByUnit(course).filter((u) => u.sentences.length > 0 || u.stories.some((s) => s.lines.length > 0)), [course]);
  const current = units.find((u) => u.unit.id === unit) ?? units[0];
  const unitName = (n: number, title: TaggedText | undefined): JSX.Element => (title === undefined ? <>{t.format("corrections.page.unit", { number: n + 1 })}</> : <T text={title} />);
  const item = (target: Correctable): JSX.Element => (
    <Item key={correctionKey(target.item, target.step)} course={course} target={target} corrected={corrections.has(correctionKey(target.item, target.step))} onCorrect={onCorrect} />
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
          <ol className={styles.items}>{current.sentences.map(item)}</ol>
          {current.stories.map(({ story, lines }) => {
            const title = story.title[course.supportKey];
            return (
              <section key={story.id} aria-labelledby={`story-${story.id}`} data-story-items={story.id}>
                <h3 className={styles.storyHeading} id={`story-${story.id}`}>
                  <span>{t.format("corrections.page.story")}</span>
                  {title !== undefined && <T text={title} />}
                </h3>
                <ol className={styles.items}>{lines.map(item)}</ol>
              </section>
            );
          })}
        </section>
      )}
    </div>
  );
};
