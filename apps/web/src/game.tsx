/**
 * The game layer in the app (gameplan §12): XP, the streak, freezes, today's quests,
 * achievements and the session gate, all projections of the on-device log by @nabu/core/game.
 * The deployment configures the rules in `game.json` next to the app (optional; the defaults
 * keep the gate off and streaks, XP and quests on).
 */
import { canStart, DEFAULT_GAME, gameConfig, replayGame, type GameConfig, type GameState, type Mode } from "@nabu/core/game";
import { useTranslator } from "@nabu/ui";
import { useEffect, useState, type CSSProperties, type JSX } from "react";
import { ProgressBar } from "react-aria-components";
import styles from "./App.module.css";
import { localDate, msUntilNextLocalDate } from "./clock.ts";
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

/**
 * The game state of the whole device log (all courses) as of now. Synced events carry when the
 * server received them, so a late sync counts as the server counts it (§12.2) and the two agree.
 */
export const gameOf = async (store: EventStore, config: GameConfig, now = new Date()): Promise<GameState> => {
  const received = await store.receivedTimes();
  return replayGame(
    (await store.allEvents()).map((event) => ({ event, receivedAt: received.get(event.id) })),
    config,
    { today: localDate(now), now: now.toISOString() },
  );
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
 * Recomputes the game state whenever `version` changes (an event was recorded or pulled), when
 * the page is shown again, and when the local date changes: a page left open overnight shows the
 * new day (the streak, today's quests, the gate) without a new event.
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

/** Streak, freezes, today's quests and achievements. */
export const GamePanel = ({ state, config }: { state: GameState; config: GameConfig }): JSX.Element => {
  const t = useTranslator();
  const { streak } = state;
  return (
    <section className={`${styles.course} ${styles.game}`} data-game="" aria-labelledby="game-title">
      <h2 className={styles.courseName} id="game-title">
        {t.format("game.title")}
      </h2>
      <p className={styles.streak} data-streak={streak.current} data-practiced-today={String(streak.practicedToday)}>
        <span className={styles.streakCount}>{t.format("game.streak", { days: streak.current })}</span>
        <span className={styles.muted}>{t.format(streak.practicedToday ? "game.streak.today-done" : "game.streak.today-pending")}</span>
      </p>
      <p className={styles.stats}>
        <span className={styles.stat} data-freezes={streak.freezes}>
          {t.format("game.freezes", { count: streak.freezes })}
        </span>
        <span className={styles.stat} data-longest={streak.longest}>
          {t.format("game.streak.longest", { days: streak.longest })}
        </span>
        <GatePanel state={state} config={config} />
      </p>

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
