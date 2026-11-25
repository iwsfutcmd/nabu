/**
 * The rules explorer (debug mode): pick a lexeme of the course's language as the base, set the values
 * of its cell, write other lexemes onto it before or after it (a prefix, a clitic, a suffix: as a token
 * lists them) and see, as it changes, what the language's rules give (kept in view at the top while the
 * controls below it change): the lexical form with its
 * boundaries, its status, every rule and branch taken, and its spelling in each of the course's
 * orthographies and marked layers, with the free alternatives. Below it, how the course's own tokens
 * write the base, each with the rules' verdict as the compiler's token check gives it (a way loads into
 * the explorer), and the base's paradigm over the cells the course lists (a cell loads too).
 *
 * A lexeme is picked from the lexicon browsed (the base) or searched (one to add, the next word), each
 * list narrowed by the Data page's lexicon facets: part of speech, free or bound, taught or not,
 * features, the keys an entry stores or lacks.
 *
 * Everything shown is laid out in core (`rulesExplorer`, `explore`, `waysOf`, `explorerParadigm`) from
 * the lexicon's own files, which the page passes in; ids, features, rules and branches are code, left
 * to right; every text goes through <T> in its own language and direction. The search fields follow
 * what is typed only once an IME has committed it. Nothing here is recorded.
 */
import {
  dataMatcher,
  explore,
  EXPLORE_DEFAULTS,
  explorerParadigm,
  lexiconFacets,
  lexiconFilter,
  rulesExplorer,
  waysOf,
  type CourseView,
  type Explored,
  type ExploreRequest,
  type ExplorerLexeme,
  type ExplorerProblem,
  type ExplorerWay,
  type LexiconFilter,
  type LexiconSource,
  type RulesExplorer as Explorer,
  type Attached,
} from "@nabu/core/lesson";
import type { UdFeatures } from "@nabu/schema";
import { useId, useMemo, useState, type JSX } from "react";
import { Button, Checkbox, Input, Label, Radio, RadioGroup, SearchField } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { CheckIcon } from "../icons.tsx";
import { LexiconFilters } from "./LexiconFilters.tsx";
import { T } from "../T.tsx";
import list from "../words/Words.module.css";
import data from "./Data.module.css";
import styles from "./RulesExplorer.module.css";

export interface RulesExplorerProps {
  readonly course: CourseView;
  /** The lexicon's own files with the course's profiles; null: they are not beside the app; undefined: still being read. */
  readonly source: LexiconSource | null | undefined;
  /** What is being explored: none until a base is picked. */
  readonly request: ExploreRequest | undefined;
  /** Told each change: the page keeps it in its address. */
  readonly onRequest: (request: ExploreRequest | undefined) => void;
  /** Reads the files again (after an edit to the rules), where the page can. */
  readonly onReload?: (() => void) | undefined;
}

type Translator = ReturnType<typeof useTranslator>;

/** Lexemes listed at first, and added by each "Show more". */
const PAGE = 40;

const STATUS_MESSAGES = { given: "rules.status.given", pinned: "rules.status.pinned", listed: "rules.status.listed" } as const;

const ERROR_MESSAGES = {
  "unknown-lexeme": "rules.error.unknown-lexeme",
  "no-rule": "rules.error.no-rule",
  tie: "rules.error.tie",
  template: "rules.error.template",
  form: "rules.error.form",
  "spelled-only": "rules.error.spelled-only",
  "not-ready": "rules.error.not-ready",
} as const;

const VERDICT_MESSAGES = {
  spelling: "rules.verdict.spelling",
  alternative: "rules.verdict.alternative",
  variant: "rules.verdict.variant",
  differs: "rules.verdict.differs",
  unspelled: "rules.verdict.unspelled",
  error: "rules.verdict.error",
} as const;

const OPTION_MESSAGES = { blocking: "rules.option.blocking", pinned: "rules.option.pinned", spellings: "rules.option.spellings" } as const;

const Code = ({ value, ...marks }: { value: string; "data-rule-step"?: string }): JSX.Element => (
  <code className={data.code} {...marks}>
    {value}
  </code>
);

