/**
 * Debug mode: which card this is, exactly. Its kind and its id, and, where the app can make one
 * (`cardLink`), a link that opens this very card again on any device: the app puts the card itself in
 * the link. A copy goes to the clipboard; where the clipboard is shut, the link shows in a field to copy.
 */
import type { Exercise } from "@nabu/core/lesson";
import { useState, type JSX } from "react";
import { useTranslator } from "../context.tsx";
import styles from "./Player.module.css";

type Copy = { readonly tag: "idle" } | { readonly tag: "copied" } | { readonly tag: "shown"; readonly url: string };

export const DebugCard = ({ ex, cardLink }: { readonly ex: Exercise; readonly cardLink?: ((ex: Exercise) => Promise<string>) | undefined }): JSX.Element => {
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
  return (
    <p className={styles.muted} data-debug-template={ex.template}>
      {t.format("debug.template", { template: ex.template })}{" "}
      {/* An id is code: left to right, whatever the chrome's direction. */}
      <code dir="ltr" data-debug-card={ex.id}>
        {ex.id}
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
