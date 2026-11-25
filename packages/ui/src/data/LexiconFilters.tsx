/**
 * The Lexicon view's filters (debug mode): the facets core reads off the lexicon (`lexiconFacets`),
 * each a group of checkboxes with how many lexemes each value would show, and how its chosen values
 * combine (any one of them, or every one). Values are what the lexicon writes (UD tags, feature values,
 * an entry's keys: code, left to right) or, for the facets core fixes (free or bound, what the course
 * does with a lexeme), named in the interface's language. A value no lexeme the search finds has, and
 * not chosen, is left out. Closed until opened, unless something is chosen.
 */
import type { FacetValues, LexiconFacet, LexiconFilter } from "@nabu/core/lesson";
import type { JSX } from "react";
import { Button, Checkbox, CheckboxGroup, Disclosure, DisclosurePanel, Label, Text } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { CheckIcon, ExpandIcon } from "../icons.tsx";
import list from "../words/Words.module.css";
import styles from "./Data.module.css";

const FACET_MESSAGES = {
  pos: "data.lexicon.facet.pos",
  class: "data.lexicon.facet.class",
  kind: "data.lexicon.facet.kind",
  course: "data.lexicon.facet.course",
  feature: "data.lexicon.facet.feature",
  has: "data.lexicon.facet.has",
  lacks: "data.lexicon.facet.lacks",
} as const satisfies Readonly<Record<LexiconFacet, string>>;

/** The values core fixes, named; every other value is the lexicon's own, shown as code. */
const VALUE_MESSAGES: Partial<Readonly<Record<LexiconFacet, Readonly<Record<string, "data.lexicon.kind.free" | "data.lexicon.kind.bound" | "data.lexicon.course.taught" | "data.lexicon.course.untaught" | "data.lexicon.course.file">>>>> = {
  kind: { free: "data.lexicon.kind.free", bound: "data.lexicon.kind.bound" },
  course: { taught: "data.lexicon.course.taught", untaught: "data.lexicon.course.untaught", file: "data.lexicon.course.file" },
};

export interface LexiconFiltersProps {
  readonly facets: readonly FacetValues[];
  readonly filter: LexiconFilter;
  readonly onChange: (filter: LexiconFilter) => void;
}

export const LexiconFilters = ({ facets, filter, onChange }: LexiconFiltersProps): JSX.Element => {
  const t = useTranslator();
  const number = new Intl.NumberFormat(t.formattingLocale);
  const chosen = Object.values(filter).reduce((n, values) => n + values.length, 0);
  const offered = facets.map((f) => ({ ...f, values: f.values.filter((v) => v.chosen || v.count > 0) })).filter((f) => f.values.length > 0);
  return (
    <Disclosure className={styles.filters} defaultExpanded={chosen > 0} data-lexicon-filters="">
      {({ isExpanded }) => (
        <>
          <div className={styles.filterBar}>
            <Button slot="trigger" className={list.partsToggle} data-action="lexicon-filter">
              <span>{t.format("data.lexicon.filter")}</span>
              <ExpandIcon size={16} open={isExpanded} />
            </Button>
            {chosen > 0 && (
              <>
                <span className={list.muted} data-filter-chosen={chosen}>
                  {t.format("data.lexicon.filter.chosen", { count: chosen })}
                </span>
                <Button className={list.partsToggle} onPress={() => onChange({})} data-action="lexicon-filter-clear">
                  {t.format("data.lexicon.filter.clear")}
                </Button>
              </>
            )}
          </div>
          <DisclosurePanel>
            <div className={styles.facets}>
              {offered.map(({ facet, combine, values }) => {
                const named = VALUE_MESSAGES[facet];
                return (
                  <CheckboxGroup
                    key={facet}
                    className={styles.facet}
                    value={[...(filter[facet] ?? [])]}
                    onChange={(next) => onChange({ ...filter, [facet]: next })}
                    data-facet={facet}
                    data-combine={combine}
                  >
                    <div className={styles.facetHead}>
                      <Label className={list.label}>{t.format(FACET_MESSAGES[facet])}</Label>
                      <Text slot="description" className={list.muted}>
                        {t.format(combine === "any" ? "data.lexicon.facet.any" : "data.lexicon.facet.all")}
                      </Text>
                    </div>
                    <div className={styles.chips}>
                      {values.map(({ value, count }) => {
                        const message = named?.[value];
                        return (
                          <Checkbox key={value} className={styles.chip} value={value} data-facet-value={value} data-count={count}>
                            {({ isSelected }) => (
                              <>
                                {/* Chosen is a tick in its box, not a colour alone. */}
                                <span className={styles.box} aria-hidden="true">
                                  {isSelected && <CheckIcon size={14} />}
                                </span>
                                {message === undefined ? <span className={styles.chipCode}>{value}</span> : <span>{t.format(message)}</span>}
                                <span className={styles.chipCount}>{number.format(count)}</span>
                              </>
                            )}
                          </Checkbox>
                        );
                      })}
                    </div>
                  </CheckboxGroup>
                );
              })}
            </div>
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
};
