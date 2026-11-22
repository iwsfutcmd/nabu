/**
 * #/<course>/<orthography>/data[/<view>[/<lexeme>]] (debug mode): everything the course says of its
 * words, forms, letters and sentences, and every lexeme of its lexicon with everything stored on it,
 * to browse (courseData and lexiconData in @nabu/core/lesson; @nabu/ui/data). It reads the bundle the
 * lessons read; the Lexicon and Language views also read the lexicon's own files from
 * lexicon-source/<course>.json beside the app (lexicon-source.ts), fetched only once one is shown,
 * and say so where they are not there. The view and the lexeme open are kept in the address, so a
 * lexeme can be linked to. Nothing here is recorded.
 */
import { isLexiconSource, type DataView, type LexiconSource } from "@nabu/core/lesson";
import type { AliasTable } from "@nabu/schema";
import { useTranslator } from "@nabu/ui";
import { DataBrowser } from "@nabu/ui/data";
import type { LoadedCourse } from "@nabu/ui/player";
import { useCallback, useEffect, useState, type JSX } from "react";
import styles from "./App.module.css";
import { storedReading } from "./readings.ts";
import type { AliasesOf } from "./upgrade-log.ts";

const VIEWS: ReadonlySet<string> = new Set<DataView>(["words", "forms", "letters", "sentences", "lexicon", "language"]);

export interface DataPageProps {
  readonly loaded: LoadedCourse;
  readonly back: string;
  /** The view and the lexeme the address names, if any. */
  readonly view?: string | undefined;
  readonly entry?: string | undefined;
  /** Where the app is served from: lexicon-source/ sits beside it. */
  readonly base: string;
  /** The bundle's alias table: the old ids each lexeme was. Fetched again only when it or the course changes. */
  readonly aliases: AliasesOf;
  /** The address of a view and a lexeme open in it. */
  readonly at: (view: DataView, entry: string | undefined) => string;
}

export const DataPage = ({ loaded, back, view, entry, base, aliases: aliasesOf, at }: DataPageProps): JSX.Element => {
  const t = useTranslator();
  const { course } = loaded;
  const [aliases, setAliases] = useState<AliasTable | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void aliasesOf(course.id).then((table) => {
      if (live) setAliases(table);
    });
    return () => {
      live = false;
    };
  }, [aliasesOf, course.id]);
  const lexicon = useCallback(
    async (): Promise<LexiconSource | null> => {
      const response = await fetch(`${base}lexicon-source/${course.id}.json`);
      if (!response.ok) return null;
      const source = (await response.json()) as unknown;
      return isLexiconSource(source) ? source : null;
    },
    [base, course.id],
  );
  // The address follows the view and the lexeme open, without a new history entry.
  const navigate = useCallback((v: DataView, opened: string | undefined): void => history.replaceState(history.state, "", at(v, opened)), [at]);
  return (
    <main className={styles.page} data-data-page={course.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("corrections.page.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("data.title")}</h1>
      <DataBrowser
        course={course}
        reading={storedReading(course.orthography)}
        view={view !== undefined && VIEWS.has(view) ? (view as DataView) : undefined}
        opened={view === "lexicon" ? entry : undefined}
        onNavigate={navigate}
        lexicon={lexicon}
        aliases={aliases}
        url={loaded.imageUrl}
      />
    </main>
  );
};
