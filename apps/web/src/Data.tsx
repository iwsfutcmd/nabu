/**
 * #/<course>/<orthography>/data (debug mode): everything the course says of its words, forms,
 * letters and sentences, to browse (courseData in @nabu/core/lesson; @nabu/ui/data). It reads the
 * bundle the lessons read. Nothing here is recorded.
 */
import { useTranslator } from "@nabu/ui";
import { DataBrowser } from "@nabu/ui/data";
import type { LoadedCourse } from "@nabu/ui/player";
import type { JSX } from "react";
import styles from "./App.module.css";
import { storedReading } from "./readings.ts";

export const DataPage = ({ loaded, back }: { readonly loaded: LoadedCourse; readonly back: string }): JSX.Element => {
  const t = useTranslator();
  const { course } = loaded;
  return (
    <main className={styles.page} data-data-page={course.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("corrections.page.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("data.title")}</h1>
      <DataBrowser course={course} reading={storedReading(course.orthography)} />
    </main>
  );
};
