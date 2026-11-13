/**
 * The web client (gameplan §11.1): the course list, a course's path, and
 * sessions (a lesson, review or mistakes). Routes live in the URL hash so the
 * static build works anywhere (GitHub Pages):
 *   #/ · #/<course>/<orthography> · #/<course>/<orthography>/<node | review | mistakes | placement>
 *   · #/<course>/<orthography>/story/<node> · #/<course>/<orthography>/roleplay/<scenario>
 *
 * Local-first (§14.2): every learner event goes to the on-device log, and the
 * path, XP and the next session are projections of it, computed by @nabu/core.
 * An account is optional; with one, the log syncs to the server.
 *
 * A running session holds the route: Back asks before leaving it, and leaving a
 * finished one goes back to where it was opened from (navigation.ts). A reload
 * picks a session up where it was (open-session.ts).
 */
import {
  applyEvents,
  continueOf,
  learnedWords,
  paceOf,
  pathNodes,
  pathOf,
  plan,
  plannable,
  practicableMistakes,
  replay,
  scriptPathOf,
  wordCounts,
  type LearnerState,
  type NodeStatus,
  type PaceChoice,
  type PathEntry,
  type PathNode,
  type SessionPlan,
  type SessionRequest,
} from "@nabu/core/learner";
import { createGrader, doneOf, firstTriesOf, LISTENING, prepareGrading, resume, seededRng, SPEAKING, speechSupportOf, type CourseView, type Effect, type PlayerState, type TemplateId } from "@nabu/core/lesson";
import { xpRule, type GameConfig, type GameState } from "@nabu/core/game";
import { correctablesOf, draftCount } from "@nabu/core/corrections";
import { restrictMedia } from "@nabu/core/offline";
import { storyAt, storyScript } from "@nabu/core/story";
import { courseBlurb, courseName, directionOf, orthographyHint, orthographyName, type Named } from "@nabu/i18n";
import type { AnswerSubmitted, LearnerEvent, SentenceReported } from "@nabu/schema";
import { CorrectIcon, CourseUiProvider, LockIcon, T, useTranslator } from "@nabu/ui";
import { fetchCourse, fetchCourseIndex, LessonPlayer, type CourseIndexEntry, type LoadedCourse } from "@nabu/ui/player";
import { StoryReader } from "@nabu/ui/story";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX, type MouseEvent } from "react";
import { AnswerHelp, RoleplayPage, ScenarioEntries, useAccount, useAiStatus, type AiStatus } from "./ai.tsx";
import { serverAllowed, speechServices, useSpeechTiers } from "./voice.ts";
import styles from "./App.module.css";
import summaries from "virtual:nabu-courses";
import { localDate, uuidv7 } from "./clock.ts";
import { BREAK_MS, onBreak, playsUnasked, setBreakUntil } from "./breaks.ts";
import { paceChoiceOf, setPaceChoice } from "./pace.ts";
import { SentencesPage, useCorrections } from "./Corrections.tsx";
import { LineReport } from "./Report.tsx";
import { ReviewHome, ReviewPage, useReviewer } from "./Review.tsx";
import { WordsPage } from "./Words.tsx";
import { storedReading, storeReading } from "./readings.ts";
import { reportIntake, reportsThrough } from "./reports.ts";
import { ReportsLink, ReportsPage } from "./YourReports.tsx";
import { AudioCheckPage } from "./AudioCheck.tsx";
import { CardsPage, debugMode } from "./Debug.tsx";
import { GamePanel, loadGameConfig, sessionAllowed, useGame } from "./game.tsx";
import { deviceGoal, forgetDeviceGoal, goalEvent, goalToMigrate } from "./goal.ts";
import { Progress } from "./Progress.tsx";
import { OfflineNotice, OfflinePanel } from "./Offline.tsx";
import { knownWords, storedDisplay, storeDisplay } from "./display.ts";
import { PreferencesPage, storedSound, storeSound } from "./Preferences.tsx";
import { offlineSupported, registerWorker, useOnline, useStored } from "./offline.ts";
import { startNative } from "./native.ts";
import { holdRoute, leave, watchRoute } from "./navigation.ts";
import { closeOpen, keepOpen, reopen, type OpenSession } from "./open-session.ts";
import { mostQuestions, PlacementIntro, PlacementResult } from "./Placement.tsx";
import { isNative } from "./platform.ts";
import { LeaguePanel } from "./social.tsx";
import { recorder, resetEvent, storyRecorder } from "./session.ts";
import { focusScreen, Loading, ScreenHeading, sessionName, titleOf, useScreen } from "./screen.tsx";
import { StartOver } from "./StartOver.tsx";
import { openStore, type EventStore } from "./store.ts";
import { createSync, type Account, type Sync } from "./sync.ts";

const BUNDLES = `${import.meta.env.BASE_URL}bundles/`;

/**
 * Courses offline in the browser (Phase 10): production builds with a service worker. The dev
 * server serves modules the worker cannot keep, and native builds ship every course inside.
 */
const OFFLINE = import.meta.env.PROD && offlineSupported() && !isNative();

/** Debug mode (?debug=1, remembered on this device): every card says its kind; a gallery of every kind. */
const DEBUG = debugMode;

export type Route =
  | { readonly tag: "home" }
  | { readonly tag: "preferences" }
  | { readonly tag: "course"; readonly course: string; readonly orthography: string }
  | { readonly tag: "session"; readonly course: string; readonly orthography: string; readonly request: SessionRequest }
  | { readonly tag: "story"; readonly course: string; readonly orthography: string; readonly node: string }
  | { readonly tag: "roleplay"; readonly course: string; readonly orthography: string; readonly scenario: string }
  | { readonly tag: "sentences"; readonly course: string; readonly orthography: string }
  | { readonly tag: "cards"; readonly course: string; readonly orthography: string }
  | { readonly tag: "audio"; readonly course: string; readonly orthography: string }
  | { readonly tag: "words"; readonly course: string; readonly orthography: string }
  | { readonly tag: "reports"; readonly course: string; readonly orthography: string }
  | { readonly tag: "review" }
  | { readonly tag: "review-course"; readonly course: string; readonly orthography: string };

/** Orthography ids carry a "/" (fa-Arab/standard): "." in the URL. */
const slug = (orthography: string): string => orthography.replace("/", ".");
const unslug = (s: string): string => s.replace(".", "/");

/** Node ids are course-prefixed ("fa.book"), so they never collide with "review", "mistakes" or "placement". */
const requestOf = (segment: string): SessionRequest =>
  segment === "review" || segment === "mistakes" || segment === "placement" ? { mode: segment } : { mode: "lesson", node: segment };

