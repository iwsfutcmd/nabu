/**
 * The AI features in the app (gameplan §13), all optional. Without an account, or on a server
 * without a model, the app offers only what needs no model: reporting an answer, which is an
 * event in the learner's own log and reaches reviewers when it syncs. With one:
 * - a second check by the judge, for typed answers graded wrong, where an evaluation opened its
 *   gate for the course orthography: an accept arrives as an outcome_revised event, and the
 *   projections recompute. Offline, the check waits in a queue for the next sync;
 * - Explain My Answer, on request;
 * - roleplay conversations, once the scenario's node is done.
 */
import { JUDGED_TEMPLATES, judgeable } from "@nabu/core/ai";
import type { CourseView, Exercise } from "@nabu/core/lesson";
import type { LearnerState } from "@nabu/core/learner";
import { surfaceOf } from "@nabu/core/text";
import { directionOf } from "@nabu/i18n";
import type { AnswerReported, AnswerSubmitted, BundleScenario, Explanation, LearnerEvent, RoleplayTurn, TaggedText } from "@nabu/schema";
import { T, useTranslator } from "@nabu/ui";
import { aiStyles, ExplanationView, RoleplayChat, type ChatTurn, type Rating, type RoleplayStatus } from "@nabu/ui/ai";
import { useEffect, useState, useSyncExternalStore, type JSX } from "react";
import styles from "./App.module.css";
import { localDate, localIso, timeZone, uuidv7 } from "./clock.ts";
import type { EventStore } from "./store.ts";
import { isHttpError, queueJudge, request, type Account, type Sync } from "./sync.ts";

export interface AiStatus {
  readonly judge: boolean;
  readonly explain: boolean;
  readonly roleplay: boolean;
}

const OFF: AiStatus = { judge: false, explain: false, roleplay: false };
/** Templates whose wrong answers can be explained: translations, typed or built from tiles. */
const EXPLAINED: ReadonlySet<string> = new Set(["translate-type.l1-l2", "translate-tap.l1-l2", "translate-tap.l2-l1"]);

const noSync = { subscribe: () => () => undefined, get: () => undefined };

/** The signed-in account, if any. */
export const useAccount = (sync: Sync | null): Account | undefined => useSyncExternalStore(sync?.subscribe ?? noSync.subscribe, () => sync?.get().account);

const statuses = new Map<string, Promise<AiStatus>>();

