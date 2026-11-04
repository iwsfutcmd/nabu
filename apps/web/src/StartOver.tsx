/**
 * "Start this course over": a confirmed progress_reset event. The log keeps every earlier event;
 * the projection forgets what came before the reset in this course (what the learner knows, the
 * lessons done, placement and mistakes), on every device once it syncs. XP, the streak and
 * achievements stay: they record practice that happened.
 */
import { useTranslator } from "@nabu/ui";
import { useState, type JSX } from "react";
import { Button, Dialog, DialogTrigger, Heading, Modal } from "react-aria-components";
import styles from "./App.module.css";

/** Shown while the course has progress to forget, and after a reset to say it happened. */
export const StartOver = ({ language, hasProgress, onReset }: { language: string; hasProgress: boolean; onReset: () => void }): JSX.Element | null => {
  const t = useTranslator();
  const [done, setDone] = useState(false);
  if (!hasProgress && !done) return null;
  return (
    <section className={styles.startOver} aria-labelledby="start-over-title" data-start-over="">
      <h2 className={styles.subheading} id="start-over-title">
        {t.format("app.reset.title")}
      </h2>
      {hasProgress && <p className={styles.muted}>{t.format("app.reset.hint", { language })}</p>}
      {done && (
        <p className={styles.muted} role="status" data-reset-done="">
          {t.format("app.reset.done", { language })}
        </p>
      )}
      {hasProgress && (
        <DialogTrigger>
          <Button className={styles.textButton} data-action="start-over">
            {t.format("app.reset.open")}
          </Button>
          <Modal className={styles.modal} isDismissable>
            <Dialog className={styles.dialog} role="alertdialog" data-start-over-dialog="">
              {({ close }) => (
                <>
                  <Heading slot="title" className={styles.subheading}>
                    {t.format("app.reset.confirm-title", { language })}
                  </Heading>
                  <p>{t.format("app.reset.confirm-body")}</p>
                  <div className={styles.dialogActions}>
                    <Button className={styles.textButton} onPress={close} autoFocus data-action="keep-progress">
                      {t.format("app.reset.cancel")}
                    </Button>
                    <Button
                      className={styles.dangerButton}
                      onPress={() => {
                        onReset();
                        setDone(true);
                        close();
                      }}
                      data-action="confirm-start-over"
                    >
                      {t.format("app.reset.confirm")}
                    </Button>
                  </div>
                </>
              )}
            </Dialog>
          </Modal>
        </DialogTrigger>
      )}
    </section>
  );
};
