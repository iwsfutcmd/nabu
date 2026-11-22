/**
 * The Data page's browser (debug mode): a course's own data, to read (courseData in
 * @nabu/core/lesson). Four lists and one search field:
 *
 * - Words: each with its meaning, its entry (id, part of speech, features), and every way its
 *   sentences write it, each with what that token carries (its parts as the parts cards read them,
 *   ADR 0152; a form the word has of itself is marked) and its readings.
 * - Forms and patterns: each with its glossary entry and the words that carry it.
 * - Letters: what a script track teaches.
 * - Sentences: each with its translation, what it accepts, the parts it lists, and its words.
 * - Lexicon: every lexeme of the lexicon, free and bound alike, each opening to everything stored on
 *   it (lexiconData): its entry as the lexicon's file has it, its bundle lexeme, and what the course
 *   does with it. The lexicon's own files come from beside the app (`lexicon`); without them the
 *   view says so once and shows the other two parts. A lexeme's body is laid out only once opened.
 * - Language: the language file as stored (its defaults, labels, rules), by the same renderer.
 *
 * Search (dataMatcher) is by letters whatever the vowel marks, by reading, by meaning, or by id: an
 * id of a part finds the sentences that list it. Every text goes through <T> in its own language and
 * direction; ids and tags are code. The list follows a query only once an IME has committed it.
 * Nothing here is recorded.
 */
import {
  courseData,
  dataMatcher,
  lexemesInOrder,
  lexiconData,
  type CourseView,
  type DataView,
  type EntryId,
  type FormRow,
  type LetterRow,
  type LexemeRow,
  type LexiconData,
  type LexiconSource,
  type PinnedReading,
  type SentenceRow,
  type TokenParts,
  type WordRow,
} from "@nabu/core/lesson";
import { textOfSurface } from "@nabu/core/text";
import type { AliasTable, SchemeId, TaggedText } from "@nabu/schema";
import { useCallback, useEffect, useId, useMemo, useState, type JSX, type ReactNode } from "react";
import { Button, Disclosure, DisclosurePanel, Input, Label, Radio, RadioGroup, SearchField } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { ExpandIcon } from "../icons.tsx";
import { PartsList } from "../player/Parts.tsx";
import { defaultRuby, schemeName } from "../player/Readings.tsx";
import { T } from "../T.tsx";
import list from "../words/Words.module.css";
import styles from "./Data.module.css";
import { DataTree } from "./DataTree.tsx";

export interface DataBrowserProps {
  readonly course: CourseView;
  /** The reading layer the learner chose for the orthography (ADR 0071), if any: shown as ruby. */
  readonly reading?: SchemeId | false | undefined;
  /** The list it opens on: the words, unless said. */
  readonly view?: DataView | undefined;
  /** What it opens searched for: nothing, unless said. */
  readonly query?: string | undefined;
  /** The lexeme whose entry opens open (the Lexicon view): a link to it. */
  readonly opened?: string | undefined;
  /** Told the view and the lexeme opened last, as they change: the page keeps them in its address. */
  readonly onNavigate?: ((view: DataView, opened: string | undefined) => void) | undefined;
  /**
   * The lexicon's own files (lexicons/<lang>/lexemes.yaml, language.yaml), or how to fetch them:
   * asked for only once the Lexicon or Language view is shown. null: they are not beside the app.
   */
  readonly lexicon?: LexiconSource | null | (() => Promise<LexiconSource | null>) | undefined;
  /** The bundle's alias table, where it is at hand: the old ids that became each lexeme. */
  readonly aliases?: AliasTable | undefined;
  /** A bundle path's URL: a lexeme's picture. */
  readonly url?: ((path: string) => string) | undefined;
}

/** Rows shown at first, and added by each "Show more": a course has a thousand sentences. */
const PAGE = 40;

const VIEW_MESSAGES = {
  words: "data.view.words",
  forms: "data.view.forms",
  letters: "data.view.letters",
  sentences: "data.view.sentences",
  lexicon: "data.view.lexicon",
  language: "data.view.language",
} as const;

