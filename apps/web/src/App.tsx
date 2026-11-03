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
 */
import { applyEvents, dueFacets, pathNodes, pathOf, plan, replay, type LearnerState, type NodeStatus, type PathEntry, type SessionRequest } from "@nabu/core/learner";
import { createGrader, LISTENING, seededRng } from "@nabu/core/lesson";
import type { GameConfig, GameState } from "@nabu/core/game";
import { storyAt, storyScript } from "@nabu/core/story";
import { directionOf } from "@nabu/i18n";
import type { AnswerSubmitted, LearnerEvent } from "@nabu/schema";
import { CorrectIcon, LockIcon, T, useTranslator } from "@nabu/ui";
import { fetchCourse, fetchCourseIndex, LessonPlayer, type CourseIndexEntry, type LoadedCourse } from "@nabu/ui/player";
import { StoryReader } from "@nabu/ui/story";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type JSX } from "react";
import { AnswerHelp, Conversations, RoleplayPage, useAccount, useAiStatus, type AiStatus } from "./ai.tsx";
import styles from "./App.module.css";
import { localDate } from "./clock.ts";
import { GamePanel, loadGameConfig, sessionAllowed, useGame } from "./game.tsx";
import { Progress } from "./Progress.tsx";
import { LeaguePanel } from "./social.tsx";
import { recorder, storyRecorder } from "./session.ts";
import { openStore, type EventStore } from "./store.ts";
import { createSync, type Account, type Sync } from "./sync.ts";

const BUNDLES = `${import.meta.env.BASE_URL}bundles/`;

type Route =
  | { readonly tag: "home" }
  | { readonly tag: "course"; readonly course: string; readonly orthography: string }
  | { readonly tag: "session"; readonly course: string; readonly orthography: string; readonly request: SessionRequest }
  | { readonly tag: "story"; readonly course: string; readonly orthography: string; readonly node: string }
  | { readonly tag: "roleplay"; readonly course: string; readonly orthography: string; readonly scenario: string };

/** Orthography ids carry a "/" (fa-Arab/standard): "." in the URL. */
const slug = (orthography: string): string => orthography.replace("/", ".");
const unslug = (s: string): string => s.replace(".", "/");

/** Node ids are course-prefixed ("fa.book"), so they never collide with "review", "mistakes" or "placement". */
const requestOf = (segment: string): SessionRequest =>
  segment === "review" || segment === "mistakes" || segment === "placement" ? { mode: segment } : { mode: "lesson", node: segment };

