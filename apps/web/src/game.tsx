/**
 * The game layer in the app (gameplan §12): XP, the streak, freezes, today's quests,
 * achievements, the weekly goal (the account's, ADR 0107) and the session gate, all projections
 * of the on-device log by @nabu/core/game.
 * The deployment configures the rules in `game.json` next to the app (optional; the defaults
 * keep the gate off and streaks, XP and quests on).
 */
import { canStart, daysBetween, daysThisWeek, DEFAULT_GAME, GOAL_DAYS, gameConfig, isGoalDays, type GameConfig, type GameState, type Mode } from "@nabu/core/game";
import { useTranslator } from "@nabu/ui";
import { useEffect, useState, type CSSProperties, type JSX } from "react";
import { Button, Label, ProgressBar, Radio, RadioGroup } from "react-aria-components";
import styles from "./App.module.css";
import { localDate, msUntilNextLocalDate } from "./clock.ts";
import { gameOfLog } from "./game-log.ts";
import type { EventStore } from "./store.ts";

/** The deployment's rules: game.json overrides on the defaults, or the defaults. */
export const loadGameConfig = async (base: string): Promise<GameConfig> => {
  try {
    const res = await fetch(`${base}game.json`);
    if (!res.ok) return DEFAULT_GAME;
    return gameConfig((await res.json()) as Parameters<typeof gameConfig>[0]);
  } catch {
    return DEFAULT_GAME;
  }
};

/** The game state of the whole device log (all courses) as of now (game-log.ts). */
const gameOf = async (store: EventStore, config: GameConfig): Promise<GameState> => {
  const received = await store.receivedTimes();
  return gameOfLog(await store.allEvents(), received, config);
};

/**
 * Counts the times the game state may have changed with nothing recorded: the page shown again
 * (a phone unlocked, a tab come back to), and the local date turning over while it stays open.
 */
const useClockTurns = (): number => {
  const [turns, setTurns] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Set from the clock again each time: a timer can fire late (a computer asleep), and early by
    // the clock (set back), when the date has not changed yet and it waits again.
    const arm = (): void => {
      const today = localDate(new Date());
      timer = setTimeout(() => {
        if (localDate(new Date()) !== today) setTurns((n) => n + 1);
        arm();
      }, msUntilNextLocalDate(new Date()));
    };
    arm();
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") setTurns((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return turns;
};

/**
 * Recomputes the game state whenever `version` changes (an event that changes it was recorded, events
 * were pulled, another screen opened), when the page is shown again, and when the local date changes:
 * a page left open overnight shows the new day (the streak, today's quests, the gate) without a new
 * event. It reads the whole log, so the app does not change `version` for each answer (R1).
 */
export const useGame = (store: EventStore | null, config: GameConfig | null, version: unknown): GameState | null => {
  const [state, setState] = useState<GameState | null>(null);
  const turns = useClockTurns();
  useEffect(() => {
    if (store === null || config === null) return;
    let live = true;
    void gameOf(store, config).then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, [store, config, version, turns]);
  return state;
};

export const sessionAllowed = (state: GameState | null, mode: Mode, config: GameConfig | null): boolean =>
  state === null || config === null ? true : canStart(state.gate, mode, config.gate);

/** An achievement's message: its kind (streak, sessions, stories, right) and number. */
const achievementText = (t: ReturnType<typeof useTranslator>, id: string, config: GameConfig): string => {
  const a = config.achievements.find((x) => x.id === id);
  if (a === undefined) return id;
  if (a.kind === "streak") return t.format("achievement.streak", { days: a.days });
  const key = `achievement.${id.split("-")[0] ?? ""}`;
  return t.has(key) ? t.format(key, { target: a.target }) : id;
};

export const GatePanel = ({ state, config }: { state: GameState; config: GameConfig }): JSX.Element | null => {
  const t = useTranslator();
  if (config.gate.policy === "none") return null;
  const label = config.gate.policy === "hearts" ? t.format("game.gate.hearts", { count: state.gate.value }) : t.format("game.gate.energy", { count: state.gate.value });
  return (
    <p className={styles.stat} data-gate={config.gate.policy} data-gate-value={state.gate.value}>
      {label}
    </p>
  );
};

/** The day the UI locale's region starts the week on (1 Monday … 7 Sunday), where the browser says; else Monday. */
const firstDayOf = (locale: string): number => {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    return l.getWeekInfo?.().firstDay ?? l.weekInfo?.firstDay ?? 1;
  } catch {
    return 1;
  }
};

/** The days of the last week a freeze covered, named as the UI locale names weekdays, in a list. */
const coveredDays = (t: ReturnType<typeof useTranslator>, frozen: readonly string[], today: string): { readonly days: string; readonly count: number } | undefined => {
  const recent = frozen.filter((d) => daysBetween(d, today) >= 1 && daysBetween(d, today) <= 6);
  if (recent.length === 0) return undefined;
  const weekday = new Intl.DateTimeFormat(t.formattingLocale, { weekday: "long", timeZone: "UTC" });
  const names = recent.map((d) => weekday.format(Date.parse(`${d}T12:00:00Z`)));
  return { days: new Intl.ListFormat(t.formattingLocale, { type: "conjunction" }).format(names), count: recent.length };
};

interface GoalProps {
  readonly days: readonly string[];
  readonly today: string;
  /** The account's goal, from the game state (the latest goal_set, on any device). */
  readonly goal: number | null | undefined;
  /** The learner chose a goal: the app records it (a goal_set event). */
  readonly onGoal: (days: number) => void;
}

