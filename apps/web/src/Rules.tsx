/**
 * #/<course>/<orthography>/rules[/<request>] (debug mode): the rules explorer (@nabu/ui/data
 * RulesExplorer; @nabu/core/lesson rulesExplorer). It reads the lexicon's own files and the course's
 * profiles from lexicon-source/<course>.json beside the app (lexicon-source.ts), the dev server's
 * straight from lexicons/ and profiles/, so an edited rule shows once the files are read again. What
 * is explored is kept in the address (encodeExplore), so it can be linked to. A debug tool: the page is
 * its own chunk, and nothing a learner does realises or spells on the device. Nothing here is recorded.
 */
import { decodeExplore, encodeExplore, isLexiconSource, type ExploreRequest, type LexiconSource } from "@nabu/core/lesson";
import { useTranslator } from "@nabu/ui";
import { RulesExplorer } from "@nabu/ui/data";
import type { LoadedCourse } from "@nabu/ui/player";
import { useCallback, useEffect, useState, type JSX } from "react";
import styles from "./App.module.css";

export interface RulesPageProps {
  readonly loaded: LoadedCourse;
  readonly back: string;
  /** The request the address names, encoded, if any. */
  readonly encoded?: string | undefined;
  /** Where the app is served from: lexicon-source/ sits beside it. */
  readonly base: string;
  /** The address of a request explored (none: the page with nothing picked). */
  readonly at: (encoded: string | undefined) => string;
}

const RulesPage = ({ loaded, back, encoded, base, at }: RulesPageProps): JSX.Element => {
  const t = useTranslator();
  const { course } = loaded;
  const [source, setSource] = useState<LexiconSource | null | undefined>(undefined);
  const [request, setRequest] = useState<ExploreRequest | undefined>(() => (encoded === undefined ? undefined : decodeExplore(encoded)));
  const read = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${base}lexicon-source/${course.id}.json`, { cache: "no-store" });
      const value = response.ok ? ((await response.json()) as unknown) : null;
      setSource(isLexiconSource(value) ? value : null);
    } catch {
      setSource(null);
    }
  }, [base, course.id]);
  useEffect(() => {
    void read();
  }, [read]);
  // The address follows what is explored, without a new history entry.
  const change = useCallback(
    (next: ExploreRequest | undefined): void => {
      setRequest(next);
      history.replaceState(history.state, "", at(next === undefined ? undefined : encodeExplore(next)));
    },
    [at],
  );
  return (
    <main className={styles.page} data-rules-page={course.id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format("corrections.page.back")}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("rules.title")}</h1>
      <RulesExplorer
        course={course}
        source={source}
        request={request}
        onRequest={change}
        onReload={() => {
          setSource(undefined);
          void read();
        }}
      />
    </main>
  );
};

export default RulesPage;