const parse = (hash: string): Route => {
  const [course, orthography, session, node] = hash.replace(/^#\/?/u, "").split("/").filter((p) => p !== "").map(decodeURIComponent);
  if (course === undefined || orthography === undefined) return { tag: "home" };
  if (session === undefined) return { tag: "course", course, orthography: unslug(orthography) };
  if (session === "story" && node !== undefined) return { tag: "story", course, orthography: unslug(orthography), node };
  if (session === "roleplay" && node !== undefined) return { tag: "roleplay", course, orthography: unslug(orthography), scenario: node };
  return { tag: "session", course, orthography: unslug(orthography), request: requestOf(session) };
};

const segmentOf = (request: SessionRequest): string => (request.mode === "lesson" ? encodeURIComponent(request.node) : request.mode);

export const href = (route: Route): string =>
  route.tag === "home"
    ? "#/"
    : route.tag === "course"
      ? `#/${route.course}/${slug(route.orthography)}`
      : route.tag === "story"
        ? `#/${route.course}/${slug(route.orthography)}/story/${encodeURIComponent(route.node)}`
        : route.tag === "roleplay"
          ? `#/${route.course}/${slug(route.orthography)}/roleplay/${encodeURIComponent(route.scenario)}`
          : `#/${route.course}/${slug(route.orthography)}/${segmentOf(route.request)}`;

const useRoute = (): Route => {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
};

type Translator = ReturnType<typeof useTranslator>;

const courseName = (t: Translator, id: string): string => {
  const key = `course.name.${id}`;
  return t.has(key) ? t.format(key) : id;
};

const orthographyName = (t: Translator, id: string): string => {
  const key = `orthography.${slug(id)}`;
  return t.has(key) ? t.format(key) : id;
};

interface GameProps {
  readonly game: GameState | null;
  readonly gameConfig: GameConfig | null;
}

const Home = ({ courses, store, sync, game, gameConfig, version }: { courses: readonly CourseIndexEntry[]; store: EventStore; sync: Sync; version: string } & GameProps): JSX.Element => {
  const t = useTranslator();
  const account = useSyncExternalStore(sync.subscribe, () => sync.get().account);
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{t.format("app.home.title")}</h1>
      {game !== null && gameConfig !== null && <GamePanel state={game} config={gameConfig} />}
      {account !== undefined && <LeaguePanel account={account} version={version} />}
      <ul className={styles.list} data-course-list="">
        {courses.map((c) => (
          <li key={c.id} className={styles.course} data-course={c.id}>
            <h2 className={styles.courseName}>{courseName(t, c.id)}</h2>
            {c.orthographies.length > 1 && <p className={styles.muted}>{t.format("app.home.writing")}</p>}
            <div className={styles.links}>
              {c.orthographies.map((o) => (
                <a key={o} className={styles.link} href={href({ tag: "course", course: c.id, orthography: o })} data-orthography={o}>
                  {orthographyName(t, o)}
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Progress store={store} sync={sync} />
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

/** The course's path (§11.1): practice, XP, and the lessons in order, each done, open or locked. */
const CoursePath = ({ loaded, state, persistent, ai }: { loaded: LoadedCourse; state: LearnerState; persistent: boolean; ai: AiStatus }): JSX.Element => {
  const t = useTranslator();
  const [quiet, setQuiet] = useState(listeningOff);
  const { course } = loaded;
  const orthography = course.orthography;
  const now = new Date();
  const status = new Map(pathOf(course, state).map((n) => [n.node, n.status]));
  const due = dueFacets(state, orthography, now.toISOString()).length;
  const studied = Object.keys(state.cards).length > 0;
  const mistakes = state.mistakes.length;
  const today = state.xp.byDate[localDate(now)] ?? 0;
  const units = pathNodes(course).reduce<{ unit: PathEntry["unit"]; entries: PathEntry[] }[]>((acc, entry) => {
    const last = acc.at(-1);
    if (last?.unit === entry.unit) last.entries.push(entry);
    else acc.push({ unit: entry.unit, entries: [entry] });
    return acc;
  }, []);
  let number = 0;
  const to = (request: SessionRequest): string => href({ tag: "session", course: course.id, orthography, request });

  return (
    <main className={styles.page} data-course-path={course.id}>
      <p>
        <a className={styles.back} href={href({ tag: "home" })}>
          {t.format("app.lessons.back")}
        </a>
      </p>
      <h1 className={styles.heading}>
        {courseName(t, course.id)} · {orthographyName(t, orthography)}
      </h1>
      <p className={styles.stats} data-xp={state.xp.total} data-xp-today={today}>
        <span className={styles.stat}>{t.format("app.xp.total", { xp: state.xp.total })}</span>
        <span className={styles.stat}>{t.format("app.xp.today", { xp: today })}</span>
      </p>
      {!persistent && (
        <p className={styles.notice} role="note" data-not-saved="">
          {t.format("app.store.memory")}
        </p>
      )}
      {quiet && (
        <p className={styles.notice} role="note" data-listening-off="">
          {t.format("app.listening.off")}{" "}
          <button
            type="button"
            className={styles.inlineButton}
            onClick={() => {
              setListeningOffUntil(0);
              setQuiet(false);
            }}
            data-action="listening-on"
          >
            {t.format("app.listening.on")}
          </button>
        </p>
      )}

      {state.completedNodes.length === 0 && (
        <p>
          <a className={styles.back} href={to({ mode: "placement" })} data-practice-mode="placement">
            {t.format("app.practice.placement", { language: courseName(t, course.id) })}
          </a>
        </p>
      )}

      <h2 className={styles.subheading}>{t.format("app.practice.title")}</h2>
      <div className={styles.links} data-practice="">
        {studied ? (
          <a className={styles.link} href={to({ mode: "review" })} data-practice-mode="review" data-count={due}>
            {t.format("app.practice.review")}
            <span className={styles.count}>{t.format("app.practice.due", { count: due })}</span>
          </a>
        ) : (
          <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true" data-practice-mode="review" data-count={0}>
            {t.format("app.practice.review")}
          </span>
        )}
        {mistakes > 0 ? (
          <a className={styles.link} href={to({ mode: "mistakes" })} data-practice-mode="mistakes" data-count={mistakes}>
            {t.format("app.practice.mistakes")}
            <span className={styles.count}>{t.format("app.practice.to-fix", { count: mistakes })}</span>
          </a>
        ) : (
          <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true" data-practice-mode="mistakes" data-count={0}>
            {t.format("app.practice.mistakes")}
          </span>
        )}
      </div>

      <h2 className={styles.subheading}>{t.format("app.lessons.title")}</h2>
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
                  <li key={node.id}>
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
                );
              })}
            </ol>
          </section>
        );
      })}
      <Conversations course={course} state={state} status={ai} link={(scenario) => href({ tag: "roleplay", course: course.id, orthography, scenario })} />
    </main>
  );
};

