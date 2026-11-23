/**
 * Debug mode: which card this is, exactly. Its full id (`cardId`: its course, its orthography and the
 * exercise's id, which begins with its kind), and, where the app can make one (`cardLink`), a link that
 * opens this very card again on any device: the app puts the card itself in the link. A copy goes to
 * the clipboard; where the clipboard is shut, the link shows in a field to copy.
 */
import { cardId, type CourseView, type Exercise } from "@nabu/core/lesson";
import { Fragment, useState, type JSX } from "react";
import { useTranslator } from "../context.tsx";
import styles from "./Player.module.css";

type Copy = { readonly tag: "idle" } | { readonly tag: "copied" } | { readonly tag: "shown"; readonly url: string };

export const DebugCard = ({
  course,
  ex,
  cardLink,
}: {
  readonly course: Pick<CourseView, "id" | "orthography">;
  readonly ex: Exercise;
  readonly cardLink?: ((ex: Exercise) => Promise<string>) | undefined;
}): JSX.Element => {
  const t = useTranslator();
  const [copy, setCopy] = useState<Copy>({ tag: "idle" });
  const copyLink = async (): Promise<void> => {
    if (cardLink === undefined) return;
    const url = await cardLink(ex);
    try {
      await navigator.clipboard.writeText(url);
      setCopy({ tag: "copied" });
    } catch {
      setCopy({ tag: "shown", url });
    }
  };
  const id = cardId(course, ex);
  return (
    <p className={`${styles.muted} ${styles.debugCard}`} data-debug-template={ex.template}>
      {/* An id is code: left to right, whatever the chrome's direction. */}
      <code className={styles.debugId} dir="ltr" data-debug-card={id}>
        {/* Broken after a slash, between course, orthography and exercise; never at an id's own hyphen. */}
        {id.split("/").map((part, i, parts) => (
          <Fragment key={i}>
            <span className={styles.debugIdPart}>{i < parts.length - 1 ? `${part}/` : part}</span>
            {i < parts.length - 1 && <wbr />}
          </Fragment>
        ))}
      </code>
      {cardLink !== undefined && (
        <button type="button" className={styles.textButton} onClick={() => void copyLink()} data-action="copy-card-link">
          {t.format(copy.tag === "copied" ? "debug.card.copied" : "debug.card.copy")}
        </button>
      )}
      {copy.tag === "shown" && (
        <input
          className={styles.debugLink}
          readOnly
          dir="ltr"
          value={copy.url}
          aria-label={t.format("debug.card.link")}
          onFocus={(e) => e.currentTarget.select()}
          data-card-link=""
        />
      )}
    </p>
  );
};
