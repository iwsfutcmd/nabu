/**
 * Corrections in the app (ADR 0051, 0057): the sentence list page, and "This sentence is wrong"
 * under an exercise's feedback and on story lines; "This word is wrong" under a word exercise's,
 * and "One of these is wrong" under match-the-pairs, which asks which word first. A correction is a sentence_reported event in the
 * device's log: it syncs like any other and joins the server's review queue. The sentence list
 * also downloads the device's own corrections as the file `nabu corrections apply` reads, so a
 * reviewer can apply them with no server at all.
 */
import { correctable, correctablesOf, correctionKey, correctionRows, jsonLines, latestCorrections, sentenceReportedOf, type Correctable } from "@nabu/core/corrections";
import type { CourseView, Exercise } from "@nabu/core/lesson";
import type { CorrectionFields, LearnerEvent, SentenceReported } from "@nabu/schema";
import { chromeClass, T, useChrome, useTranslator } from "@nabu/ui";
import { CorrectionForm, SentenceList } from "@nabu/ui/corrections";
import { rubySchemeOf } from "@nabu/ui/player";
import { useEffect, useState, type JSX } from "react";
import { Button, Dialog, Modal } from "react-aria-components";
import styles from "./App.module.css";
import { localDate, localIso, timeZone, uuidv7 } from "./clock.ts";
import { useReportsPublic } from "./reports.ts";
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
  const published = useReportsPublic();
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
          {published && (
            <p className={styles.muted} data-reports-public="">
              {t.format("reports.public")}
            </p>
          )}
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
  const target = correctable(recording.course, item, step);
  return target === undefined ? null : <MarkTargets {...recording} targets={[target]} corrections={corrections} className={className} />;
};

interface ExerciseMarkProps extends Recording {
  readonly ex: Pick<Exercise, "template" | "item" | "kcs">;
  readonly corrections: ReadonlyMap<string, SentenceReported>;
}

/**
 * Under an exercise's feedback: the sentence or word it was built from can be marked as wrong;
 * match-the-pairs asks which of its words first.
 */
export const MarkExercise = ({ ex, ...props }: ExerciseMarkProps): JSX.Element | null => {
  const targets = correctablesOf(props.course, ex);
  return targets.length === 0 ? null : <MarkTargets {...props} targets={targets} />;
};

interface TargetsProps extends Recording {
  readonly targets: readonly Correctable[];
  readonly corrections: ReadonlyMap<string, SentenceReported>;
  readonly className?: string | undefined;
}

const MarkTargets = ({ targets, corrections, className, ...recording }: TargetsProps): JSX.Element | null => {
  const t = useTranslator();
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState<Correctable | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [first] = targets;
  if (first === undefined) return null;
  const previousOf = (c: Correctable): SentenceReported | undefined => corrections.get(correctionKey(c.item, c.step));
  const several = targets.length > 1;
  const label = several ? "corrections.mark.pairs" : previousOf(first) !== undefined ? "corrections.edit" : first.kind === "word" ? "corrections.mark.word" : "corrections.mark";
  return (
    <>
      <Button
        className={className ?? styles.textButton}
        onPress={() => (several ? setChoosing(true) : setTarget(first))}
        data-action="mark-incorrect"
        data-item={several ? undefined : first.item}
        data-step={several ? undefined : first.step}
      >
        {t.format(label)}
      </Button>
      {sent && <Sent />}
      {choosing && (
        <ChooseDialog
          course={recording.course}
          targets={targets}
          corrections={corrections}
          onChoose={(c) => {
            setChoosing(false);
            setTarget(c);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
      {target !== undefined && (
        <CorrectionDialog
          {...recording}
          target={target}
          previous={previousOf(target)}
          onClose={(done) => {
            setTarget(undefined);
            if (done) setSent(true);
          }}
        />
      )}
    </>
  );
};

interface ChooseProps {
  readonly course: CourseView;
  readonly targets: readonly Correctable[];
  readonly corrections: ReadonlyMap<string, SentenceReported>;
  readonly onChoose: (target: Correctable) => void;
  readonly onClose: () => void;
}

/**
 * "Which one is wrong?": each word in the learner's orthography (with its readings, which can be
 * what is wrong), and its meaning, through <T>.
 */
const ChooseDialog = ({ course, targets, corrections, onChoose, onClose }: ChooseProps): JSX.Element => {
  const t = useTranslator();
  const chrome = useChrome();
  const ruby = rubySchemeOf(course.profiles.get(course.orthography)?.source) ?? false;
  return (
    <Modal className={styles.modal} isOpen isDismissable onOpenChange={(open) => !open && onClose()}>
      <Dialog className={`${styles.dialog} ${chromeClass}`} style={chrome.style} aria-label={t.format("corrections.choose")} data-correction-choose="">
        <div lang={chrome.lang} dir={chrome.dir} className={styles.dialogBody}>
          <h2 className={styles.heading}>{t.format("corrections.choose")}</h2>
          <ul className={styles.choices}>
            {targets.map((c) => {
              const word = c.forms[course.orthography];
              const corrected = corrections.has(correctionKey(c.item, c.step));
              return (
                <li key={c.item}>
                  <Button className={styles.choice} onPress={() => onChoose(c)} data-choose={c.item} data-corrected={corrected || undefined}>
                    {word !== undefined && <T className={styles.choiceWord} text={word} ruby={ruby} />}
                    {c.translation !== undefined && <T className={styles.choiceMeaning} text={c.translation} />}
                    {corrected && <span className={styles.muted}>{t.format("corrections.pending")}</span>}
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className={styles.dialogActions}>
            <Button className={styles.textButton} onPress={onClose} data-action="cancel-choose">
              {t.format("corrections.cancel")}
            </Button>
          </div>
        </div>
      </Dialog>
    </Modal>
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
