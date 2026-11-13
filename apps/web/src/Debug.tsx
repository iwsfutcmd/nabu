/**
 * Debug mode: try every kind of card. `?debug=1` turns it on for this device (`?debug=0` off);
 * the course page then links to a gallery with one card of every kind the course can make, and
 * every card says which kind it is. Nothing played here is recorded: the gallery's sessions go
 * nowhere, so they never touch the learner's progress. While it is on, every screen says so, with
 * a way out (DebugNotice).
 */
import { cardGallery, createGrader, type Exercise } from "@nabu/core/lesson";
import { useTranslator } from "@nabu/ui";
import { LessonPlayer, type LoadedCourse } from "@nabu/ui/player";
import { useMemo, useState, type JSX } from "react";
import { Button } from "react-aria-components";
import styles from "./App.module.css";
import { ScreenHeading } from "./screen.tsx";

const DEBUG = "nabu.debug";

/** Reads ?debug=1 / ?debug=0 once and remembers it on this device. */
export const debugOn = (): boolean => {
  const asked = new URLSearchParams(window.location.search).get("debug");
  try {
    if (asked === "1") localStorage.setItem(DEBUG, "1");
    if (asked === "0") localStorage.removeItem(DEBUG);
    return localStorage.getItem(DEBUG) === "1";
  } catch {
    return asked === "1";
  }
};

/** Debug mode as the page opened: read once, so every screen agrees until the page opens again. */
export const debugMode = debugOn();

/**
 * Leaves debug mode on this device, and opens the page again without it (and without a
 * ?debug=1 that would turn it straight back on).
 */
export const leaveDebug = (): void => {
  try {
    localStorage.removeItem(DEBUG);
  } catch {
    // Storage unavailable: only the address kept it on.
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("debug");
  // The same address with a fragment would only scroll: load it again instead.
  if (url.href === window.location.href) window.location.reload();
  else window.location.replace(url.href);
};

/** On every screen while debug mode is on: says so, and offers the way out. */
export const DebugNotice = (): JSX.Element => {
  const t = useTranslator();
  return (
    <aside className={styles.debugNotice} aria-label={t.format("debug.notice.label")} data-debug-notice="">
      <span>{t.format("debug.notice")}</span>
      <button type="button" className={styles.inlineButton} onClick={leaveDebug} data-action="leave-debug">
        {t.format("debug.leave")}
      </button>
    </aside>
  );
};

interface CardsProps {
  readonly loaded: LoadedCourse;
  readonly language: string;
  readonly back: string;
}

/** One card of every kind; each can be tried alone, or all in a row. */
export const CardsPage = ({ loaded, language, back }: CardsProps): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const gallery = useMemo(() => cardGallery(course, 7), [course]);
  const grader = useMemo(() => createGrader(course), [course]);
  const [playing, setPlaying] = useState<{ readonly key: string; readonly exercises: readonly Exercise[] } | null>(null);
  const sound = new URLSearchParams(window.location.search).get("sound") !== "off";
  if (playing !== null) {
    return (
      <main className={styles.player}>
        <ScreenHeading>{t.format("debug.cards.title")}</ScreenHeading>
        <LessonPlayer
          key={playing.key}
          course={course}
          lessonId="debug"
          exercises={playing.exercises}
          grader={grader}
          imageUrl={imageUrl}
          language={language}
          sound={sound}
          retries={false}
          xpEarned={0}
          debug
          onExit={() => setPlaying(null)}
        />
      </main>
    );
  }
  const all = gallery.flatMap((c) => (c.exercise === undefined ? [] : [c.exercise]));
  return (
    <main className={styles.page} data-cards-page={course.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("debug.cards.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("debug.cards.title")}</h1>
      <p className={styles.muted}>{t.format("debug.cards.intro")}</p>
      <p>
        <Button className={styles.button} onPress={() => setPlaying({ key: "all", exercises: all })} data-action="play-all-cards">
          {t.format("debug.cards.play-all")}
        </Button>
      </p>
      <ul className={styles.list} data-card-list="">
        {gallery.map(({ template, exercise }) => (
          <li key={template} className={styles.course} data-card={template} data-available={exercise !== undefined}>
            <code>{template}</code>{" "}
            {exercise === undefined ? (
              <span className={styles.muted}>{t.format("debug.cards.none")}</span>
            ) : (
              <Button className={styles.textButton} onPress={() => setPlaying({ key: template, exercises: [exercise] })} data-action="try-card">
                {t.format("debug.cards.try")}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
};
