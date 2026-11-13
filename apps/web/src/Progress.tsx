/**
 * "Your progress" on the home screen: where progress lives (this browser or
 * app, and whether it is kept for good), a download of the learner's own data
 * (§14.4) and restoring one (S6), and, when a sync server is configured, the
 * optional account (§14.2): create one or sign in, which uploads the local
 * history; then sync status and sign-out.
 *
 * Email addresses may use any script (EAI), so the field is text with an
 * email keyboard, not type=email (which rejects non-ASCII local parts). An
 * address is a left-to-right structure (local@domain) even when its local
 * part is Arabic or Hebrew, so it is shown as an LTR isolate.
 *
 * A server with an age gate (ADR 0069) answers the first sign-up with "age-required": the form then
 * asks the person's age, neutrally (no threshold shown), in any script's digits. If the server turns
 * them away, the device remembers and offers no new account there; learning on the device goes on.
 *
 * When the server ends the session (ADR 0123), Home says so at its top (SignedOutNotice) until the
 * learner signs in again or stays signed out, and the form here asks them to sign in again, their
 * address filled in. A server sends no email, so it cannot reset a password: the sign-in form says so
 * plainly when asked, and what is left to do (a new account takes everything on the device).
 */
import { parseDigits, type Named } from "@nabu/i18n";
import { useTranslator } from "@nabu/ui";
import { useState, useSyncExternalStore, type FormEvent, type JSX } from "react";
import { Button, Form, Input, Label, Text, TextField } from "react-aria-components";
import styles from "./App.module.css";
import { DeviceCopy, Restore } from "./Restore.tsx";
import { ProfileForm, Reminders } from "./social.tsx";
import { forgetCalibration, loadCalibration, serverAllowed, setServerAllowed } from "./voice.ts";
import type { EventStore } from "./store.ts";
import type { SignedOut, Sync, SyncError, SyncState } from "./sync.ts";

/** Left-to-right isolate (LRI … PDI): keeps an address in its own order inside any paragraph. */
const ltr = (text: string): string => `\u2066${text}\u2069`;

/** The server's minimum password length, in graphemes (apps/api/src/accounts.ts). */
const MIN_PASSWORD = 8;

const ERRORS = {
  "invalid-email": "app.error.account.invalid-email",
  "weak-password": "app.error.account.weak-password",
  "email-taken": "app.error.account.email-taken",
  "wrong-credentials": "app.error.account.wrong-credentials",
  "rate-limited": "app.error.account.rate-limited",
  "age-required": "app.error.account.age-required",
  age: "app.account.age-refused",
  offline: "app.error.account.offline",
  unreachable: "app.error.account.unreachable",
  "signed-out": "app.error.account.signed-out",
  rejected: "app.error.account.rejected",
  unknown: "app.error.account.unknown",
  "invalid-age": "app.error.account.invalid-age",
} as const satisfies Record<SyncError | "invalid-age", string>;

const save = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const download = async (store: EventStore): Promise<void> => {
  const events = await store.allEvents();
  save(new Blob(events.map((e) => `${JSON.stringify(e)}\n`), { type: "application/x-ndjson" }), "nabu-events.jsonl");
};

/**
 * What the server keeps for the account (§14.4): download all of it, or delete the account. Deleting
 * asks for the password, says what goes and what stays, and cannot be undone.
 */
