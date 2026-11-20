/**
 * A word's parts as text (ADR 0152): a word as the course writes it, with what it means; a form by
 * its glossary entry. The card that builds a word lists them; the card that takes a word apart puts
 * each on a tile, and its feedback and the end of a session list the right ones.
 */
import type { WordPart } from "@nabu/core/lesson";
import { directionOf } from "@nabu/i18n";
import type { SchemeId } from "@nabu/schema";
import type { JSX } from "react";
import type { Marks } from "../marks.tsx";
import { T } from "../T.tsx";
import styles from "./Player.module.css";

interface PartLabelProps {
  readonly part: WordPart;
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
}

/** A part as a card shows it: a word as the course writes it, with what it means; a form by its name. */
export const PartLabel = ({ part, ruby, marks }: PartLabelProps): JSX.Element => (
  <>
    {part.text !== undefined && <T text={part.text} ruby={ruby} marks={marks} className={styles.partWord} />}
    <T text={part.gloss} className={part.text === undefined ? styles.partName : styles.partGloss} />
  </>
);

interface PartsListProps {
  readonly parts: readonly WordPart[];
  /** The language the word is in: its script gives the list its direction. */
  readonly lang: string;
  readonly label: string;
  readonly ruby: SchemeId | false;
  readonly marks: Marks;
  readonly id?: string | undefined;
}

/** A word's parts in the word's own order, in its language's direction whatever the chrome's. */
export const PartsList = ({ parts, lang, label, ruby, marks, id }: PartsListProps): JSX.Element => (
  <ul className={styles.parts} dir={directionOf(lang)} aria-label={label} id={id} data-parts="">
    {parts.map((part) => (
      <li key={part.kc} className={styles.part} data-part={part.kc} data-part-own={part.base === true ? "" : undefined}>
        <PartLabel part={part} ruby={ruby} marks={marks} />
      </li>
    ))}
  </ul>
);
