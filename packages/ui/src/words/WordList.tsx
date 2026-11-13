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
 */
import { orderWords, wordCounts, wordMatcher, type LearnedWord, type Skill, type WordOrder } from "@nabu/core/learner";
import type { CourseView } from "@nabu/core/lesson";
import type { SchemeId, TaggedText } from "@nabu/schema";
import { useId, useMemo, useState, type JSX } from "react";
import { Input, Label, Radio, RadioGroup, SearchField } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { AudioButtons, useClipPlayer } from "../player/Audio.tsx";
import { rubySchemeOf } from "../player/shared.ts";
import { T } from "../T.tsx";
import styles from "./Words.module.css";

export interface WordListProps {
  readonly course: CourseView;
  readonly words: readonly LearnedWord[];
  /** A bundle path (a clip) as a URL. */
  readonly url: (path: string) => string;
}

/** How remembered a word is, in three words: due for review, strong, or fading. */
export const strengthBand = (word: LearnedWord): "due" | "strong" | "fading" => (word.due ? "due" : word.strength >= 0.85 ? "strong" : "fading");

const BAND_MESSAGES = { due: "words.strength.due", strong: "words.strength.strong", fading: "words.strength.fading" } as const;

const ORDERS: readonly WordOrder[] = ["course", "alphabetical", "weakest"];

type WordFilter = "all" | "known" | "learning";
const FILTERS: readonly WordFilter[] = ["all", "known", "learning"];
const FILTER_MESSAGES = { all: "words.filter.all", known: "words.filter.known", learning: "words.filter.learning" } as const;

const SKILL_MESSAGES: Readonly<Record<Skill, "words.skill.recognize" | "words.skill.produce" | "words.skill.listen">> = {
  recognize: "words.skill.recognize",
  produce: "words.skill.produce",
  listen: "words.skill.listen",
};

const Word = ({ course, word, url, ruby }: { course: CourseView; word: LearnedWord; url: (path: string) => string; ruby: SchemeId | false }): JSX.Element => {
  const t = useTranslator();
  const audio = course.audio[word.kc];
  const player = useClipPlayer(audio, url);
  const band = strengthBand(word);
  const missing = word.skills.filter((s) => !s.shown).map((s) => s.skill);
  return (
    <li className={styles.word} data-word={word.kc} data-strength={band} data-known={word.known}>
      <div className={styles.texts} data-ink-container={`word:${word.kc}`}>
        <T as="p" className={styles.form} text={word.form} ruby={ruby} />
        {word.gloss !== undefined && <T as="p" className={styles.gloss} text={word.gloss} />}
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
      </div>
      <div className={styles.side}>
        {audio !== undefined && <AudioButtons player={player} audio={audio} label={false} />}
        <p className={styles.band} data-band={band}>
          <span className={styles.meter} aria-hidden="true">
            <span className={styles.fill} style={{ inlineSize: `${String(Math.round(word.strength * 100))}%` }} />
          </span>
          {t.format(BAND_MESSAGES[band])}
        </p>
      </div>
    </li>
  );
};

const titleOf = (course: CourseView, unit: string): TaggedText | undefined => course.units.find((u) => u.id === unit)?.title?.[course.supportKey];

export const WordList = ({ course, words, url }: WordListProps): JSX.Element => {
  const t = useTranslator();
  const listId = useId();
  const [order, setOrder] = useState<WordOrder>("course");
  const [filter, setFilter] = useState<WordFilter>("all");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const ruby = useMemo(() => rubySchemeOf(course.profiles.get(course.orthography)?.source) ?? false, [course]);
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
        {shown.length === 0 ? (
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
                  <Word key={w.kc} course={course} word={w} url={url} ruby={ruby} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
};
