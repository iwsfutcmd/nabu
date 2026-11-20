/**
 * The Data page's browser (debug mode): a course's own data, to read (courseData in
 * @nabu/core/lesson). Four lists and one search field:
 *
 * - Words: each with its meaning, its entry (id, part of speech, features), and every way its
 *   sentences write it, each with what that token carries (its parts as the parts cards read them,
 *   ADR 0152; a form the word has of itself is marked) and its readings.
 * - Forms and patterns: each with its glossary entry and the words that carry it.
 * - Letters: what a script track teaches.
 * - Sentences: each with its translation, what it accepts, the KCs it lists, and its words.
 *
 * Search (dataMatcher) is by letters whatever the vowel marks, by reading, by meaning, or by id: an
 * id of a KC finds the sentences that list it. Every text goes through <T> in its own language and
 * direction; ids and tags are code. The list follows a query only once an IME has committed it.
 * Nothing here is recorded.
 */
import { courseData, dataMatcher, type CourseView, type DataView, type EntryId, type FormRow, type LetterRow, type PinnedReading, type SentenceRow, type TokenParts, type WordRow } from "@nabu/core/lesson";
import { textOfSurface } from "@nabu/core/text";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { useId, useMemo, useState, type JSX, type ReactNode } from "react";
import { Button, Input, Label, Radio, RadioGroup, SearchField } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { PartsList } from "../player/Parts.tsx";
import { defaultRuby, schemeName } from "../player/Readings.tsx";
import { T } from "../T.tsx";
import list from "../words/Words.module.css";
import styles from "./Data.module.css";

export interface DataBrowserProps {
  readonly course: CourseView;
  /** The reading layer the learner chose for the orthography (ADR 0071), if any: shown as ruby. */
  readonly reading?: SchemeId | false | undefined;
  /** The list it opens on: the words, unless said. */
  readonly view?: DataView | undefined;
  /** What it opens searched for: nothing, unless said. */
  readonly query?: string | undefined;
}

/** Rows shown at first, and added by each "Show more": a course has a thousand sentences. */
const PAGE = 40;

const VIEW_MESSAGES = { words: "data.view.words", forms: "data.view.forms", letters: "data.view.letters", sentences: "data.view.sentences" } as const;

type Translator = ReturnType<typeof useTranslator>;

/**
 * An id, as code. One that names its KC by the word itself (sense:係) is text in the course's script,
 * set in that script's face: the interface's has no letters for it.
 */
const Id = ({ id, ...marks }: { id: EntryId; "data-entry-id"?: string; "data-listed-kc"?: string }): JSX.Element => (
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
    <li className={styles.row} data-data-row={row.kc.id}>
      <div className={styles.head} data-ink-container={`data:${row.kc.id}`}>
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
  <li className={styles.row} data-data-row={row.kc.id}>
    {row.gloss !== undefined && (
      <div className={styles.head} data-ink-container={`data:${row.kc.id}`}>
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
  <li className={styles.row} data-data-row={row.kc.id}>
    <div className={styles.head} data-ink-container={`data:${row.kc.id}`}>
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
        {row.listed.map((kc) => (
          <Id key={kc.id} id={kc} data-listed-kc="" />
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

const titleOf = (course: CourseView, unit: number): TaggedText | undefined => course.units[unit]?.title?.[course.supportKey];

export const DataBrowser = ({ course, reading, view: opensOn, query: opensWith = "" }: DataBrowserProps): JSX.Element => {
  const t = useTranslator();
  const listId = useId();
  const data = useMemo(() => courseData(course), [course]);
  const views = useMemo(() => (["words", "forms", "letters", "sentences"] as const).filter((v) => data[v].length > 0), [data]);
  const [view, setView] = useState<DataView>(opensOn ?? "words");
  const [typed, setTyped] = useState(opensWith);
  const [query, setQuery] = useState(opensWith);
  const [composing, setComposing] = useState(false);
  const [pages, setPages] = useState(1);
  const ruby = useMemo(() => defaultRuby(course.profiles.get(course.orthography)?.source, reading), [course, reading]);
  const matcher = useMemo(() => dataMatcher(course, query), [course, query]);
  const shown = useMemo((): readonly { readonly unit: number; readonly key: string; readonly node: JSX.Element }[] => {
    if (view === "words") return data.words.filter(matcher.words).map((row) => ({ unit: row.unit, key: row.kc.id, node: <Word key={row.kc.id} t={t} row={row} ruby={ruby} /> }));
    if (view === "forms") return data.forms.filter(matcher.forms).map((row) => ({ unit: row.unit, key: row.kc.id, node: <Form key={row.kc.id} t={t} row={row} ruby={ruby} /> }));
    if (view === "letters") return data.letters.filter(matcher.letters).map((row) => ({ unit: row.unit, key: row.kc.id, node: <Letter key={row.kc.id} row={row} /> }));
    return data.sentences.filter(matcher.sentences).map((row) => ({ unit: row.unit, key: row.sentence.id, node: <Sentence key={row.sentence.id} t={t} course={course} row={row} ruby={ruby} /> }));
  }, [view, data, matcher, t, ruby, course]);
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
          }}
          orientation="horizontal"
          data-data-view={view}
        >
          <Label className={list.label}>{t.format("data.view.label")}</Label>
          <div className={list.radios}>
            {views.map((v) => (
              <Radio key={v} className={list.radio} value={v} data-view={v}>
                {t.format(VIEW_MESSAGES[v], { count: data[v].length })}
              </Radio>
            ))}
          </div>
        </RadioGroup>
      </div>
      <p className={list.count} role="status" data-data-found={shown.length}>
        {t.format("data.found", { count: shown.length, total: data[view].length })}
      </p>
      <div id={listId}>
        {groups.map((g) => {
          const title = titleOf(course, g.unit);
          return (
            <section key={g.unit} aria-labelledby={`${listId}-${String(g.unit)}`} data-data-unit={g.unit}>
              <h2 className={list.unit} id={`${listId}-${String(g.unit)}`}>
                {title === undefined ? t.format("corrections.page.unit", { number: g.unit + 1 }) : <T text={title} />}
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