/** What the server offers for this course orthography; all off without an account or a server. */
export const useAiStatus = (account: Account | undefined, course: string, orthography: string): AiStatus => {
  const [status, setStatus] = useState<AiStatus>(OFF);
  useEffect(() => {
    if (account === undefined) {
      setStatus(OFF);
      return;
    }
    const key = `${account.server}\u0000${account.token}\u0000${course}\u0000${orthography}`;
    let pending = statuses.get(key);
    if (pending === undefined) {
      pending = request<AiStatus>(account.server, `/v1/ai/status?course=${encodeURIComponent(course)}&orthography=${encodeURIComponent(orthography)}`, { token: account.token }).catch(() => {
        statuses.delete(key);
        return OFF;
      });
      statuses.set(key, pending);
    }
    let live = true;
    void pending.then((s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, [account, course, orthography]);
  return status;
};

type Judge = "idle" | "checking" | "accepted" | "queued";
type Explain = { readonly tag: "idle" } | { readonly tag: "loading" } | { readonly tag: "shown"; readonly explanation: Explanation; readonly key: string; readonly rating?: Rating } | { readonly tag: "failed"; readonly why: "ai.explain.failed" | "ai.unavailable" | "ai.budget" };

export interface AnswerHelpProps {
  readonly answer: AnswerSubmitted | undefined;
  readonly ex: Exercise;
  readonly status: AiStatus;
  readonly account: Account | undefined;
  readonly store: EventStore;
  readonly record: (event: LearnerEvent) => void;
}

/** "My answer should be accepted" for a wrong typed answer (§13.2): an event, synced like any other. */
const reportOf = (answer: AnswerSubmitted): AnswerReported => {
  const now = new Date();
  return {
    id: uuidv7(now.getTime()),
    type: "answer_reported",
    schema: 1,
    device: answer.device,
    ...(answer.user === undefined ? {} : { user: answer.user }),
    course: answer.course,
    orthography: answer.orthography,
    support: answer.support,
    bundle: answer.bundle,
    session: answer.session,
    clientTime: localIso(now),
    localDate: localDate(now),
    tz: timeZone(),
    answer: answer.id,
    exercise: answer.exercise,
    text: answer.input.raw ?? "",
  };
};

const failure = (e: unknown): "ai.explain.failed" | "ai.unavailable" | "ai.budget" =>
  isHttpError(e) ? (e.status === 429 ? "ai.budget" : e.status === 503 ? "ai.unavailable" : "ai.explain.failed") : "ai.unavailable";

/** Under the feedback for a wrong answer: report it, a second check by the judge, an explanation. */
export const AnswerHelp = ({ answer, ex, status, account, store, record }: AnswerHelpProps): JSX.Element | null => {
  const t = useTranslator();
  const [reported, setReported] = useState(false);
  const [judge, setJudge] = useState<Judge>("idle");
  const [explain, setExplain] = useState<Explain>({ tag: "idle" });
  const wrong = answer !== undefined && !answer.outcome.kind.startsWith("CORRECT") && (answer.input.raw ?? "").trim() !== "";
  const reportable = wrong && JUDGED_TEMPLATES.has(ex.template);
  const explainable = wrong && status.explain && EXPLAINED.has(ex.template);

  useEffect(() => {
    if (answer === undefined || account === undefined || !status.judge || !judgeable(answer)) return;
    let live = true;
    setJudge("checking");
    request<{ revision?: LearnerEvent }>(account.server, "/v1/ai/judge", { token: account.token, body: { answer } }).then(
      (res) => {
        if (res.revision !== undefined) record(res.revision);
        if (live) setJudge(res.revision === undefined ? "idle" : "accepted");
      },
      (e: unknown) => {
        // Unreachable: ask again on the next sync. Anything else: the accept sets stand.
        if (!isHttpError(e) || e.status === 503) {
          void queueJudge(store, answer);
          if (live) setJudge("queued");
        } else if (live) setJudge("idle");
      },
    );
    return () => {
      live = false;
    };
  }, [answer, account, status.judge, store, record]);

  if (!reportable && !explainable && judge === "idle") return null;
  const askExplanation = (): void => {
    if (answer === undefined || account === undefined) return;
    setExplain({ tag: "loading" });
    request<{ explanation: Explanation; key: string }>(account.server, "/v1/ai/explain", { token: account.token, body: { answer } }).then(
      ({ explanation, key }) => setExplain({ tag: "shown", explanation, key }),
      (e: unknown) => setExplain({ tag: "failed", why: failure(e) }),
    );
  };
  const rate = (rating: Rating): void => {
    if (explain.tag !== "shown" || account === undefined) return;
    setExplain({ ...explain, rating });
    void request(account.server, "/v1/ai/explain/rate", { token: account.token, body: { key: explain.key, rating } }).catch(() => undefined);
  };
  return (
    <div className={aiStyles.help} data-answer-help="">
      <p className={aiStyles.status} role="status" data-judge={judge}>
        {judge === "checking" ? t.format("ai.judge.checking") : judge === "accepted" ? t.format("ai.judge.accepted") : judge === "queued" ? t.format("ai.judge.queued") : ""}
      </p>
      <div className={aiStyles.actions}>
        {reportable && judge !== "accepted" && (
          <button
            type="button"
            className={aiStyles.action}
            disabled={reported}
            onClick={() => {
              if (answer === undefined) return;
              record(reportOf(answer));
              setReported(true);
            }}
            data-action="report"
          >
            {t.format("ai.report.button")}
          </button>
        )}
        {explainable && explain.tag === "idle" && (
          <button type="button" className={aiStyles.action} onClick={askExplanation} data-action="explain">
            {t.format("ai.explain.button")}
          </button>
        )}
      </div>
      {reported && (
        <p className={aiStyles.status} role="status" data-reported="">
          {t.format("ai.report.done")}
        </p>
      )}
      {explain.tag === "loading" && (
        <p className={aiStyles.status} role="status">
          {t.format("ai.explain.loading")}
        </p>
      )}
      {explain.tag === "failed" && (
        <p className={aiStyles.status} role="status" data-explain-failed="">
          {t.format(explain.why)}
        </p>
      )}
      {explain.tag === "shown" && <ExplanationView explanation={explain.explanation} rating={explain.rating} onRate={rate} />}
    </div>
  );
};

// ------------------------------------------------------------------------------------- roleplay

export const scenariosOf = (course: CourseView): readonly BundleScenario[] => course.units.flatMap((u) => u.scenarios ?? []);

/** The conversations on the course page: open once their node is done, when the server offers roleplay. */
export const Conversations = ({ course, state, status, link }: { course: CourseView; state: LearnerState; status: AiStatus; link: (scenario: string) => string }): JSX.Element | null => {
  const t = useTranslator();
  const scenarios = scenariosOf(course);
  if (!status.roleplay || scenarios.length === 0) return null;
  return (
    <section data-conversations="">
      <h2 className={styles.subheading}>{t.format("app.roleplay.title")}</h2>
      <p className={styles.muted}>{t.format("app.roleplay.note")}</p>
      <ul className={styles.list}>
        {scenarios.map((s) => {
          const title = s.title[course.supportKey];
          const open = state.completedNodes.includes(s.after);
          const body = title === undefined ? s.id : <T text={title} />;
          return (
            <li key={s.id}>
              {open ? (
                <a className={`${styles.lesson} ${styles.next}`} href={link(s.id)} data-scenario={s.id} data-status="available">
                  {body}
                </a>
              ) : (
                <div className={`${styles.lesson} ${styles.locked}`} aria-disabled="true" data-scenario={s.id} data-status="locked">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export interface RoleplayPageProps {
  readonly course: CourseView;
  readonly scenario: string;
  readonly account: Account | undefined;
  readonly status: AiStatus;
  readonly back: string;
}

/** One conversation (§13.4). The character speaks first when the learner starts it. */
export const RoleplayPage = ({ course, scenario: id, account, status, back }: RoleplayPageProps): JSX.Element => {
  const t = useTranslator();
  const [turns, setTurns] = useState<readonly ChatTurn[]>([]);
  const [phase, setPhase] = useState<RoleplayStatus>("idle");
  const scenario = scenariosOf(course).find((s) => s.id === id);
  const key = course.supportKey;
  const text = (field: "title" | "setting" | "character" | "goal"): TaggedText | undefined => scenario?.[field][key];
  const card = { title: text("title"), setting: text("setting"), character: text("character"), goal: text("goal") };
  const base = course.units.flatMap((u) => u.sentences).find((s) => s.forms[course.orthography] !== undefined)?.forms[course.orthography]?.text;
  if (scenario === undefined || account === undefined || !status.roleplay || base === undefined || card.title === undefined || card.setting === undefined || card.character === undefined || card.goal === undefined) {
    return (
      <main className={styles.page}>
        <p role="note" data-roleplay-unavailable="">
          {t.format("app.roleplay.unavailable")}
        </p>
        <a className={styles.back} href={back}>
          {t.format("app.roleplay.back")}
        </a>
      </main>
    );
  }
  const next = (history: readonly ChatTurn[]): void => {
    setTurns(history);
    setPhase("thinking");
    request<{ turn: RoleplayTurn }>(account.server, "/v1/ai/roleplay", {
      token: account.token,
      body: { course: course.id, orthography: course.orthography, support: key, scenario: scenario.id, history: history.map((h) => ({ role: h.role, text: surfaceOf(h.text) })) },
    }).then(
      ({ turn }) => {
        setTurns([...history, { role: "character", text: turn.text, translation: turn.translation }]);
        setPhase("idle");
      },
      (e: unknown) => setPhase(isHttpError(e) ? (e.code === "ai-no-turn" ? "no-turn" : e.status === 429 ? "budget" : "unavailable") : "unavailable"),
    );
  };
  return (
    <main className={styles.page} data-roleplay-page={scenario.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("app.roleplay.back")}
        </a>
      </p>
      <RoleplayChat
        scenario={{ title: card.title, setting: card.setting, character: card.character, goal: card.goal }}
        turns={turns}
        base={{ lang: base.lang, orthography: base.orthography }}
        dir={directionOf(base.lang)}
        status={phase}
        onSend={(turn) => next([...turns, { role: "learner", text: turn }])}
      />
      {turns.length === 0 && phase !== "thinking" && (
        <button type="button" className={aiStyles.action} onClick={() => next([])} data-action="start">
          {t.format("ai.roleplay.start")}
        </button>
      )}
    </main>
  );
};
