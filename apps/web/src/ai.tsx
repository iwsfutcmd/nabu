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
import { judgeable, ROLEPLAY_HISTORY, textBase } from "@nabu/core/ai";
import { answerTextOf, SPEAKING, TEMPLATES, type CourseView, type Exercise, type Response, type TemplateId } from "@nabu/core/lesson";
import type { LearnerState } from "@nabu/core/learner";
import { surfaceOf } from "@nabu/core/text";
import { directionOf } from "@nabu/i18n";
import type { AnswerReported, AnswerSubmitted, BundleScenario, Explanation, LearnerEvent, RoleplayTurn, TaggedText } from "@nabu/schema";
import { T, useTranslator } from "@nabu/ui";
import { aiStyles, ExplanationView, RoleplayChat, type ChatTurn, type Rating, type RoleplayStatus } from "@nabu/ui/ai";
import { useEffect, useState, useSyncExternalStore, type JSX } from "react";
import styles from "./App.module.css";
import { localDate, localIso, timeZone, uuidv7 } from "./clock.ts";
import { Sent } from "./Corrections.tsx";
import { ReportButton, type Claim, type Correcting } from "./Report.tsx";
import { ScreenHeading } from "./screen.tsx";
import type { EventStore } from "./store.ts";
import { isHttpError, queueJudge, request, type Account, type Sync } from "./sync.ts";

export interface AiStatus {
  readonly judge: boolean;
  readonly explain: boolean;
  readonly roleplay: boolean;
}

const OFF: AiStatus = { judge: false, explain: false, roleplay: false };
/** Templates whose wrong answers can be explained: translations, typed or built from tiles. */
/** Templates Explain My Answer covers (`TemplateInfo.explained`, C11). */
const EXPLAINED: ReadonlySet<string> = new Set((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].explained === true));

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
  /** The response graded: a story question's tile order or choice, which the answer event does not keep. */
  readonly response?: Response | null | undefined;
  readonly status: AiStatus;
  readonly account: Account | undefined;
  readonly store: EventStore;
  readonly record: (event: LearnerEvent) => void;
  /** What the card was built from, which the report button offers to correct (none for a story question). */
  readonly correcting?: Correcting | undefined;
}

/**
 * What a learner can claim about their answer (ADR 0052): any answer with text (typed, built from
 * tiles, an option chosen; story questions too). A wrong one "should have been accepted", a right
 * one "should have been wrong"; either counts that way for the learner at once and joins the
 * review queue. Speaking is graded by the voice, and pairs have no single answer: neither is claimed.
 */
const reportable = (template: string): boolean =>
  (!SPEAKING.has(template as TemplateId) || SCORED_SPEECH.has(template)) && TEMPLATES[template as TemplateId].modality.input !== "pairs";

/**
 * The grades that let an answer pass with a difference (a typo, marks, a variant form): only after
 * one can a right answer be claimed wrong (M6). An answer the accept set lists is the course's own:
 * if that is wrong, the sentence is ("This sentence is wrong").
 */
const LENIENT: ReadonlySet<string> = new Set(["CORRECT_WITH_TYPO", "CORRECT_MARKS", "CORRECT_VARIANT"]);

/**
 * Speaking cards the device scores (tones, sounds): the scoring can be wrong, so the learner can
 * say they said it right. The claim's text is the sentence they were asked to say: no recording
 * and no transcript leave the device. A self-rated card (speak.tier-0) has nothing to overrule.
 */
const SCORED_SPEECH: ReadonlySet<string> = new Set((Object.keys(TEMPLATES) as TemplateId[]).filter((t) => TEMPLATES[t].modality.mic && TEMPLATES[t].selfRated !== true));

/** "My answer should have been accepted" or "this should have been wrong" (§13.2, ADR 0052). */
const reportOf = (answer: AnswerSubmitted, text: string, claim: "accept" | "reject"): AnswerReported => {
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
    text,
    ...(claim === "accept" ? {} : { claim }),
  };
};

const failure = (e: unknown): "ai.explain.failed" | "ai.unavailable" | "ai.budget" =>
  isHttpError(e) ? (e.status === 429 ? "ai.budget" : e.status === 503 ? "ai.unavailable" : "ai.explain.failed") : "ai.unavailable";

/**
 * Under the feedback for an answer: the second check by the judge and an explanation (for a wrong
 * answer, where the server offers them), and one button to report a problem (Report.tsx).
 */
