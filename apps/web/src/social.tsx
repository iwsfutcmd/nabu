/**
 * What an account adds (gameplan §12.4–12.7): a profile (a UTS #39 username, a free-form display
 * name), the weekly league when the server runs one, and practice reminders by Web Push.
 *
 * Names are user data in any script: every one is rendered inside <bdi>, so an Arabic name in an
 * English table, or a Latin one in an Arabic table, never reorders what is around it (§11.3).
 */
import { useTranslator } from "@nabu/ui";
import { useEffect, useState, type FormEvent, type JSX } from "react";
import { Button, Form, Input, Label, Switch, Text, TextField } from "react-aria-components";
import styles from "./App.module.css";
import { nativePlatform, registerDevice, savedToken, unregisterDevice, type NativePlatform } from "./native.ts";
import { isHttpError, request, type Account } from "./sync.ts";

interface Profile {
  readonly username: string;
  readonly displayName: string | null;
  readonly uiLocale: string;
}

const profileError = (e: unknown): string => {
  // No answer: no network is said apart from a server that does not answer (ADR 0123).
  if (!isHttpError(e)) return navigator.onLine === false ? "app.error.account.offline" : "app.error.account.unreachable";
  const detail = e.detail as { code?: string; reason?: string } | undefined;
  if (detail?.code === "invalid-username" && detail.reason !== undefined) return `app.error.profile.${detail.reason}`;
  if (detail?.code === "username-taken" || detail?.code === "username-confusable") return `app.error.profile.${detail.code}`;
  if (detail?.code === "invalid-display-name") return "app.error.profile.display-name";
  return "app.error.account.unknown";
};

export const ProfileForm = ({ account, uiLocale, onSaved }: { account: Account; uiLocale: string; onSaved?: () => void }): JSX.Element => {
  const t = useTranslator();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<{ readonly saved: boolean; readonly error?: string }>({ saved: false });
  useEffect(() => {
    void request<{ profile: Profile | null }>(account.server, "/v1/profile", { token: account.token }).then(
      ({ profile }) => {
        if (profile === null) return;
        setUsername(profile.username);
        setDisplayName(profile.displayName ?? "");
      },
      () => undefined,
    );
  }, [account]);
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    void request<{ profile: Profile }>(account.server, "/v1/profile", { token: account.token, method: "PUT", body: { username, displayName, uiLocale } }).then(
      () => {
        setStatus({ saved: true });
        onSaved?.();
      },
      (err: unknown) => setStatus({ saved: false, error: profileError(err) }),
    );
  };
  const error = status.error;
  return (
    <Form className={styles.form} onSubmit={submit} data-profile-form="">
      <h3 className={styles.unitTitle}>{t.format("app.profile.title")}</h3>
      <TextField className={styles.field} value={username} onChange={setUsername} isRequired name="username" autoComplete="username">
        <Label className={styles.label}>{t.format("app.profile.username")}</Label>
        {/* Usernames may be in any script: their direction comes from what is typed. */}
        <Input className={styles.input} dir="auto" spellCheck={false} autoCapitalize="none" data-field="username" />
        <Text slot="description" className={styles.muted}>
          {t.format("app.profile.username-hint")}
        </Text>
      </TextField>
      <TextField className={styles.field} value={displayName} onChange={setDisplayName} name="displayName" autoComplete="nickname">
        <Label className={styles.label}>{t.format("app.profile.display-name")}</Label>
        <Input className={styles.input} dir="auto" data-field="display-name" />
      </TextField>
      {error !== undefined && t.has(error) && (
        <p className={styles.notice} role="alert" data-profile-error={error}>
          {t.format(error)}
        </p>
      )}
      {status.saved && (
        <p className={styles.muted} role="status" data-profile-saved="">
          {t.format("app.profile.saved")}
        </p>
      )}
      <div className={styles.links}>
        <Button className={styles.button} type="submit" data-action="profile-save">
          {t.format("app.profile.save")}
        </Button>
      </div>
    </Form>
  );
};

type Outcome = "promoted" | "stayed" | "demoted";

interface Standing {
  readonly rank: number;
  readonly xp: number;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly you: boolean;
  readonly outcome: Outcome;
}

/** How the learner's last league week ended (M8): their place of how many, and the tier it took them to. */
interface LastResult {
  readonly week: string;
  readonly rank: number;
  readonly of: number;
  readonly outcome: Outcome;
  readonly nextTier: number;
}

