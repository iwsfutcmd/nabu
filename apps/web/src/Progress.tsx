/**
 * "Your progress" on the home screen: where progress lives (this device),
 * a download of the learner's own data (§14.4), and, when a sync server is
 * configured, the optional account (§14.2): create one or sign in, which
 * uploads the local history; then sync status and sign-out.
 *
 * Email addresses may use any script (EAI), so the field is text with an
 * email keyboard, not type=email (which rejects non-ASCII local parts). An
 * address is a left-to-right structure (local@domain) even when its local
 * part is Arabic or Hebrew, so it is shown as an LTR isolate.
 */
import { useTranslator } from "@nabu/ui";
import { useState, useSyncExternalStore, type FormEvent, type JSX } from "react";
import { Button, Form, Input, Label, Text, TextField } from "react-aria-components";
import styles from "./App.module.css";
import { ProfileForm, Reminders } from "./social.tsx";
import { forgetCalibration, loadCalibration, serverAllowed, setServerAllowed } from "./voice.ts";
import type { EventStore } from "./store.ts";
import type { Sync, SyncError, SyncState } from "./sync.ts";

/** Left-to-right isolate (LRI … PDI): keeps an address in its own order inside any paragraph. */
const ltr = (text: string): string => `\u2066${text}\u2069`;

/** The server's minimum password length, in graphemes (apps/api/src/accounts.ts). */
const MIN_PASSWORD = 8;

const ERRORS = {
  "invalid-email": "app.error.account.invalid-email",
  "weak-password": "app.error.account.weak-password",
  "email-taken": "app.error.account.email-taken",
  "wrong-credentials": "app.error.account.wrong-credentials",
  unreachable: "app.error.account.unreachable",
  "signed-out": "app.error.account.signed-out",
  rejected: "app.error.account.rejected",
  unknown: "app.error.account.unknown",
} as const satisfies Record<SyncError, string>;

