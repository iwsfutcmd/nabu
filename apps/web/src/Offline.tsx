/**
 * The course's offline panel (Phase 10): what works on this device with no network, each unit's
 * media (audio and pictures) to download or remove, with sizes in the UI locale, and progress.
 * Plus the notice shown while the device is offline.
 */
import type { LoadedCourse } from "@nabu/ui/player";
import { offlineStatus, downloadPlan, type UnitState } from "@nabu/core/offline";
import { T, useTranslator } from "@nabu/ui";
import { useState, type CSSProperties, type JSX } from "react";
import { Button, ProgressBar } from "react-aria-components";
import styles from "./App.module.css";
import { downloadCourse, removeUnits, type DownloadError, type Progress } from "./offline.ts";

type Translator = ReturnType<typeof useTranslator>;

/** A size in kB or MB (SI, as Intl's units are), in the UI's formatting locale. */
const sizeOf = (t: Translator, bytes: number): string => {
  const mb = bytes >= 1_000_000;
  return new Intl.NumberFormat(t.formattingLocale, { style: "unit", unit: mb ? "megabyte" : "kilobyte", unitDisplay: "short", maximumFractionDigits: mb ? 1 : 0 }).format(mb ? bytes / 1_000_000 : Math.max(1, Math.round(bytes / 1000)));
};

const STATE = { ready: "app.offline.state.ready", partial: "app.offline.state.partial", missing: "app.offline.state.missing" } as const satisfies Record<UnitState, string>;
const ERROR = { network: "app.offline.error.network", integrity: "app.offline.error.integrity", quota: "app.offline.error.quota" } as const satisfies Record<DownloadError, string>;

export const OfflineNotice = (): JSX.Element => {
  const t = useTranslator();
  return (
    <p className={styles.notice} role="status" data-offline-notice="">
      {t.format("app.offline.notice")}
    </p>
  );
};

export const OfflinePanel = ({ loaded, root, stored, onChange }: { loaded: LoadedCourse; root: string; stored: ReadonlySet<string>; onChange: () => void }): JSX.Element => {
  const t = useTranslator();
  const { course, manifest } = loaded;
  const [progress, setProgress] = useState<Progress | undefined>(undefined);
  const [error, setError] = useState<DownloadError | undefined>(undefined);
  const status = offlineStatus(manifest, stored);
  const all = downloadPlan(manifest, stored);
  const busy = progress !== undefined;

  const download = (units: readonly string[] | undefined): void => {
    if (busy) return;
    setError(undefined);
    setProgress({ done: 0, total: 0 });
    void downloadCourse(root, manifest, JSON.stringify(course.units), units, setProgress).then((e) => {
      setProgress(undefined);
      setError(e);
      onChange();
    });
  };
  const remove = (units: readonly string[]): void => {
    if (busy) return;
    void removeUnits(root, manifest, units).then(onChange);
  };

  return (
    <section className={styles.offline} aria-labelledby="offline-title" data-offline={course.id} data-offline-core={String(status.core)} data-offline-complete={String(status.complete)}>
      <h2 className={styles.subheading} id="offline-title">
        {t.format("app.offline.title")}
      </h2>
      <p className={styles.muted}>{t.format(status.core ? "app.offline.core-ready" : "app.offline.core-missing")}</p>
      <ul className={styles.offlineUnits}>
        {status.units.map((u, i) => {
          const unit = course.units.find((x) => x.id === u.id);
          const title = unit?.title?.[course.supportKey];
          return (
            <li key={u.id} className={styles.offlineUnit} data-offline-unit={u.id} data-state={u.state}>
              <span className={styles.offlineName}>{title === undefined ? t.format("app.offline.unit", { number: i + 1 }) : <T text={title} />}</span>
              <span className={styles.muted}>{t.format(STATE[u.state])}</span>
              {u.state !== "ready" ? (
                <Button className={styles.textButton} isDisabled={busy} onPress={() => download([u.id])} data-action="download-unit">
                  {t.format("app.offline.download", { size: sizeOf(t, u.missingBytes) })}
                </Button>
              ) : (
                u.bytes > 0 && (
                  <Button className={styles.textButton} isDisabled={busy} onPress={() => remove([u.id])} data-action="remove-unit">
                    {t.format("app.offline.remove", { size: sizeOf(t, u.bytes) })}
                  </Button>
                )
              )}
            </li>
          );
        })}
      </ul>
      {all.files.length > 0 && (
        <Button className={styles.button} isDisabled={busy} onPress={() => download(undefined)} data-action="download-course">
          {t.format("app.offline.download-all", { size: sizeOf(t, all.bytes) })}
        </Button>
      )}
      {progress !== undefined && (
        <ProgressBar className={styles.questBar} value={progress.done} minValue={0} maxValue={Math.max(progress.total, 1)} aria-label={t.format("app.offline.downloading")} valueLabel={t.format("app.offline.progress", { done: sizeOf(t, progress.done), total: sizeOf(t, progress.total) })} data-offline-progress="">
          {({ percentage, valueText }) => (
            <>
              <span className={styles.questHead}>
                <span>{t.format("app.offline.downloading")}</span>
                <span className={styles.muted}>{valueText}</span>
              </span>
              <span className={styles.track}>
                <span className={styles.fill} style={{ "--nabu-progress": `${percentage ?? 0}%` } as CSSProperties} />
              </span>
            </>
          )}
        </ProgressBar>
      )}
      {error !== undefined && (
        <p className={styles.notice} role="alert" data-offline-error={error}>
          {t.format(ERROR[error])}
        </p>
      )}
    </section>
  );
};
