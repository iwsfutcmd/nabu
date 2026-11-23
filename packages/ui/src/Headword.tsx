/**
 * A word shown as itself (a new word, the word list, a tapped word's meaning), with its principal
 * parts after its lemma where its category has them (docs/rules-design.md, stage 4; core
 * `principalParts`: an apc verb's he-present after its he-past). The lemma and its parts are one run
 * in the word's own direction (from its script, as `<T>` sets it), so in a right-to-left script the
 * lemma comes first there too; each part is a text of its own, set off by a rule the stylesheet draws:
 * no separator is written. Without parts it is the lemma's `<T>` alone, as before.
 */
import { directionOf } from "@nabu/i18n";
import type { SchemeId, TaggedText } from "@nabu/schema";
import type { JSX } from "react";
import type { Marks } from "./marks.tsx";
import { T } from "./T.tsx";
import styles from "./Headword.module.css";

export interface HeadwordProps {
  readonly text: TaggedText;
  /** Its principal parts (core `principalParts`), in order. */
  readonly parts: readonly TaggedText[];
  readonly as?: "span" | "p" | "div";
  readonly className?: string | undefined;
  readonly ruby?: SchemeId | false;
  readonly marks?: Marks;
}

export const Headword = ({ text, parts, as = "span", className, ruby = false, marks = "show" }: HeadwordProps): JSX.Element => {
  if (parts.length === 0) return <T as={as} {...(className === undefined ? {} : { className })} text={text} ruby={ruby} marks={marks} />;
  const Tag = as;
  return (
    <Tag className={[className, styles.headword].filter(Boolean).join(" ")} dir={directionOf(text.lang)} data-principal-parts={parts.length}>
      <T text={text} ruby={ruby} marks={marks} />
      {parts.map((part, i) => (
        <T key={i} className={styles.part} text={part} ruby={ruby} marks={marks} />
      ))}
    </Tag>
  );
};