const AccountData = ({ sync, onDeleted }: { sync: Sync; onDeleted: () => void }): JSX.Element => {
  const t = useTranslator();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<SyncError | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const exportData = (): void => {
    setBusy(true);
    void sync.exportAccount().then((result) => {
      setBusy(false);
      if (result.ok) save(new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" }), "nabu-account.json");
      setError(result.ok ? undefined : result.error);
    });
  };
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    void sync.deleteAccount(password).then((result) => {
      setBusy(false);
      setError(result);
      if (result === undefined) onDeleted();
    });
  };
  return (
    <div className={styles.voice} data-account-data="">
      <h3 className={styles.subheading}>{t.format("app.account.data")}</h3>
      <div className={styles.links}>
        <Button className={styles.textButton} onPress={exportData} isDisabled={busy} data-action="export-account">
          {t.format("app.account.export")}
        </Button>
        {!deleting && (
          <Button className={styles.textButton} onPress={() => setDeleting(true)} data-action="delete-account">
            {t.format("app.account.delete")}
          </Button>
        )}
      </div>
      {deleting && (
        <Form className={styles.form} onSubmit={submit} data-delete-account="">
          <p className={styles.formIntro}>{t.format("app.account.delete-note")}</p>
          <TextField className={styles.field} value={password} onChange={setPassword} isRequired type="password" autoComplete="current-password" name="password">
            <Label className={styles.label}>{t.format("app.account.password")}</Label>
            <Input className={styles.input} dir="auto" data-field="delete-password" />
          </TextField>
          <div className={styles.links}>
            <Button className={styles.dangerButton} type="submit" isDisabled={busy} data-action="delete-account-confirm">
              {t.format("app.account.delete-confirm")}
            </Button>
            <Button
              className={styles.textButton}
              onPress={() => {
                setDeleting(false);
                setPassword("");
                setError(undefined);
              }}
              data-action="delete-account-cancel"
            >
              {t.format("app.account.delete-cancel")}
            </Button>
          </div>
        </Form>
      )}
      {error !== undefined && (
        <p className={styles.notice} role="alert" data-account-data-error={error}>
          {t.format(ERRORS[error], { min: MIN_PASSWORD })}
        </p>
      )}
    </div>
  );
};

const Status = ({ state }: { state: SyncState }): JSX.Element => {
  const t = useTranslator();
  // Never "all saved" while the server has rejected some of it (S13): that part is said apart. No
  // network is not a server that does not answer (ADR 0123): each is said as what it is.
  const status =
    state.phase === "offline" || state.phase === "unreachable"
      ? state.phase
      : state.phase === "syncing"
        ? "syncing"
        : state.pending > 0
          ? "pending"
          : state.phase === "error"
            ? "error"
            : state.held > 0
              ? "held"
              : "saved";
  const text =
    status === "offline"
      ? t.format("app.sync.offline", { count: state.pending })
      : status === "unreachable"
        ? t.format("app.sync.unreachable", { count: state.pending })
        : status === "syncing"
          ? t.format("app.sync.syncing")
          : status === "pending"
            ? t.format("app.sync.pending", { count: state.pending })
            : status === "error"
              ? t.format(ERRORS[state.error ?? "unknown"], { min: MIN_PASSWORD })
              : status === "held"
                ? t.format("app.sync.saved-except")
                : t.format("app.sync.saved");
  return (
    <p className={styles.muted} role="status" data-sync-status={status} data-pending={state.pending} data-verified={state.verified === undefined ? undefined : String(state.verified)}>
      {text}
      {state.verified === false && ` ${t.format("app.sync.mismatch")}`}
    </p>
  );
};

/**
 * Events the server rejected (S13): how many, that they stay on this device and still count here,
 * and a way to send them again (a newer server may take them).
 */
const Held = ({ sync, count }: { sync: Sync; count: number }): JSX.Element => {
  const t = useTranslator();
  const [busy, setBusy] = useState(false);
  return (
    <p className={styles.notice} role="note" data-sync-held={count}>
      {t.format("app.sync.held", { count })}{" "}
      <Button
        className={styles.inlineButton}
        isDisabled={busy}
        onPress={() => {
          setBusy(true);
          void sync.retryHeld().finally(() => setBusy(false));
        }}
        data-action="sync-retry-held"
      >
        {t.format("app.sync.held-retry", { count })}
      </Button>
    </p>
  );
};

