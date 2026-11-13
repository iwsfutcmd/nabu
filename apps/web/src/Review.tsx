/**
 * The review workspace (ADR 0074): for reviewer accounts, signed in on the course list.
 *
 * - #/review lists the courses the account reviews (GET /v1/review/me).
 * - #/review/<course>/<orthography> shows the course's sentences and stories, as the sentence
 *   list does, with each item's clip and accept sets, a field to accept one more answer, and
 *   sign-offs kept on the server; and the reports and corrections learners filed, to approve or
 *   reject.
 *
 * Everything goes through the API with the account's token; nothing here touches the device's
 * learner log except "This is wrong", which files a correction like anywhere else in the app.
 */
import { correctionKey, type Correctable, type SignOffKind, type UnitCorrectables } from "@nabu/core/corrections";
import type { AnswerReport, SentenceCorrection, SentenceReported, SignOff, SignOffs } from "@nabu/schema";
import { useTranslator } from "@nabu/ui";
import { SentenceList, signOffKey } from "@nabu/ui/corrections";
import type { CourseIndexEntry, LoadedCourse } from "@nabu/ui/player";
import { ItemDetails, Queue, type AcceptResult, type Decision } from "@nabu/ui/review";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type JSX } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import styles from "./App.module.css";
import { CorrectionDialog, Sent, signOffOf, unitSignOffs, type Recording } from "./Corrections.tsx";
import { isHttpError, request } from "./http.ts";
import type { Account, Sync } from "./sync.ts";

export interface ReviewerInfo {
  readonly handle: string;
  /** Course ids, or ["*"]: every course. */
  readonly courses: readonly string[];
}

/** What GET /v1/review/me answers: the role, or none (D11: {role: null}, not a refusal). */
type RoleAnswer = { readonly role?: "reviewer" | null; readonly handle?: unknown; readonly courses?: unknown } | undefined;

/** The reviewer an answer names, or null for an account that reviews nothing. */
export const reviewerIn = (answer: RoleAnswer): ReviewerInfo | null =>
  answer !== undefined && answer.role !== null && typeof answer.handle === "string" && Array.isArray(answer.courses) && answer.courses.every((c) => typeof c === "string")
    ? { handle: answer.handle, courses: answer.courses }
    : null;

export type ReviewerState =
  | { readonly kind: "loading" }
  | { readonly kind: "none"; readonly why: "no-server" | "signed-out" | "not-reviewer" | "error" }
  | { readonly kind: "reviewer"; readonly info: ReviewerInfo; readonly account: Account };

export const reviews = (info: ReviewerInfo, course: string): boolean => info.courses.includes("*") || info.courses.includes(course);

const noSync = { subscribe: () => () => undefined };

/**
 * The server's answer about an account's role, kept for this browser session (null: not a
 * reviewer). Only the server knows the role, and an admin may grant it at any time, so the app
 * asks; but most accounts review nothing, and the course list should not ask (and be refused)
 * every time it opens. The workspace asks afresh and keeps its answer here.
 */
const ROLE = "nabu.reviewer:";
const roleKey = (account: Account): string => `${ROLE}${account.server} ${account.user.id}`;

const rememberedRole = (account: Account): ReviewerInfo | null | undefined => {
  try {
    const value = sessionStorage.getItem(roleKey(account));
    return value === null ? undefined : (JSON.parse(value) as ReviewerInfo | null);
  } catch {
    return undefined;
  }
};

const rememberRole = (account: Account, info: ReviewerInfo | null): void => {
  try {
    sessionStorage.setItem(roleKey(account), JSON.stringify(info));
  } catch {
    // No session storage: the next screen asks again.
  }
};

/**
 * Whether the signed-in account reviews courses, and which. `fresh` (the workspace itself) asks
 * the server every time; otherwise an answer from earlier in this browser session stands.
 */