const download = async (store: EventStore): Promise<void> => {
  const events = await store.allEvents();
  const blob = new Blob(events.map((e) => `${JSON.stringify(e)}\n`), { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "nabu-events.jsonl";
  a.click();
  URL.revokeObjectURL(url);
};

const Status = ({ state }: { state: SyncState }): JSX.Element => {
  const t = useTranslator();
  const status = state.phase === "offline" ? "offline" : state.phase === "syncing" ? "syncing" : state.pending > 0 ? "pending" : state.phase === "error" ? "error" : "saved";
  const text =
    status === "offline"
      ? t.format("app.sync.offline", { count: state.pending })
      : status === "syncing"
        ? t.format("app.sync.syncing")
        : status === "pending"
          ? t.format("app.sync.pending", { count: state.pending })
          : status === "error"
            ? t.format(ERRORS[state.error ?? "unknown"], { min: MIN_PASSWORD })
            : t.format("app.sync.saved");
  return (
    <p className={styles.muted} role="status" data-sync-status={status} data-pending={state.pending} data-verified={state.verified === undefined ? undefined : String(state.verified)}>
      {text}
      {state.verified === false && ` ${t.format("app.sync.mismatch")}`}
    </p>
  );
};

const AccountForm = ({ sync }: { sync: Sync }): JSX.Element => {
  const t = useTranslator();
  const [mode, setMode] = useState<"create" | "sign-in">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<SyncError | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    void (mode === "create" ? sync.signUp(email, password) : sync.signIn(email, password)).then((result) => {
      setBusy(false);
      setError(result);
    });
  };
  return (
    <Form className={styles.form} onSubmit={submit} data-account-form={mode}>
      <p className={styles.formIntro}>{t.format(mode === "create" ? "app.account.pitch" : "app.account.welcome-back")}</p>
      <TextField className={styles.field} value={email} onChange={setEmail} isRequired autoComplete="email" name="email">
        <Label className={styles.label}>{t.format("app.account.email")}</Label>
        <Input className={styles.input} inputMode="email" dir="ltr" spellCheck={false} autoCapitalize="none" data-field="email" />
      </TextField>
      <TextField className={styles.field} value={password} onChange={setPassword} isRequired type="password" autoComplete={mode === "create" ? "new-password" : "current-password"} name="password">
        <Label className={styles.label}>{t.format("app.account.password")}</Label>
        <Input className={styles.input} dir="auto" data-field="password" />
        {mode === "create" && (
          <Text slot="description" className={styles.muted}>
            {t.format("app.account.password-hint", { min: MIN_PASSWORD })}
          </Text>
        )}
      </TextField>
      {error !== undefined && (
        <p className={styles.notice} role="alert" data-account-error={error}>
          {t.format(ERRORS[error], { min: MIN_PASSWORD })}
        </p>
      )}
      <div className={styles.links}>
        <Button className={styles.button} type="submit" isDisabled={busy} data-action="account-submit">
          {t.format(mode === "create" ? "app.account.create" : "app.account.sign-in")}
        </Button>
        <Button
          className={styles.textButton}
          onPress={() => {
            setMode(mode === "create" ? "sign-in" : "create");
            setError(undefined);
          }}
          data-action="account-mode"
        >
          {t.format(mode === "create" ? "app.account.have-account" : "app.account.new-account")}
        </Button>
      </div>
    </Form>
  );
};

export const Progress = ({ store, sync }: { store: EventStore; sync: Sync }): JSX.Element => {
  const t = useTranslator();
  const state = useSyncExternalStore(sync.subscribe, sync.get);
  return (
    <section className={`${styles.course} ${styles.progress}`} data-progress="" aria-labelledby="progress-title">
      <h2 className={styles.courseName} id="progress-title">
        {t.format("app.progress.title")}
      </h2>
      <p className={styles.muted}>{t.format(store.persistent ? "app.progress.device" : "app.store.memory")}</p>
      {state.server !== undefined &&
        (state.account === undefined ? (
          <AccountForm sync={sync} />
        ) : (
          <div data-account={state.account.user.email}>
            <p>
              {t.format("app.account.signed-in", { email: ltr(state.account.user.email) })}
            </p>
            <Status state={state} />
            <ProfileForm account={state.account} uiLocale={t.locale} />
            <Reminders account={state.account} />
            <Button className={styles.textButton} onPress={() => void sync.signOut()} data-action="sign-out">
              {t.format("app.account.sign-out")}
            </Button>
          </div>
        ))}
      <div className={styles.links}>
        <Button className={styles.textButton} onPress={() => void download(store)} data-action="export">
          {t.format("app.progress.export")}
        </Button>
      </div>
      <Voice signedIn={state.account !== undefined} />
    </section>
  );
};

/**
 * Your voice (§10.4): recordings are scored and dropped, never kept. With an account the learner
 * chooses whether the server's speech service may hear them; the pitch range learned on this
 * device (three numbers) can be forgotten.
 */
const Voice = ({ signedIn }: { signedIn: boolean }): JSX.Element => {
  const t = useTranslator();
  const [server, setServer] = useState(serverAllowed);
  const [range, setRange] = useState(() => loadCalibration() !== undefined);
  return (
    <div className={styles.voice} data-voice="">
      <h3 className={styles.subheading}>{t.format("app.voice.title")}</h3>
      <p className={styles.muted}>{t.format("app.voice.note")}</p>
      {signedIn && (
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={server}
            onChange={(e) => {
              setServerAllowed(e.currentTarget.checked);
              setServer(e.currentTarget.checked);
            }}
            data-action="voice-server"
          />
          {t.format("app.voice.server")}
        </label>
      )}
      <Button
        className={styles.textButton}
        onPress={() => {
          forgetCalibration();
          setRange(false);
        }}
        isDisabled={!range}
        data-action="voice-forget"
      >
        {range ? t.format("app.voice.forget") : t.format("app.voice.forgotten")}
      </Button>
    </div>
  );
};