interface Week {
  readonly enabled: true;
  readonly week: string;
  readonly endsAt: string;
  /** The learner said no to leagues (ADR 0122). */
  readonly optedOut: boolean;
  readonly last?: LastResult | undefined;
}

type LeagueView = { readonly enabled: false } | (Week & { readonly member: false }) | (Week & { readonly member: true; readonly tier: number; readonly standings: readonly Standing[] });

/** The standings in their zones (M8): the rows moving up, those staying, those moving down, each a run of ranks. */
const zonesOf = (standings: readonly Standing[]): readonly { readonly outcome: Outcome; readonly rows: readonly Standing[] }[] => {
  const zones: { outcome: Outcome; rows: Standing[] }[] = [];
  for (const s of standings) {
    const zone = zones.at(-1);
    if (zone?.outcome === s.outcome) zone.rows.push(s);
    else zones.push({ outcome: s.outcome, rows: [s] });
  }
  return zones;
};

const LAST: Readonly<Record<Outcome, "league.last.promoted" | "league.last.stayed" | "league.last.demoted">> = {
  promoted: "league.last.promoted",
  stayed: "league.last.stayed",
  demoted: "league.last.demoted",
};

/**
 * The weekly league, when the server runs one (§12.4); nothing at all otherwise. It says how last
 * week ended, names its zones, and lets the learner say no to leagues, or take part again (M8).
 */