export const useReviewer = (sync: Sync | null, fresh = false): ReviewerState => {
  const server = useSyncExternalStore(sync?.subscribe ?? noSync.subscribe, () => sync?.get().server);
  const account = useSyncExternalStore(sync?.subscribe ?? noSync.subscribe, () => sync?.get().account);
  const [state, setState] = useState<ReviewerState>({ kind: "loading" });
  useEffect(() => {
    if (sync === null) return;
    if (server === undefined) return setState({ kind: "none", why: "no-server" });
    if (account === undefined) return setState({ kind: "none", why: "signed-out" });
    const known = fresh ? undefined : rememberedRole(account);
    if (known !== undefined) return setState(known === null ? { kind: "none", why: "not-reviewer" } : { kind: "reviewer", info: known, account });
    let live = true;
    setState({ kind: "loading" });
    request<RoleAnswer>(account.server, "/v1/review/me", { token: account.token }).then(
      (answer) => {
        // No role (D11) is an answer too: the account reviews nothing.
        const info = reviewerIn(answer);
        rememberRole(account, info);
        if (live) setState(info === null ? { kind: "none", why: "not-reviewer" } : { kind: "reviewer", info, account });
      },
      (e: unknown) => {
        // A server from before D11 refuses instead (403): that is the same answer. Anything else
        // is asked again next time.
        const refused = isHttpError(e) && e.status === 403;
        if (refused) rememberRole(account, null);
        if (live) setState({ kind: "none", why: refused ? "not-reviewer" : "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [sync, server, account, fresh]);
  return state;
};

const WHY = { "no-server": "review.workspace.no-server", "signed-out": "review.workspace.sign-in", "not-reviewer": "review.workspace.not-reviewer", error: "review.workspace.error" } as const;

const Status = ({ state }: { state: ReviewerState }): JSX.Element | null => {
  const t = useTranslator();
  if (state.kind === "loading") return <p className={styles.muted}>{t.format("player.loading")}</p>;
  if (state.kind === "none") return <p className={styles.notice} role="note" data-reviewer={state.why}>{t.format(WHY[state.why])}</p>;
  return (
    <p className={styles.muted} data-reviewer="yes">
      {t.format("review.workspace.as", { handle: state.info.handle })}
    </p>
  );
};

type Names = { readonly course: (id: string) => string; readonly orthography: (id: string) => string };

/** #/review: the courses this account reviews, one link per orthography. */
export const ReviewHome = ({ courses, sync, names, back, hrefOf }: { courses: readonly CourseIndexEntry[]; sync: Sync; names: Names; back: string; hrefOf: (course: string, orthography: string) => string }): JSX.Element => {
  const t = useTranslator();
  const state = useReviewer(sync, true);
  const mine = state.kind === "reviewer" ? courses.filter((c) => reviews(state.info, c.id)) : [];
  return (
    <main className={styles.page} data-review-home="">
      <p>
        <a className={styles.back} href={back}>
          {t.format("app.lessons.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("review.workspace.title")}</h1>
      <Status state={state} />
      {mine.length > 0 && (
        <section aria-labelledby="review-courses">
          <h2 className={styles.courseName} id="review-courses">
            {t.format("review.workspace.courses")}
          </h2>
          <ul className={styles.list}>
            {mine.map((c) => (
              <li key={c.id} className={styles.course} data-review-course={c.id}>
                <h3 className={styles.courseName}>{names.course(c.id)}</h3>
                <div className={styles.links}>
                  {c.orthographies.map((o) => (
                    <a key={o} className={styles.link} href={hrefOf(c.id, o)} data-orthography={o}>
                      {names.orthography(o)}
                    </a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
};

interface PageProps extends Recording {
  readonly loaded: LoadedCourse;
  readonly sync: Sync;
  readonly corrections: ReadonlyMap<string, SentenceReported>;
  readonly back: string;
}

/** Sign-offs kept on the server, by signOffKey. */
const useServerSignOffs = (account: Account | undefined, course: string): { signed: ReadonlySet<string>; put: (list: readonly SignOff[]) => Promise<boolean>; remove: (kind: SignOffKind, item: string) => Promise<boolean> } => {
  const [signed, setSigned] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (account === undefined) return;
    let live = true;
    request<SignOffs>(account.server, `/v1/review/signoffs?course=${encodeURIComponent(course)}`, { token: account.token }).then(
      (file) => live && setSigned(new Set(file.signoffs.map((s) => signOffKey(s.kind, s.item)))),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [account, course]);
  const put = useCallback(
    async (list: readonly SignOff[]): Promise<boolean> => {
      if (account === undefined || list.length === 0) return false;
      try {
        await request(account.server, "/v1/review/signoffs", { token: account.token, method: "PUT", body: { course, signoffs: list } });
        setSigned((before) => new Set([...before, ...list.map((s) => signOffKey(s.kind, s.item))]));
        return true;
      } catch {
        return false;
      }
    },
    [account, course],
  );
  const remove = useCallback(
    async (kind: SignOffKind, item: string): Promise<boolean> => {
      if (account === undefined) return false;
      try {
        await request(account.server, `/v1/review/signoffs/${encodeURIComponent(course)}/${kind}/${encodeURIComponent(item)}`, { token: account.token, method: "DELETE" });
      } catch (e) {
        if (!(isHttpError(e) && e.status === 404)) return false;
      }
      setSigned((before) => new Set([...before].filter((k) => k !== signOffKey(kind, item))));
      return true;
    },
    [account, course],
  );
  return { signed, put, remove };
};

/** The course's reports and corrections still to decide, and the ones decided here (they stay, with their new status). */
const useQueue = (account: Account | undefined, course: string): { reports: AnswerReport[]; corrections: SentenceCorrection[]; decide: (kind: "report" | "correction", id: string, status: Decision) => Promise<boolean> } => {
  const [reports, setReports] = useState<AnswerReport[]>([]);
  const [corrections, setCorrections] = useState<SentenceCorrection[]>([]);
  useEffect(() => {
    if (account === undefined) return;
    let live = true;
    const q = `course=${encodeURIComponent(course)}&status=pending`;
    void Promise.all([
      request<{ reports: AnswerReport[] }>(account.server, `/v1/review/reports?${q}`, { token: account.token }),
      request<{ corrections: SentenceCorrection[] }>(account.server, `/v1/review/corrections?${q}`, { token: account.token }),
    ]).then(
      ([r, c]) => {
        if (!live) return;
        setReports(r.reports);
        setCorrections(c.corrections);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [account, course]);
  const decide = useCallback(
    async (kind: "report" | "correction", id: string, status: Decision): Promise<boolean> => {
      if (account === undefined) return false;
      try {
        await request(account.server, `/v1/review/${kind === "report" ? "reports" : "corrections"}/${encodeURIComponent(id)}`, { token: account.token, body: { status } });
      } catch {
        return false;
      }
      if (kind === "report") setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
      else setCorrections((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
      return true;
    },
    [account],
  );
  return { reports, corrections, decide };
};

/** #/review/<course>/<orthography>: one course's workspace. */
export const ReviewPage = ({ loaded, sync, corrections, back, ...recording }: PageProps): JSX.Element => {
  const t = useTranslator();
  const state = useReviewer(sync, true);
  const { course } = loaded;
  const allowed = state.kind === "reviewer" && reviews(state.info, course.id);
  const account = allowed ? state.account : undefined;
  const [unit, setUnit] = useState<string | undefined>(undefined);
  const [target, setTarget] = useState<Correctable | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const signoffs = useServerSignOffs(account, course.id);
  const queue = useQueue(account, course.id);

  const signOff = useCallback(
    async (pairs: readonly (readonly [SignOffKind, string])[]): Promise<void> => {
      const at = new Date().toISOString();
      const made = (await Promise.all(pairs.map(([kind, item]) => signOffOf(course, kind, item, at)))).filter((s): s is SignOff => s !== undefined);
      setFailed(!(await signoffs.put(made)) && made.length > 0);
    },
    [course, signoffs],
  );
  const controls = useMemo(
    () => ({
      signed: signoffs.signed,
      onSignOff: (kind: SignOffKind, item: string, on: boolean): void => {
        if (on) void signOff([[kind, item]]);
        else void signoffs.remove(kind, item).then((ok) => setFailed(!ok));
      },
      onSignOffUnit: (u: UnitCorrectables): void => void signOff(unitSignOffs(u, corrections)),
    }),
    [signoffs, signOff, corrections],
  );
  const accept = useCallback(
    async (item: string, answer: string): Promise<AcceptResult> => {
      if (account === undefined) return "failed";
      try {
        await request(account.server, "/v1/review/accepts", { token: account.token, body: { course: course.id, orthography: course.orthography, item, answer } });
        return "added";
      } catch {
        return "failed";
      }
    },
    [account, course],
  );
  const details = useCallback(
    (c: Correctable): JSX.Element => <ItemDetails course={course} target={c} url={loaded.imageUrl} onAccept={c.kind === "sentence" ? (answer) => accept(c.item, answer) : undefined} />,
    [course, loaded.imageUrl, accept],
  );

  return (
    <main className={styles.page} data-review-page={course.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("review.workspace.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("review.workspace.title")}</h1>
      <Status state={state.kind === "reviewer" && !allowed ? { kind: "none", why: "not-reviewer" } : state} />
      {allowed && (
        <>
          <p className={styles.muted}>{t.format("review.workspace.intro")}</p>
          {failed && (
            <p className={styles.notice} role="alert" data-review-error="">
              {t.format("review.workspace.error")}
            </p>
          )}
          {sent && <Sent />}
          <Tabs className={styles.tabs}>
            <TabList className={styles.tabList} aria-label={t.format("review.workspace.title")}>
              <Tab className={styles.tab} id="sentences" data-tab="sentences">
                {t.format("review.workspace.sentences")}
              </Tab>
              <Tab className={styles.tab} id="queue" data-tab="queue">
                {t.format("review.workspace.queue")}
              </Tab>
            </TabList>
            <TabPanel id="sentences">
              <SentenceList
                course={course}
                corrections={corrections}
                unit={unit}
                onUnit={setUnit}
                onCorrect={(c) => {
                  setSent(false);
                  setTarget(c);
                }}
                review={controls}
                details={details}
              />
            </TabPanel>
            <TabPanel id="queue">
              <Queue course={course} reports={queue.reports} corrections={queue.corrections} onDecide={(kind, id, status) => void queue.decide(kind, id, status).then((ok) => setFailed(!ok))} />
            </TabPanel>
          </Tabs>
          {target !== undefined && (
            <CorrectionDialog
              {...recording}
              course={course}
              target={target}
              previous={corrections.get(correctionKey(target.item, target.step))}
              onClose={(done) => {
                setTarget(undefined);
                if (done) setSent(true);
              }}
            />
          )}
        </>
      )}
    </main>
  );
};
