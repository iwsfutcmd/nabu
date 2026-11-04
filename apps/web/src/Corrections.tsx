/**
 * Corrections in the app (ADR 0051): the sentence list page, and "This sentence is wrong" under
 * an exercise's feedback and on story lines. A correction is a sentence_reported event in the
 * device's log: it syncs like any other and joins the server's review queue. The sentence list
 * also downloads the device's own corrections as the file `nabu corrections apply` reads, so a
 * reviewer can apply them with no server at all.
 */
import { correctable, correctionKey, correctionRows, jsonLines, latestCorrections, sentenceReportedOf, type Correctable } from "@nabu/core/corrections";
import type { CourseView } from "@nabu/core/lesson";
import type { CorrectionFields, LearnerEvent, SentenceReported } from "@nabu/schema";
import { chromeClass, useChrome, useTranslator } from "@nabu/ui";
import { CorrectionForm, SentenceList } from "@nabu/ui/corrections";
import { useEffect, useState, type JSX } from "react";
import { Button, Dialog, Modal } from "react-aria-components";
import styles from "./App.module.css";
import { localDate, localIso, timeZone, uuidv7 } from "./clock.ts";
import type { EventStore } from "./store.ts";

type Made = { readonly correction: CorrectionFields; readonly note?: string };

/** This device's corrections in a course, read again whenever `version` changes. */
export const useCorrections = (store: EventStore | null, course: string | null, version: string): ReadonlyMap<string, SentenceReported> => {
  const [latest, setLatest] = useState<ReadonlyMap<string, SentenceReported>>(new Map());
  useEffect(() => {
    if (store === null || course === null) return;
    let live = true;
    void store.eventsOf(course).then((events) => {
      if (live) setLatest(latestCorrections(events, course));
    });
    return () => {
      live = false;
    };
  }, [store, course, version]);
  return latest;
};

/** The sentence_reported event, stamped like any event this device records. */
export const correctionEvent = (course: CourseView, bundle: string, device: string, target: Correctable, shown: CorrectionFields, made: Made): SentenceReported => {
  const now = new Date();
  return sentenceReportedOf(course, target, shown, made, { id: uuidv7(now.getTime()), clientTime: localIso(now), localDate: localDate(now), tz: timeZone(), device, session: uuidv7(now.getTime()), bundle });
};

interface Recording {
  readonly course: CourseView;
  readonly bundle: string;
  readonly device: string;
  readonly record: (event: LearnerEvent) => void;
}

interface DialogProps extends Recording {
  readonly target: Correctable;
  readonly previous: SentenceReported | undefined;
  readonly onClose: (sent: boolean) => void;
}

/** The correction form in a modal dialog; closing it without sending changes nothing. */
const CorrectionDialog = ({ course, bundle, device, record, target, previous, onClose }: DialogProps): JSX.Element => {
  const t = useTranslator();
  const chrome = useChrome();
  return (
    <Modal className={styles.modal} isOpen isDismissable onOpenChange={(open) => !open && onClose(false)}>
      <Dialog className={`${styles.dialog} ${styles.wideDialog} ${chromeClass}`} style={chrome.style} aria-label={t.format("corrections.title")} data-correction-dialog="">
        <div lang={chrome.lang} dir={chrome.dir}>
          <CorrectionForm
            course={course}
            target={target}
            previous={previous}
            onCancel={() => onClose(false)}
            onSubmit={(made, shown) => {
              record(correctionEvent(course, bundle, device, target, shown, made));
              onClose(true);
            }}
          />
        </div>
      </Dialog>
    </Modal>
  );
};

const Sent = (): JSX.Element => {
  const t = useTranslator();
  return (
    <p className={styles.muted} role="status" data-correction-sent="">
      {t.format("corrections.sent")}
    </p>
  );
};

interface MarkProps extends Recording {
  readonly item: string;
  readonly step?: number | undefined;
  readonly corrections: ReadonlyMap<string, SentenceReported>;
  readonly className?: string | undefined;
}

/** "This sentence is wrong": a button that opens the form, for any item the course source holds. */
export const MarkIncorrect = ({ item, step, corrections, className, ...recording }: MarkProps): JSX.Element | null => {
  const t = useTranslator();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const target = correctable(recording.course, item, step);
  if (target === undefined) return null;
  const previous = corrections.get(correctionKey(item, step));
  return (
    <>
      <Button className={className ?? styles.textButton} onPress={() => setOpen(true)} data-action="mark-incorrect" data-item={item} data-step={step}>
        {t.format(previous === undefined ? "corrections.mark" : "corrections.edit")}
      </Button>
      {sent && <Sent />}
      {open && (
        <CorrectionDialog
          {...recording}
          target={target}
          previous={previous}
          onClose={(done) => {
            setOpen(false);
            if (done) setSent(true);
          }}
        />
      )}
    </>
  );
};

/** Saves the device's corrections in this course as JSON Lines, the rows `nabu corrections apply` reads. */
const download = (course: string, corrections: ReadonlyMap<string, SentenceReported>): void => {
  const blob = new Blob([jsonLines(correctionRows(corrections.values()))], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nabu-corrections-${course}.jsonl`;
  a.click();
  URL.revokeObjectURL(url);
};

interface PageProps extends Recording {
  readonly corrections: ReadonlyMap<string, SentenceReported>;
  readonly back: string;
}

/** Every sentence and story line of the course, unit by unit, each one correctable. */
export const SentencesPage = ({ corrections, back, ...recording }: PageProps): JSX.Element => {
  const t = useTranslator();
  const { course } = recording;
  const [unit, setUnit] = useState<string | undefined>(undefined);
  const [target, setTarget] = useState<Correctable | undefined>(undefined);
  const [sent, setSent] = useState(false);
  return (
    <main className={styles.page} data-sentences-page={course.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("corrections.page.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("corrections.page.title")}</h1>
      <p className={styles.muted}>{t.format("corrections.page.intro")}</p>
      {corrections.size > 0 && (
        <Button className={styles.textButton} onPress={() => download(course.id, corrections)} data-action="export-corrections">
          {t.format("corrections.export", { count: corrections.size })}
        </Button>
      )}
      {sent && <Sent />}
      <SentenceList
        course={course}
        corrections={corrections}
        unit={unit}
        onUnit={setUnit}
        onCorrect={(c) => {
          setSent(false);
          setTarget(c);
        }}
      />
      {target !== undefined && (
        <CorrectionDialog
          {...recording}
          target={target}
          previous={corrections.get(correctionKey(target.item, target.step))}
          onClose={(done) => {
            setTarget(undefined);
            if (done) setSent(true);
          }}
        />
      )}
    </main>
  );
};