/** A lexeme as a line: its lemma, its gloss, its id and tags as code. */
const LexemeLine = ({ lexeme }: { lexeme: ExplorerLexeme }): JSX.Element => (
  <span className={styles.lexeme}>
    {lexeme.row.form !== undefined && <T className={styles.lemma} text={lexeme.row.form} />}
    {lexeme.row.gloss !== undefined && <T className={list.gloss} text={lexeme.row.gloss} />}
    <Code value={lexeme.row.id.id} />
    {lexeme.row.tags.map((tag) => (
      <Code key={tag} value={tag} />
    ))}
  </span>
);

/**
 * A lexeme to pick: the lexicon browsed, a page at a time, narrowed by a search (letters, meaning or id:
 * `dataMatcher`) and by the facets the Data page's Lexicon view reads off the lexicon (part of speech,
 * free or bound, taught or not, features, the keys an entry stores or lacks: `lexiconFacets`), each
 * lexeme a button that picks it. `browse`: the list shows before anything is typed or chosen (the
 * base); else only once something is (a lexeme to add, the next word).
 */
const LexemePicker = ({ t, explorer, label, field, browse, onPick }: { t: Translator; explorer: Explorer; label: string; field: string; browse: boolean; onPick: (lexeme: ExplorerLexeme) => void }): JSX.Element => {
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState<LexiconFilter>({});
  const [pages, setPages] = useState(1);
  const listId = useId();
  const rows = useMemo(() => explorer.lexemes.map((l) => l.row), [explorer]);
  const searched = useMemo(() => {
    if (query.trim() === "") return explorer.lexemes;
    const matches = dataMatcher(explorer.course, query).lexicon;
    return explorer.lexemes.filter((l) => matches(l.row));
  }, [explorer, query]);
  const facets = useMemo(() => lexiconFacets(rows, searched.map((l) => l.row), filter), [rows, searched, filter]);
  const found = useMemo(() => {
    const passes = lexiconFilter(filter);
    return searched.filter((l) => passes(l.row));
  }, [searched, filter]);
  const filtered = Object.values(filter).some((values) => values.length > 0);
  const listing = browse || query.trim() !== "" || filtered;
  const shown = listing ? found.slice(0, pages * PAGE) : [];
  const search = (value: string): void => {
    setQuery(value);
    setPages(1);
  };
  return (
    <div className={styles.picker} data-picker={field}>
      <SearchField
        className={list.search}
        value={typed}
        onChange={(v) => {
          setTyped(v);
          if (!composing) search(v);
        }}
        onClear={() => search("")}
      >
        <Label className={list.label}>{label}</Label>
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
          data-field={field}
        />
      </SearchField>
      <LexiconFilters
        facets={facets}
        filter={filter}
        onChange={(next) => {
          setFilter(next);
          setPages(1);
        }}
      />
      <div id={listId}>
        {listing && (
          <p className={list.count} role="status" data-rules-found={found.length}>
            {t.format("data.found", { count: found.length, total: rows.length })}
          </p>
        )}
        {listing && found.length === 0 && <p className={list.muted}>{t.format("rules.pick.none")}</p>}
        {shown.length > 0 && (
          <ul className={styles.matches}>
            {shown.map((l) => (
              <li key={l.row.id.id}>
                <Button
                  className={styles.match}
                  onPress={() => {
                    onPick(l);
                    setTyped("");
                    search("");
                  }}
                  data-pick={l.row.id.id}
                >
                  <LexemeLine lexeme={l} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {found.length > shown.length && shown.length > 0 && (
          <Button className={data.more} onPress={() => setPages((n) => n + 1)} data-action="rules-more">
            {t.format("data.more", { count: found.length - shown.length })}
          </Button>
        )}
      </div>
    </div>
  );
};

const Problem = ({ t, problem }: { t: Translator; problem: ExplorerProblem }): JSX.Element => (
  <div className={data.notice} role="note" data-rules-problem={problem.kind}>
    <p className={styles.flat}>
      {problem.kind === "no-notation"
        ? t.format("rules.problem.no-notation")
        : problem.kind === "language"
          ? t.format("rules.problem.language")
          : t.format("rules.problem.spell", { orthography: problem.layer === undefined ? problem.orthography : `${problem.orthography}#${problem.layer}` })}
    </p>
    {problem.kind !== "no-notation" && (
      <ul className={styles.errors}>
        {problem.errors.map((e, i) => (
          <li key={i}>
            <Code value={e} />
          </li>
        ))}
      </ul>
    )}
  </div>
);

/** What the rules give, or what went wrong. */
const Result = ({ t, result }: { t: Translator; result: Explored }): JSX.Element => {
  if (!result.ok)
    return (
      <div className={styles.result} data-rules-result="error" data-error={result.error.kind}>
        <p className={styles.flat}>{t.format(ERROR_MESSAGES[result.error.kind])}</p>
        {result.error.details.length > 0 && (
          <p className={data.meta}>
            {result.error.details.map((d) => (
              <Code key={d.key} value={`${d.key}: ${d.value}`} />
            ))}
          </p>
        )}
      </div>
    );
  return (
    <div className={styles.result} data-rules-result="ok" data-status={result.status}>
      <p className={data.meta}>
        <span className={data.badge}>{t.format(STATUS_MESSAGES[result.status])}</span>
        {result.listed !== undefined && <Code value={result.listed} />}
      </p>
      <div className={styles.pair}>
        <span className={list.muted}>{t.format("rules.form")}</span>
        <span data-rules-form="">
          <T className={styles.form} text={result.form} />
        </span>
      </div>
      <div className={styles.pair}>
        <span className={list.muted}>{t.format("rules.steps")}</span>
        {result.steps.length === 0 ? (
          <span className={list.muted}>{t.format("rules.steps.none")}</span>
        ) : (
          <ol className={styles.steps}>
            {result.steps.map((s, i) => (
              <li key={i} className={styles.step}>
                <Code value={s.branch === undefined ? s.rule : `${s.rule}|${s.branch}`} data-rule-step="" />
                {s.gloss !== undefined && <T className={list.muted} text={s.gloss} />}
              </li>
            ))}
          </ol>
        )}
      </div>
      <ul className={styles.spellings} aria-label={t.format("rules.spellings")}>
        {result.spellings.map((s) => (
          <li key={s.layer === undefined ? s.orthography : `${s.orthography}#${s.layer}`} className={styles.spelling} data-spelled={s.orthography} data-layer={s.layer}>
            <Code value={s.layer === undefined ? s.orthography : `${s.orthography}#${s.layer}`} />
            {s.spelling === undefined ? (
              <span className={list.muted}>{t.format(s.spells ? "rules.spelling.failed" : "rules.spelling.none")}</span>
            ) : (
              <span data-spelling="">
                <T className={styles.spelled} text={s.spelling} />
              </span>
            )}
            {s.alternatives.length > 0 && (
              <span className={styles.alternatives} aria-label={t.format("rules.alternatives")}>
                {s.alternatives.map((a, i) => (
                  <span key={i} className={styles.alternative} data-alternative="">
                    <T text={a.spelling} />
                    {a.by.map((v) => (
                      <Code key={v} value={v} />
                    ))}
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      {result.variants.length > 0 && (
        <div className={styles.pair} data-variants={result.variants.length}>
          <span className={list.muted}>{t.format("rules.variants")}</span>
          <ul className={styles.steps}>
            {result.variants.map((v, i) => (
              <li key={i} className={styles.step} data-variant="">
                <T className={styles.spelled} text={v.form} />
                {v.spellings.map((s, k) => (s.spelling === undefined ? null : <T key={k} className={list.muted} text={s.spelling} />))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/** A cell's values: each feature a row of radios, "none" leaving it out. */
const Cell = ({ t, features, feats, onChange }: { t: Translator; features: ExplorerLexeme["features"]; feats: UdFeatures; onChange: (feats: UdFeatures) => void }): JSX.Element => (
  <>
    {features.map(({ feature, values }) => (
      <RadioGroup
        key={feature}
        className={styles.feature}
        value={feats[feature] ?? ""}
        onChange={(v) => {
          const next = { ...feats };
          if (v === "") delete next[feature];
          else next[feature] = v;
          onChange(next);
        }}
        orientation="horizontal"
        data-feature={feature}
      >
        <Label className={styles.featureName}>
          <Code value={feature} />
        </Label>
        <div className={list.radios}>
          <Radio className={list.radio} value="" data-value="">
            {t.format("rules.feature.unset")}
          </Radio>
          {values.map((v) => (
            <Radio key={v} className={list.radio} value={v} data-value={v}>
              <span className={data.chipCode}>{v}</span>
            </Radio>
          ))}
        </div>
      </RadioGroup>
    ))}
  </>
);

/** The lexemes written before or after the base, each movable and removable, each with the values the token gives it where its category has any. */
const Around = ({ t, explorer, items, side, onChange }: { t: Translator; explorer: Explorer; items: readonly Attached[]; side: "before" | "after"; onChange: (items: readonly Attached[]) => void }): JSX.Element => {
  const byId = new Map(explorer.lexemes.map((l) => [l.row.id.id, l]));
  const move = (i: number, by: number): void => {
    const next = [...items];
    const [taken] = next.splice(i, 1);
    if (taken !== undefined) next.splice(i + by, 0, taken);
    onChange(next);
  };
  return (
    <div className={styles.pair} data-around={side}>
      <span className={list.muted}>{t.format(side === "before" ? "rules.before" : "rules.after")}</span>
      {items.length === 0 ? (
        <span className={list.muted}>{t.format("rules.around.none")}</span>
      ) : (
        <ol className={styles.around}>
          {items.map((item, i) => {
            const lexeme = byId.get(item.lexeme);
            return (
              <li key={`${item.lexeme}-${String(i)}`} className={styles.attachedItem} data-attached={item.lexeme}>
                <span className={styles.attached}>
                  {lexeme === undefined ? <Code value={item.lexeme} /> : <LexemeLine lexeme={lexeme} />}
                  <span className={styles.actions}>
                    <Button className={list.partsToggle} isDisabled={i === 0} onPress={() => move(i, -1)} data-action="rules-earlier">
                      {t.format("rules.move.earlier")}
                    </Button>
                    <Button className={list.partsToggle} isDisabled={i === items.length - 1} onPress={() => move(i, 1)} data-action="rules-later">
                      {t.format("rules.move.later")}
                    </Button>
                    <Button className={list.partsToggle} onPress={() => onChange(items.filter((_, k) => k !== i))} data-action="rules-remove">
                      {t.format("rules.remove")}
                    </Button>
                  </span>
                </span>
                {lexeme !== undefined && lexeme.features.length > 0 && (
                  <Cell
                    t={t}
                    features={lexeme.features}
                    feats={item.feats ?? {}}
                    onChange={(feats) => onChange(items.map((x, k) => (k === i ? (Object.keys(feats).length === 0 ? { lexeme: x.lexeme } : { lexeme: x.lexeme, feats }) : x)))}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

const Way = ({ t, way, onExplore }: { t: Translator; way: ExplorerWay; onExplore: () => void }): JSX.Element => (
  <li className={styles.way} data-way={way.orthography} data-verdict={way.verdict}>
    <T className={styles.spelled} text={way.text} />
    <Code value={way.orthography} />
    <span className={data.badge}>{t.format(VERDICT_MESSAGES[way.verdict])}</span>
    {way.verdict === "differs" && way.spelled !== undefined && <T className={list.muted} text={way.spelled} />}
    <span className={list.muted}>{t.format("rules.way.items", { count: way.items.length })}</span>
    <Code value={way.items[0] ?? ""} />
    <Button className={list.partsToggle} onPress={onExplore} data-action="rules-explore-way">
      {t.format("rules.way.explore")}
    </Button>
  </li>
);

export const RulesExplorer = ({ course, source, request, onRequest, onReload }: RulesExplorerProps): JSX.Element => {
  const t = useTranslator();
  const explorer = useMemo(() => (source === null || source === undefined ? undefined : rulesExplorer(course, source)), [course, source]);
  const [side, setSide] = useState<"before" | "after">("after");
  const base = explorer === undefined || request === undefined ? undefined : explorer.lexemes.find((l) => l.row.id.id === request.base);
  const result = useMemo(() => (explorer === undefined || request === undefined ? undefined : explore(explorer, request)), [explorer, request]);
  const ways = useMemo(() => (explorer === undefined || base === undefined ? [] : waysOf(explorer, base.row.id.id)), [explorer, base]);
  const options = request === undefined ? EXPLORE_DEFAULTS : { blocking: request.blocking, pinned: request.pinned, spellings: request.spellings };
  const cells = useMemo(() => (explorer === undefined || base === undefined ? [] : explorerParadigm(explorer, base, options)), [explorer, base, options.blocking, options.pinned, options.spellings]);
  const nextLexeme = explorer === undefined || request?.next === undefined ? undefined : explorer.lexemes.find((l) => l.row.id.id === request.next);
  const change = (patch: Partial<ExploreRequest>): void => {
    if (request !== undefined) onRequest({ ...request, ...patch });
  };

  return (
    <div className={styles.explorer} data-rules-explorer={course.id}>
      <p className={list.muted}>{t.format("rules.intro")}</p>
      {onReload !== undefined && (
        <p>
          <Button className={list.partsToggle} onPress={onReload} data-action="rules-reload">
            {t.format("rules.reload")}
          </Button>
        </p>
      )}
      {source === undefined && (
        <p className={list.muted} role="status">
          {t.format("rules.loading")}
        </p>
      )}
      {source === null && (
        <p className={data.notice} role="note" data-rules-missing="">
          {t.format("rules.missing")}
        </p>
      )}
      {explorer !== undefined && (
        <>
          {explorer.problems.map((p, i) => (
            <Problem key={i} t={t} problem={p} />
          ))}
          <section className={styles.part} aria-labelledby="rules-base">
            <h2 className={data.partTitle} id="rules-base">
              {t.format("rules.base")}
            </h2>
            {base === undefined ? (
              <LexemePicker t={t} explorer={explorer} label={t.format("rules.search")} field="rules-base" browse onPick={(l) => onRequest({ base: l.row.id.id, feats: {}, before: [], after: [], ...EXPLORE_DEFAULTS })} />
            ) : (
              <div className={styles.chosen} data-base={base.row.id.id}>
                <LexemeLine lexeme={base} />
                <Button className={list.partsToggle} onPress={() => onRequest(undefined)} data-action="rules-change-base">
                  {t.format("rules.change")}
                </Button>
              </div>
            )}
          </section>
          {base !== undefined && request !== undefined && (
            <>
              {/* It scrolls within itself where it is long: focusable, so a keyboard can scroll it. */}
              <section className={`${styles.part} ${styles.live}`} aria-labelledby="rules-result" aria-live="polite" tabIndex={0} data-rules-live="">
                <h2 className={data.partTitle} id="rules-result">
                  {t.format("rules.result")}
                </h2>
                {result !== undefined && <Result t={t} result={result} />}
              </section>
              <section className={styles.part} aria-labelledby="rules-cell">
                <h2 className={data.partTitle} id="rules-cell">
                  {t.format("rules.features")}
                </h2>
                {base.features.length === 0 && <p className={list.muted}>{t.format("rules.features.none")}</p>}
                <Cell t={t} features={base.features} feats={request.feats} onChange={(feats) => change({ feats })} />
              </section>
              <section className={styles.part} aria-labelledby="rules-around">
                <h2 className={data.partTitle} id="rules-around">
                  {t.format("rules.around")}
                </h2>
                <Around t={t} explorer={explorer} items={request.before} side="before" onChange={(before) => change({ before })} />
                <Around t={t} explorer={explorer} items={request.after} side="after" onChange={(after) => change({ after })} />
                <RadioGroup className={styles.feature} value={side} onChange={(v) => setSide(v === "before" ? "before" : "after")} orientation="horizontal" data-add-side={side}>
                  <Label className={list.label}>{t.format("rules.add.side")}</Label>
                  <div className={list.radios}>
                    <Radio className={list.radio} value="before">
                      {t.format("rules.before")}
                    </Radio>
                    <Radio className={list.radio} value="after">
                      {t.format("rules.after")}
                    </Radio>
                  </div>
                </RadioGroup>
                <LexemePicker
                  t={t}
                  explorer={explorer}
                  label={t.format("rules.add")}
                  field="rules-add"
                  browse={false}
                  onPick={(l) => change(side === "before" ? { before: [...request.before, { lexeme: l.row.id.id }] } : { after: [...request.after, { lexeme: l.row.id.id }] })}
                />
                <div className={styles.pair} data-next={request.next ?? ""}>
                  <span className={list.muted}>{t.format("rules.next")}</span>
                  {request.next === undefined ? (
                    <span className={list.muted}>{t.format("rules.next.none")}</span>
                  ) : (
                    <span className={styles.attached}>
                      {nextLexeme === undefined ? <Code value={request.next} /> : <LexemeLine lexeme={nextLexeme} />}
                      <Button
                        className={list.partsToggle}
                        onPress={() => {
                          const { next: _gone, ...rest } = request;
                          onRequest(rest);
                        }}
                        data-action="rules-next-clear"
                      >
                        {t.format("rules.remove")}
                      </Button>
                    </span>
                  )}
                </div>
                <LexemePicker t={t} explorer={explorer} label={t.format("rules.next.pick")} field="rules-next" browse={false} onPick={(l) => change({ next: l.row.id.id })} />
              </section>
              <section className={styles.part} aria-labelledby="rules-options">
                <h2 className={data.partTitle} id="rules-options">
                  {t.format("rules.options")}
                </h2>
                <div className={data.chips}>
                  {(["blocking", "pinned", "spellings"] as const).map((option) => (
                    <Checkbox key={option} className={data.chip} isSelected={request[option]} onChange={(on) => change({ [option]: on })} data-option={option}>
                      {({ isSelected }) => (
                        <>
                          <span className={data.box} aria-hidden="true">
                            {isSelected && <CheckIcon size={14} />}
                          </span>
                          <span>{t.format(OPTION_MESSAGES[option])}</span>
                        </>
                      )}
                    </Checkbox>
                  ))}
                </div>
              </section>
              <section className={styles.part} aria-labelledby="rules-ways">
                <h2 className={data.partTitle} id="rules-ways">
                  {t.format("rules.ways")}
                </h2>
                {ways.length === 0 ? (
                  <p className={list.muted}>{t.format("rules.ways.none")}</p>
                ) : (
                  <ul className={styles.ways}>
                    {ways.map((w, i) => (
                      <Way key={i} t={t} way={w} onExplore={() => onRequest(w.request)} />
                    ))}
                  </ul>
                )}
              </section>
              <section className={styles.part} aria-labelledby="rules-paradigm">
                <h2 className={data.partTitle} id="rules-paradigm">
                  {t.format("rules.paradigm")}
                </h2>
                {cells.length === 0 ? (
                  <p className={list.muted}>{t.format("rules.paradigm.none")}</p>
                ) : (
                  <ul className={styles.cells}>
                    <li className={styles.cell} aria-hidden="true">
                      <span className={list.muted}>{t.format("rules.paradigm.cell")}</span>
                      {explorer.orthographies.map((o) => (
                        <Code key={o.layer === undefined ? o.orthography : `${o.orthography}#${o.layer}`} value={o.layer === undefined ? o.orthography : `${o.orthography}#${o.layer}`} />
                      ))}
                    </li>
                    {cells.map((c) => (
                      <li key={c.cell} className={styles.cell} data-cell={c.cell} data-ok={c.result.ok ? "" : undefined}>
                        <Button className={styles.cellButton} onPress={() => change({ feats: c.feats })} data-action="rules-explore-cell">
                          <Code value={c.cell} />
                        </Button>
                        {c.result.ok ? (
                          c.result.spellings.map((s, i) =>
                            s.spelling === undefined ? (
                              <span key={i} className={list.muted}>
                                {t.format("rules.spelling.none.short")}
                              </span>
                            ) : (
                              <T key={i} className={styles.spelled} text={s.spelling} />
                            ),
                          )
                        ) : (
                          <span className={list.muted}>{t.format(ERROR_MESSAGES[c.result.error.kind])}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};
