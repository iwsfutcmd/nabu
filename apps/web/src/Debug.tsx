/**
 * Debug mode: try every kind of card. Preferences turns it on for this device, as `?debug=1` does
 * (`?debug=0` off); the course page then links to a gallery with one card of every kind the course can make, and
 * every card says which kind it is. Nothing played here is recorded: the gallery's sessions go
 * nowhere, so they never touch the learner's progress. While it is on, every screen says so, with
 * a way out and a way to open a card by its id or link (DebugNotice, OpenCardPage).
 */
import { cardFromId, cardGallery, createGrader, type CardIdError, type CardIdParts, type Exercise } from "@nabu/core/lesson";
import { playsUnasked } from "./breaks.ts";
import { useSettledSubmit, useTranslator } from "@nabu/ui";
import { CardIdText, LessonPlayer, type LoadedCourse } from "@nabu/ui/player";
import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Button, Input, Label, Text, TextField } from "react-aria-components";
import styles from "./App.module.css";
import { storedSound, storeSound } from "./Preferences.tsx";
import { cardTargetOf, decodeCard } from "./card-link.ts";
import { leaveDebug } from "./debug-mode.ts";
import { leave, openAddress } from "./navigation.ts";
import { ScreenHeading } from "./screen.tsx";

export { debugMode, leaveDebug, setDebug } from "./debug-mode.ts";

/** The route of the page that opens a card by its id or link: #/open-card. */
export const OPEN_CARD = "open-card";

/** On every screen while debug mode is on: says so, offers the way out, and opens a card by its id or link. */
export const DebugNotice = (): JSX.Element => {
  const t = useTranslator();
  return (
    <aside className={styles.debugNotice} aria-label={t.format("debug.notice.label")} data-debug-notice="">
      <span>{t.format("debug.notice")}</span>
      <span className={styles.noticeActions}>
        <a className={styles.inlineButton} href={`#/${OPEN_CARD}`} data-action="open-card">
          {t.format("debug.open.link")}
        </a>
        <button type="button" className={styles.inlineButton} onClick={leaveDebug} data-action="leave-debug">
          {t.format("debug.leave")}
        </button>
      </span>
    </aside>
  );
};

/** An id debug mode shows, as an example of what to paste. */
const EXAMPLE_ID = "tok/tok-Qaap.sitelen-pona/choose-translation:s.u01.1";

/**
 * Opens a card by what was pasted: a card's link (its own route, card-link.ts) or its id (core `cardId`), which
 * opens the card the course makes from it (`idHref`, CardIdPage). The field is code (left to right); a press or
 * Enter while a keyboard composes waits for the settled text (ADR 0118).
 */
export const OpenCardPage = ({ idHref }: { readonly idHref: (card: CardIdParts) => string }): JSX.Element => {
  const t = useTranslator();
  const [text, setText] = useState("");
  const [unreadable, setUnreadable] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const settled = useSettledSubmit(() => {
    const target = cardTargetOf(text);
    setUnreadable(target === undefined);
    if (target !== undefined) openAddress(target.tag === "address" ? target.hash : idHref(target.card));
  }, button);
  return (
    <main className={styles.page} data-open-card="">
      <ScreenHeading>{t.format("debug.open.title")}</ScreenHeading>
      <p className={styles.formIntro}>{t.format("debug.open.intro")}</p>
      <form
        className={styles.field}
        onSubmit={(e) => {
          e.preventDefault();
          settled.enter();
        }}
      >
        <TextField className={styles.field} value={text} onChange={setText} autoComplete="off" isInvalid={unreadable}>
          <Label className={styles.label}>{t.format("debug.open.field")}</Label>
          <Input className={styles.input} dir="ltr" spellCheck={false} autoCapitalize="none" {...settled.composition} data-field="card-id" />
          <Text slot="description" elementType="div" className={styles.muted}>
            {t.format("debug.open.example")}
            {/* Code: left to right on a line of its own, whatever the chrome's direction. */}
            <code className={styles.exampleId} dir="ltr">
              <CardIdText id={EXAMPLE_ID} />
            </code>
          </Text>
        </TextField>
        {unreadable && (
          <p role="alert" data-card-target-unreadable="">
            {t.format("debug.open.unreadable")}
          </p>
        )}
        <div>
          <Button ref={button} type="submit" className={styles.button} onPress={settled.press} data-action="open-card-submit">
            {t.format("debug.open.submit")}
          </Button>
        </div>
      </form>
    </main>
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
  return <OneCard loaded={loaded} language={language} back={back} cardLink={cardLink} card={card} title={t.format("debug.card.title")} />;
};

/** One card played as the gallery plays one, nothing recorded; `note` says where it came from. */
const OneCard = ({ loaded, language, back, cardLink, card, title, note }: CardsProps & { readonly card: Exercise; readonly title: string; readonly note?: string | undefined }): JSX.Element => {
  const { course, imageUrl } = loaded;
  const grader = useMemo(() => createGrader(course), [course]);
  const sound = playsUnasked(new URLSearchParams(window.location.search).get("sound") !== "off" && storedSound());
  return (
    <main className={styles.player} data-card-page={card.id}>
      <ScreenHeading>{title}</ScreenHeading>
      {note !== undefined && (
        <p className={styles.muted} data-card-note="">
          {note}
        </p>
      )}
      <LessonPlayer
        key={card.id}
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

const ID_ERRORS = {
  unreadable: "debug.cardid.error.unreadable",
  "unknown-kind": "debug.cardid.error.unknown-kind",
  excluded: "debug.cardid.error.excluded",
  "not-made": "debug.cardid.error.not-made",
} as const satisfies Readonly<Record<CardIdError, string>>;

/**
 * The card an id names (debug mode), made again as the course makes it (core `cardFromId`): its kind,
 * sentence or lexeme and asked word are the id's, the rest the same each time. It says so, and says why
 * where the course makes no such card.
 */
export const CardIdPage = ({ exercise, ...props }: CardsProps & { readonly exercise: string }): JSX.Element => {
  const t = useTranslator();
  const made = useMemo(() => cardFromId(props.loaded.course, exercise), [props.loaded.course, exercise]);
  if (!made.ok) {
    return (
      <main className={styles.page} data-card-id-error={made.error}>
        <ScreenHeading>{t.format("debug.cardid.title")}</ScreenHeading>
        <p>
          <code dir="ltr">{exercise}</code>
        </p>
        <p>{t.format(ID_ERRORS[made.error])}</p>
        <p>
          <a className={styles.back} href={`#/${OPEN_CARD}`}>
            {t.format("debug.open.title")}
          </a>
        </p>
      </main>
    );
  }
  return <OneCard {...props} card={made.value} title={t.format("debug.cardid.title")} note={t.format("debug.cardid.rebuilt")} />;
};