export const LeaguePanel = ({ account, version }: { account: Account; version: unknown }): JSX.Element | null => {
  const t = useTranslator();
  const [view, setView] = useState<LeagueView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void request<LeagueView>(account.server, "/v1/league", { token: account.token }).then(setView, () => setView(null));
  }, [account, version]);
  if (view === null || !view.enabled) return null;
  const daysLeft = Math.max(0, Math.ceil((Date.parse(view.endsAt) - Date.now()) / 86_400_000));
  const takePart = (on: boolean): void => {
    setFailed(false);
    void request<LeagueView>(account.server, "/v1/league", { token: account.token, method: "PUT", body: { optedOut: !on } }).then(setView, () => setFailed(true));
  };
  const { last } = view;
  return (
    <section className={`${styles.course} ${styles.league}`} data-league={view.optedOut ? "opted-out" : view.member ? "member" : "not-member"} aria-labelledby="league-title">
      <h2 className={styles.courseName} id="league-title">
        {t.format("league.title")}
      </h2>
      {last !== undefined && (
        <p data-league-last={last.outcome} data-league-last-rank={last.rank}>
          {t.format("league.last.place", { rank: last.rank, of: last.of })} {t.format(LAST[last.outcome], { tier: last.nextTier })}
        </p>
      )}
      {view.optedOut ? null : !view.member ? (
        <p className={styles.muted}>{t.format("league.join")}</p>
      ) : (
        <>
          <p className={styles.stats}>
            <span className={styles.stat} data-league-tier={view.tier}>
              {t.format("league.tier", { tier: view.tier })}
            </span>
            <span className={styles.stat}>{t.format("league.days-left", { days: daysLeft })}</span>
          </p>
          <div className={styles.zones} data-standings="">
            {zonesOf(view.standings).map((zone) => (
              <div key={zone.rows[0]?.rank} className={styles.zone} data-zone={zone.outcome}>
                {/* The zones are named where they are, not only coloured (M8). */}
                {zone.outcome !== "stayed" && <h3 className={styles.zoneTitle}>{t.format(zone.outcome === "promoted" ? "league.zone.promote" : "league.zone.demote")}</h3>}
                <ol className={styles.standings} start={zone.rows[0]?.rank}>
                  {zone.rows.map((s) => (
                    <li key={s.rank} className={styles.standing} data-rank={s.rank} data-you={String(s.you)} data-outcome={s.outcome}>
                      <span>{s.rank}</span>
                      <span>
                        {/* User-chosen names, in any script: isolated so they never reorder the row. */}
                        <bdi>{s.displayName ?? s.username ?? t.format("league.anonymous")}</bdi>
                        {s.you && <span className={styles.muted}> · {t.format("league.you")}</span>}
                      </span>
                      <span>{t.format("league.xp", { xp: s.xp })}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </>
      )}
      {/* Leagues can be declined, and taken up again (M8): the account's choice, on every device. */}
      <div className={styles.leagueChoice} data-league-take-part={String(!view.optedOut)}>
        <p className={styles.muted}>{t.format(view.optedOut ? "league.out" : "league.visible")}</p>
        <Button className={view.optedOut ? styles.button : styles.textButton} onPress={() => takePart(view.optedOut)} data-action={view.optedOut ? "league-rejoin" : "league-leave"}>
          {t.format(view.optedOut ? "league.rejoin" : "league.leave")}
        </Button>
        {failed && (
          <p className={styles.notice} role="alert" data-league-error="">
            {t.format("app.error.account.unreachable")}
          </p>
        )}
      </div>
    </section>
  );
};

/** VAPID keys arrive base64url; pushManager.subscribe wants bytes. */
const bytes = (base64url: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(base64url.replace(/-/gu, "+").replace(/_/gu, "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

const SW = `${import.meta.env.BASE_URL}sw.js`;

/** Practice reminders (§12.6): Web Push in a browser, the platform's push service in the native app. */
export const Reminders = ({ account }: { account: Account }): JSX.Element | null => {
  const platform = nativePlatform();
  return platform === undefined ? <WebReminders account={account} /> : <NativeReminders account={account} platform={platform} />;
};

/** In the Android or iOS app: register the device token with the server (FCM or APNs, ADR 0048). */
const NativeReminders = ({ account, platform }: { account: Account; platform: NativePlatform }): JSX.Element | null => {
  const t = useTranslator();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [on, setOn] = useState(savedToken() !== undefined);
  const [problem, setProblem] = useState<"denied" | "failed" | null>(null);
  useEffect(() => {
    void request<{ platforms: string[] }>(account.server, "/v1/push/native", { token: account.token }).then(
      (r) => setAvailable(r.platforms.includes(platform)),
      () => setAvailable(false),
    );
  }, [account, platform]);
  if (available !== true) return null; // this server sends no reminders to this platform
  const toggle = async (next: boolean): Promise<void> => {
    if (!next) {
      const token = savedToken();
      if (token !== undefined) await request(account.server, "/v1/push/native/unregister", { token: account.token, body: { token } }).catch(() => undefined);
      await unregisterDevice();
      setOn(false);
      return;
    }
    const registered = await registerDevice();
    if ("error" in registered) {
      setProblem(registered.error);
      return;
    }
    await request(account.server, "/v1/push/native/register", { token: account.token, body: { platform, token: registered.token } });
    setProblem(null);
    setOn(true);
  };
  return (
    <div className={styles.field} data-reminders={on ? "on" : "off"} data-reminders-platform={platform}>
      <Switch isSelected={on} onChange={(v) => void toggle(v)} data-action="reminders">
        {t.format("app.reminders.label")}
      </Switch>
      <p className={styles.muted}>{t.format(problem === "denied" ? "app.reminders.denied" : problem === "failed" ? "app.reminders.failed" : "app.reminders.when")}</p>
    </div>
  );
};

/** In a browser: a switch that subscribes through the service worker (Web Push). */
const WebReminders = ({ account }: { account: Account }): JSX.Element | null => {
  const t = useTranslator();
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const [key, setKey] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [problem, setProblem] = useState<"denied" | "unsupported" | null>(supported ? null : "unsupported");
  useEffect(() => {
    if (!supported) return;
    void request<{ publicKey: string }>(account.server, "/v1/push/key", { token: account.token }).then(
      (k) => setKey(k.publicKey),
      () => setKey(null),
    );
    void navigator.serviceWorker.getRegistration(SW).then(async (reg) => setOn((await reg?.pushManager.getSubscription()) != null));
  }, [account, supported]);
  if (key === null && problem === null) return null; // this server sends no reminders
  const toggle = async (next: boolean): Promise<void> => {
    if (key === null) return;
    const reg = await navigator.serviceWorker.register(SW);
    if (!next) {
      const sub = await reg.pushManager.getSubscription();
      if (sub !== null) {
        await request(account.server, "/v1/push/unsubscribe", { token: account.token, body: { endpoint: sub.endpoint } }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setOn(false);
      return;
    }
    if ((await Notification.requestPermission()) !== "granted") {
      setProblem("denied");
      return;
    }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(key) });
    await request(account.server, "/v1/push/subscribe", { token: account.token, body: sub.toJSON() });
    setProblem(null);
    setOn(true);
  };
  return (
    <div className={styles.field} data-reminders={on ? "on" : "off"}>
      <Switch isSelected={on} isDisabled={problem === "unsupported"} onChange={(v) => void toggle(v)} data-action="reminders">
        {t.format("app.reminders.label")}
      </Switch>
      <p className={styles.muted}>{t.format(problem === "denied" ? "app.reminders.denied" : problem === "unsupported" ? "app.reminders.unsupported" : "app.reminders.when")}</p>
    </div>
  );
};
