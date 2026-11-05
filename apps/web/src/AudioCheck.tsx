/**
 * The audio check (ADR 0060): every clip of a course, to listen to and judge. Each item shows
 * its text in the voice's orthography (with karaoke while it plays), what the speech recognizer
 * heard when the clip was made, and whether learners get it (a clip that failed the round trip
 * is held back). The listener says whether it sounds right; verdicts stay on this device until
 * they are downloaded for `nabu audio verdicts`, which marks the clips reviewed or rejected.
 *
 * The clips come from audio-check/<course>/ beside the app (the dev server serves courses/;
 * Pages publishes a copy), not from the learners' bundles, which leave held-back clips out.
 */
import { correctable, correctablesByUnit, type Correctable } from "@nabu/core/corrections";
import type { AudioRef, CourseView } from "@nabu/core/lesson";
import { surfaceOf, textOfSurface } from "@nabu/core/text";
import type { AudioClip, AudioVerdict, AudioVerdicts, BundleClip, TaggedText } from "@nabu/schema";
import { T, useTranslator } from "@nabu/ui";
import { AudioButtons, rubySchemeOf, useClipPlayer, type LoadedCourse, type Speed } from "@nabu/ui/player";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Button, Label, TextField, TextArea, ToggleButton } from "react-aria-components";
import type { AudioCheckData } from "../audio-check.ts";
import styles from "./AudioCheck.module.css";
import app from "./App.module.css";

type Kind = "word" | "sentence" | "line" | "other";
type Status = "pass" | "review" | "fail" | "none";

interface Row {
  /** The item's audio id: a sentence id, a KC id, or "<story>#<step>". */
  readonly key: string;
  readonly kind: Kind;
  /** Index of the unit it belongs to (the course's order); -1 when the course no longer has it. */
  readonly unit: number;
  readonly target: Correctable | undefined;
  readonly normal: AudioClip | undefined;
  readonly slow: AudioClip | undefined;
}

interface Stored {
  readonly verdict: "right" | "wrong";
  readonly note?: string;
  /** The clips judged (sha256): a verdict stops applying once a clip is made again. */
  readonly clips: readonly string[];
  readonly at: string;
}

const statusOf = (row: Row): Status => row.normal?.qa?.status ?? "none";
const clipsOf = (row: Row): readonly AudioClip[] => [row.normal, row.slow].flatMap((c) => (c === undefined ? [] : [c]));
const shasOf = (row: Row): readonly string[] => clipsOf(row).map((c) => c.sha256);
const reviewed = (clip: AudioClip | undefined): boolean => clip?.provenance.status === "reviewed" || clip?.provenance.status === "published";
/** Learners do not get it: its clip failed the round trip unreviewed, or a listener rejected it. */
const heldBack = (row: Row): boolean => (statusOf(row) === "fail" && !reviewed(row.normal)) || clipsOf(row).some((c) => c.rejected !== undefined);
const current = (stored: Stored | undefined, row: Row): Stored | undefined => {
  const shas = shasOf(row);
  return stored !== undefined && stored.clips.length === shas.length && stored.clips.every((s) => shas.includes(s)) ? stored : undefined;
};

/** Every item that has a clip, unit by unit as the course runs: words, sentences, story lines. */
const rowsOf = (course: CourseView, clips: readonly AudioClip[]): readonly Row[] => {
  const byItem = new Map<string, { normal?: AudioClip; slow?: AudioClip }>();
  for (const clip of clips) byItem.set(clip.item, { ...byItem.get(clip.item), [clip.speed]: clip });
  const rows: Row[] = [];
  const take = (key: string, kind: Kind, unit: number, target: Correctable | undefined): void => {
    const found = byItem.get(key);
    if (found === undefined) return;
    byItem.delete(key);
    rows.push({ key, kind, unit, target, normal: found.normal, slow: found.slow });
  };
  correctablesByUnit(course).forEach(({ unit, sentences, stories }, u) => {
    for (const kc of unit.kcs) take(kc.id, "word", u, correctable(course, kc.id));
    for (const s of sentences) take(s.item, "sentence", u, s);
    for (const { lines } of stories) for (const line of lines) take(`${line.item}#${String(line.step)}`, "line", u, line);
  });
  for (const key of [...byItem.keys()].sort()) take(key, "other", -1, undefined);
  return rows;
};