/** The weekly goal (ADR 0107, D12): how far this week has come, or the question that sets it. */
const Goal = ({ days, today, goal, onGoal }: GoalProps): JSX.Element => {
  const t = useTranslator();
  // The goal just chosen, until the game state (worked out again from the log) says it too.
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const [choosing, setChoosing] = useState(false);
  useEffect(() => {
    if (chosen !== undefined && goal === chosen) setChosen(undefined);
  }, [goal, chosen]);
  const current = chosen ?? goal ?? undefined;
  const done = daysThisWeek(days, today, firstDayOf(t.formattingLocale));
  const number = new Intl.NumberFormat(t.formattingLocale);
  if (current === undefined || choosing) {
    return (
      <RadioGroup
        className={styles.goal}
        orientation="horizontal"
        value={current === undefined ? null : String(current)}
        onChange={(value) => {
          const n = Number(value);
          if (!isGoalDays(n)) return;
          setChosen(n);
          setChoosing(false);
          if (n !== current) onGoal(n);
        }}
        data-goal-choice=""
      >
        <Label className={styles.label}>{t.format("game.goal.question")}</Label>
        <div className={styles.goalChoices}>
          {/* The number shows; its name says the days ("3 days"), as the question asks. */}
          {GOAL_DAYS.map((n) => (
            <Radio key={n} value={String(n)} className={`${styles.preferenceOption} ${styles.goalChoice}`} aria-label={t.format("game.goal.days", { days: n })} data-goal-days={n}>
              {number.format(n)}
            </Radio>
          ))}
        </div>
      </RadioGroup>
    );
  }
  return (
    <p className={styles.goal} data-goal={current} data-week-days={done}>
      <span className={styles.goalProgress}>{t.format("game.goal.week", { done, goal: current })}</span>
      {done >= current && <span className={styles.muted}>{t.format("game.goal.met")}</span>}
      <Button className={styles.inlineButton} onPress={() => setChoosing(true)} data-action="change-goal">
        {t.format("game.goal.change")}
      </Button>
    </p>
  );
};

/**
 * The learner's practice: the streak, the freezes, the weekly goal, today's quests and the
 * achievements. Nothing before the first session (M4): Home opens on the courses, not on an empty
 * streak. A streak that ended says how to start again, never a zero.
 */
export const GamePanel = ({ state, config, onGoal }: { state: GameState; config: GameConfig; onGoal: (days: number) => void }): JSX.Element | null => {
  const t = useTranslator();
  const { streak } = state;
  if (state.days.length === 0 && state.xp.total === 0) return null;
  const today = localDate(new Date());
  const covered = coveredDays(t, streak.frozen, today);
  return (
    <section className={`${styles.course} ${styles.game}`} data-game="" aria-labelledby="game-title">
      <h2 className={styles.courseName} id="game-title">
        {t.format("game.practice.title")}
      </h2>
      <p className={styles.streak} data-streak={streak.current} data-practiced-today={String(streak.practicedToday)}>
        {streak.current > 0 ? (
          <>
            <span className={styles.streakCount}>{t.format("game.streak", { days: streak.current })}</span>
            <span className={styles.muted}>{t.format(streak.practicedToday ? "game.streak.today-done" : "game.streak.today-pending")}</span>
          </>
        ) : (
          <span className={styles.streakCount}>{t.format("game.streak.restart")}</span>
        )}
      </p>
      {covered !== undefined && (
        <p className={styles.muted} data-freeze-covered={covered.count}>
          {t.format("game.freeze.covered", covered)}
        </p>
      )}
      <Goal days={state.days} today={today} goal={state.goal} onGoal={onGoal} />
      {(streak.freezes > 0 || streak.longest > streak.current || config.gate.policy !== "none") && (
        <p className={styles.stats}>
          {streak.freezes > 0 && (
            <span className={styles.stat} data-freezes={streak.freezes}>
              {t.format("game.freezes", { count: streak.freezes })}
            </span>
          )}
          {streak.longest > streak.current && (
            <span className={styles.stat} data-longest={streak.longest}>
              {t.format("game.streak.longest", { days: streak.longest })}
            </span>
          )}
          <GatePanel state={state} config={config} />
        </p>
      )}

      <h3 className={styles.unitTitle}>{t.format("game.quests.title")}</h3>
      <ul className={styles.quests} data-quests="">
        {state.quests.map((q) => {
          const key = `quest.${q.id}`;
          const name = t.has(key) ? t.format(key, { target: q.target }) : q.id;
          const progress = t.format("game.quests.progress", { progress: q.progress, target: q.target });
          return (
            <li key={q.id} className={styles.quest} data-quest={q.id} data-done={String(q.done)} data-quest-progress={q.progress}>
              <ProgressBar className={styles.questBar} value={q.progress} minValue={0} maxValue={q.target} aria-label={name} valueLabel={q.done ? t.format("game.quests.done") : progress}>
                {({ percentage, valueText }) => (
                  <>
                    <span className={styles.questHead}>
                      <span>{name}</span>
                      <span className={styles.muted}>{valueText}</span>
                    </span>
                    <span className={styles.track}>
                      <span className={styles.fill} style={{ "--nabu-progress": `${percentage ?? 0}%` } as CSSProperties} />
                    </span>
                  </>
                )}
              </ProgressBar>
            </li>
          );
        })}
      </ul>

      <h3 className={styles.unitTitle}>{t.format("game.achievements.title")}</h3>
      {state.achievements.length === 0 ? (
        <p className={styles.muted}>{t.format("game.achievements.none")}</p>
      ) : (
        <ul className={styles.achievements} data-achievements="">
          {state.achievements.map((id) => (
            <li key={id} className={styles.achievement} data-achievement={id}>
              {achievementText(t, id, config)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
