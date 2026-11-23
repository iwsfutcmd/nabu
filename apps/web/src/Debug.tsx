/**
 * Debug mode: try every kind of card. Preferences turns it on for this device, as `?debug=1` does
 * (`?debug=0` off); the course page then links to a gallery with one card of every kind the course can make, and
 * every card says which kind it is. Nothing played here is recorded: the gallery's sessions go
 * nowhere, so they never touch the learner's progress. While it is on, every screen says so, with
 * a way out (DebugNotice).
 */
import { cardGallery, createGrader, type Exercise } from "@nabu/core/lesson";
import { playsUnasked } from "./breaks.ts";
import { useTranslator } from "@nabu/ui";
import { LessonPlayer, type LoadedCourse } from "@nabu/ui/player";
import { useEffect, useMemo, useState, type JSX } from "react";
import { Button } from "react-aria-components";
import styles from "./App.module.css";
import { storedSound, storeSound } from "./Preferences.tsx";
import { decodeCard } from "./card-link.ts";
import { leaveDebug } from "./debug-mode.ts";
import { leave } from "./navigation.ts";
import { ScreenHeading } from "./screen.tsx";

export { debugMode, leaveDebug, setDebug } from "./debug-mode.ts";

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
  /** A link that opens a card again, exactly (card-link.ts). */
  readonly cardLink: (ex: Exercise) => Promise<string>;
}

/** One card of every kind; each can be tried alone, or all in a row. */
export const CardsPage = ({ loaded, language, back, cardLink }: CardsProps): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const gallery = useMemo(() => cardGallery(course, 7), [course]);
  const grader = useMemo(() => createGrader(course), [course]);
  const [playing, setPlaying] = useState<{ readonly key: string; readonly exercises: readonly Exercise[] } | null>(null);
  // Nothing plays by itself with sound off or listening put off (P6).
  const sound = playsUnasked(new URLSearchParams(window.location.search).get("sound") !== "off" && storedSound());
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
          onSoundChange={storeSound}
          retries={false}
          xpEarned={0}
          debug
          cardLink={cardLink}
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

/**
 * One exact card from a link (debug mode): the card the link carries (card-link.ts), played as the gallery
 * plays one, nothing recorded. A link cut short, or made by another format, says so.
 */
export const CardPage = ({ loaded, language, back, cardLink, code }: CardsProps & { readonly code: string }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  // undefined while the link is read; null where it cannot be.
  const [card, setCard] = useState<Exercise | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void decodeCard(code).then((ex) => {
      if (current) setCard(ex ?? null);
    });
    return () => {
      current = false;
    };
  }, [code]);
  const sound = playsUnasked(new URLSearchParams(window.location.search).get("sound") !== "off" && storedSound());
  if (card === undefined) return <main className={styles.page} aria-busy="true" />;
  if (card === null) {
    return (
      <main className={styles.page} data-card-unreadable="">
        <ScreenHeading>{t.format("debug.card.title")}</ScreenHeading>
        <p>{t.format("debug.card.unreadable")}</p>
        <p>
          <a className={styles.back} href={back}>
            {t.format("debug.cards.back")}
          </a>
        </p>
      </main>
    );
  }
  return (
    <main className={styles.player} data-card-page={card.id}>
      <ScreenHeading>{t.format("debug.card.title")}</ScreenHeading>
      <LessonPlayer
        key={code}
        course={course}
        lessonId="debug"
        exercises={[card]}
        grader={grader}
        imageUrl={imageUrl}
        language={language}
        sound={sound}
        onSoundChange={storeSound}
        retries={false}
        xpEarned={0}
        debug
        cardLink={cardLink}
        onExit={() => leave(back)}
      />
    </main>
  );
};