const parse = (hash: string): Route => {
  const [course, orthography, session, node] = hash.replace(/^#\/?/u, "").split("/").filter((p) => p !== "").map(decodeURIComponent);
  if (course === "preferences" && orthography === undefined) return { tag: "preferences" };
  // The review workspace (ADR 0074): #/review, and #/review/<course>/<orthography>.
  if (course === "review") return orthography === undefined || session === undefined ? { tag: "review" } : { tag: "review-course", course: orthography, orthography: unslug(session) };
  if (course === undefined || orthography === undefined) return { tag: "home" };
  if (session === undefined) return { tag: "course", course, orthography: unslug(orthography) };
  if (session === "sentences") return { tag: "sentences", course, orthography: unslug(orthography) };
  if (session === "cards") return { tag: "cards", course, orthography: unslug(orthography) };
  if (session === "audio") return { tag: "audio", course, orthography: unslug(orthography) };
  if (session === "words") return { tag: "words", course, orthography: unslug(orthography) };
  if (session === "reports") return { tag: "reports", course, orthography: unslug(orthography) };
  if (session === "story" && node !== undefined) return { tag: "story", course, orthography: unslug(orthography), node };
  if (session === "roleplay" && node !== undefined) return { tag: "roleplay", course, orthography: unslug(orthography), scenario: node };
  return { tag: "session", course, orthography: unslug(orthography), request: requestOf(session) };
};

const segmentOf = (request: SessionRequest): string => (request.mode === "lesson" ? encodeURIComponent(request.node) : request.mode);

export const href = (route: Route): string =>
  route.tag === "home"
    ? "#/"
    : route.tag === "preferences"
      ? "#/preferences"
      : route.tag === "review"
        ? "#/review"
        : route.tag === "review-course"
          ? `#/review/${route.course}/${slug(route.orthography)}`
      : route.tag === "course"
      ? `#/${route.course}/${slug(route.orthography)}`
      : route.tag === "story"
        ? `#/${route.course}/${slug(route.orthography)}/story/${encodeURIComponent(route.node)}`
        : route.tag === "roleplay"
          ? `#/${route.course}/${slug(route.orthography)}/roleplay/${encodeURIComponent(route.scenario)}`
          : route.tag === "sentences" || route.tag === "cards" || route.tag === "audio" || route.tag === "words" || route.tag === "reports"
            ? `#/${route.course}/${slug(route.orthography)}/${route.tag}`
            : `#/${route.course}/${slug(route.orthography)}/${segmentOf(route.request)}`;

/** The route in the URL hash; a running session holds it (navigation.ts, S3). */
const useRoute = (): Route => {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => watchRoute(() => setRoute(parse(window.location.hash))), []);
  return route;
};

/**
 * A link that leaves the screen it is on (navigation.ts): back to `to` when that is where the
 * learner came from, else in this screen's place, so Back never returns to what was left.
 */
const leaving =
  (to: string) =>
  (e: MouseEvent<HTMLAnchorElement>): void => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    leave(to);
  };

type Translator = ReturnType<typeof useTranslator>;

interface GameProps {
  readonly game: GameState | null;
  readonly gameConfig: GameConfig | null;
}

/** What a course's card says of its size and levels, from the bundles (vite-courses.ts). */
const aboutCourse = (t: Translator, id: string): string | undefined => {
  const summary = summaries[id];
  if (summary === undefined) return undefined;
  const { units, levels } = summary;
  if (levels === undefined) return t.format("app.home.course.units", { units });
  return levels[0] === levels[1] ? t.format("app.home.course.level", { level: levels[0], units }) : t.format("app.home.course.levels", { from: levels[0], to: levels[1], units });
};

/** What a course leaves out, said on its card: a reading course, or one without listening (ADR 0071, 0091). */
const leavesOut = (id: string): "app.home.course.reading" | "app.home.course.no-listening" | undefined => {
  const summary = summaries[id];
  if (summary === undefined || summary.listening) return undefined;
  return summary.speaking ? "app.home.course.no-listening" : "app.home.course.reading";
};

/**
 * A course in the list (S4): the whole card is the link to its course page, in its first writing
 * system; a line on what it teaches, its levels and size, and what it leaves out. A course written
 * in several systems offers each, with a hint, and says the learner can switch any time.
 */
