/**
 * The correction form (ADR 0051): a learner says what a sentence, story line or word (ADR 0057)
 * should be. It starts from what the course has (or from the learner's own earlier correction)
 * and records only what they change: the text in every orthography the course is taught in, each
 * word's pinned reading (Jyutping), the translation (a word's meaning), and a note for the reviewer.
 *
 * - Every field takes its text's own `lang` and `dir` (from the script, never the UI) and font;
 *   the course's text is shown beside it through <T>.
 * - IME-safe (gameplan §6.7): values are kept exactly as typed; nothing is normalized until the
 *   correction is made (NFC, in @nabu/core/corrections), and nothing is sent mid-composition.
 */
import { correctionOf, draftFrom, shownOf, type Correctable, type CorrectionDraft, type CorrectionError } from "@nabu/core/corrections";
import { readingScheme } from "@nabu/core";
import type { CourseView } from "@nabu/core/lesson";
import { textOfSurface } from "@nabu/core/text";
import { directionOf, fontStackFor, orthographyName } from "@nabu/i18n";
import type { CorrectionFields, SentenceReported, TaggedText, TokenReading } from "@nabu/schema";
import { useId, useMemo, useState, type CSSProperties, type JSX } from "react";
import { Button, FieldError, Input, Label, Text, TextArea, TextField } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { T } from "../T.tsx";
import styles from "./Corrections.module.css";

export interface CorrectionFormProps {
  readonly course: CourseView;
  readonly target: Correctable;
  /** This device's earlier correction of the item: the form starts from it. */
  readonly previous?: SentenceReported | undefined;
  readonly onSubmit: (made: { readonly correction: CorrectionFields; readonly note?: string }, shown: CorrectionFields) => void;
  readonly onCancel: () => void;
}

/** The draft to start from: what the course has, with the learner's earlier changes on top. */
const startFrom = (shown: CorrectionFields, previous: SentenceReported | undefined): CorrectionDraft => {
  const base = draftFrom(shown);
  if (previous === undefined) return base;
  const forms = Object.fromEntries(
    Object.entries(base.forms).map(([o, f]) => {
      const fix = previous.correction.forms?.[o];
      const readings = (shown.forms?.[o]?.readings ?? []).map((r, n) => fix?.readings?.find((x) => x.token === r.token && x.scheme === r.scheme)?.reading ?? f.readings[n] ?? r.reading);
      return [o, { text: fix?.text ?? f.text, readings }];
    }),
  );
  return { forms, translation: previous.correction.translation ?? base.translation, note: previous.note ?? "" };
};

/** The learner's orthography first, then the others the course pins. */
const orthographiesOf = (course: CourseView, target: Correctable): readonly string[] => {
  const all = Object.keys(target.forms);
  return [...all.filter((o) => o === course.orthography), ...all.filter((o) => o !== course.orthography).sort()];
};

const fieldStyle = (lang: string, fonts?: Parameters<typeof fontStackFor>[1]): CSSProperties => {
  const font = fontStackFor(lang, fonts);
  return { "--nabu-field-font": font.family, "--nabu-field-line-height": String(font.lineHeight) } as CSSProperties;
};

const ERROR_MESSAGES = {
  unchanged: "corrections.error.unchanged",
  empty: "corrections.error.empty",
  "too-long": "corrections.error.too-long",
} as const satisfies Record<CorrectionError["code"], string>;

