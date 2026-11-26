/**
 * #/<course>/<orthography>/rules[/<request>] (debug mode): the rules explorer (@nabu/ui/data
 * RulesExplorer; @nabu/core/lesson rulesExplorer). It reads the lexicon's own files and the course's
 * profiles from lexicon-source/<course>.json beside the app (lexicon-source.ts), the dev server's
 * straight from lexicons/ and profiles/, so an edited rule shows once the files are read again. What
 * is explored is kept in the address (encodeExplore), so it can be linked to. A debug tool: the page is
 * its own chunk, and nothing a learner does realises or spells on the device. Nothing here is recorded.
 *
 * #/lexicon/<lang>/rules[/<request>] opens a lexicon no course uses (lexicons/arb, ADR 0158) the same
 * way: lexicon-source/<lang>.json carries its files and profiles, and core `lexiconCourse` makes a
 * course view of them with no units, so nothing of a course loads.
 */
import numberingSystems from "@nabu/i18n/generated/numbering-systems.json" with { type: "json" };
import {
  decodeExplore,
  encodeExplore,
  isLexiconSource,
  lexiconCourse,
  type CourseView,
  type ExploreRequest,
  type LexiconSource,
} from "@nabu/core/lesson";
import { CourseUiProvider, useTranslator } from "@nabu/ui";
import { RulesExplorer } from "@nabu/ui/data";
import type { LoadedCourse } from "@nabu/ui/player";
import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import styles from "./App.module.css";

export interface RulesPageProps {
  /** The course whose lexicon is explored; or, with `lexicon`, none. */
  readonly loaded?: LoadedCourse | undefined;
  /** A lexicon no course uses (arb): its files and profiles make the page's course view. */
  readonly lexicon?: string | undefined;
  readonly back: string;
  /** The request the address names, encoded, if any. */
  readonly encoded?: string | undefined;
  /** Where the app is served from: lexicon-source/ sits beside it. */
  readonly base: string;
  /** The address of a request explored (none: the page with nothing picked). */
  readonly at: (encoded: string | undefined) => string;
}

/** The support orthography a lexicon's page glosses in. */
const SUPPORT = "en-Latn/standard";

const RulesPage = ({
  loaded,
  lexicon,
  back,
  encoded,
  base,
  at,
}: RulesPageProps): JSX.Element => {
  const t = useTranslator();
  const [source, setSource] = useState<LexiconSource | null | undefined>(
    undefined,
  );
  const id = loaded?.course.id ?? lexicon ?? "";
  // A lexicon's course view, made from its source once read; a course's own, loaded.
  const course = useMemo((): CourseView | null | undefined => {
    if (loaded !== undefined) return loaded.course;
    if (source === undefined) return undefined;
    if (source === null || lexicon === undefined) return null;
    const made = lexiconCourse(source, {
      language: lexicon,
      support: SUPPORT,
      numberingSystems,
    });
    return made.ok ? made.value : null;
  }, [loaded, lexicon, source]);
  const [request, setRequest] = useState<ExploreRequest | undefined>(() =>
    encoded === undefined ? undefined : decodeExplore(encoded),
  );
  const read = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${base}lexicon-source/${id}.json`, {
        cache: "no-store",
      });
      const value = response.ok ? ((await response.json()) as unknown) : null;
      setSource(isLexiconSource(value) ? value : null);
    } catch {
      setSource(null);
    }
  }, [base, id]);
  useEffect(() => {
    void read();
  }, [read]);
  // The address follows what is explored, without a new history entry.
  const change = useCallback(
    (next: ExploreRequest | undefined): void => {
      setRequest(next);
      history.replaceState(
        history.state,
        "",
        at(next === undefined ? undefined : encodeExplore(next)),
      );
    },
    [at],
  );
  const page = (
    <main className={styles.page} data-rules-page={id}>
      <p>
        <a className={styles.back} href={back}>
          {t.format(
            loaded === undefined ? "app.lessons.back" : "corrections.page.back",
          )}
        </a>
      </p>
      <h1 className={styles.heading}>{t.format("rules.title")}</h1>
      {course === undefined ? (
        <p role="status">{t.format("player.loading")}</p>
      ) : course === null ? (
        <p role="alert">{t.format("rules.lexicon.unavailable")}</p>
      ) : (
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
      )}
    </main>
  );
  // A course's page is wrapped in its course's UI where the app renders it; a lexicon's, here.
  return loaded === undefined && course !== undefined && course !== null ? (
    <CourseUiProvider course={course}>{page}</CourseUiProvider>
  ) : (
    page
  );
};

export default RulesPage;
