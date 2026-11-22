/**
 * A record of the Data page's Lexicon and Language views (core `DataNode`), rendered without
 * knowing any field: keys and code as code, left to right in the interface's own face; text through
 * <T>, in its own language and direction (target-language text sized as the course's); lists and
 * records laid out with logical properties, so RTL chrome and vertical writing lay them out alike.
 * A bundle lexeme's feature says whether its entry stores it or a default of its language gives it.
 * A record or a list of plain values only (a form's feature values, a provenance, a word's
 * spellings) is flat: it reads on one line, pair by pair, so a long entry stays short.
 */
import type { DataNode } from "@nabu/core/lesson";
import type { JSX } from "react";
import { useTranslator } from "../context.tsx";
import { T } from "../T.tsx";
import styles from "./Data.module.css";

const NOTE_MESSAGES = { stored: "data.lexicon.stored", default: "data.lexicon.default" } as const;

/** A value with nothing under it: code or text. */
const plain = (node: DataNode): boolean => node.kind === "code" || node.kind === "text";

export const DataTree = ({ node }: { readonly node: DataNode }): JSX.Element => {
  const t = useTranslator();
  switch (node.kind) {
    case "code":
      return (
        <code className={styles.code} dir="ltr" data-tree="code">
          {node.value}
        </code>
      );
    case "text":
      return <T className={styles.treeText} text={node.text} />;
    case "list":
      return node.items.length === 0 ? (
        <span className={styles.treeNone} data-tree="none">
          {t.format("data.tree.none")}
        </span>
      ) : (
        <ol className={styles.treeList} data-tree="list" data-flat={node.items.every(plain) ? "" : undefined}>
          {node.items.map((item, i) => (
            <li key={i} className={styles.treeItem}>
              <DataTree node={item} />
            </li>
          ))}
        </ol>
      );
    case "record":
      return node.fields.length === 0 ? (
        <span className={styles.treeNone} data-tree="none">
          {t.format("data.tree.none")}
        </span>
      ) : (
        <dl className={styles.treeRecord} data-tree="record" data-flat={node.fields.every((field) => plain(field.value)) ? "" : undefined}>
          {node.fields.map((field) => (
            <div key={field.key} className={styles.treeField} data-key={field.key} data-note={field.note}>
              <dt className={styles.treeKey}>
                <code className={styles.code} dir="ltr">
                  {field.key}
                </code>
                {field.note !== undefined && <span className={styles.note}>{t.format(NOTE_MESSAGES[field.note])}</span>}
              </dt>
              <dd className={styles.treeValue}>
                <DataTree node={field.value} />
              </dd>
            </div>
          ))}
        </dl>
      );
  }
};