/**
 * "Can't listen now" (§10): listening exercises stay out of new sessions for an hour. A
 * per-device convenience, so it lives in localStorage; without storage it lasts the page.
 */
const LISTENING_OFF = "nabu.listening-off-until";
const LISTENING_BREAK_MS = 3_600_000;
let listeningOffFallback = 0;

const listeningOffUntil = (): number => {
  try {
    return Number(localStorage.getItem(LISTENING_OFF) ?? 0);
  } catch {
    return listeningOffFallback;
  }
};

const setListeningOffUntil = (until: number): void => {
  listeningOffFallback = until;
  try {
    if (until === 0) localStorage.removeItem(LISTENING_OFF);
    else localStorage.setItem(LISTENING_OFF, String(until));
  } catch {
    // Storage unavailable: the in-memory value above still holds for this page.
  }
};

const listeningOff = (): boolean => listeningOffUntil() > Date.now();

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
        <a className={styles.back} href={href({ tag: "course", course: course.id, orthography: course.orthography })}>
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
}

/** Plans one session from the learner's state when it opens (§9.4), then plays it. */
const Session = (props: SessionProps): JSX.Element => {
  const { loaded, request, game, gameConfig } = props;
  // Decided once, when the session opens: answering inside it never closes the gate on it.
  const [allowed] = useState(() => sessionAllowed(game, request.mode, gameConfig));
  return allowed ? <SessionBody {...props} /> : <GateEmpty course={loaded.course} />;
};