const bundleClip = (clip: AudioClip): BundleClip => ({
  path: clip.file,
  durationMs: clip.durationMs,
  synthetic: clip.synthetic,
  license: clip.license,
  ...(clip.timings === undefined ? {} : { timings: clip.timings }),
});

const STORE = "nabu.audio-check.";
const load = (course: string): Readonly<Record<string, Stored>> => {
  try {
    return JSON.parse(localStorage.getItem(STORE + course) ?? "{}") as Record<string, Stored>;
  } catch {
    return {};
  }
};

const download = (verdicts: AudioVerdicts): void => {
  const blob = new Blob([`${JSON.stringify(verdicts, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nabu-audio-verdicts-${verdicts.course}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

interface RowProps {
  readonly row: Row;
  readonly orthography: string;
  readonly ruby: false | NonNullable<ReturnType<typeof rubySchemeOf>>;
  readonly url: (path: string) => string;
  readonly isCurrent: boolean;
  readonly stored: Stored | undefined;
  readonly onJudge: (row: Row, verdict: Stored["verdict"] | undefined, note?: string) => void;
  readonly onFocus: (key: string) => void;
  /** Stops whatever else is playing; registers this row's player for the keyboard. */
  readonly onPlay: (stop: () => void) => void;
  readonly register: (key: string, play: ((speed: Speed) => void) | undefined) => void;
}

const ItemRow = ({ row, orthography, ruby, url, isCurrent, stored, onJudge, onFocus, onPlay, register }: RowProps): JSX.Element => {
  const t = useTranslator();
  const audio: AudioRef | undefined = useMemo(
    () => (row.normal === undefined ? undefined : { normal: bundleClip(row.normal), ...(row.slow === undefined ? {} : { slow: bundleClip(row.slow) }) }),
    [row],
  );
  const player = useClipPlayer(audio, url);
  const play = useCallback(
    (speed: Speed = "normal"): void => {
      onPlay(player.stop);
      onFocus(row.key);
      player.play(speed);
    },
    [onPlay, onFocus, player, row.key],
  );
  useEffect(() => {
    register(row.key, play);
    return () => register(row.key, undefined);
  }, [register, row.key, play]);
  const element = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (isCurrent) element.current?.scrollIntoView?.({ block: "nearest" });
  }, [isCurrent]);
  const form: TaggedText | undefined = row.target?.forms[orthography] ?? Object.values(row.target?.forms ?? {})[0];
  const status = statusOf(row);
  const verdict = current(stored, row);
  const [note, setNote] = useState(verdict?.note ?? "");
  const input = row.normal?.synthesis?.input;
  const heard = row.normal?.qa?.asrText;
  const cer = row.normal?.qa?.cer;
  return (
    <li ref={element} className={styles.row} data-audio-item={row.key} data-kind={row.kind} data-status={status} data-current={isCurrent || undefined}>
      <div className={styles.play}>{audio !== undefined && <AudioButtons player={{ ...player, play }} audio={audio} label={false} />}</div>
      <div className={styles.body}>
        {form === undefined ? (
          <code className={styles.id}>{row.key}</code>
        ) : (
          <T as="p" className={styles.text} text={form} ruby={ruby} {...(player.token === undefined ? {} : { highlight: [player.token] })} />
        )}
        {row.target?.translation !== undefined && <T as="p" className={app.muted} text={row.target.translation} />}
        {form !== undefined && input !== undefined && input.normalize("NFC") !== surfaceOf(form).normalize("NFC") && (
          <p className={styles.detail} data-read="">
            <span>{t.format("audio.check.read")}</span> <T text={textOfSurface(form, input)} />
          </p>
        )}
        <p className={styles.detail}>
          <span className={styles.badge} data-badge={status}>
            {t.format(`audio.check.status.${status}`)}
          </span>
          {cer !== undefined && <span>{t.format("audio.check.cer", { cer })}</span>}
          {heldBack(row) && (
            <span className={styles.badge} data-badge="held">
              {t.format("audio.check.held")}
            </span>
          )}
          {reviewed(row.normal) && <span className={styles.badge}>{t.format("audio.check.reviewed")}</span>}
          {clipsOf(row).some((c) => c.rejected !== undefined) && <span className={styles.badge}>{t.format("audio.check.rejected")}</span>}
        </p>
        {form !== undefined && heard !== undefined && heard !== "" && (
          <p className={styles.detail} data-heard="">
            <span>{t.format("audio.check.heard")}</span> <T text={textOfSurface(form, heard)} />
          </p>
        )}
        <div className={styles.verdict}>
          <ToggleButton
            className={styles.toggle}
            isSelected={verdict?.verdict === "right"}
            onChange={(on) => {
              onFocus(row.key);
              onJudge(row, on ? "right" : undefined);
            }}
            data-action="sounds-right"
          >
            {t.format("audio.check.right")}
          </ToggleButton>
          <ToggleButton
            className={styles.toggle}
            isSelected={verdict?.verdict === "wrong"}
            onChange={(on) => {
              onFocus(row.key);
              onJudge(row, on ? "wrong" : undefined);
            }}
            data-action="sounds-wrong"
          >
            {t.format("audio.check.wrong")}
          </ToggleButton>
          {stored !== undefined && verdict === undefined && <span className={app.muted}>{t.format("audio.check.outdated")}</span>}
        </div>
        {verdict?.verdict === "wrong" && (
          <TextField className={styles.note} value={note} onChange={setNote} maxLength={500} onBlur={() => onJudge(row, "wrong", note)}>
            <Label>{t.format("audio.check.note")}</Label>
            <TextArea rows={2} data-field="note" />
          </TextField>
        )}
      </div>
    </li>
  );
};

interface PageProps {
  readonly loaded: LoadedCourse;
  readonly back: string;
  /** Where the app is served from: audio-check/ sits beside it. */
  readonly base: string;
}

type Filter = { readonly kind: Kind | "all"; readonly status: Status | "held" | "all"; readonly mine: "all" | "none" | "right" | "wrong"; readonly order: "course" | "worst" };

/** Every clip of the course, to listen to and judge. */
export const AudioCheckPage = ({ loaded, back, base }: PageProps): JSX.Element => {
  const t = useTranslator();
  const { course } = loaded;
  const [data, setData] = useState<AudioCheckData | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void fetch(`${base}audio-check/${course.id}/index.json`)
      .then((r) => (r.ok ? (r.json() as Promise<AudioCheckData>) : null))
      .catch(() => null)
      .then((d) => {
        if (live) setData(d);
      });
    return () => {
      live = false;
    };
  }, [base, course.id]);
  const [stored, setStored] = useState(() => load(course.id));
  const [filter, setFilter] = useState<Filter>({ kind: "all", status: "all", mine: "all", order: "course" });
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const players = useRef(new Map<string, (speed: Speed) => void>());
  const stopActive = useRef<(() => void) | undefined>(undefined);

  const voice = data?.voices[0];
  const orthography = voice?.orthography ?? course.orthography;
  const ruby = rubySchemeOf(course.profiles.get(orthography)?.source) ?? false;
  const bundled = data?.bundled;
  const url = useCallback(
    (path: string): string => {
      const inBundle = bundled?.[path];
      return inBundle === undefined ? `${base}audio-check/${course.id}/${path}` : `${base}${inBundle}`;
    },
    [base, bundled, course.id],
  );
  const rows = useMemo(() => (data === null || data === undefined ? [] : rowsOf(course, data.index.clips)), [course, data]);

  const judge = useCallback(
    (row: Row, verdict: Stored["verdict"] | undefined, note?: string): void => {
      setStored((prev) => {
        const next = { ...prev };
        if (verdict === undefined) delete next[row.key];
        else {
          const text = note?.trim();
          next[row.key] = { verdict, clips: shasOf(row), at: new Date().toISOString(), ...(text === undefined || text === "" ? {} : { note: text }) };
        }
        try {
          localStorage.setItem(STORE + course.id, JSON.stringify(next));
        } catch {
          // Private browsing: the verdicts last as long as the page.
        }
        return next;
      });
    },
    [course.id],
  );
  const onPlay = useCallback((stop: () => void): void => {
    if (stopActive.current !== stop) stopActive.current?.();
    stopActive.current = stop;
  }, []);
  const register = useCallback((key: string, play: ((speed: Speed) => void) | undefined): void => {
    if (play === undefined) players.current.delete(key);
    else players.current.set(key, play);
  }, []);

  const shown = useMemo(() => {
    const kept = rows.filter((row) => {
      const mine = current(stored[row.key], row)?.verdict;
      return (
        (filter.kind === "all" || row.kind === filter.kind) &&
        (filter.status === "all" || (filter.status === "held" ? heldBack(row) : statusOf(row) === filter.status)) &&
        (filter.mine === "all" || (filter.mine === "none" ? mine === undefined : mine === filter.mine))
      );
    });
    return filter.order === "worst" ? [...kept].sort((a, b) => (b.normal?.qa?.cer ?? -1) - (a.normal?.qa?.cer ?? -1)) : kept;
  }, [rows, stored, filter]);
  const at = Math.max(0, shown.findIndex((r) => r.key === focus));
  const focused = shown[at];

  const verdicts: readonly AudioVerdict[] = useMemo(
    () =>
      rows.flatMap((row) => {
        const v = current(stored[row.key], row);
        return v === undefined ? [] : [{ item: row.key, clips: [...v.clips], verdict: v.verdict, at: v.at, ...(v.note === undefined ? {} : { note: v.note }) }];
      }),
    [rows, stored],
  );

  // Keys by position (event.code), so they stay put on any keyboard layout; never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [role=button], a") && e.code === "Space") return;
      if (target?.closest("input, textarea, select")) return;
      const move = (by: number): void => {
        const next = shown[Math.min(shown.length - 1, Math.max(0, at + by))];
        if (next !== undefined) setFocus(next.key);
      };
      const actions: Record<string, () => void> = {
        KeyJ: () => move(1),
        KeyK: () => move(-1),
        Space: () => focused !== undefined && players.current.get(focused.key)?.("normal"),
        KeyS: () => focused !== undefined && players.current.get(focused.key)?.("slow"),
        KeyR: () => focused !== undefined && judge(focused, current(stored[focused.key], focused)?.verdict === "right" ? undefined : "right"),
        KeyW: () => focused !== undefined && judge(focused, current(stored[focused.key], focused)?.verdict === "wrong" ? undefined : "wrong"),
      };
      const action = actions[e.code];
      if (action === undefined) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, at, focused, judge, stored]);

  const counts = useMemo(() => {
    const by = (s: Status): number => rows.filter((r) => statusOf(r) === s).length;
    return { pass: by("pass"), review: by("review"), fail: by("fail"), none: by("none"), held: rows.filter(heldBack).length };
  }, [rows]);
  const reference = data?.index.references?.find((r) => r.id === voice?.voice);
  const sample = rows.find((r) => r.target?.forms[orthography] !== undefined)?.target?.forms[orthography];

  const select = <K extends keyof Filter>(key: K, label: string, options: readonly [Filter[K], string][]): JSX.Element => (
    <label className={styles.filter}>
      <span>{label}</span>
      <select value={filter[key]} onChange={(e) => setFilter({ ...filter, [key]: e.target.value as Filter[K] })} data-filter={key}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  const list = (items: readonly Row[]): JSX.Element => (
    <ol className={styles.rows}>
      {items.map((row) => (
        <ItemRow
          key={row.key}
          row={row}
          orthography={orthography}
          ruby={ruby}
          url={url}
          isCurrent={row.key === focused?.key}
          stored={stored[row.key]}
          onJudge={judge}
          onFocus={setFocus}
          onPlay={onPlay}
          register={register}
        />
      ))}
    </ol>
  );

  const units = correctablesByUnit(course).map((u) => u.unit);
  return (
    <main className={app.page} data-audio-check={course.id}>
      <p>
        <a className={app.back} href={back}>
          {t.format("audio.check.back")}
        </a>
      </p>
      <h1 className={app.heading}>{t.format("audio.check.title")}</h1>
      <p className={app.muted}>{t.format("audio.check.intro")}</p>
      {data === undefined && <p>{t.format("audio.check.loading")}</p>}
      {data === null && <p data-audio-check-missing="">{t.format("audio.check.missing")}</p>}
      {data !== null && data !== undefined && (
        <>
          {voice !== undefined && <p className={app.muted}>{t.format("audio.check.voice", { voice: voice.id, provider: voice.provider })}</p>}
          {reference !== undefined && sample !== undefined && (
            <Reference
              text={textOfSurface(sample, reference.text)}
              audio={{ normal: { path: reference.file, durationMs: reference.durationMs, synthetic: reference.synthetic, license: reference.license } }}
              url={url}
              onPlay={onPlay}
            />
          )}
          <dl className={styles.stats} aria-label={t.format("audio.check.stats")}>
            {(["pass", "review", "fail", "none"] as const).map((s) => (
              <div key={s} data-count={s}>
                <dt>{t.format(`audio.check.status.${s}`)}</dt>
                <dd>{counts[s]}</dd>
              </div>
            ))}
            <div data-count="held">
              <dt>{t.format("audio.check.held")}</dt>
              <dd>{counts.held}</dd>
            </div>
          </dl>
          <div className={styles.filters}>
            {select("kind", t.format("audio.check.filter.kind"), [
              ["all", t.format("audio.check.kind.all")],
              ["word", t.format("audio.check.kind.word")],
              ["sentence", t.format("audio.check.kind.sentence")],
              ["line", t.format("audio.check.kind.line")],
            ])}
            {select("status", t.format("audio.check.filter.status"), [
              ["all", t.format("audio.check.status.all")],
              ["pass", t.format("audio.check.status.pass")],
              ["review", t.format("audio.check.status.review")],
              ["fail", t.format("audio.check.status.fail")],
              ["none", t.format("audio.check.status.none")],
              ["held", t.format("audio.check.held")],
            ])}
            {select("mine", t.format("audio.check.filter.mine"), [
              ["all", t.format("audio.check.mine.all")],
              ["none", t.format("audio.check.mine.none")],
              ["right", t.format("audio.check.right")],
              ["wrong", t.format("audio.check.wrong")],
            ])}
            {select("order", t.format("audio.check.filter.order"), [
              ["course", t.format("audio.check.order.course")],
              ["worst", t.format("audio.check.order.worst")],
            ])}
          </div>
          <p className={app.muted}>{t.format("audio.check.keys")}</p>
          <p className={styles.toolbar}>
            <span data-shown={shown.length}>{t.format("audio.check.shown", { shown: shown.length, total: rows.length })}</span>
            {verdicts.length > 0 && (
              <Button className={app.textButton} onPress={() => download({ course: course.id, verdicts: [...verdicts] })} data-action="export-verdicts">
                {t.format("audio.check.export", { count: verdicts.length })}
              </Button>
            )}
          </p>
          {filter.order === "worst"
            ? list(shown)
            : [...units.map((_, u) => u), -1].map((u) => {
                const items = shown.filter((r) => r.unit === u);
                if (items.length === 0) return null;
                const unit = units[u];
                const title = unit?.title?.[course.supportKey];
                return (
                  <section key={u} aria-labelledby={`audio-unit-${String(u)}`} data-audio-unit={unit?.id ?? "other"}>
                    <h2 className={app.subheading} id={`audio-unit-${String(u)}`}>
                      {u < 0 ? t.format("audio.check.other") : title !== undefined ? <T text={title} /> : t.format("audio.check.unit", { number: u + 1 })}
                    </h2>
                    {list(items)}
                  </section>
                );
              })}
        </>
      )}
    </main>
  );
};

/** The recording every clip of a cloning voice imitates. */
const Reference = ({ text, audio, url, onPlay }: { readonly text: TaggedText; readonly audio: AudioRef; readonly url: (path: string) => string; readonly onPlay: (stop: () => void) => void }): JSX.Element => {
  const t = useTranslator();
  const player = useClipPlayer(audio, url);
  const play = (speed: Speed = "normal"): void => {
    onPlay(player.stop);
    player.play(speed);
  };
  return (
    <div className={styles.reference} data-reference="">
      <AudioButtons player={{ ...player, play }} audio={audio} label={false} />
      <div>
        <p className={styles.detail}>{t.format("audio.check.reference")}</p>
        <T as="p" text={text} {...(player.token === undefined ? {} : { highlight: [player.token] })} />
      </div>
    </div>
  );
};