type Translator = ReturnType<typeof useTranslator>;

/**
 * An id, as code. One that names its lexeme by the word itself (lexeme:係) is text in the course's script,
 * set in that script's face: the interface's has no letters for it.
 */
const Id = ({ id, ...marks }: { id: EntryId; "data-entry-id"?: string; "data-listed-part"?: string }): JSX.Element => (
  <code className={styles.code} {...marks}>
    {id.text === undefined ? id.id : <T text={id.text} />}
  </code>
);

/** An entry as the course keeps it: its id, then its tags (a part of speech, features, a status), as code. */
const Entry = ({ id, tags, children }: { id: EntryId; tags: readonly string[]; children?: ReactNode }): JSX.Element => (
  <p className={styles.meta}>
    <Id id={id} data-entry-id="" />
    {tags.map((tag) => (
      <code key={tag} className={styles.code}>
        {tag}
      </code>
    ))}
    {children}
  </p>
);

const SentenceCount = ({ t, count }: { t: Translator; count: number }): JSX.Element => <span className={list.muted}>{t.format("data.sentences.count", { count })}</span>;

/** Every reading a token pins, each named by its scheme: the ruby shows one layer at most. */
const ReadingsOf = ({ t, readings }: { t: Translator; readings: readonly PinnedReading[] }): JSX.Element | null =>
  readings.length === 0 ? null : (
    <span className={styles.readings} data-readings="">
      {readings.map((r) => (
        <span key={r.scheme} className={styles.reading}>
          <span className={list.muted}>{schemeName(t, r.scheme)}</span>
          <T text={r.text} />
        </span>
      ))}
    </span>
  );

/** One token as the course writes it, with what it carries. */
const Carried = ({
  t,
  text,
  readings,
  carries,
  ruby,
  children,
}: {
  t: Translator;
  text: TaggedText;
  readings: readonly PinnedReading[];
  carries: TokenParts | undefined;
  ruby: SchemeId | false;
  children?: ReactNode;
}): JSX.Element => (
  <div className={styles.way}>
    <T className={styles.token} text={text} ruby={ruby} />
    {carries !== undefined && (
      <PartsList parts={carries.parts} lang={text.lang} label={t.format("player.parts.label")} ruby={false} marks="show" ofItself={carries.ofItself} note={t.format("data.part.of-itself")} />
    )}
    <ReadingsOf t={t} readings={readings} />
    {carries?.asked === true && (
      <span className={styles.badge} data-parts-asked="">
        {t.format("data.word.asked")}
      </span>
    )}
    {children}
  </div>
);