/** The form's password field: where Sign in again takes the learner, their address filled in. */
const toSignIn = (): void => {
  const field = document.querySelector<HTMLInputElement>("[data-account-form] [data-field=password]");
  if (field === null) return;
  field.focus({ preventScroll: true });
  // The middle of the screen, clear of a phone browser's bottom toolbar.
  field.scrollIntoView({ block: "center" });
};

/**
 * The server ended the session (ADR 0123): said at the top of Home, across reloads, until the learner
 * signs in again or stays signed out. Progress stays on the device either way.
 */
export const SignedOutNotice = ({ sync }: { sync: Sync }): JSX.Element | null => {
  const t = useTranslator();
  const signedOut = useSyncExternalStore(sync.subscribe, () => sync.get().signedOut);
  if (signedOut === undefined) return null;
  return (
    <p className={styles.notice} role="status" data-signed-out={signedOut.email}>
      {t.format("app.account.signed-out", { email: ltr(signedOut.email) })}{" "}
      <span className={styles.noticeActions}>
        <Button className={styles.inlineButton} onPress={toSignIn} data-action="sign-in-again">
          {t.format("app.account.sign-in-again")}
        </Button>
        <Button className={styles.inlineButton} onPress={() => void sync.staySignedOut()} data-action="stay-signed-out">
          {t.format("app.account.stay-signed-out")}
        </Button>
      </span>
    </p>
  );
};

/** `signedOut`: the server ended this person's session, so the form asks them to sign in again (ADR 0123). */
const AccountForm = ({ sync, ageRefused, signedOut }: { sync: Sync; ageRefused: boolean; signedOut: SignedOut | undefined }): JSX.Element => {
  const t = useTranslator();
  const [mode, setMode] = useState<"create" | "sign-in">(signedOut === undefined ? "create" : "sign-in");
  const [email, setEmail] = useState(signedOut?.email ?? "");
  const [password, setPassword] = useState("");
  // Only once the server asks (ADR 0069); the answer goes with the sign-up and nowhere else.
  const [askAge, setAskAge] = useState(false);
  const [age, setAge] = useState("");
  const [error, setError] = useState<SyncError | "invalid-age" | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // What a forgotten password leaves the learner (ADR 0123): the server cannot reset one.
  const [forgot, setForgot] = useState(false);
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (busy) return;
    const years = askAge ? parseDigits(age) : undefined;
    if (mode === "create" && askAge && years === undefined) {
      setError("invalid-age");
      return;
    }
    setBusy(true);
    void (mode === "create" ? sync.signUp(email, password, years) : sync.signIn(email, password)).then((result) => {
      setBusy(false);
      setError(result);
      if (result === "age-required") setAskAge(true);
      if (result === "age") setAge("");
    });
  };
  const turnedAway = mode === "create" && ageRefused;
  return (
    <Form className={styles.form} onSubmit={submit} data-account-form={mode}>
      {turnedAway ? (
        <p className={styles.formIntro} role="status" data-age-refused="">
          {t.format("app.account.age-refused")}
        </p>
      ) : (
        <AccountFields
          mode={mode}
          again={signedOut !== undefined}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          askAge={askAge}
          age={age}
          setAge={setAge}
        />
      )}
      {error !== undefined && !(turnedAway && error === "age") && (
        <p className={styles.notice} role="alert" data-account-error={error}>
          {t.format(ERRORS[error], { min: MIN_PASSWORD })}
        </p>
      )}
      <div className={styles.links}>
        {!turnedAway && (
          <Button className={styles.button} type="submit" isDisabled={busy} data-action="account-submit">
            {t.format(mode === "create" ? "app.account.create" : "app.account.sign-in")}
          </Button>
        )}
        {mode === "sign-in" && (
          <Button className={styles.textButton} onPress={() => setForgot(!forgot)} aria-expanded={forgot} data-action="forgot-password">
            {t.format("app.account.forgot")}
          </Button>
        )}
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
      {mode === "sign-in" && forgot && (
        <p className={styles.notice} role="note" data-no-reset="">
          {t.format("app.account.no-reset")}
        </p>
      )}
    </Form>
  );
};