export const AnswerHelp = ({ answer, ex, response, status, account, store, record, correcting }: AnswerHelpProps): JSX.Element | null => {
  const t = useTranslator();
  const [reported, setReported] = useState<Claim | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [judge, setJudge] = useState<Judge>("idle");
  const [explain, setExplain] = useState<Explain>({ tag: "idle" });
  const spoken = SCORED_SPEECH.has(ex.template) && "prompt" in ex ? surfaceOf(ex.prompt) : undefined;
  const text = (spoken ?? answer?.input.raw ?? (response === undefined || response === null ? undefined : answerTextOf(ex, response)) ?? "").normalize("NFC").trim();
  const right = answer !== undefined && answer.outcome.kind.startsWith("CORRECT");
  const wrong = answer !== undefined && !right && text !== "";
  // A wrong answer can be claimed right; a right one wrong only after a lenient grade; a spoken answer only right.
  const claim: Claim | undefined =
    answer === undefined || text === "" || !reportable(ex.template) ? undefined : right ? (spoken === undefined && LENIENT.has(answer.outcome.kind) ? "reject" : undefined) : "accept";
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

  // Once the judge has accepted the answer, there is nothing left to claim.
  const offered = judge === "accepted" ? undefined : claim;
  const correctable = (correcting?.targets.length ?? 0) > 0;
  if (offered === undefined && !correctable && !explainable && judge === "idle" && reported === undefined && !sent) return null;
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
    <div className={styles.answerTools} data-answer-help="">
      <div className={styles.answerToolsRow}>
        {explainable && explain.tag === "idle" && (
          <button type="button" className={aiStyles.action} onClick={askExplanation} data-action="explain">
            {t.format("ai.explain.button")}
          </button>
        )}
        <ReportButton
          claim={offered}
          spoken={spoken !== undefined}
          claimed={reported}
          onClaim={(c) => {
            if (answer === undefined) return;
            record(reportOf(answer, text, c));
            setReported(c);
          }}
          correcting={correcting}
          onSent={() => setSent(true)}
        />
      </div>
      {/* Present and empty while there is nothing to say, so that what it says next is announced. */}
      <p className={styles.toolsStatus} role="status" data-judge={judge}>
        {judge === "checking" ? t.format("ai.judge.checking") : judge === "accepted" ? t.format("ai.judge.accepted") : judge === "queued" ? t.format("ai.judge.queued") : ""}
      </p>
      {reported !== undefined && (
        <p className={styles.toolsStatus} role="status" data-reported={reported}>
          {t.format(reported === "accept" ? "ai.report.done" : "ai.report.rejected")}
        </p>
      )}
      {sent && <Sent />}
      {explain.tag === "loading" && (
        <p className={styles.toolsStatus} role="status">
          {t.format("ai.explain.loading")}
        </p>
      )}
      {explain.tag === "failed" && (
        <p className={styles.toolsStatus} role="status" data-explain-failed="">
          {t.format(explain.why)}
        </p>
      )}
      {explain.tag === "shown" && <ExplanationView explanation={explain.explanation} rating={explain.rating} onRate={rate} />}
    </div>
  );
};

// ------------------------------------------------------------------------------------- roleplay

export const scenariosOf = (course: CourseView): readonly BundleScenario[] => course.units.flatMap((u) => u.scenarios ?? []);

/**
 * The conversations a path node opens (§13.4), as path entries right after it: available once the
 * node is done, and only when the server offers roleplay.
 */
export const ScenarioEntries = ({ course, node, state, status, link }: { course: CourseView; node: string; state: LearnerState; status: AiStatus; link: (scenario: string) => string }): JSX.Element | null => {
  const t = useTranslator();
  const scenarios = status.roleplay ? scenariosOf(course).filter((s) => s.after === node) : [];
  if (scenarios.length === 0) return null;
  const open = state.completedNodes.includes(node);
  return (
    <>
      {scenarios.map((s) => {
        const title = s.title[course.supportKey];
        const body = (
          <>
            <span className={styles.lessonHead}>
              <span className={styles.lessonName}>{t.format("app.path.conversation")}</span>
            </span>
            <span className={styles.preview}>{title === undefined ? s.id : <T text={title} />}</span>
          </>
        );
        return (
          <li key={s.id}>
            {open ? (
              <a className={styles.lesson} href={link(s.id)} data-scenario={s.id} data-status="available">
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
    </>
  );
};

/** What a failed turn tells the learner: each refusal the server can give has its own message. */
const failedPhase = (e: unknown): RoleplayStatus => {
  if (!isHttpError(e)) return "unavailable";
  if (e.code === "ai-no-turn") return "no-turn";
  if (e.status === 429) return "budget";
  // The server has not seen the node done yet (not synced), or the course no longer has the scenario.
  if (e.code === "scenario-locked") return "locked";
  if (e.code === "unknown-scenario") return "gone";
  return "unavailable";
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
      // The model sees the latest turns only (the server keeps no more), however long the conversation runs.
      body: { course: course.id, orthography: course.orthography, support: key, scenario: scenario.id, history: history.slice(-ROLEPLAY_HISTORY).map((h) => ({ role: h.role, text: surfaceOf(h.text) })) },
    }).then(
      ({ turn }) => {
        setTurns([...history, { role: "character", text: turn.text, translation: turn.translation }]);
        setPhase("idle");
      },
      (e: unknown) => setPhase(failedPhase(e)),
    );
  };
  return (
    <main className={styles.page} data-roleplay-page={scenario.id}>
      <ScreenHeading>{t.format("app.path.conversation")}</ScreenHeading>
      <p>
        <a className={styles.back} href={back}>
          {t.format("app.roleplay.back")}
        </a>
      </p>
      <p className={styles.muted} role="note" data-ai-notice="">
        {t.format("app.roleplay.note")}
      </p>
      <RoleplayChat
        scenario={{ title: card.title, setting: card.setting, character: card.character, goal: card.goal }}
        turns={turns}
        base={textBase(course.profiles, base)}
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
