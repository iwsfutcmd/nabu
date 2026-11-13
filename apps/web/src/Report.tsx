/**
 * One way to report a problem with an answer (the 2026-11 review's M6): a small flag at the inline
 * end beside the feedback, which opens the reports that apply to this card and nothing else:
 *
 * - "My answer should have been accepted" for a wrong answer with text, and "I said it right" for
 *   speech the device scored (ADR 0052): it counts that way for the learner at once;
 * - "This should have been wrong" only after a lenient grade (the caller decides which);
 * - "This sentence is wrong", "This word is wrong", or "One of these is wrong" (match-the-pairs, which
 *   asks which word next) for what the card was built from (ADR 0051, 0057).
 *
 * A report is a choice two steps away, never a line under every verdict that reads like one.
 */
import { correctable, correctionKey, type Correctable } from "@nabu/core/corrections";
import type { SentenceReported } from "@nabu/schema";
import { chromeClass, FlagIcon, useChrome, useTranslator } from "@nabu/ui";
import { useState, type JSX } from "react";
import { Button, Dialog, DialogTrigger, Heading, Popover } from "react-aria-components";
import styles from "./App.module.css";
import { ChooseDialog, CorrectionDialog, Sent, type Recording } from "./Corrections.tsx";
import { useReportsPublic } from "./reports.ts";

export type Claim = "accept" | "reject";

/** What the card was built from, to correct, and the corrections this device made in the course. */
export interface Correcting extends Recording {
  readonly targets: readonly Correctable[];
  readonly corrections: ReadonlyMap<string, SentenceReported>;
}

export interface ReportProps {
  /** The claim this answer allows, if any. */
  readonly claim: Claim | undefined;
  /** Scored speech: the claim is "I said it right". */
  readonly spoken: boolean;
  /** The claim already made: an answer takes one. */
  readonly claimed: Claim | undefined;
  readonly onClaim: (claim: Claim) => void;
  /** What can be corrected; none for a story question, whose lines are corrected where they stand. */
  readonly correcting?: Correcting | undefined;
  /** A correction was sent. */
  readonly onSent: () => void;
}

export const ReportButton = ({ claim, spoken, claimed, onClaim, correcting, onSent }: ReportProps): JSX.Element | null => {
  const t = useTranslator();
  const chrome = useChrome();
  const published = useReportsPublic();
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState<Correctable | undefined>(undefined);
  const targets = correcting?.targets ?? [];
  const [first] = targets;
  if (claim === undefined && first === undefined) return null;
  const previousOf = (c: Correctable): SentenceReported | undefined => correcting?.corrections.get(correctionKey(c.item, c.step));
  const several = targets.length > 1;
  const correction =
    first === undefined ? undefined : several ? "corrections.mark.pairs" : previousOf(first) !== undefined ? "corrections.edit" : first.kind === "word" ? "corrections.mark.word" : "corrections.mark";
  const claimLabel = claim === "reject" ? "ai.report.reject" : spoken ? "ai.report.spoken" : "ai.report.button";
  const name = t.format("report.problem");
  return (
    <>
      <DialogTrigger>
        <Button className={styles.reportButton} aria-label={name} data-action="report-problem">
          <FlagIcon />
        </Button>
        <Popover className={styles.reportPopover} placement="bottom end">
          <Dialog className={`${styles.reportDialog} ${chromeClass}`} style={chrome.style} aria-label={name} data-report-dialog="">
            {({ close }) => (
              <div lang={chrome.lang} dir={chrome.dir} className={styles.dialogBody}>
                <Heading slot="title" className={styles.reportTitle}>
                  {name}
                </Heading>
                <div className={styles.reportOptions}>
                  {claim !== undefined && (
                    <Button
                      className={styles.reportOption}
                      isDisabled={claimed !== undefined}
                      onPress={() => {
                        close();
                        onClaim(claim);
                      }}
                      data-action={claim === "accept" ? "report" : "report-wrong"}
                    >
                      {t.format(claimLabel)}
                    </Button>
                  )}
                  {first !== undefined && correction !== undefined && (
                    <Button
                      className={styles.reportOption}
                      onPress={() => {
                        close();
                        if (several) setChoosing(true);
                        else setTarget(first);
                      }}
                      data-action="mark-incorrect"
                      data-item={several ? undefined : first.item}
                    >
                      {t.format(correction)}
                    </Button>
                  )}
                </div>
                {published && (
                  <p className={styles.muted} data-reports-public="">
                    {t.format("reports.public")}
                  </p>
                )}
              </div>
            )}
          </Dialog>
        </Popover>
      </DialogTrigger>
      {choosing && correcting !== undefined && (
        <ChooseDialog
          course={correcting.course}
          targets={targets}
          corrections={correcting.corrections}
          onChoose={(c) => {
            setChoosing(false);
            setTarget(c);
          }}
          onClose={() => setChoosing(false)}
        />
      )}
      {target !== undefined && correcting !== undefined && (
        <CorrectionDialog
          course={correcting.course}
          bundle={correcting.bundle}
          device={correcting.device}
          record={correcting.record}
          target={target}
          previous={previousOf(target)}
          onClose={(sent) => {
            setTarget(undefined);
            if (sent) onSent();
          }}
        />
      )}
    </>
  );
};

/**
 * A story line's report: the same small flag as a card's, at the inline end of the line's controls,
 * offering only "This sentence is wrong" (or the correction already made). A line is corrected where
 * it stands, by its step in the story; once sent, the line says so beside the flag.
 */
export const LineReport = ({ item, step, corrections, ...recording }: Recording & { readonly item: string; readonly step: number; readonly corrections: ReadonlyMap<string, SentenceReported> }): JSX.Element | null => {
  const [sent, setSent] = useState(false);
  const target = correctable(recording.course, item, step);
  if (target === undefined) return null;
  return (
    <div className={styles.lineReport}>
      {sent && <Sent />}
      <ReportButton claim={undefined} spoken={false} claimed={undefined} onClaim={() => undefined} correcting={{ ...recording, targets: [target], corrections }} onSent={() => setSent(true)} />
    </div>
  );
};
