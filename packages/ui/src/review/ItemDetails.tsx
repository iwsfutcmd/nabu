/**
 * What the review workspace (ADR 0074) shows under each item of the sentence list: its clip, the
 * answers its accept sets take (each orthography's `reverse`, and the translation's), and a way to
 * accept one more answer in the reviewer's orthography, which `nabu reports promote` adds.
 *
 * Every text keeps its own language: accept-set lines render through <T> with the tag of the form
 * or translation they belong to, and the field takes the orthography's lang, direction and font.
 * The field never submits: only the button adds, so no IME composition can be cut short.
 */
import { correctionKey, type Correctable } from "@nabu/core/corrections";
import type { CourseView } from "@nabu/core/lesson";
import { textOfSurface } from "@nabu/core/text";
import { directionOf, fontStackFor } from "@nabu/i18n";
import type { BundleSentence, TaggedText } from "@nabu/schema";
import { useId, useMemo, useState, type CSSProperties, type JSX } from "react";
import { Button, Input, Label, TextField } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { AudioButtons, useClipPlayer } from "../player/Audio.tsx";
import { T } from "../T.tsx";
import styles from "./Review.module.css";

export type AcceptResult = "added" | "failed";

export interface ItemDetailsProps {
  readonly course: CourseView;
  readonly target: Correctable;
  /** A bundle path (a clip) as a URL. */
  readonly url: (path: string) => string;
  /** Accepts one more answer in the course's orthography (absent: no field). */
  readonly onAccept?: ((answer: string) => Promise<AcceptResult>) | undefined;
}

/** An accept set's alternatives, one a line. */
const linesOf = (accept: string): string[] =>
  accept
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");

const fieldStyle = (lang: string, fonts?: Parameters<typeof fontStackFor>[1]): CSSProperties => {
  const font = fontStackFor(lang, fonts);
  return { "--nabu-field-font": font.family, "--nabu-field-line-height": String(font.lineHeight) } as CSSProperties;
};

/** The accept sets of a sentence: each orthography's, in code-point order, then the translation's. */
const acceptSets = (course: CourseView, sentence: BundleSentence): { readonly key: string; readonly base: TaggedText; readonly lines: readonly string[] }[] => [
  ...Object.entries(sentence.forms)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([orthography, form]) => (form.reverse === undefined ? [] : [{ key: orthography, base: form.text, lines: linesOf(form.reverse) }])),
  ...(() => {
    const translation = sentence.translations[course.supportKey];
    return translation === undefined ? [] : [{ key: course.supportKey, base: translation.text, lines: linesOf(translation.accept) }];
  })(),
];

const Clip = ({ course, target, url }: { course: CourseView; target: Correctable; url: (path: string) => string }): JSX.Element | null => {
  const audio = course.audio[correctionKey(target.item, target.step)];
  const player = useClipPlayer(audio, url);
  return audio === undefined ? null : <AudioButtons player={player} audio={audio} label={false} />;
};

/** The field takes the tag of the sentence's own form (as the correction form does), and its profile's font. */
const AddAnswer = ({ course, lang, onAccept }: { course: CourseView; lang: string; onAccept: (answer: string) => Promise<AcceptResult> }): JSX.Element => {
  const t = useTranslator();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AcceptResult | undefined>(undefined);
  const profile = course.profiles.get(course.orthography);
  const add = async (): Promise<void> => {
    if (value.trim() === "") return;
    setBusy(true);
    const r = await onAccept(value.normalize("NFC"));
    setBusy(false);
    setResult(r);
    if (r === "added") setValue("");
  };
  return (
    <div className={styles.add}>
      <TextField className={styles.field} value={value} onChange={(v) => {
        setValue(v);
        setResult(undefined);
      }}>
        <Label className={styles.label}>{t.format("review.accepted.add-label")}</Label>
        <Input className={styles.input} lang={lang} dir={directionOf(lang)} spellCheck={false} autoCapitalize="none" style={fieldStyle(lang, profile?.source.fonts)} data-field="accepted-answer" />
      </TextField>
      <Button className={styles.small} onPress={() => void add()} isDisabled={busy || value.trim() === ""} data-action="add-accepted">
        {t.format("review.accepted.add")}
      </Button>
      {result !== undefined && (
        <p className={result === "added" ? styles.muted : styles.error} role="status" data-accept-result={result}>
          {t.format(result === "added" ? "review.accepted.added" : "review.accepted.failed")}
        </p>
      )}
    </div>
  );
};

export const ItemDetails = ({ course, target, url, onAccept }: ItemDetailsProps): JSX.Element => {
  const t = useTranslator();
  const headingId = useId();
  const sentence = useMemo(() => (target.kind === "sentence" ? course.units.flatMap((u) => u.sentences).find((s) => s.id === target.item) : undefined), [course, target]);
  const sets = sentence === undefined ? [] : acceptSets(course, sentence);
  const own = sentence?.forms[course.orthography];
  return (
    <div className={styles.details} data-review-details={correctionKey(target.item, target.step)}>
      <Clip course={course} target={target} url={url} />
      {sets.length > 0 && (
        <section aria-labelledby={headingId} className={styles.accepted}>
          <h4 className={styles.subheading} id={headingId}>
            {t.format("review.accepted.title")}
          </h4>
          {sets.map(({ key, base, lines }) => (
            <ul key={key} className={styles.alternatives} data-accept-set={key}>
              {lines.map((line, i) => (
                <li key={i}>
                  <T text={textOfSurface(base, line)} />
                </li>
              ))}
            </ul>
          ))}
        </section>
      )}
      {own?.reverse !== undefined && onAccept !== undefined && <AddAnswer course={course} lang={own.text.lang} onAccept={onAccept} />}
    </div>
  );
};
