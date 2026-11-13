/**
 * Where progress is kept, and getting it back (S6 in the 2026-11 review).
 *
 * - DeviceCopy says what holds the learner's progress as it is: this browser, kept for good (the
 *   browser granted persistent storage) or not (it may clear site data to free space, or after
 *   weeks without a visit, as Safari does); the app on this phone; or nothing past this window.
 * - Restore takes back a file "Download my learning data" saved, or the account's download: every
 *   event checked against the schema, what this device has already left as it is (by id), and the
 *   rest added to its log after the learner has seen what the file holds.
 */
import type { LearnerEvent } from "@nabu/schema";
import { useTranslator } from "@nabu/ui";
import { useEffect, useState, type JSX } from "react";
import { Button, FileTrigger } from "react-aria-components";
import styles from "./App.module.css";
import { isNative } from "./platform.ts";
import { eventValidator, readEventsFile, restoreEvents } from "./restore.ts";
import type { EventStore } from "./store.ts";
import type { Sync } from "./sync.ts";

type Translator = ReturnType<typeof useTranslator>;

/** What holds this device's progress: in memory only, the app, a browser that keeps it, or one that may not. */
type Keeping = "memory" | "app" | "kept" | "at-risk";

const KEEPING = { memory: "app.store.memory", app: "app.progress.app", kept: "app.progress.kept", "at-risk": "app.progress.at-risk" } as const;

export const DeviceCopy = ({ store }: { store: EventStore }): JSX.Element | null => {
  const t = useTranslator();
  const [keeping, setKeeping] = useState<Keeping | undefined>(() => (!store.persistent ? "memory" : isNative() ? "app" : undefined));
  useEffect(() => {
    if (keeping !== undefined) return;
    let live = true;
    void store.durable().then((kept) => {
      if (live) setKeeping(kept ? "kept" : "at-risk");
    });
    return () => {
      live = false;
    };
  }, [store, keeping]);
  // Asked as the store opened: known in a moment. Nothing is said until it is.
  if (keeping === undefined) return null;
  return (
    <p className={styles.muted} data-device-copy={keeping}>
      {t.format(KEEPING[keeping])}
    </p>
  );
};

const courseNames = (t: Translator, events: readonly LearnerEvent[]): string => {
  const ids = [...new Set(events.map((e) => e.course))];
  const names = ids.map((id) => {
    const key = `course.name.${id}`;
    return t.has(key) ? t.format(key) : id;
  });
  return new Intl.ListFormat(t.locale, { type: "conjunction" }).format(names);
};

type Stage =
  | { readonly tag: "idle" }
  | { readonly tag: "reading" }
  /** The file read: its events, those new to this device, and the entries that were not events. */
  | { readonly tag: "found"; readonly events: readonly LearnerEvent[]; readonly fresh: readonly LearnerEvent[]; readonly invalid: number }
  | { readonly tag: "adding" }
  | { readonly tag: "done"; readonly added: number }
  /** No learner event in it at all. */
  | { readonly tag: "empty" }
  | { readonly tag: "unreadable" };

export const Restore = ({ store, sync }: { store: EventStore; sync: Sync }): JSX.Element => {
  const t = useTranslator();
  const [stage, setStage] = useState<Stage>({ tag: "idle" });
  const read = async (file: File): Promise<void> => {
    setStage({ tag: "reading" });
    try {
      const [text, valid] = await Promise.all([file.text(), eventValidator()]);
      const { events, invalid } = readEventsFile(text, valid);
      if (events.length === 0) {
        setStage({ tag: "empty" });
        return;
      }
      const have = await store.ids();
      setStage({ tag: "found", events, fresh: events.filter((e) => !have.has(e.id)), invalid });
    } catch {
      setStage({ tag: "unreadable" });
    }
  };
  const add = async (fresh: readonly LearnerEvent[]): Promise<void> => {
    setStage({ tag: "adding" });
    try {
      const added = await restoreEvents(store.append, fresh);
      // Open views replay, and with an account the next sync sends what came in.
      sync.added();
      setStage({ tag: "done", added });
    } catch {
      setStage({ tag: "unreadable" });
    }
  };
  const busy = stage.tag === "reading" || stage.tag === "adding";
  return (
    <div data-restore={stage.tag}>
      <FileTrigger
        onSelect={(files) => {
          const file = files?.[0];
          if (file !== undefined) void read(file);
        }}
        data-restore-input=""
      >
        <Button className={styles.textButton} isDisabled={busy} data-action="restore">
          {t.format("app.progress.restore")}
        </Button>
      </FileTrigger>
      {/* What the file holds, and how it went, is said as it changes; the choices follow it. */}
      <div role="status">
        {stage.tag === "found" && (
          <div className={styles.form} data-restore-found={stage.events.length} data-restore-new={stage.fresh.length} data-restore-invalid={stage.invalid}>
            <p className={styles.formIntro}>{t.format("app.restore.found", { count: stage.events.length, courses: courseNames(t, stage.events) })}</p>
            <p className={styles.formIntro}>{stage.fresh.length > 0 ? t.format("app.restore.new", { count: stage.fresh.length }) : t.format("app.restore.none-new")}</p>
            {stage.invalid > 0 && <p className={styles.formIntro}>{t.format("app.restore.invalid", { count: stage.invalid })}</p>}
          </div>
        )}
        {stage.tag === "done" && (
          <p className={styles.notice} data-restored={stage.added}>
            {t.format("app.restore.done", { count: stage.added })}
          </p>
        )}
        {stage.tag === "empty" && (
          <p className={styles.notice} data-restore-error="empty">
            {t.format("app.restore.empty")}
          </p>
        )}
        {stage.tag === "unreadable" && (
          <p className={styles.notice} data-restore-error="unreadable">
            {t.format("app.restore.unreadable")}
          </p>
        )}
      </div>
      {stage.tag === "found" && (
        <div className={styles.links}>
          {stage.fresh.length > 0 && (
            <Button className={styles.button} onPress={() => void add(stage.fresh)} data-action="restore-confirm">
              {t.format("app.restore.confirm")}
            </Button>
          )}
          <Button className={styles.textButton} onPress={() => setStage({ tag: "idle" })} data-action="restore-cancel">
            {t.format(stage.fresh.length > 0 ? "app.restore.cancel" : "app.restore.close")}
          </Button>
        </div>
      )}
    </div>
  );
};