interface FieldsProps {
  readonly mode: "create" | "sign-in";
  /** The server signed this person out: signing in is signing in again. */
  readonly again: boolean;
  readonly email: string;
  readonly setEmail: (v: string) => void;
  readonly password: string;
  readonly setPassword: (v: string) => void;
  readonly askAge: boolean;
  readonly age: string;
  readonly setAge: (v: string) => void;
}

const AccountFields = ({ mode, again, email, setEmail, password, setPassword, askAge, age, setAge }: FieldsProps): JSX.Element => {
  const t = useTranslator();
  return (
    <>
      <p className={styles.formIntro}>{t.format(mode === "create" ? "app.account.pitch" : again ? "app.error.account.signed-out" : "app.account.welcome-back")}</p>
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
      {mode === "create" && askAge && (
        <TextField className={styles.field} value={age} onChange={setAge} isRequired autoComplete="off" name="age">
          <Label className={styles.label}>{t.format("app.account.age")}</Label>
          <Input className={styles.input} inputMode="numeric" data-field="age" />
          <Text slot="description" className={styles.muted}>
            {t.format("app.account.age-note")}
          </Text>
        </TextField>
      )}
    </>
  );
};

/** `courses` names the courses a restored file holds (ADR 0109). */
export const Progress = ({ store, sync, courses }: { store: EventStore; sync: Sync; courses: readonly Named[] }): JSX.Element => {
  const t = useTranslator();
  const state = useSyncExternalStore(sync.subscribe, sync.get);
  const [deleted, setDeleted] = useState(false);
  return (
    <section className={`${styles.course} ${styles.progress}`} data-progress="" aria-labelledby="progress-title">
      <h2 className={styles.courseName} id="progress-title">
        {t.format("app.progress.title")}
      </h2>
      <DeviceCopy store={store} />
      {deleted && state.account === undefined && (
        <p className={styles.notice} role="status" data-account-deleted="">
          {t.format("app.account.deleted")}
        </p>
      )}
      {state.server !== undefined &&
        (state.account === undefined ? (
          // A sign-out by the server while the page is open starts the form afresh, on sign-in.
          <AccountForm key={state.signedOut?.email ?? ""} sync={sync} ageRefused={state.ageRefused} signedOut={state.signedOut} />
        ) : (
          <div data-account={state.account.user.email}>
            <p>
              {t.format("app.account.signed-in", { email: ltr(state.account.user.email) })}
            </p>
            <Status state={state} />
            {state.held > 0 && <Held sync={sync} count={state.held} />}
            <ProfileForm account={state.account} uiLocale={t.locale} />
            <Reminders account={state.account} />
            <Button className={styles.textButton} onPress={() => void sync.signOut()} data-action="sign-out">
              {t.format("app.account.sign-out")}
            </Button>
            <AccountData sync={sync} onDeleted={() => setDeleted(true)} />
          </div>
        ))}
      <div className={styles.links}>
        <Button className={styles.textButton} onPress={() => void download(store)} data-action="export">
          {t.format("app.progress.export")}
        </Button>
      </div>
      <Restore store={store} sync={sync} courses={courses} />
      <Voice signedIn={state.account !== undefined} />
    </section>
  );
};

/**
 * Your voice (§10.4): recordings are scored and dropped, never kept. With an account the learner
 * chooses whether the server's speech service may hear them; the pitch range learned on this
 * device (three numbers) can be forgotten.
 */
const Voice = ({ signedIn }: { signedIn: boolean }): JSX.Element | null => {
  const t = useTranslator();
  const [server, setServer] = useState(serverAllowed);
  const [range, setRange] = useState(() => loadCalibration() !== undefined);
  // Nothing to choose and nothing to forget (no server to allow, no pitch range kept): no panel (S4).
  // Once shown, it stays to say the range is forgotten.
  const [kept] = useState(range);
  if (!signedIn && !kept) return null;
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