const CourseCard = ({ entry }: { readonly entry: CourseIndexEntry }): JSX.Element => {
  const t = useTranslator();
  const [first] = entry.orthographies;
  const blurb = courseBlurb(t, entry);
  const about = aboutCourse(t, entry.id);
  const leaves = leavesOut(entry.id);
  return (
    <li className={`${styles.course} ${styles.courseCard}`} data-course={entry.id}>
      <h2 className={styles.courseName}>
        {first === undefined ? (
          courseName(t, entry)
        ) : (
          <a className={styles.courseLink} href={href({ tag: "course", course: entry.id, orthography: first })} data-course-link="">
            {courseName(t, entry)}
          </a>
        )}
      </h2>
      {blurb !== undefined && <p className={styles.courseLine}>{blurb}</p>}
      {about !== undefined && (
        <p className={styles.muted} data-course-about="">
          {about}
        </p>
      )}
      {leaves !== undefined && (
        <p className={styles.courseTag} data-course-leaves="">
          {t.format(leaves)}
        </p>
      )}
      {entry.orthographies.length > 1 && (
        <div className={styles.scripts} role="group" aria-labelledby={`scripts-${entry.id}`}>
          <p className={`${styles.courseLine} ${styles.label}`} id={`scripts-${entry.id}`}>
            {t.format("app.home.writing")}
          </p>
          <p className={styles.muted}>{t.format("app.home.writing-switch")}</p>
          <div className={styles.links}>
            {entry.orthographies.map((o) => {
              const hint = orthographyHint(t, entry, o);
              return (
                <a key={o} className={`${styles.link} ${styles.scriptLink}`} href={href({ tag: "course", course: entry.id, orthography: o })} data-orthography={o}>
                  <span>{orthographyName(t, entry, o)}</span>
                  {hint !== undefined && <span className={styles.scriptHint}>{hint}</span>}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </li>
  );
};

const Home = ({
  courses,
  store,
  sync,
  game,
  gameConfig,
  version,
  online,
  onGoal,
}: { courses: readonly CourseIndexEntry[]; store: EventStore; sync: Sync; version: string; online: boolean; onGoal: (days: number) => void } & GameProps): JSX.Element => {
  const t = useTranslator();
  const account = useSyncExternalStore(sync.subscribe, () => sync.get().account);
  const reviewer = useReviewer(sync);
  // A learner who has not started yet is told what this is and how to begin (S4).
  const fresh = game !== null && game.days.length === 0 && game.xp.total === 0;
  // In the order of their names as the UI language sorts them.
  const collator = new Intl.Collator(t.formattingLocale);
  const sorted = [...courses].sort((a, b) => collator.compare(courseName(t, a), courseName(t, b)));
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{t.format("app.home.title")}</h1>
      {!online && <OfflineNotice synced={account !== undefined} />}
      {fresh && (
        <div className={styles.intro} data-home-intro="">
          <p>{t.format("app.home.intro")}</p>
          <p className={styles.muted}>{t.format("app.home.start")}</p>
        </div>
      )}
      {game !== null && gameConfig !== null && <GamePanel state={game} config={gameConfig} onGoal={onGoal} />}
      {account !== undefined && <LeaguePanel account={account} version={version} />}
      <ul className={styles.list} data-course-list="">
        {sorted.map((c) => (
          <CourseCard key={c.id} entry={c} />
        ))}
      </ul>
      <Progress store={store} sync={sync} courses={courses} />
      <div className={styles.links}>
        <a className={styles.link} href={href({ tag: "preferences" })} data-preferences-link="">
          {t.format("app.preferences.link")}
        </a>
        {reviewer.kind === "reviewer" && (
          <a className={styles.link} href={href({ tag: "review" })} data-review-link="">
            {t.format("review.workspace.link")}
          </a>
        )}
      </div>
    </main>
  );
};

const STATUS_LABEL = { done: "app.path.done", available: "app.path.start", locked: "app.path.locked" } as const;

const Status = ({ status }: { status: NodeStatus }): JSX.Element => {
  const t = useTranslator();
  return (
    <span className={styles.status} data-status-label="">
      {status === "done" && <CorrectIcon size={20} />}
      {status === "locked" && <LockIcon size={18} />}
      {t.format(STATUS_LABEL[status])}
    </span>
  );
};

/** The course's offline state, where this build keeps courses offline. */
interface OfflineProps {
  readonly online: boolean;
  /** Whether progress syncs (an account): what the offline notice promises. */
  readonly synced: boolean;
  readonly root: string;
  readonly stored: ReadonlySet<string> | undefined;
  readonly onChange: () => void;
}

/** The course's path (§11.1): practice, XP, and the lessons in order, each done, open or locked. */
const CoursePath = ({
  loaded,
  state,
  persistent,
  ai,
  offline,
  speechTiers,
  game,
  onReset,
  reports,
}: {
  loaded: LoadedCourse;
  state: LearnerState;
  persistent: boolean;
  ai: AiStatus;
  offline: OfflineProps;
  speechTiers: readonly number[];
  /** The game state: XP comes from it alone, with the deployment's rules and quests (ADR 0107). */
  game: GameState | null;
  onReset: () => void;
  /** The link to Your reports, beside the sentence list's (ADR 0115). */
  reports: JSX.Element;
}): JSX.Element => {
  const t = useTranslator();
  const [off, setOff] = useState(() => ({ listening: onBreak("listening"), speaking: onBreak("speaking") }));
  const { course } = loaded;
  const orthography = course.orthography;
  const now = new Date();
  const status = new Map(pathOf(course, state).map((n) => [n.node, n.status]));
  // A script track (ADR 0088): the alphabet, a row of its own that never gates the units.
  const scriptRow = scriptPathOf(course, state);
  // The words due for review and known (ADR 0100), as the word list counts them (W8): worked out once
  // a minute and when the log changes, not on every render (R12).
  const minute = Math.floor(now.getTime() / 60_000);
  // The learner's pace (ADR 0105): read from the log unless they chose one (D5). It sets what "due"
  // means (its retention target) and where Continue goes (D6).
  const [paceChoice, setChoice] = useState<PaceChoice>(() => paceChoiceOf(course.id));
  const pace = useMemo(() => paceOf(course, state, new Date(minute * 60_000).toISOString(), paceChoice), [course, state, minute, paceChoice]);
  const counts = useMemo(() => wordCounts(learnedWords(course, state, new Date(minute * 60_000).toISOString(), pace.settings.retention)), [course, state, minute, pace]);
  const { due, known } = counts;
  const next = continueOf(course, state, pace);
  const studied = Object.keys(state.cards).length > 0;
  // What a mistakes session would hold now: a mistake on a listening card waits out a listening
  // break, and one the course no longer makes is not counted (practicableMistakes).
  const mistakes = useMemo(
    () => practicableMistakes(course, state, { exclude: excludedBy(off), speech: speechSupportOf(course, serverAllowed() ? speechTiers.length : 0) }).length,
    [course, state, off, speechTiers],
  );
  const today = game?.xp.byDate[localDate(now)] ?? 0;
  // The demo's full builds keep drafts and say so (ADR 0073); a release build has none.
  const drafts = draftCount(course.units);
  const units = pathNodes(course).reduce<{ unit: PathEntry["unit"]; entries: PathEntry[] }[]>((acc, entry) => {
    const last = acc.at(-1);
    if (last?.unit === entry.unit) last.entries.push(entry);
    else acc.push({ unit: entry.unit, entries: [entry] });
    return acc;
  }, []);
  let number = 0;
  const to = (request: SessionRequest): string => href({ tag: "session", course: course.id, orthography, request });
  const nodeHref = (n: PathNode): string => (n.kind === "story" ? href({ tag: "story", course: course.id, orthography, node: n.node }) : to({ mode: "lesson", node: n.node }));
  // The line saying why (D5): what is slipping when practice comes first, else how the pace reads.
  const why =
    next.kind === "practice"
      ? t.format("app.pace.why.slipping", { count: pace.slipping })
      : next.kind === "done"
        ? t.format("app.continue.done")
        : pace.reason === "chosen"
          ? t.format(pace.band === "consolidate" ? "app.pace.why.chosen-consolidate" : pace.band === "accelerate" ? "app.pace.why.chosen-accelerate" : "app.pace.why.chosen-steady")
          : pace.reason === "struggling"
            ? t.format("app.pace.why.struggling")
            : pace.reason === "breezing"
              ? t.format("app.pace.why.breezing")
              : pace.reason === "backlog"
                ? t.format("app.pace.why.backlog")
                : undefined;

  return (
    <main className={styles.page} data-course-path={course.id}>
      <p>
        <a className={styles.back} href={href({ tag: "home" })}>
          {t.format("app.lessons.back")}
        </a>
      </p>
      <h1 className={styles.heading}>
        {courseName(t, course)} · {orthographyName(t, course, orthography)}
      </h1>
      {game !== null && (
        <p className={styles.stats} data-xp={game.xp.total} data-xp-today={today}>
          <span className={styles.stat}>{t.format("app.xp.total", { xp: game.xp.total })}</span>
          <span className={styles.stat}>{t.format("app.xp.today", { xp: today })}</span>
        </p>
      )}
      {!offline.online && <OfflineNotice synced={offline.synced} />}
      {drafts.drafts > 0 && (
        <p className={styles.notice} role="note" data-drafts={drafts.drafts}>
          {drafts.drafts === drafts.total ? t.format("app.course.unchecked.all") : t.format("app.course.unchecked.some", { drafts: drafts.drafts, total: drafts.total })}
        </p>
      )}
      {!persistent && (
        <p className={`${styles.notice} ${styles.warning}`} role="note" data-not-saved="">
          {t.format("app.store.memory")}
        </p>
      )}
      {off.listening && (
        <p className={styles.notice} role="note" data-listening-off="">
          {t.format("app.listening.off")}{" "}
          <button
            type="button"
            className={styles.inlineButton}
            onClick={() => {
              setBreakUntil("listening", 0);
              setOff({ ...off, listening: false });
            }}
            data-action="listening-on"
          >
            {t.format("app.listening.on")}
          </button>
        </p>
      )}
      {off.speaking && (
        <p className={styles.notice} role="note" data-speaking-off="">
          {t.format("app.speaking.off")}{" "}
          <button
            type="button"
            className={styles.inlineButton}
            onClick={() => {
              setBreakUntil("speaking", 0);
              setOff({ ...off, speaking: false });
            }}
            data-action="speaking-on"
          >
            {t.format("app.speaking.on")}
          </button>
        </p>
      )}

      {/* Placement can be taken again (S5): it only ever adds lessons done, so it is offered until all are. */}
      {[...status.values()].some((s) => s !== "done") && (
        <p>
          <a className={styles.back} href={to({ mode: "placement" })} data-practice-mode="placement" data-again={state.completedNodes.length > 0 ? "" : undefined}>
            {t.format(state.completedNodes.length === 0 ? "app.practice.placement" : "app.practice.placement-again", { language: courseName(t, course) })}
          </a>
        </p>
      )}

      <section className={styles.continue} aria-label={t.format("app.continue.label")} data-continue={next.kind} data-pace={pace.band} data-pace-reason={pace.reason}>
        {next.kind === "practice" ? (
          <>
            <a className={styles.primary} href={to({ mode: "review" })} data-action="continue">
              {t.format("app.continue.practice")}
            </a>
            {/* A new lesson is always on offer (D6). */}
            {next.next !== undefined && (
              <a className={styles.link} href={nodeHref(next.next)} data-action="new-lesson">
                {t.format("app.continue.new-lesson")}
              </a>
            )}
          </>
        ) : next.kind === "path" ? (
          <a className={styles.primary} href={nodeHref(next.next)} data-action="continue">
            {t.format("app.continue.lesson")}
          </a>
        ) : null}
        {why !== undefined && (
          <p className={styles.paceLine} data-pace-line="">
            {why}
          </p>
        )}
        <label className={styles.paceChoice}>
          {t.format("app.pace.label")}
          <select
            value={paceChoice}
            onChange={(e) => {
              const choice = e.currentTarget.value as PaceChoice;
              setPaceChoice(course.id, choice);
              setChoice(choice);
            }}
            data-field="pace"
          >
            <option value="auto">{t.format("app.pace.auto")}</option>
            <option value="consolidate">{t.format("app.pace.consolidate")}</option>
            <option value="steady">{t.format("app.pace.steady")}</option>
            <option value="accelerate">{t.format("app.pace.accelerate")}</option>
          </select>
        </label>
      </section>

      <h2 className={styles.subheading}>{t.format("app.practice.title")}</h2>
      <div className={styles.links} data-practice="">
        {studied ? (
          <a className={styles.link} href={to({ mode: "review" })} data-practice-mode="review" data-count={due}>
            {t.format("app.practice.review")}
            {due > 0 && <span className={styles.count}>{t.format("app.practice.due-words", { count: due })}</span>}
          </a>
        ) : (
          <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true" data-practice-mode="review" data-count={0}>
            {t.format("app.practice.review")}
          </span>
        )}
        {mistakes > 0 ? (
          <a className={styles.link} href={to({ mode: "mistakes" })} data-practice-mode="mistakes" data-count={mistakes}>
            {t.format("app.practice.mistakes")}
            <span className={styles.count}>{t.format("app.practice.to-fix-later", { count: mistakes })}</span>
          </a>
        ) : (
          <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true" data-practice-mode="mistakes" data-count={0}>
            {t.format("app.practice.mistakes")}
          </span>
        )}
        {/* The words met and known (ADR 0100), next to practising them (S14). */}
        <a className={styles.link} href={href({ tag: "words", course: course.id, orthography })} data-words-link="" data-count={known}>
          {t.format("words.title")}
          {studied && <span className={styles.count}>{t.format("app.practice.known", { count: known })}</span>}
        </a>
      </div>

      <h2 className={styles.subheading}>{t.format("app.lessons.title")}</h2>
      {scriptRow.length > 0 && (
        <section className={styles.unit} data-script-track="">
          {(() => {
            const first = course.units.find((u) => u.id === scriptRow[0]?.unit);
            const title = first?.title?.[course.supportKey];
            return title === undefined ? null : (
              <h3 className={styles.unitTitle}>
                <T text={title} />
              </h3>
            );
          })()}
          <ol className={styles.list}>
            {scriptRow.map((entry, k) => {
              const unit = course.units.find((u) => u.id === entry.unit);
              const node = unit?.nodes.find((n) => n.id === entry.node);
              const letters = node?.alphabet?.letters.map((l) => l.text) ?? [];
              const body = (
                <>
                  <span className={styles.lessonHead}>
                    <span className={styles.lessonName}>{t.format("app.path.letters", { number: k + 1 })}</span>
                    <Status status={entry.status} />
                  </span>
                  <span className={styles.preview} role="group" aria-label={t.format("app.path.new-letters")} dir={letters[0] === undefined ? undefined : directionOf(letters[0].lang)}>
                    {letters.map((l, i) => (
                      <T key={i} text={l} />
                    ))}
                  </span>
                </>
              );
              return (
                <li key={entry.node}>
                  {entry.status === "locked" ? (
                    <div className={`${styles.lesson} ${styles.locked}`} aria-disabled="true" data-script-node={entry.node} data-status={entry.status}>
                      {body}
                    </div>
                  ) : (
                    <a className={`${styles.lesson} ${entry.status === "available" ? styles.next : ""}`} href={to({ mode: "lesson", node: entry.node })} data-script-node={entry.node} data-status={entry.status}>
                      {body}
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {units.map(({ unit, entries }) => {
        const title = unit.title?.[course.supportKey];
        return (
          <section key={unit.id} className={styles.unit}>
            {title !== undefined && units.length > 1 && (
              <h3 className={styles.unitTitle}>
                <T text={title} />
              </h3>
            )}
            <ol className={styles.list} data-lesson-list="">
              {entries.map(({ node, kind }) => {
                const s = status.get(node.id) ?? "locked";
                const story = kind === "story" ? (unit.stories ?? []).find((st) => st.node === node.id) : undefined;
                const storyTitle = story?.title[course.supportKey];
                if (kind === "lesson") number++;
                const words = node.introduces.flatMap((id) => unit.kcs.find((k) => k.id === id)?.forms?.[orthography]?.[0] ?? []);
                const body =
                  kind === "story" ? (
                    <>
                      <span className={styles.lessonHead}>
                        <span className={styles.lessonName}>{t.format("app.path.story")}</span>
                        <Status status={s} />
                      </span>
                      {storyTitle !== undefined && (
                        <span className={styles.preview}>
                          <T text={storyTitle} />
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className={styles.lessonHead}>
                        <span className={styles.lessonName}>{t.format("app.lessons.lesson", { number })}</span>
                        <Status status={s} />
                      </span>
                      <span className={styles.preview} role="group" aria-label={t.format("app.lessons.new-words")} dir={words[0] === undefined ? undefined : directionOf(words[0].lang)}>
                        {words.map((w, k) => (
                          <T key={k} text={w} />
                        ))}
                      </span>
                    </>
                  );
                const link = kind === "story" ? href({ tag: "story", course: course.id, orthography, node: node.id }) : to({ mode: "lesson", node: node.id });
                const data = kind === "story" ? { "data-story-node": node.id } : { "data-lesson": node.id };
                return (
                  <Fragment key={node.id}>
                    <li>
                      {s === "locked" ? (
                        <div className={`${styles.lesson} ${styles.locked}`} aria-disabled="true" {...data} data-status={s}>
                          {body}
                        </div>
                      ) : (
                        <a className={`${styles.lesson} ${s === "available" ? styles.next : ""}`} href={link} {...data} data-status={s}>
                          {body}
                        </a>
                      )}
                    </li>
                    {/* The conversations this node opens sit right after it (§13.4). */}
                    <ScenarioEntries course={course} node={node.id} state={state} status={ai} link={(scenario) => href({ tag: "roleplay", course: course.id, orthography, scenario })} />
                  </Fragment>
                );
              })}
            </ol>
          </section>
        );
      })}
      {/* The course's sentences to correct, and what came of the learner's reports (ADR 0115). */}
      <div className={styles.links}>
        <a className={styles.link} href={href({ tag: "sentences", course: course.id, orthography })} data-sentences-link="">
          {t.format("corrections.page.open")}
        </a>
        {reports}
      </div>
      {DEBUG && (
        <p>
          <a className={styles.link} href={href({ tag: "cards", course: course.id, orthography })} data-cards-link="">
            {t.format("debug.cards.open")}
          </a>
        </p>
      )}
      {DEBUG && course.audio !== undefined && Object.keys(course.audio).length > 0 && (
        <p>
          <a className={styles.link} href={href({ tag: "audio", course: course.id, orthography })} data-audio-check-link="">
            {t.format("audio.check.open")}
          </a>
        </p>
      )}
      {OFFLINE && offline.stored !== undefined && <OfflinePanel loaded={loaded} root={offline.root} stored={offline.stored} onChange={offline.onChange} />}
      <StartOver language={courseName(t, course)} hasProgress={studied || state.completedNodes.length > 0 || state.mistakes.length > 0} onReset={onReset} />
    </main>
  );
};

/** What sessions leave out: listening and speaking while they are on a break. */
const excludedBy = (off: { readonly listening: boolean; readonly speaking: boolean }): ReadonlySet<TemplateId> =>
  new Set<TemplateId>([...(off.listening ? LISTENING : []), ...(off.speaking ? SPEAKING : [])]);

/** What a new session leaves out, as the breaks stand when it opens. */
const excluded = (): ReadonlySet<TemplateId> => excludedBy({ listening: onBreak("listening"), speaking: onBreak("speaking") });

/** The session seed: ?seed=… for reproducible runs (tests), else fresh randomness. */
const seedFor = (): number => {
  const param = new URLSearchParams(window.location.search).get("seed");
  if (param !== null && /^\d+$/u.test(param)) return Number(param);
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
};

/** The session gate is empty (§12.3, only where an instance turns it on): practice stays open. */
const GateEmpty = ({ course }: { course: LoadedCourse["course"] }): JSX.Element => {
  const t = useTranslator();
  const to = (mode: "review" | "mistakes"): string => href({ tag: "session", course: course.id, orthography: course.orthography, request: { mode } });
  return (
    <main className={styles.page}>
      <p className={styles.notice} role="note" data-gate-empty="">
        {t.format("game.gate.empty")}
      </p>
      <div className={styles.links}>
        <a className={styles.link} href={to("review")} data-practice-mode="review">
          {t.format("app.practice.review")}
        </a>
        <a className={styles.link} href={to("mistakes")} data-practice-mode="mistakes">
          {t.format("app.practice.mistakes")}
        </a>
        <a className={styles.back} href={href({ tag: "course", course: course.id, orthography: course.orthography })} onClick={leaving(href({ tag: "course", course: course.id, orthography: course.orthography }))}>
          {t.format("app.practice.back")}
        </a>
      </div>
    </main>
  );
};

interface SessionProps extends GameProps {
  readonly loaded: LoadedCourse;
  readonly request: SessionRequest;
  readonly state: LearnerState;
  readonly device: string;
  readonly record: (event: LearnerEvent) => void;
  readonly store: EventStore;
  readonly account: Account | undefined;
  readonly ai: AiStatus;
  /** What the server's speech service can score here (Phase 9); empty without one. */
  readonly speechTiers: readonly number[];
  /** This device's corrections in the course (ADR 0051). */
  readonly corrections: ReadonlyMap<string, SentenceReported>;
}

/** A course or the course list could not be loaded: what happened, Try again, and (in a course) a way home. */
const LoadFailed = ({ message, home, onRetry }: { message: "app.error.index" | "app.error.load" | "app.offline.unavailable"; home: boolean; onRetry: () => void }): JSX.Element => {
  const t = useTranslator();
  return (
    <main className={styles.page}>
      <p role="alert" data-load-error="">
        {t.format(message)}
      </p>
      <p className={styles.links}>
        <button type="button" className={styles.link} onClick={onRetry} data-action="retry">
          {t.format("app.error.retry")}
        </button>
        {home && (
          <a className={styles.back} href={href({ tag: "home" })}>
            {t.format("app.lessons.back")}
          </a>
        )}
      </p>
    </main>
  );
};

/** A link to a lesson or story the course no longer has (an old bookmark, a tab restored after an update). */
const Missing = ({ course }: { course: CourseView }): JSX.Element => {
  const t = useTranslator();
  return (
    <main className={styles.page}>
      <p role="alert" data-missing-node="">
        {t.format("app.session.missing")}
      </p>
      <a className={styles.back} href={href({ tag: "course", course: course.id, orthography: course.orthography })} onClick={leaving(href({ tag: "course", course: course.id, orthography: course.orthography }))}>
        {t.format("app.practice.back")}
      </a>
    </main>
  );
};

/** A session as it opens: planned now, or picked up where a reload left it (S3). */
interface Setup {
  readonly seed: number;
  readonly planned: SessionPlan;
  /** The session's id: every event it records carries it. */
  readonly session: string;
  /**
   * The game's XP before the session (ADR 0107: the end screen shows what it earned, as the game
   * counts it); undefined while the game state is not known yet, and then taken when it is.
   */
  readonly xpBefore: number | undefined;
  /** Picked up again: where the session stands, what reopens it, and its first tries so far. */
  readonly resumed?: { readonly from: readonly [PlayerState, readonly Effect[]]; readonly firstTries: ReadonlyMap<string, boolean> } | undefined;
  /** A new session's plan, kept on the device once the session starts (S3). */
  readonly open?: OpenSession | undefined;
}

/** What the player starts a session's exercises with: retries, or the placement test's search. */
const startOptions = (request: SessionRequest, planned: SessionPlan) => ({ retries: request.mode !== "placement", ...(planned.placement === undefined ? {} : { adaptive: planned.placement.test }) });

/** Plans a new session from the learner's state as it opens (§9.4); its plan is kept from when it starts until it ends (S3). */
const plannedSetup = (props: SessionProps, route: string): Setup => {
  const { loaded, request, state, speechTiers, game } = props;
  const { course } = loaded;
  const seed = seedFor();
  // Speaking is scored where tones can be judged here or the server scores it (§10.4).
  const speech = speechSupportOf(course, serverAllowed() ? speechTiers.length : 0);
  const exclude = excluded();
  // The local date, as events stamp it: a word met today shows its skills from tomorrow (ADR 0100).
  const now = new Date();
  // The learner's pace (ADR 0105): a lesson's share of review and the retention target.
  const pace = paceOf(course, state, now.toISOString(), paceChoiceOf(course.id)).band;
  const planned = plan(course, state, request, { now: now.toISOString(), today: localDate(now), seed, speech, pace, ...(exclude.size > 0 ? { exclude } : {}) });
  const session = uuidv7(now.getTime());
  const open: OpenSession | undefined = planned.exercises.length === 0 ? undefined : { route, course: course.id, session, seed, bundle: loaded.manifest.id, opened: now.getTime(), plan: planned };
  return { seed, planned, session, xpBefore: game?.xp.total, open };
};

/**
 * Opens a session (§9.4): the one this device was in the middle of at this route, picked up where
 * it was (S3: a reload, a phone that dropped the tab, the log reloading under it), or a new one.
 */
const Session = (props: SessionProps): JSX.Element => {
  const { loaded, request, game, gameConfig, store } = props;
  const route = href({ tag: "session", course: loaded.course.id, orthography: loaded.course.orthography, request });
  const [opened, setOpened] = useState<{ readonly setup: Setup } | "gate" | undefined>(undefined);
  const known = plannable(loaded.course, request);
  useEffect(() => {
    if (!known) return;
    let live = true;
    void reopen(store, { route, course: loaded.course.id, bundle: loaded.manifest.id, now: Date.now() }).then((found) => {
      if (!live) return;
      const done = found === undefined ? [] : doneOf(found.events, found.open.session);
      const from = found === undefined ? undefined : resume(request.mode === "lesson" ? request.node : request.mode, found.open.plan.exercises, startOptions(request, found.open.plan), done);
      if (found !== undefined && from !== undefined) {
        // What the session earned so far is in the game state already: the end screen counts from before it.
        const { open } = found;
        const xpBefore = game === null || gameConfig === null ? undefined : game.xp.total - xpOfEvents(found.events, gameConfig);
        setOpened({ setup: { seed: open.seed, planned: open.plan, session: open.session, xpBefore, resumed: { from, firstTries: firstTriesOf(done) } } });
      } else if (!sessionAllowed(game, request.mode, gameConfig)) {
        // Decided once, when the session opens: answering inside it never closes the gate on it.
        setOpened("gate");
      } else {
        setOpened({ setup: plannedSetup(props, route) });
      }
    });
    return () => {
      live = false;
    };
    // Once, as the session opens: later states are its own doing.
  }, []);
  if (!known) return <Missing course={loaded.course} />;
  if (opened === undefined) return <Loading />;
  return opened === "gate" ? <GateEmpty course={loaded.course} /> : <SessionBody {...props} setup={opened.setup} route={route} />;
};

/**
 * While a session plays it holds the route (navigation.ts, S3): Back, or the phone's back button,
 * asks whether to quit as the quit button does, and quitting goes where Back was going. Once it
 * ends, leaving goes back to the course page it came from, so Back never plays it again.
 */
const useSessionRoute = (route: string, back: string, playing: boolean) => {
  const [quitRequest, setQuitRequest] = useState(0);
  // Where Back was going when the session asked: quitting goes there.
  const going = useRef<string | undefined>(undefined);
  const [ended, setEnded] = useState(false);
  const release = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (!playing || ended) return undefined;
    release.current = holdRoute(route, (to) => {
      going.current = to ?? back;
      setQuitRequest((n) => n + 1);
    });
    return release.current;
  }, [route, back, playing, ended]);
  // Once: the end screen's Continue and a quit on the way out must not both go back.
  const left = useRef(false);
  const go = (to: string): void => {
    if (left.current) return;
    left.current = true;
    leave(to);
  };
  return {
    quitRequest,
    /** The session ended. A quit that Back asked for goes on where Back was going, unless the end screen has more to say (`stay`). */
    ended: (completed: boolean, stay = false): void => {
      // The route is free at once: nothing to ask about any more.
      release.current?.();
      setEnded(true);
      if (!completed && !stay && going.current !== undefined) go(going.current);
    },
    exit: (): void => go(going.current ?? back),
  } as const;
};

/** XP the events earn by the game's rule (answers right, so far, in a session not yet finished). */
const xpOfEvents = (events: readonly LearnerEvent[], config: GameConfig): number =>
  events.reduce((n, event) => n + xpRule({ event }, { config, mode: undefined, counts: true, replay: false }).reduce((m, e) => m + (e.tag === "xp" ? e.amount : 0), 0), 0);

/**
 * The XP a session has earned, from the game state (ADR 0107), as the course page counts XP: with the
 * deployment's rules, and the quests the session completed. The game state is worked out again after
 * each event, so the count settles a moment after the last one.
 */
const useXpEarned = (game: GameState | null, from: number | undefined): number | undefined => {
  const [before, setBefore] = useState<number | undefined>(from ?? game?.xp.total);
  useEffect(() => {
    if (before === undefined && game !== null) setBefore(game.xp.total);
  }, [before, game]);
  return before === undefined || game === null ? undefined : game.xp.total - before;
};

const SessionBody = ({ loaded, request, state, device, record, store, account, ai, speechTiers, corrections, game, setup, route }: SessionProps & { readonly setup: Setup; readonly route: string }): JSX.Element => {
  const t = useTranslator();
  const xpEarned = useXpEarned(game, setup.xpBefore);
  const { course, manifest, imageUrl } = loaded;
  const back = href({ tag: "course", course: course.id, orthography: course.orthography });
  const placement = request.mode === "placement";
  // A placement test starts once the learner has read what it does (S5); one picked up again goes on.
  const [started, setStarted] = useState(!placement || setup.resumed !== undefined);
  const playing = started && setup.planned.exercises.length > 0;
  const routing = useSessionRoute(route, back, playing);
  // The plan is kept from the start until the session ends, so a reload picks it up (S3).
  useEffect(() => {
    if (playing && setup.open !== undefined) void keepOpen(store, setup.open);
  }, [playing, setup.open, store]);
  // What was done before the session, and what a placement test placed: its result says what changed.
  const [before] = useState(() => new Set(state.completedNodes));
  const [placed, setPlaced] = useState<readonly string[] | undefined>(undefined);
  // The words the learner knows as the session opens: where a course marks vowels on new words only (P12).
  const [known] = useState(() => knownWords(course, state, new Date()));
  // Each exercise's latest answer, for what the feedback offers under it (Phase 8).
  const [answers, setAnswers] = useState<ReadonlyMap<string, AnswerSubmitted>>(new Map());
  const [onEvent] = useState(() => {
    const keep = (event: LearnerEvent): void => {
      if (event.type === "answer_submitted") setAnswers((m) => new Map(m).set(event.exercise.id, event));
      record(event);
      if (event.type === "session_completed") {
        void closeOpen(store, setup.session);
        if (event.mode === "placement") setPlaced(event.placed);
        // A placement test's end screen says where the learner placed, however it ended.
        routing.ended(event.summary.completed, placement);
      }
    };
    return recorder({ course, bundle: manifest.id, device, plan: setup.planned, seed: setup.seed, record: keep, session: setup.session, firstTries: setup.resumed?.firstTries });
  });
  const grader = useMemo(() => createGrader(course), [course]);
  const speech = useMemo(() => speechServices(course, account, speechTiers), [course, account, speechTiers]);
  // Nothing plays by itself with sound off or listening put off (P6).
  const sound = playsUnasked(new URLSearchParams(window.location.search).get("sound") !== "off" && storedSound());
  if (!started) {
    const start = (): void => {
      setStarted(true);
      // The player opens on the same screen: focus goes to it, as a new screen's does.
      requestAnimationFrame(focusScreen);
    };
    return <PlacementIntro language={courseName(t, course)} most={mostQuestions(setup.planned)} onStart={start} back={back} onBack={leaving(back)} />;
  }
  if (!playing) {
    return (
      <main className={styles.page}>
        <p data-empty-session="">{t.format("app.practice.empty")}</p>
        <a className={styles.back} href={back} onClick={leaving(back)}>
          {t.format("app.practice.back")}
        </a>
      </main>
    );
  }
  return (
    <main className={styles.player}>
      <ScreenHeading>{sessionName(t, request, course)}</ScreenHeading>
      <LessonPlayer
        course={course}
        lessonId={request.mode === "lesson" ? request.node : request.mode}
        exercises={setup.planned.exercises}
        grader={grader}
        imageUrl={imageUrl}
        language={courseName(t, course)}
        onEvent={onEvent}
        sound={sound}
        onSoundChange={storeSound}
        listening={!onBreak("listening")}
        retries={request.mode !== "placement"}
        mode={request.mode}
        replay={request.mode === "lesson" && before.has(request.node)}
        adaptive={setup.planned.placement?.test}
        resumed={setup.resumed?.from}
        quitRequest={routing.quitRequest}
        quitCopy={
          placement
            ? { title: t.format("app.placement.quit.title"), body: t.format("app.placement.quit.body"), confirm: t.format("app.placement.quit.confirm"), cancel: t.format("app.placement.quit.cancel") }
            : undefined
        }
        summary={placement ? () => <PlacementResult course={course} state={state} before={before} placed={placed} /> : undefined}
        debug={DEBUG}
        reading={storedReading(course.orthography)}
        onReadingChange={(scheme) => storeReading(course.orthography, scheme)}
        display={storedDisplay(course.id, course.orthography)}
        onDisplayChange={(choice) => storeDisplay(course.id, course.orthography, choice)}
        known={known}
        onCantListen={() => setBreakUntil("listening", Date.now() + BREAK_MS)}
        onCantSpeak={() => setBreakUntil("speaking", Date.now() + BREAK_MS)}
        xpEarned={xpEarned}
        onExit={routing.exit}
        speech={speech}
        feedbackExtra={(ex, _outcome, response) => {
          const answer = answers.get(ex.id);
          // One report button beside the feedback (M6): claims about the answer, and corrections of what the card was built from.
          const correcting = { course, bundle: manifest.id, device, record, targets: correctablesOf(course, ex), corrections };
          return <AnswerHelp key={`help:${answer?.id ?? ex.id}`} answer={answer} ex={ex} response={response} status={ai} account={account} store={store} record={record} correcting={correcting} />;
        }}
      />
    </main>
  );
};

interface StorySessionProps extends GameProps {
  readonly loaded: LoadedCourse;
  readonly node: string;
  readonly state: LearnerState;
  readonly device: string;
  readonly record: (event: LearnerEvent) => void;
  readonly corrections: ReadonlyMap<string, SentenceReported>;
  readonly store: EventStore;
  readonly account: Account | undefined;
  readonly ai: AiStatus;
}

/** Reads one story (Phase 6): a session of mode story at its node. */
const StorySession = (props: StorySessionProps): JSX.Element => {
  const [allowed] = useState(() => sessionAllowed(props.game, "story", props.gameConfig));
  if (storyAt(props.loaded.course, props.node) === undefined) return <Missing course={props.loaded.course} />;
  return allowed ? <StoryBody {...props} /> : <GateEmpty course={props.loaded.course} />;
};

const StoryBody = ({ loaded, node, state, device, record, corrections, store, account, ai, game }: StorySessionProps): JSX.Element => {
  const t = useTranslator();
  const xpEarned = useXpEarned(game, undefined);
  const { course, manifest, imageUrl } = loaded;
  const back = href({ tag: "course", course: course.id, orthography: course.orthography });
  const route = href({ tag: "story", course: course.id, orthography: course.orthography, node });
  const routing = useSessionRoute(route, back, storyAt(course, node) !== undefined);
  // Each question's latest answer, for "My answer should be accepted" under its feedback.
  const [answers, setAnswers] = useState<ReadonlyMap<string, AnswerSubmitted>>(new Map());
  const [setup] = useState(() => {
    const story = storyAt(course, node);
    if (story === undefined) return undefined;
    const seed = seedFor();
    const keep = (event: LearnerEvent): void => {
      if (event.type === "answer_submitted") setAnswers((m) => new Map(m).set(event.exercise.id, event));
      record(event);
      if (event.type === "session_completed") routing.ended(event.summary.completed);
    };
    return {
      script: storyScript(course, story, seededRng(seed)),
      known: knownWords(course, state, new Date()),
      onEvent: storyRecorder({ course, bundle: manifest.id, device, node, seed, record: keep }),
    };
  });
  const grader = useMemo(() => createGrader(course), [course]);
  // Nothing plays by itself with sound off or listening put off (P6).
  const sound = playsUnasked(new URLSearchParams(window.location.search).get("sound") !== "off" && storedSound());
  if (setup === undefined) {
    return (
      <main className={styles.page}>
        <p data-empty-session="">{t.format("app.practice.empty")}</p>
        <a className={styles.back} href={back} onClick={leaving(back)}>
          {t.format("app.practice.back")}
        </a>
      </main>
    );
  }
  return (
    <main className={styles.player}>
      <ScreenHeading>{t.format("app.path.story")}</ScreenHeading>
      <StoryReader
        course={course}
        script={setup.script}
        grader={grader}
        imageUrl={imageUrl}
        language={courseName(t, course)}
        onEvent={setup.onEvent}
        sound={sound}
        onSoundChange={storeSound}
        listening={!onBreak("listening")}
        xpEarned={xpEarned}
        reading={storedReading(course.orthography)}
        onReadingChange={(scheme) => storeReading(course.orthography, scheme)}
        display={storedDisplay(course.id, course.orthography)}
        onDisplayChange={(choice) => storeDisplay(course.id, course.orthography, choice)}
        known={setup.known}
        replay={state.completedNodes.includes(node)}
        quitRequest={routing.quitRequest}
        onExit={routing.exit}
        lineAction={(line) => <LineReport course={course} bundle={manifest.id} device={device} record={record} item={setup.script.id} step={line.step} corrections={corrections} />}
        feedbackExtra={(ex, _outcome, response) => {
          const answer = answers.get(ex.id);
          return <AnswerHelp key={`help:${answer?.id ?? ex.id}`} answer={answer} ex={ex} response={response} status={ai} account={account} store={store} record={record} />;
        }}
      />
    </main>
  );
};

/**
 * The sync server: ?api= (tests, trying a server), else the build's VITE_NABU_API, else none
 * (local-only). "/" is this origin: a self-hosted instance serves the app and the API together
 * (deploy/compose.yaml), so one build works under any domain.
 */
const apiBase = (): string | undefined => {
  const value = new URLSearchParams(window.location.search).get("api") ?? import.meta.env.VITE_NABU_API;
  if (value === undefined || value === "") return undefined;
  return value === "/" ? window.location.origin : value.replace(/\/+$/u, "");
};

/** The open store and sync, for tests and debugging (import history, read the log). */
declare global {
  interface Window {
    nabu?: EventStore;
    nabuSync?: Sync;
  }
}
/** The deployment's game rules, loaded once. */
const gameRules = loadGameConfig(import.meta.env.BASE_URL);
const ready = openStore().then(async (store) => {
  const sync = await createSync(store, apiBase(), { gameConfig: () => gameRules });
  window.nabu = store;
  window.nabuSync = sync;
  // Where a report goes depends on the server and the account (ADR 0115).
  reportsThrough(sync);
  return { store, sync };
});

const noSync = { subscribe: () => () => undefined, get: () => undefined };

/** One course's event log and the state it projects to. */
interface Log {
  readonly course: string;
  readonly state: LearnerState;
}

export const App = (): JSX.Element => {
  const t = useTranslator();
  const route = useRoute();
  const [index, setIndex] = useState<readonly CourseIndexEntry[] | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  // Loads that failed are tried again when the connection comes back, or when the learner asks.
  const [retry, setRetry] = useState(0);
  const [{ store, sync }, setDevice] = useState<{ store: EventStore | null; sync: Sync | null }>({ store: null, sync: null });
  // Events pulled from another device: replay the open course.
  const pulled = useSyncExternalStore(sync?.subscribe ?? noSync.subscribe, () => sync?.get().pulled ?? 0);
  // A second check revised an answer: replay in place (an open session stays open).
  const revised = useSyncExternalStore(sync?.subscribe ?? noSync.subscribe, () => sync?.get().revised ?? 0);
  const account = useAccount(sync);
  const [log, setLog] = useState<Log | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [recorded, setRecorded] = useState(0);
  const version = `${recorded}:${pulled}:${href(route)}`;
  const game = useGame(store, gameConfig, version);
  // A failed load remembers the retry it was, so it is tried again only on the next one (never in a loop).
  const [loaded, setLoaded] = useState<{ key: string; value: LoadedCourse } | { key: string; error: string; attempt: number } | null>(null);
  // The route's course, if it has one (home and preferences have none).
  const inCourse = route.tag === "home" || route.tag === "preferences" || route.tag === "review" ? null : route;
  const courseKey = inCourse === null ? null : `${inCourse.course}:${inCourse.orthography}`;
  const courseId = inCourse === null ? null : inCourse.course;
  const ai = useAiStatus(account, courseId ?? "", inCourse === null ? "" : inCourse.orthography);
  const speechTiers = useSpeechTiers(account, courseId ?? "", inCourse === null ? "" : inCourse.orthography);
  const online = useOnline();
  const [downloads, setDownloads] = useState(0);
  const root = courseId === null ? undefined : `${BUNDLES}${courseId}/`;
  // Re-read after a course loads (the worker keeps what the app fetched) and after a download.
  const stored = useStored(OFFLINE ? root : undefined, `${downloads}:${loaded?.key ?? ""}:${online}`);
  const corrections = useCorrections(store, courseId, version);
  // Each screen's title; a new route starts at the top, with focus on its heading.
  // Named from the index, so a title names a course before it loads.
  const named = (id: string): Named => index?.find((c) => c.id === id) ?? { id };
  const names = { course: (id: string) => courseName(t, named(id)), orthography: (id: string, orthography: string) => orthographyName(t, named(id), orthography) };
  useScreen(href(route), titleOf(t, route, names, loaded !== null && loaded.key === courseKey && "value" in loaded ? loaded.value.course : undefined));

  useEffect(() => {
    if (online) setRetry((n) => n + 1);
  }, [online]);
  useEffect(() => {
    if (index !== null) return;
    setIndexFailed(false);
    fetchCourseIndex(BUNDLES).then(setIndex, () => setIndexFailed(true));
  }, [index, retry]);
  useEffect(() => {
    void gameRules.then(setGameConfig);
    void ready.then(setDevice);
    if (OFFLINE) void registerWorker(import.meta.env.BASE_URL);
    // The native app: sync when it comes back to the foreground; reminders open where they point.
    void ready.then(({ sync: s }) => startNative(() => void s.syncNow()));
  }, []);
  useEffect(() => {
    if (pulled > 0) setLog(null);
  }, [pulled]);
  useEffect(() => {
    if (revised === 0 || store === null || courseId === null) return;
    void store.eventsOf(courseId).then((events) => setLog({ course: courseId, state: replay(events) }));
  }, [revised, store, courseId]);
  useEffect(() => {
    if (inCourse === null || courseKey === null) return;
    if (loaded?.key === courseKey && !("error" in loaded && loaded.attempt < retry)) return;
    const attempt = retry;
    fetchCourse(BUNDLES, inCourse.course, inCourse.orthography).then(
      (value) => setLoaded({ key: courseKey, value }),
      (e: unknown) => setLoaded({ key: courseKey, error: String(e), attempt }),
    );
  }, [inCourse, courseKey, loaded, retry]);
  useEffect(() => {
    if (store === null || courseId === null || log?.course === courseId) return;
    void store.eventsOf(courseId).then((events) => setLog({ course: courseId, state: replay(events) }));
  }, [store, courseId, log]);

  // Live events are the newest in the log, so folding them onto the state equals a replay. A
  // revision rewrites an earlier answer (§8.3): the server issued it, and the log is replayed.
  const record = useCallback(
    (event: LearnerEvent): void => {
      // Corrections and claims go to the deployment's report intake too (ADR 0055), if it has one.
      if (event.type === "sentence_reported" || event.type === "answer_reported") void reportIntake().then((intake) => intake?.submit(event));
      // A revision (the judge's, or the learner's own claim, ADR 0052) rewrites an earlier answer: replay.
      // The server issued a judge's revision, so it is already synced; a learner's report still uploads.
      if (event.type === "outcome_revised" || event.type === "answer_reported") {
        const fromServer = event.type === "outcome_revised";
        void store
          ?.append([event], fromServer ? { synced: true } : undefined)
          .then(() => store.eventsOf(event.course))
          .then((events) => {
            setLog((prev) => (prev === null || prev.course !== event.course ? prev : { course: prev.course, state: replay(events) }));
            if (!fromServer) sync?.schedule();
            setRecorded((n) => n + 1);
          });
        return;
      }
      // The weekly goal is the account's, no course's (ADR 0107, D12): kept and synced, read from the game state.
      if (event.type !== "goal_set") setLog((prev) => (prev === null || prev.course !== event.course ? prev : { course: prev.course, state: applyEvents(prev.state, [event]) }));
      void store?.append([event]).then(() => {
        sync?.schedule();
        setRecorded((n) => n + 1);
      });
    },
    [store, sync],
  );

  // The weekly goal is the account's (ADR 0107, D12): choosing it records a goal_set, which syncs.
  const setGoal = useCallback(
    (days: number): void => {
      if (store !== null) record(goalEvent(days, store.device));
    },
    [store, record],
  );
  // A goal this device kept before goals were the account's goes into the log once, if the log has
  // none from any device; the device's own copy is forgotten either way.
  useEffect(() => {
    if (game === null || store === null) return;
    const kept = deviceGoal();
    if (kept === undefined) return;
    forgetDeviceGoal();
    const days = goalToMigrate(kept, game);
    if (days !== undefined) setGoal(days);
  }, [game, store, setGoal]);

  // Offline, a session uses only the media on this device: no listening without the clip. One
  // object per load and download state, so a session's grader keeps its course across renders.
  const current = loaded !== null && "value" in loaded ? loaded.value : undefined;
  const playable = useMemo(
    (): LoadedCourse | undefined => (current === undefined || online || stored === undefined ? current : { ...current, course: restrictMedia(current.course, (path) => stored.has(path)) }),
    [current, online, stored],
  );
  // The words typed answers are looked up in, built while the learner looks at the course, so the
  // first Check of a session never waits for them (R5).
  useEffect(() => {
    if (playable === undefined) return;
    const course = playable.course;
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(() => prepareGrading(course), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(() => prepareGrading(course), 200);
    return () => clearTimeout(id);
  }, [playable]);

  if (route.tag === "preferences") return <PreferencesPage back={href({ tag: "home" })} account={account} />;
  if (route.tag === "review") {
    return index === null || sync === null ? (
      <Loading />
    ) : (
      <ReviewHome courses={index} sync={sync} names={names} back={href({ tag: "home" })} hrefOf={(course, orthography) => href({ tag: "review-course", course, orthography })} />
    );
  }
  if (route.tag === "home") {
    if (index === null && indexFailed) return <LoadFailed message={online ? "app.error.index" : "app.offline.unavailable"} home={false} onRetry={() => setRetry((n) => n + 1)} />;
    return index === null || store === null || sync === null ? <Loading /> : <Home courses={index} store={store} sync={sync} game={game} gameConfig={gameConfig} version={version} online={online} onGoal={setGoal} />;
  }
  if (loaded?.key === courseKey && "error" in loaded) return <LoadFailed message={online ? "app.error.load" : "app.offline.unavailable"} home onRetry={() => setRetry((n) => n + 1)} />;
  if (loaded === null || loaded.key !== courseKey || "error" in loaded || store === null || log === null || log.course !== route.course) {
    return <Loading />;
  }
  if (route.tag === "course") {
    const offline: OfflineProps = { online, synced: account !== undefined, root: root ?? BUNDLES, stored, onChange: () => setDownloads((n) => n + 1) };
    const value = loaded.value;
    const onReset = (): void => record(resetEvent(value.course, value.manifest.id, store.device));
    // The path's words and titles take the course's profiles (fonts, target text size), as its pages do.
    const reports = <ReportsLink loaded={value} store={store} version={version} href={href({ tag: "reports", course: value.course.id, orthography: value.course.orthography })} />;
    return (
      <CourseUiProvider course={value.course}>
        <CoursePath loaded={value} state={log.state} persistent={store.persistent} ai={ai} offline={offline} speechTiers={speechTiers} game={game} onReset={onReset} reports={reports} />
      </CourseUiProvider>
    );
  }
  if (route.tag === "cards") {
    const { course } = loaded.value;
    return (
      <CourseUiProvider course={course}>
        <CardsPage loaded={loaded.value} language={courseName(t, course)} back={href({ tag: "course", course: course.id, orthography: course.orthography })} />
      </CourseUiProvider>
    );
  }
  if (route.tag === "audio") {
    const { course } = loaded.value;
    return (
      <CourseUiProvider course={course}>
        <AudioCheckPage loaded={loaded.value} base={import.meta.env.BASE_URL} back={href({ tag: "course", course: course.id, orthography: course.orthography })} />
      </CourseUiProvider>
    );
  }
  if (route.tag === "review-course") {
    const { course, manifest } = loaded.value;
    return sync === null ? (
      <Loading />
    ) : (
      <CourseUiProvider course={course}>
        <ReviewPage loaded={loaded.value} sync={sync} course={course} bundle={manifest.id} device={store.device} record={record} corrections={corrections} back={href({ tag: "review" })} />
      </CourseUiProvider>
    );
  }
  if (route.tag === "words") {
    const { course } = loaded.value;
    return (
      <CourseUiProvider course={course}>
        <WordsPage loaded={loaded.value} state={log.state} back={href({ tag: "course", course: course.id, orthography: course.orthography })} />
      </CourseUiProvider>
    );
  }
  if (route.tag === "reports") {
    const { course } = loaded.value;
    return (
      <CourseUiProvider course={course}>
        <ReportsPage loaded={loaded.value} store={store} version={version} back={href({ tag: "course", course: course.id, orthography: course.orthography })} />
      </CourseUiProvider>
    );
  }
  if (route.tag === "sentences") {
    const { course, manifest } = loaded.value;
    const back = href({ tag: "course", course: course.id, orthography: course.orthography });
    return (
      <CourseUiProvider course={course}>
        <SentencesPage course={course} bundle={manifest.id} device={store.device} record={record} corrections={corrections} back={back} review={DEBUG} />
      </CourseUiProvider>
    );
  }
  const sessionCourse = playable ?? loaded.value;
  if (route.tag === "roleplay") {
    const back = href({ tag: "course", course: route.course, orthography: route.orthography });
    return (
      <CourseUiProvider course={loaded.value.course}>
        <RoleplayPage key={href(route)} course={loaded.value.course} scenario={route.scenario} account={account} status={ai} back={back} />
      </CourseUiProvider>
    );
  }
  if (game === null && gameConfig?.gate.policy !== "none") return <Loading />;
  if (route.tag === "story")
    return (
      <StorySession
        key={href(route)}
        loaded={sessionCourse}
        node={route.node}
        state={log.state}
        device={store.device}
        record={record}
        game={game}
        gameConfig={gameConfig}
        corrections={corrections}
        store={store}
        account={account}
        ai={ai}
      />
    );
  return (
    <Session
      key={href(route)}
      loaded={sessionCourse}
      request={route.request}
      state={log.state}
      device={store.device}
      record={record}
      store={store}
      account={account}
      ai={ai}
      speechTiers={speechTiers}
      game={game}
      gameConfig={gameConfig}
      corrections={corrections}
    />
  );
};