const Word = ({ t, row, ruby }: { t: Translator; row: WordRow; ruby: SchemeId | false }): JSX.Element => {
  const [lemma, ...variants] = row.forms;
  return (
    <li className={styles.row} data-data-row={row.id.id}>
      <div className={styles.head} data-ink-container={`data:${row.id.id}`}>
        {lemma !== undefined && <T className={styles.form} text={lemma} ruby={ruby} />}
        {variants.map((v, i) => (
          <T key={i} className={styles.variant} text={v} ruby={ruby} />
        ))}
        {row.gloss !== undefined && <T className={list.gloss} text={row.gloss} />}
      </div>
      <Entry id={row.id} tags={row.tags}>
        <SentenceCount t={t} count={row.sentences} />
      </Entry>
      {row.written.length === 0 ? (
        <p className={list.muted}>{t.format("data.word.unwritten")}</p>
      ) : (
        <ul className={styles.ways} aria-label={t.format("data.word.written")}>
          {row.written.map((w, i) => (
            <li key={i} data-written="">
              <Carried t={t} text={w.text} readings={w.readings} carries={w.carries} ruby={ruby}>
                <SentenceCount t={t} count={w.sentences.length} />
                <code className={styles.code}>{w.sentences[0]}</code>
              </Carried>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

/** Carriers listed before "and n more". */
const CARRIERS = 12;

const Form = ({ t, row, ruby }: { t: Translator; row: FormRow; ruby: SchemeId | false }): JSX.Element => (
  <li className={styles.row} data-data-row={row.id.id}>
    {row.gloss !== undefined && (
      <div className={styles.head} data-ink-container={`data:${row.id.id}`}>
        <T className={styles.entry} text={row.gloss} />
      </div>
    )}
    <Entry id={row.id} tags={row.tags}>
      <SentenceCount t={t} count={row.sentences} />
    </Entry>
    {row.carriers.length === 0 ? (
      <p className={list.muted}>{t.format("data.form.uncarried")}</p>
    ) : (
      <ul className={styles.carriers} aria-label={t.format("data.form.carried")}>
        {row.carriers.slice(0, CARRIERS).map((c, i) => (
          <li key={i} className={styles.carrier} data-carrier={c.word} data-of-itself={c.ofItself || undefined}>
            <T text={c.text} ruby={ruby} />
            {c.ofItself && <span className={styles.note}>{t.format("data.part.of-itself")}</span>}
          </li>
        ))}
        {row.carriers.length > CARRIERS && <li className={list.muted}>{t.format("data.more.carriers", { count: row.carriers.length - CARRIERS })}</li>}
      </ul>
    )}
  </li>
);

const Letter = ({ row }: { row: LetterRow }): JSX.Element => (
  <li className={styles.row} data-data-row={row.id.id}>
    <div className={styles.head} data-ink-container={`data:${row.id.id}`}>
      {row.forms.map((f, i) => (
        <T key={i} className={i === 0 ? styles.form : styles.variant} text={f} />
      ))}
      {row.gloss !== undefined && <T className={list.gloss} text={row.gloss} />}
    </div>
    <Entry id={row.id} tags={row.tags} />
  </li>
);

const Sentence = ({ t, course, row, ruby }: { t: Translator; course: CourseView; row: SentenceRow; ruby: SchemeId | false }): JSX.Element => {
  const { sentence } = row;
  const reverse = sentence.forms[course.orthography]?.reverse;
  const accept = sentence.translations[course.supportKey]?.accept;
  return (
    <li className={styles.row} data-data-row={sentence.id}>
      <div className={styles.ink} data-ink-container={`data:${sentence.id}`}>
        <T as="p" className={styles.sentence} text={row.text} ruby={ruby} />
      </div>
      {row.translation !== undefined && <T as="p" className={list.gloss} text={row.translation} />}
      <Entry id={{ id: sentence.id }} tags={row.tags}>
        {row.listed.map((part) => (
          <Id key={part.id} id={part} data-listed-part="" />
        ))}
      </Entry>
      {(reverse !== undefined || (accept !== undefined && row.translation !== undefined)) && (
        <div className={styles.accepts} role="group" aria-label={t.format("data.sentence.accepts")}>
          <span className={list.muted}>{t.format("data.sentence.accepts")}</span>
          {reverse !== undefined && <T as="p" className={styles.accept} text={textOfSurface(row.text, reverse)} />}
          {accept !== undefined && row.translation !== undefined && <T as="p" className={styles.accept} text={textOfSurface(row.translation, accept)} />}
        </div>
      )}
      <ul className={styles.ways} aria-label={t.format("data.sentence.words")}>
        {row.words.map((w) => (
          <li key={w.at} data-sentence-word="">
            <Carried t={t} text={w.text} readings={w.readings} carries={w.carries} ruby={ruby} />
          </li>
        ))}
      </ul>
    </li>
  );
};

/** One of a lexeme's three parts: a title, then its record. */
const Part = ({ part, title, children }: { part: string; title: string; children: ReactNode }): JSX.Element => (
  <section className={styles.part} data-lexicon-part={part}>
    <h3 className={styles.partTitle}>{title}</h3>
    {children}
  </section>
);

/** A lexeme's body: laid out only once its entry is opened. */
const LexemeBody = ({ t, row, data, ruby, url }: { t: Translator; row: LexemeRow; data: LexiconData; ruby: SchemeId | false; url: ((path: string) => string) | undefined }): JSX.Element => (
  <div className={styles.lexicon}>
    {data.source && (
      <Part part="source" title={t.format("data.lexicon.source")}>
        {row.source === undefined ? <p className={list.muted}>{t.format("data.lexicon.not-in-file")}</p> : <DataTree node={row.source} />}
      </Part>
    )}
    <Part part="bundle" title={t.format("data.lexicon.bundle")}>
      {row.bundle === undefined ? <p className={list.muted}>{t.format("data.lexicon.not-in-bundle")}</p> : <DataTree node={row.bundle} />}
      {row.image !== undefined && url !== undefined && <img className={styles.picture} src={url(row.image)} alt="" data-lexeme-image="" />}
    </Part>
    <Part part="course" title={t.format("data.lexicon.course")}>
      <DataTree node={row.course} />
      {row.written.length > 0 && (
        <ul className={styles.ways} aria-label={t.format("data.word.written")}>
          {row.written.map((w, i) => (
            <li key={i} data-written="">
              <Carried t={t} text={w.text} readings={w.readings} carries={w.carries} ruby={ruby}>
                <SentenceCount t={t} count={w.sentences.length} />
                <code className={styles.code}>{w.sentences[0]}</code>
              </Carried>
            </li>
          ))}
        </ul>
      )}
      {row.carriers.length > 0 && (
        <ul className={styles.carriers} aria-label={t.format("data.form.carried")}>
          {row.carriers.slice(0, CARRIERS).map((c, i) => (
            <li key={i} className={styles.carrier} data-carrier={c.word}>
              <T text={c.text} ruby={ruby} />
            </li>
          ))}
          {row.carriers.length > CARRIERS && <li className={list.muted}>{t.format("data.more.carriers", { count: row.carriers.length - CARRIERS })}</li>}
        </ul>
      )}
    </Part>
  </div>
);

const Lexeme = ({
  t,
  row,
  data,
  ruby,
  url,
  open,
  onOpen,
}: {
  t: Translator;
  row: LexemeRow;
  data: LexiconData;
  ruby: SchemeId | false;
  url: ((path: string) => string) | undefined;
  open: boolean;
  onOpen: (id: string, open: boolean) => void;
}): JSX.Element => (
  <li className={styles.row} data-data-row={row.id.id} data-bound={row.bound || undefined}>
    {(row.form !== undefined || row.gloss !== undefined) && (
      <div className={styles.head} data-ink-container={`data:${row.id.id}`}>
        {row.form !== undefined && <T className={styles.form} text={row.form} ruby={ruby} />}
        {row.gloss !== undefined && <T className={list.gloss} text={row.gloss} />}
      </div>
    )}
    <Entry id={row.id} tags={row.tags} />
    <Disclosure isExpanded={open} onExpandedChange={(isOpen) => onOpen(row.id.id, isOpen)} data-lexeme={row.id.id}>
      {({ isExpanded }) => (
        <>
          <Button slot="trigger" className={list.partsToggle} data-action="lexeme-open">
            <span>{t.format("data.lexicon.open")}</span>
            <ExpandIcon size={16} open={isExpanded} />
          </Button>
          <DisclosurePanel>{isExpanded && <LexemeBody t={t} row={row} data={data} ruby={ruby} url={url} />}</DisclosurePanel>
        </>
      )}
    </Disclosure>
  </li>
);

const titleOf = (course: CourseView, unit: number): TaggedText | undefined => course.units[unit]?.title?.[course.supportKey];

/** The lexicon's own files: given, fetched once the Lexicon or Language view is shown, or not beside the app (null). */
const useLexiconSource = (given: DataBrowserProps["lexicon"], wanted: boolean): LexiconSource | null | undefined => {
  const [fetched, setFetched] = useState<LexiconSource | null | undefined>(undefined);
  const load = typeof given === "function" ? given : undefined;
  useEffect(() => {
    if (load === undefined || !wanted || fetched !== undefined) return;
    let live = true;
    load().then(
      (source) => {
        if (live) setFetched(source);
      },
      () => {
        if (live) setFetched(null);
      },
    );
    return () => {
      live = false;
    };
  }, [load, wanted, fetched]);
  return typeof given === "function" ? fetched : given;
};

export const DataBrowser = ({ course, reading, view: opensOn, query: opensWith = "", opened: opensOpen, onNavigate, lexicon: lexiconFiles, aliases, url }: DataBrowserProps): JSX.Element => {
  const t = useTranslator();
  const listId = useId();
  const data = useMemo(() => courseData(course), [course]);
  const [view, setView] = useState<DataView>(opensOn ?? (opensOpen === undefined ? "words" : "lexicon"));
  const wantsLexicon = view === "lexicon" || view === "language";
  const source = useLexiconSource(lexiconFiles, wantsLexicon);
  // Laid out when it is first looked at, and again when the lexicon's files arrive.
  const lexicon = useMemo(() => (wantsLexicon ? lexiconData(course, source ?? undefined, aliases) : undefined), [wantsLexicon, course, source, aliases]);
  const counts: Readonly<Record<DataView, number>> = {
    words: data.words.length,
    forms: data.forms.length,
    letters: data.letters.length,
    sentences: data.sentences.length,
    lexicon: course.lexicon.lexemes.length,
    language: 0,
  };
  const views = (["words", "forms", "letters", "sentences", "lexicon", "language"] as const).filter((v) => v === "language" || counts[v] > 0);
  const [typed, setTyped] = useState(opensWith);
  const [query, setQuery] = useState(opensWith);
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(opensOpen === undefined ? [] : [opensOpen]));
  // A lexeme linked to is on the page the list opens on.
  const [pages, setPages] = useState(() => {
    const at = opensOpen === undefined ? -1 : lexemesInOrder(course).findIndex((l) => l.id === opensOpen);
    return at < 0 ? 1 : Math.floor(at / PAGE) + 1;
  });
  const ruby = useMemo(() => defaultRuby(course.profiles.get(course.orthography)?.source, reading), [course, reading]);
  const matcher = useMemo(() => dataMatcher(course, query), [course, query]);
  const toggle = useCallback(
    (id: string, isOpen: boolean): void => {
      setOpen((was) => {
        const next = new Set(was);
        if (isOpen) next.add(id);
        else next.delete(id);
        return next;
      });
      onNavigate?.("lexicon", isOpen ? id : undefined);
    },
    [onNavigate],
  );
  const shown = useMemo((): readonly { readonly unit: number; readonly key: string; readonly node: JSX.Element }[] => {
    if (view === "words") return data.words.filter(matcher.words).map((row) => ({ unit: row.unit, key: row.id.id, node: <Word key={row.id.id} t={t} row={row} ruby={ruby} /> }));
    if (view === "forms") return data.forms.filter(matcher.forms).map((row) => ({ unit: row.unit, key: row.id.id, node: <Form key={row.id.id} t={t} row={row} ruby={ruby} /> }));
    if (view === "letters") return data.letters.filter(matcher.letters).map((row) => ({ unit: row.unit, key: row.id.id, node: <Letter key={row.id.id} row={row} /> }));
    if (view === "lexicon") {
      return (lexicon?.lexemes ?? []).filter(matcher.lexicon).map((row) => ({
        unit: row.unit,
        key: row.id.id,
        node: <Lexeme key={row.id.id} t={t} row={row} data={lexicon as LexiconData} ruby={ruby} url={url} open={open.has(row.id.id)} onOpen={toggle} />,
      }));
    }
    if (view === "language") return [];
    return data.sentences.filter(matcher.sentences).map((row) => ({ unit: row.unit, key: row.sentence.id, node: <Sentence key={row.sentence.id} t={t} course={course} row={row} ruby={ruby} /> }));
  }, [view, data, matcher, t, ruby, course, lexicon, open, url, toggle]);
  const page = shown.slice(0, pages * PAGE);
  // Rows stay under their units, in course order.
  const groups = useMemo(() => {
    const out: { unit: number; rows: (typeof page)[number][] }[] = [];
    for (const row of page) {
      const last = out.at(-1);
      if (last?.unit === row.unit) last.rows.push(row);
      else out.push({ unit: row.unit, rows: [row] });
    }
    return out;
  }, [page]);
  const search = (value: string): void => {
    setQuery(value);
    setPages(1);
  };
  return (
    <div className={list.list} data-data-browser={course.id}>
      <p className={list.muted}>{t.format("data.intro")}</p>
      <div className={list.controls}>
        <SearchField
          className={list.search}
          value={typed}
          onChange={(v) => {
            setTyped(v);
            if (!composing) search(v);
          }}
          onClear={() => search("")}
        >
          <Label className={list.label}>{t.format("data.search")}</Label>
          <Input
            className={list.input}
            dir="auto"
            spellCheck={false}
            autoCapitalize="none"
            aria-controls={listId}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(e) => {
              setComposing(false);
              search(e.currentTarget.value);
            }}
            data-field="data-search"
          />
        </SearchField>
        <RadioGroup
          className={list.orders}
          value={view}
          onChange={(v) => {
            setView(v as DataView);
            setPages(1);
            onNavigate?.(v as DataView, undefined);
          }}
          orientation="horizontal"
          data-data-view={view}
        >
          <Label className={list.label}>{t.format("data.view.label")}</Label>
          <div className={list.radios}>
            {views.map((v) => (
              <Radio key={v} className={list.radio} value={v} data-view={v}>
                {t.format(VIEW_MESSAGES[v], { count: counts[v] })}
              </Radio>
            ))}
          </div>
        </RadioGroup>
      </div>
      {wantsLexicon && (source === null || lexiconFiles === undefined) && (
        <p className={styles.notice} role="note" data-lexicon-missing="">
          {t.format("data.lexicon.missing")}
        </p>
      )}
      {view === "lexicon" && lexicon?.file !== undefined && (
        <section className={styles.part} data-lexicon-file="">
          <h2 className={styles.partTitle}>{t.format("data.lexicon.file")}</h2>
          <DataTree node={lexicon.file} />
        </section>
      )}
      {view === "language" && lexicon !== undefined && (
        <section className={`${styles.part} ${styles.row}`} data-language-file={lexicon.source ? "source" : "bundle"} data-ink-container="data:language">
          <h2 className={styles.partTitle}>{t.format(lexicon.source ? "data.language.file" : "data.language.bundle")}</h2>
          <DataTree node={lexicon.language} />
        </section>
      )}
      {view !== "language" && (
        <p className={list.count} role="status" data-data-found={shown.length}>
          {t.format("data.found", { count: shown.length, total: counts[view] })}
        </p>
      )}
      <div id={listId}>
        {groups.map((g) => {
          const title = titleOf(course, g.unit);
          return (
            <section key={g.unit} aria-labelledby={`${listId}-${String(g.unit)}`} data-data-unit={g.unit}>
              <h2 className={list.unit} id={`${listId}-${String(g.unit)}`}>
                {title !== undefined ? <T text={title} /> : view === "lexicon" && g.unit >= course.units.length ? t.format("data.lexicon.unintroduced") : t.format("corrections.page.unit", { number: g.unit + 1 })}
                <code className={styles.code}>{course.units[g.unit]?.id}</code>
              </h2>
              <ul className={styles.rows}>{g.rows.map((row) => row.node)}</ul>
            </section>
          );
        })}
      </div>
      {shown.length > page.length && (
        <Button className={styles.more} onPress={() => setPages((n) => n + 1)} data-action="data-more">
          {t.format("data.more", { count: shown.length - page.length })}
        </Button>
      )}
    </div>
  );
};
