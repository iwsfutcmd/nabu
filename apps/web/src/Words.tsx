/**
 * #/<course>/<orthography>/words: the words this learner has learned in the course, to browse
 * (learnedWords from the device's own log; @nabu/ui/words). Nothing here is recorded.
 */
import { learnedWords, type LearnerState } from "@nabu/core/learner";
import { useTranslator } from "@nabu/ui";
import type { LoadedCourse } from "@nabu/ui/player";
import { WordList } from "@nabu/ui/words";
import { useMemo, type JSX } from "react";
import styles from "./App.module.css";

export const WordsPage = ({ loaded, state, back }: { readonly loaded: LoadedCourse; readonly state: LearnerState; readonly back: string }): JSX.Element => {
  const t = useTranslator();
  const { course } = loaded;
  // How well each word is remembered is as of opening the page.
  const now = useMemo(() => new Date().toISOString(), []);
  const words = useMemo(() => learnedWords(course, state, now), [course, state, now]);
  return (
    <main className={styles.page} data-words-page={course.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("corrections.page.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("words.title")}</h1>
      <WordList course={course} words={words} url={loaded.imageUrl} />
    </main>
  );
};