const SessionBody = ({ loaded, request, state, device, record, store, account, ai }: SessionProps): JSX.Element => {
  const t = useTranslator();
  const { course, manifest, imageUrl } = loaded;
  // Each exercise's latest answer, for what the feedback offers under it (Phase 8).
  const [answers, setAnswers] = useState<ReadonlyMap<string, AnswerSubmitted>>(new Map());
  const [setup] = useState(() => {
    const seed = seedFor();
    const planned = plan(course, state, request, { now: new Date().toISOString(), seed, ...(listeningOff() ? { exclude: LISTENING } : {}) });
    const keep = (event: LearnerEvent): void => {
      if (event.type === "answer_submitted") setAnswers((m) => new Map(m).set(event.exercise.id, event));
      record(event);
    };
    return { seed, planned, xpBefore: state.xp.total, onEvent: recorder({ course, bundle: manifest.id, device, plan: planned, seed, record: keep }) };
  });
  const grader = useMemo(() => createGrader(course), [course]);
  const sound = new URLSearchParams(window.location.search).get("sound") !== "off";
  const exit = (): void => {
    window.location.hash = href({ tag: "course", course: course.id, orthography: course.orthography });
  };
  if (setup.planned.exercises.length === 0) {
    return (
      <main className={styles.page}>
        <p data-empty-session="">{t.format("app.practice.empty")}</p>
        <a className={styles.back} href={href({ tag: "course", course: course.id, orthography: course.orthography })}>
          {t.format("app.practice.back")}
        </a>
      </main>
    );
  }
  return (
    <main className={styles.player}>
      <LessonPlayer
        course={course}
        lessonId={request.mode === "lesson" ? request.node : request.mode}
        exercises={setup.planned.exercises}
        grader={grader}
        imageUrl={imageUrl}
        language={courseName(t, course.id)}
        onEvent={setup.onEvent}
        sound={sound}
        retries={request.mode !== "placement"}
        onCantListen={() => setListeningOffUntil(Date.now() + LISTENING_BREAK_MS)}
        xpEarned={state.xp.total - setup.xpBefore}
        onExit={exit}
        feedbackExtra={(ex) => {
          const answer = answers.get(ex.id);
          return <AnswerHelp key={answer?.id ?? ex.id} answer={answer} ex={ex} status={ai} account={account} store={store} record={record} />;
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
}

/** Reads one story (Phase 6): a session of mode story at its node. */
const StorySession = (props: StorySessionProps): JSX.Element => {
  const [allowed] = useState(() => sessionAllowed(props.game, "story", props.gameConfig));
  return allowed ? <StoryBody {...props} /> : <GateEmpty course={props.loaded.course} />;
};

const StoryBody = ({ loaded, node, state, device, record }: StorySessionProps): JSX.Element => {
  const t = useTranslator();
  const { course, manifest, imageUrl } = loaded;
  const [setup] = useState(() => {
    const story = storyAt(course, node);
    if (story === undefined) return undefined;
    const seed = seedFor();
    return { script: storyScript(course, story, seededRng(seed)), xpBefore: state.xp.total, onEvent: storyRecorder({ course, bundle: manifest.id, device, node, seed, record }) };
  });
  const grader = useMemo(() => createGrader(course), [course]);
  const sound = new URLSearchParams(window.location.search).get("sound") !== "off";
  const back = href({ tag: "course", course: course.id, orthography: course.orthography });
  if (setup === undefined) {
    return (
      <main className={styles.page}>
        <p data-empty-session="">{t.format("app.practice.empty")}</p>
        <a className={styles.back} href={back}>
          {t.format("app.practice.back")}
        </a>
      </main>
    );
  }
  return (
    <main className={styles.player}>
      <StoryReader
        course={course}
        script={setup.script}
        grader={grader}
        imageUrl={imageUrl}
        language={courseName(t, course.id)}
        onEvent={setup.onEvent}
        sound={sound}
        xpEarned={state.xp.total - setup.xpBefore}
        onExit={() => {
          window.location.hash = back;
        }}
      />
    </main>
  );
};

/** The sync server: ?api= (tests, trying a server), else the build's VITE_NABU_API, else none (local-only). */
const apiBase = (): string | undefined => {
  const value = new URLSearchParams(window.location.search).get("api") ?? import.meta.env.VITE_NABU_API;
  return value === undefined || value === "" ? undefined : value.replace(/\/+$/u, "");
};

/** The open store and sync, for tests and debugging (import history, read the log). */
declare global {
  interface Window {
    nabu?: EventStore;
    nabuSync?: Sync;
  }
}
const ready = openStore().then(async (store) => {
  const sync = await createSync(store, apiBase());
  window.nabu = store;
  window.nabuSync = sync;
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
  const [loaded, setLoaded] = useState<{ key: string; value: LoadedCourse } | { key: string; error: string } | null>(null);
  const courseKey = route.tag === "home" ? null : `${route.course}:${route.orthography}`;
  const courseId = route.tag === "home" ? null : route.course;
  const ai = useAiStatus(account, courseId ?? "", route.tag === "home" ? "" : route.orthography);

  useEffect(() => {
    void fetchCourseIndex(BUNDLES).then(setIndex);
    void loadGameConfig(import.meta.env.BASE_URL).then(setGameConfig);
    void ready.then(setDevice);
  }, []);
  useEffect(() => {
    if (pulled > 0) setLog(null);
  }, [pulled]);
  useEffect(() => {
    if (revised === 0 || store === null || courseId === null) return;
    void store.eventsOf(courseId).then((events) => setLog({ course: courseId, state: replay(events) }));
  }, [revised, store, courseId]);
  useEffect(() => {
    if (route.tag === "home" || courseKey === null || loaded?.key === courseKey) return;
    fetchCourse(BUNDLES, route.course, route.orthography).then(
      (value) => setLoaded({ key: courseKey, value }),
      (e: unknown) => setLoaded({ key: courseKey, error: String(e) }),
    );
  }, [route, courseKey, loaded]);
  useEffect(() => {
    if (store === null || courseId === null || log?.course === courseId) return;
    void store.eventsOf(courseId).then((events) => setLog({ course: courseId, state: replay(events) }));
  }, [store, courseId, log]);

  // Live events are the newest in the log, so folding them onto the state equals a replay. A
  // revision rewrites an earlier answer (§8.3): the server issued it, and the log is replayed.
  const record = useCallback(
    (event: LearnerEvent): void => {
      if (event.type === "outcome_revised") {
        void store
          ?.append([event], { synced: true })
          .then(() => store.eventsOf(event.course))
          .then((events) => {
            setLog((prev) => (prev === null || prev.course !== event.course ? prev : { course: prev.course, state: replay(events) }));
            setRecorded((n) => n + 1);
          });
        return;
      }
      setLog((prev) => (prev === null || prev.course !== event.course ? prev : { course: prev.course, state: applyEvents(prev.state, [event]) }));
      void store?.append([event]).then(() => {
        sync?.schedule();
        setRecorded((n) => n + 1);
      });
    },
    [store, sync],
  );

  if (route.tag === "home") {
    return index === null || store === null || sync === null ? <p className={styles.page}>{t.format("player.loading")}</p> : <Home courses={index} store={store} sync={sync} game={game} gameConfig={gameConfig} version={version} />;
  }
  if (loaded === null || loaded.key !== courseKey || store === null || log === null || log.course !== route.course) {
    return <p className={styles.page}>{t.format("player.loading")}</p>;
  }
  if ("error" in loaded) return <p className={styles.page} role="alert">{t.format("app.error.load")}</p>;
  if (route.tag === "course") return <CoursePath loaded={loaded.value} state={log.state} persistent={store.persistent} ai={ai} />;
  if (route.tag === "roleplay") {
    const back = href({ tag: "course", course: route.course, orthography: route.orthography });
    return <RoleplayPage key={href(route)} course={loaded.value.course} scenario={route.scenario} account={account} status={ai} back={back} />;
  }
  if (game === null && gameConfig?.gate.policy !== "none") return <p className={styles.page}>{t.format("player.loading")}</p>;
  if (route.tag === "story") return <StorySession key={href(route)} loaded={loaded.value} node={route.node} state={log.state} device={store.device} record={record} game={game} gameConfig={gameConfig} />;
  return (
    <Session key={href(route)} loaded={loaded.value} request={route.request} state={log.state} device={store.device} record={record} store={store} account={account} ai={ai} game={game} gameConfig={gameConfig} />
  );
};
