/**
 * The word list: the words a learner has learned in a course, to browse (learnedWords in
 * @nabu/core/learner). Each word in the orthography being learned, with its readings where the
 * profile has them, its meaning in the support language, its clip, and how well it is remembered.
 *
 * - Order: as in the course (by unit), alphabetical by the language's own collation, or weakest
 *   first.
 * - Search: by letters, whatever the vowel marks, or by meaning (wordMatcher). The field takes the
 *   direction of what is typed, and the list follows a query only once an IME has committed it:
 *   nothing filters on a half-composed syllable.
 */
import { orderWords, wordMatcher, type LearnedWord, type WordOrder } from "@nabu/core/learner";
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

const Word = ({ course, word, url, ruby }: { course: CourseView; word: LearnedWord; url: (path: string) => string; ruby: SchemeId | false }): JSX.Element => {
  const t = useTranslator();
  const audio = course.audio[word.kc];
  const player = useClipPlayer(audio, url);
  const band = strengthBand(word);
  return (
    <li className={styles.word} data-word={word.kc} data-strength={band}>
      <div className={styles.texts} data-ink-container={`word:${word.kc}`}>
        <T as="p" className={styles.form} text={word.form} ruby={ruby} />
        {word.gloss !== undefined && <T as="p" className={styles.gloss} text={word.gloss} />}
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
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const ruby = useMemo(() => rubySchemeOf(course.profiles.get(course.orthography)?.source) ?? false, [course]);
  const shown = useMemo(() => orderWords(words, order).filter(wordMatcher(course, query)), [words, order, course, query]);
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
      <p className={styles.count} data-words-count={words.length}>
        {t.format("words.count", { count: words.length })}
      </p>
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
                  {unitName(g.unit)}
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
