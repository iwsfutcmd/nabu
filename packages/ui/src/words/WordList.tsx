/**
 * The word list: the words a learner has met in a course, to browse (learnedWords in
 * @nabu/core/learner). Each word in the orthography being learned, with its readings where the
 * profile has them, its meaning in the support language, its clip, how well it is remembered, and
 * whether it is known or still being learned, with the skills it has yet to show (ADR 0100).
 *
 * - Show: every word, the known ones, or the ones being learned, each with its count.
 * - Order: as in the course (by unit, each unit with how many of its words are known),
 *   alphabetical by the language's own collation, or weakest first.
 * - Search: by letters, whatever the vowel marks, by reading (Jyutping, pinyin…), or by meaning
 *   (wordMatcher). The field takes the direction of what is typed, and the list follows a query
 *   only once an IME has committed it: nothing filters on a half-composed syllable.
 * - A word's parts (ADR 0146, 0148; core `partsOf`): its entry opens to each thing asked of it, the
 *   skills, its own form, its spelling and its reading where they are parts, each shown or not
 *   yet, with how many are shown. Closed, the entry is as before but for the button that opens it.
 * - Rules and forms (core `ruleEntries`): after the words, each rule and form the learner has met
 *   by its label, with how many of the skills asked of it are shown; found by the same search.
 */
import { orderWords, ruleMatcher, wordCounts, wordMatcher, type AskedSkill, type LearnedWord, type PartStatus, type RuleEntry, type WordOrder, type WordPart } from "@nabu/core/learner";
import { ownFeatureLabel, type CourseView } from "@nabu/core/lesson";
import { orthographyName } from "@nabu/i18n";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { useId, useMemo, useState, type JSX } from "react";
import { Button, Disclosure, DisclosurePanel, Input, Label, Radio, RadioGroup, SearchField } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { ExpandIcon } from "../icons.tsx";
import { AudioButtons, useClipPlayer } from "../player/Audio.tsx";
import { defaultRuby, schemeName } from "../player/Readings.tsx";
import { T } from "../T.tsx";
import { WithSlots } from "../WithWords.tsx";
import styles from "./Words.module.css";

export interface WordListProps {
  readonly course: CourseView;
  readonly words: readonly LearnedWord[];
  /** A bundle path (a clip) as a URL. */
  readonly url: (path: string) => string;
  /** The reading layer the learner chose for the orthography (ADR 0071), if any: shown as ruby as the player shows it. */
  readonly reading?: SchemeId | false | undefined;
  /**
   * What is asked of each word, each shown or not (core `partsOf`): a word's entry opens to them.
   * Without it, or for a word with none, the entry does not open.
   */
  readonly parts?: ((lexeme: string) => readonly WordPart[]) | undefined;
  /** The rules and forms the learner has met (core `ruleEntries`), listed after the words. */
  readonly rules?: readonly RuleEntry[] | undefined;
  /** For Storybook and tests: these words' entries start open. */
  readonly opened?: readonly string[] | undefined;
}

/** How remembered a word is, in three words: due for review, strong, or fading. */
export const strengthBand = (word: LearnedWord): "due" | "strong" | "fading" => (word.due ? "due" : word.strength >= 0.85 ? "strong" : "fading");

const BAND_MESSAGES = { due: "words.strength.due", strong: "words.strength.strong", fading: "words.strength.fading" } as const;

const ORDERS: readonly WordOrder[] = ["course", "alphabetical", "weakest"];

type WordFilter = "all" | "known" | "learning";
const FILTERS: readonly WordFilter[] = ["all", "known", "learning"];
const FILTER_MESSAGES = { all: "words.filter.all", known: "words.filter.known", learning: "words.filter.learning" } as const;

/** The skills a word (a lexeme) is known by; a feature value's (read-off, choose) are no word's. */
type WordSkillName = "recognize" | "produce" | "listen";

const SKILL_MESSAGES: Readonly<Record<WordSkillName, "words.skill.recognize" | "words.skill.produce" | "words.skill.listen">> = {
  recognize: "words.skill.recognize",
  produce: "words.skill.produce",
  listen: "words.skill.listen",
};

const isWordSkill = (skill: AskedSkill): skill is WordSkillName => skill in SKILL_MESSAGES;