export const CorrectionForm = ({ course, target, previous, onSubmit, onCancel }: CorrectionFormProps): JSX.Element => {
  const t = useTranslator();
  const headingId = useId();
  const shown = useMemo(() => shownOf(target), [target]);
  const [draft, setDraft] = useState<CorrectionDraft>(() => startFrom(shown, previous));
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<CorrectionError | undefined>(undefined);
  const ime = { onCompositionStart: () => setComposing(true), onCompositionEnd: () => setComposing(false) };
  const errorOf = (field: string): string | undefined => (error !== undefined && "field" in error && error.field === field ? t.format(ERROR_MESSAGES[error.code]) : undefined);
  const nameOf = (id: string): string => orthographyName(t, course, id);
  const edit = (next: CorrectionDraft): void => {
    setDraft(next);
    setError(undefined);
  };
  const setForm = (o: string, change: Partial<{ text: string; readings: readonly string[] }>): void => {
    const form = draft.forms[o] ?? { text: "", readings: [] };
    edit({ ...draft, forms: { ...draft.forms, [o]: { ...form, ...change } } });
  };
  const send = (): void => {
    if (composing) return;
    const made = correctionOf(shown, draft);
    if (made.ok) onSubmit(made.value, shown);
    else setError(made.error);
  };
  const translation: TaggedText | undefined = target.translation;
  const word = target.kind === "word";

  return (
    <form
      className={styles.form}
      aria-labelledby={headingId}
      data-correction-form=""
      data-item={target.item}
      data-step={target.step}
      data-kind={target.kind}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <h2 className={styles.heading} id={headingId}>
        {t.format("corrections.title")}
      </h2>
      <p className={styles.muted}>{t.format(word ? "corrections.word.intro" : "corrections.intro")}</p>

      {orthographiesOf(course, target).map((o) => {
        const text = target.forms[o];
        const form = draft.forms[o];
        if (text === undefined || form === undefined) return null;
        const profile = course.profiles.get(o)?.source;
        const readings: readonly TokenReading[] = shown.forms?.[o]?.readings ?? [];
        return (
          <div key={o} className={styles.field} data-orthography={o}>
            <TextField className={styles.field} value={form.text} onChange={(v) => setForm(o, { text: v })} isInvalid={errorOf(`text:${o}`) !== undefined}>
              <Label className={styles.label}>{t.format(word ? "corrections.word.text" : "corrections.text", { orthography: nameOf(o) })}</Label>
              <TextArea className={styles.input} lang={text.lang} dir={directionOf(text.lang)} rows={2} spellCheck={false} style={fieldStyle(text.lang, profile?.fonts)} data-field="correction-text" {...ime} />
              <Text slot="description" className={styles.now} data-ink-container={`now:${o}`}>
                {t.format("corrections.now")} <T text={text} />
              </Text>
              <FieldError className={styles.error}>{errorOf(`text:${o}`)}</FieldError>
            </TextField>
            {readings.length > 0 && (
              <fieldset className={styles.readings}>
                <legend className={styles.legend}>{t.format("corrections.readings")}</legend>
                {readings.map((r, n) => {
                  const lang = readingScheme(r.scheme)?.lang ?? "und-Latn";
                  return (
                    <TextField
                      key={`${String(r.token)}:${r.scheme}`}
                      className={styles.field}
                      value={form.readings[n] ?? ""}
                      onChange={(v) => setForm(o, { readings: form.readings.map((x, i) => (i === n ? v : x)) })}
                      isInvalid={errorOf(`reading:${o}:${String(n)}`) !== undefined}
                    >
                      <Label className={styles.label}>
                        <T text={textOfSurface(text, r.surface)} />
                      </Label>
                      <Input className={styles.input} lang={lang} dir={directionOf(lang)} spellCheck={false} autoCapitalize="none" style={fieldStyle(lang)} data-field="correction-reading" data-token={r.token} {...ime} />
                      <FieldError className={styles.error}>{errorOf(`reading:${o}:${String(n)}`)}</FieldError>
                    </TextField>
                  );
                })}
              </fieldset>
            )}
          </div>
        );
      })}

      {translation !== undefined && (
        <TextField className={styles.field} value={draft.translation} onChange={(v) => edit({ ...draft, translation: v })} isInvalid={errorOf("translation") !== undefined}>
          <Label className={styles.label}>{t.format(word ? "corrections.word.meaning" : "corrections.translation")}</Label>
          <TextArea className={styles.input} lang={translation.lang} dir={directionOf(translation.lang)} rows={2} style={fieldStyle(translation.lang)} data-field="correction-translation" {...ime} />
          <Text slot="description" className={styles.now} data-ink-container="now:translation">
            {t.format("corrections.now")} <T text={translation} />
          </Text>
          <FieldError className={styles.error}>{errorOf("translation")}</FieldError>
        </TextField>
      )}

      <TextField className={styles.field} value={draft.note} onChange={(v) => edit({ ...draft, note: v })} isInvalid={errorOf("note") !== undefined}>
        <Label className={styles.label}>{t.format("corrections.note")}</Label>
        {/* The learner's own words, in whatever language they write: the browser finds the direction. */}
        <TextArea className={styles.input} dir="auto" rows={2} data-field="correction-note" {...ime} />
        <FieldError className={styles.error}>{errorOf("note")}</FieldError>
      </TextField>

      {error?.code === "unchanged" && (
        <p className={styles.error} role="alert" data-correction-error="unchanged">
          {t.format(ERROR_MESSAGES.unchanged)}
        </p>
      )}
      <div className={styles.actions}>
        <Button className={styles.secondary} onPress={onCancel} data-action="cancel-correction">
          {t.format("corrections.cancel")}
        </Button>
        <Button className={styles.primary} type="submit" isDisabled={composing} data-action="send-correction">
          {t.format("corrections.submit")}
        </Button>
      </div>
    </form>
  );
};
