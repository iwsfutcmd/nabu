/**
 * "Start this course over": a confirmed progress_reset event for one course (one language, every
 * script it is taught in). The log keeps every earlier event; the projection forgets what came
 * before the reset in this course (what the learner knows, the lessons done, placement and
 * mistakes), on every device once it syncs. XP, the streak and achievements stay.
 *
 * It cannot happen by accident: the dialog asks the learner to type the course's name, as it
 * reads in their UI language, before the button works. The comparison ignores case, accents and
 * surrounding spaces (an Intl.Collator at base strength in the UI locale) and waits for any IME
 * composition to end, so learners typing with an input method are never cut short.
 */
import { useTranslator } from "@nabu/ui";
import { useMemo, useState, type JSX } from "react";
import { Button, Dialog, DialogTrigger, Heading, Input, Label, Modal, Text, TextField } from "react-aria-components";
import styles from "./App.module.css";

/** Whether `typed` names the course: same letters, ignoring case, accents and outer spaces. */
const namesCourse = (collator: Intl.Collator, typed: string, name: string): boolean => typed.trim() !== "" && collator.compare(typed.normalize("NFC").trim(), name.normalize("NFC")) === 0;

const Confirm = ({ language, onConfirm, close }: { language: string; onConfirm: () => void; close: () => void }): JSX.Element => {
  const t = useTranslator();
  const collator = useMemo(() => new Intl.Collator(t.formattingLocale, { sensitivity: "base", usage: "search" }), [t.formattingLocale]);
  const [typed, setTyped] = useState("");
  const [composing, setComposing] = useState(false);
  const ready = !composing && namesCourse(collator, typed, language);
  return (
    <>
      <Heading slot="title" className={styles.subheading}>
        {t.format("app.reset.confirm-title", { language })}
      </Heading>
      <p>{t.format("app.reset.confirm-body")}</p>
      <TextField className={styles.field} value={typed} onChange={setTyped} autoComplete="off" data-reset-field="">
        <Label className={styles.label}>{t.format("app.reset.type-label", { language })}</Label>
        <Input
          className={styles.input}
          spellCheck={false}
          autoCapitalize="none"
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          data-field="reset-name"
        />
        <Text slot="description" className={styles.muted}>
          {t.format("app.reset.type-hint")}
        </Text>
      </TextField>
      <div className={styles.dialogActions}>
        <Button className={styles.textButton} onPress={close} autoFocus data-action="keep-progress">
          {t.format("app.reset.cancel")}
        </Button>
        <Button
          className={styles.dangerButton}
          isDisabled={!ready}
          onPress={() => {
            onConfirm();
            close();
          }}
          data-action="confirm-start-over"
        >
          {t.format("app.reset.confirm")}
        </Button>
      </div>
    </>
  );
};

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
                <Confirm
                  language={language}
                  close={close}
                  onConfirm={() => {
                    onReset();
                    setDone(true);
                  }}
                />
              )}
            </Dialog>
          </Modal>
        </DialogTrigger>
      )}
    </section>
  );
};