const STATUS_MESSAGES: Readonly<Record<PartStatus, "words.part.status.shown" | "words.part.status.not-shown" | "words.part.status.not-asked">> = {
  shown: "words.part.status.shown",
  "not-shown": "words.part.status.not-shown",
  "not-asked": "words.part.status.not-asked",
};

/** The parts a word's entry lists: a lexeme is asked no feature value's skills (read-off, choose). */
const listedParts = (parts: readonly WordPart[]): readonly WordPart[] => parts.filter((p) => p.kind !== "skill" || isWordSkill(p.skill));

/** A part's key, unique within its word. */
const partKey = (part: WordPart): string =>
  part.kind === "skill" ? `skill:${part.skill}` : part.kind === "feature" ? part.part : part.kind === "spelling" ? `spelling:${part.orthography}` : `reading:${part.orthography}:${part.scheme}`;

/** An id, where the course names nothing: in the interface's own face, left to right. */
const Code = ({ children }: { readonly children: string }): JSX.Element => (
  <code className={styles.code} dir="ltr">
    {children}
  </code>
);

/** What a part is called: a skill's name, its own form by the language's label, the orthography or the scheme it is in. */
const PartName = ({ course, part }: { readonly course: CourseView; readonly part: WordPart }): JSX.Element => {
  const t = useTranslator();
  switch (part.kind) {
    case "skill":
      return <>{isWordSkill(part.skill) ? t.format(SKILL_MESSAGES[part.skill]) : <Code>{part.skill}</Code>}</>;
    case "feature": {
      const label = ownFeatureLabel(course, part.part);
      // The dimension, as an id, only where the language labels no such form.
      return <WithSlots id="words.part.feature" slots={{ label: label === undefined ? <Code>{part.part.slice(part.part.indexOf("|") + 1)}</Code> : <T text={label} /> }} />;
    }
    case "spelling":
      return <>{t.format("words.part.spelling", { orthography: orthographyName(t, course, part.orthography) })}</>;
    case "reading": {
      const name = schemeName(t, part.scheme);
      return name === undefined ? <WithSlots id="words.part.reading" slots={{ scheme: <Code>{part.scheme}</Code> }} /> : <>{t.format("words.part.reading", { scheme: name })}</>;
    }
  }
};

/** A word's parts, each shown or not (ADR 0146): a disclosure, closed until the learner opens it. */
const Parts = ({ course, lexeme, parts, open }: { readonly course: CourseView; readonly lexeme: string; readonly parts: readonly WordPart[]; readonly open: boolean }): JSX.Element => {
  const t = useTranslator();
  const asked = parts.filter((p) => p.status !== "not-asked");
  const shown = asked.filter((p) => p.status === "shown").length;
  return (
    <Disclosure className={styles.partsBox} defaultExpanded={open} data-word-parts={lexeme} data-parts-shown={shown} data-parts-asked={asked.length}>
      {({ isExpanded }) => (
        <>
          <Button slot="trigger" className={styles.partsToggle} data-action="word-parts">
            <span>{t.format("words.parts.toggle")}</span>
            <span className={styles.partsCount}>{t.format("words.parts.count", { shown, all: asked.length })}</span>
            <ExpandIcon size={16} open={isExpanded} />
          </Button>
          <DisclosurePanel className={styles.partsPanel}>
            <ul className={styles.parts}>
              {parts.map((part) => (
                <li key={partKey(part)} className={styles.part} data-part={partKey(part)} data-part-kind={part.kind} data-part-status={part.status}>
                  <span className={styles.partName}>
                    <PartName course={course} part={part} />
                  </span>
                  <span className={styles.partStatus}>
                    {t.format(STATUS_MESSAGES[part.status])}
                  </span>
                </li>
              ))}
            </ul>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
};

/** A rule's or a form's entry (ADR 0146): its label, and how many of the skills asked of it are shown. */
const Rule = ({ entry }: { readonly entry: RuleEntry }): JSX.Element => {
  const t = useTranslator();
  return (
    <li className={styles.rule} data-rule={entry.part} data-rule-kind={entry.kind} data-rule-shown={entry.shown} data-rule-asked={entry.skills.length}>
      {entry.label === undefined ? (
        <p className={styles.ruleLabel}>
          <Code>{entry.part}</Code>
        </p>
      ) : (
        <T as="p" className={styles.ruleLabel} text={entry.label} />
      )}
      <p className={styles.partsCount}>{t.format("words.parts.count", { shown: entry.shown, all: entry.skills.length })}</p>
    </li>
  );
};

/** Whether a rule's or form's entry is known: every skill asked of it shown. */
const ruleKnown = (entry: RuleEntry): boolean => entry.skills.length > 0 && entry.shown === entry.skills.length;

const Word = ({ course, word, url, ruby, parts, open }: { course: CourseView; word: LearnedWord; url: (path: string) => string; ruby: SchemeId | false; parts: readonly WordPart[]; open: boolean }): JSX.Element => {
  const t = useTranslator();
  const audio = course.audio[word.lexeme];
  const player = useClipPlayer(audio, url);
  const band = strengthBand(word);
  const missing = word.skills.filter((s) => !s.shown).map((s) => s.skill).filter(isWordSkill);
  return (
    <li className={styles.word} data-word={word.lexeme} data-strength={band} data-known={word.known}>
      <div className={styles.texts} data-ink-container={`word:${word.lexeme}`}>
        <T as="p" className={styles.form} text={word.form} ruby={ruby} />
        {word.gloss !== undefined && <T as="p" className={styles.gloss} text={word.gloss} />}
      </div>
      {audio !== undefined && (
        <div className={styles.audio}>
          <AudioButtons player={player} audio={audio} label={false} />
        </div>
      )}
      <div className={styles.progress}>
        <p className={styles.status} data-status={word.known ? "known" : "learning"}>
          {t.format(word.known ? "words.status.known" : "words.status.learning")}
        </p>
        {!word.known && missing.length > 0 && (
          <p className={styles.skills} data-skills-missing={missing.join(" ")}>
            <span>{t.format("words.skills.label")}</span>
            {missing.map((s) => (
              <span key={s} className={styles.skill} data-skill={s}>
                {t.format(SKILL_MESSAGES[s])}
              </span>
            ))}
          </p>
        )}
      </div>
      <p className={styles.band} data-band={band}>
        <span className={styles.meter} aria-hidden="true">
          <span className={styles.fill} style={{ inlineSize: `${String(Math.round(word.strength * 100))}%` }} />
        </span>
        {t.format(BAND_MESSAGES[band])}
      </p>
      {parts.length > 0 && <Parts course={course} lexeme={word.lexeme} parts={parts} open={open} />}
    </li>
  );
};

const titleOf = (course: CourseView, unit: string): TaggedText | undefined => course.units.find((u) => u.id === unit)?.title?.[course.supportKey];

export const WordList = ({ course, words, url, reading, parts, rules, opened }: WordListProps): JSX.Element => {
  const t = useTranslator();
  const listId = useId();
  const [order, setOrder] = useState<WordOrder>("course");
  const [filter, setFilter] = useState<WordFilter>("all");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const ruby = useMemo(() => defaultRuby(course.profiles.get(course.orthography)?.source, reading), [course, reading]);
  const counts = useMemo(() => wordCounts(words), [words]);
  // Whether any word is asked to be heard: the explanation names listening only where it counts.
  const heard = useMemo(() => words.some((w) => w.skills.some((s) => s.skill === "listen")), [words]);
  const shown = useMemo(
    () =>
      orderWords(words, order)
        .filter((w) => filter === "all" || (filter === "known") === w.known)
        .filter(wordMatcher(course, query)),
    [words, order, filter, course, query],
  );
  // The rules and forms met, as the filter and the search have them: known ones under Known, the rest under Learning.
  const shownRules = useMemo(
    () => (rules ?? []).filter((r) => filter === "all" || (filter === "known") === ruleKnown(r)).filter(ruleMatcher(course, query)),
    [rules, filter, course, query],
  );
  const open = useMemo(() => new Set(opened ?? []), [opened]);
  // How many of each unit's words are known, for the unit headings.
  const byUnit = useMemo(() => {
    const out = new Map<string, { known: number; count: number }>();
    for (const w of words) {
      const u = out.get(w.unit) ?? { known: 0, count: 0 };
      out.set(w.unit, { known: u.known + (w.known ? 1 : 0), count: u.count + 1 });
    }
    return out;
  }, [words]);
  // In course order the words stay under their units.
  const groups = useMemo(() => {
    if (order !== "course") return [{ unit: undefined, words: shown }];
    const out: { unit: string | undefined; words: LearnedWord[] }[] = [];
    for (const w of shown) {
      const last = out.at(-1);
      if (last?.unit === w.unit) last.words.push(w);
      else out.push({ unit: w.unit, words: [w] });
    }
    return out;
  }, [shown, order]);
  const unitName = (unit: string): JSX.Element => {
    const title = titleOf(course, unit);
    return title === undefined ? <>{t.format("corrections.page.unit", { number: course.units.findIndex((u) => u.id === unit) + 1 })}</> : <T text={title} />;
  };

  if (words.length === 0) {
    return (
      <p className={styles.muted} data-words-empty="">
        {t.format("words.empty")}
      </p>
    );
  }
  return (
    <div className={styles.list} data-word-list={course.id}>
      <p className={styles.count} data-words-count={words.length} data-words-known={counts.known}>
        {t.format("words.count", { count: words.length })}
      </p>
      <p className={styles.muted}>{t.format(heard ? "words.known.explain-heard" : "words.known.explain")}</p>
      <div className={styles.controls}>
        <SearchField
          className={styles.search}
          value={typed}
          onChange={(v) => {
            setTyped(v);
            if (!composing) setQuery(v);
          }}
          onClear={() => setQuery("")}
        >
          <Label className={styles.label}>{t.format("words.search")}</Label>
          <Input
            className={styles.input}
            dir="auto"
            spellCheck={false}
            autoCapitalize="none"
            aria-controls={listId}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={(e) => {
              setComposing(false);
              setQuery(e.currentTarget.value);
            }}
            data-field="word-search"
          />
        </SearchField>
        <RadioGroup className={styles.orders} value={filter} onChange={(v) => setFilter(v as WordFilter)} orientation="horizontal" data-word-filter={filter}>
          <Label className={styles.label}>{t.format("words.filter.label")}</Label>
          <div className={styles.radios}>
            {FILTERS.map((f) => (
              <Radio key={f} className={styles.radio} value={f} data-filter={f}>
                {t.format(FILTER_MESSAGES[f], { count: f === "all" ? words.length : counts[f] })}
              </Radio>
            ))}
          </div>
        </RadioGroup>
        <RadioGroup className={styles.orders} value={order} onChange={(v) => setOrder(v as WordOrder)} orientation="horizontal" data-word-order={order}>
          <Label className={styles.label}>{t.format("words.order.label")}</Label>
          <div className={styles.radios}>
            {ORDERS.map((o) => (
              <Radio key={o} className={styles.radio} value={o} data-order={o}>
                {t.format(o === "course" ? "words.order.course" : o === "alphabetical" ? "words.order.alphabetical" : "words.order.weakest")}
              </Radio>
            ))}
          </div>
        </RadioGroup>
      </div>
      <div id={listId}>
        {shown.length === 0 && shownRules.length === 0 ? (
          <p className={styles.muted} role="status" data-words-none-found="">
            {t.format("words.none-found")}
          </p>
        ) : (
          groups.map((g) => (
            <section key={g.unit ?? "all"} aria-labelledby={g.unit === undefined ? undefined : `${listId}-${g.unit}`} data-word-unit={g.unit}>
              {g.unit !== undefined && (
                <h2 className={styles.unit} id={`${listId}-${g.unit}`}>
                  <span>{unitName(g.unit)}</span>
                  <span className={styles.unitKnown} data-unit-known={byUnit.get(g.unit)?.known ?? 0}>
                    {t.format("words.unit.known", { known: byUnit.get(g.unit)?.known ?? 0, count: byUnit.get(g.unit)?.count ?? 0 })}
                  </span>
                </h2>
              )}
              <ul className={styles.words}>
                {g.words.map((w) => (
                  <Word key={w.lexeme} course={course} word={w} url={url} ruby={ruby} parts={parts === undefined ? [] : listedParts(parts(w.lexeme))} open={open.has(w.lexeme)} />
                ))}
              </ul>
            </section>
          ))
        )}
        {shownRules.length > 0 && (
          <section aria-labelledby={`${listId}-rules`} data-rule-entries="">
            <h2 className={styles.unit} id={`${listId}-rules`}>
              {t.format("words.rules.title")}
            </h2>
            <ul className={styles.words}>
              {shownRules.map((r) => (
                <Rule key={r.part} entry={r} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};
