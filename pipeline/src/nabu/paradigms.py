"""The bundle's paradigms (docs/rules-design.md, stage 4; the owner's answer 3: the compiler lists
forms, the device looks them up): for a language with realisation rules, the lexicon's `cells` per
category, each lexeme's `paradigm` (per course orthography, each cell's spelling as its profile's
`spell` writes the realisation, with the marked text where the orthography has a layer that spells),
and `regularised` where realising with blocking off gives another form.

Python never realises or spells: every form comes from @nabu/core through core-cli (`paradigm`,
`spell`), in one batch for the course. What is decided here is only which cells are worth listing:

- a category is listed where the language's rules can say something of it: a realisation rule names
  it (`when.pos`), or names no category and every feature its `when` reads is one of the category's
  dimensions (apc: VERB and AUX by aspect and mood, ADJ and NOUN by name; not PRON or INTJ), or
  every feature its `when.own` reads is one the category has of itself (sk: NOUN and PROPN by
  gender and animacy);
- its cells are those the course's tokens choose on lexemes of that category, cut to its dimensions,
  each value of them taught: a node introduces it, or it is the value of the category's citation or
  bare cell (a singular, a masculine), or the course introduces no value of its feature at all (apc
  teaches no person: a person is given, never a part), or it is one of the feature's `unmarked`
  values (language.yaml: es's Mood Ind, used from the start and never introduced). Then the
  language's principal parts;
- a lexeme the course writes, and never with a value chosen on it, does not inflect (apc's lezem,
  fi, badd): it has no paradigm;
- each lexeme is realised `strict` (a cell no exponent of the rule names, or a phrase, gives
  nothing) with forms that pin spellings only passed over, as the token check does: those are
  stems before a suffix (2al's ق), never words. A cell that sets a lexical feature (language.yaml
  `lexical`) the lexeme has otherwise, and does not choose, is no cell of it (null).
"""

from __future__ import annotations

import json
import unicodedata
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any, cast

from nabu.corecli import CoreCli
from nabu.forms import Site, language_args
from nabu.lexicon import Language
from nabu.schema.models import BundleLexicon, BundleUnit, OrthographyProfile

Feats = dict[str, str]


def cell_key(feats: Mapping[str, str]) -> str:
    """A cell as a form key's feature part (FormKey after `|form:`): Name=Value, sorted, `;`."""
    return ";".join(f"{name}={feats[name]}" for name in sorted(feats))


def _dumped(model: Any) -> dict[str, Any]:
    """A model as its JSON object (aliases, no nulls)."""
    return cast(dict[str, Any], model.model_dump(mode="json", by_alias=True, exclude_none=True))


def _table(value: Any) -> dict[str, Any]:
    return (
        {str(k): v for k, v in cast(dict[Any, Any], value).items()}
        if isinstance(value, dict)
        else {}
    )


def _items(value: Any) -> list[Any]:
    return list(cast(list[Any], value)) if isinstance(value, list) else []


def _feats(value: Any) -> Feats:
    return {k: str(v) for k, v in _table(value).items()}


def _names(value: Any) -> dict[str, list[str]]:
    """A table of lists of names (dimensions, a category's lexical features, a feature's values)."""
    return {k: [str(x) for x in _items(v)] for k, v in _table(value).items()}


def _categories(declared: Mapping[str, Any]) -> list[str]:
    """The categories some realisation rule can say something of."""
    dims = _names(declared.get("dimensions"))
    lexical = _names(declared.get("lexical"))
    out: list[str] = []
    for rule in _items(declared.get("realisation")):
        when = _table(_table(rule).get("when"))
        pos = when.get("pos")
        if pos is not None:
            if str(pos) not in out:
                out.append(str(pos))
            continue
        # A rule that reads the lexeme's own values (`own`: a Slovak noun's gender) speaks of each
        # category that has those features of itself.
        own = set(_table(when.get("own")))
        if own:
            for category, named in lexical.items():
                if own <= set(named) and category not in out:
                    out.append(category)
            continue
        names = set(_table(when.get("feats")))
        if not names:
            continue
        for category, named in dims.items():
            if names <= set(named) and category not in out:
                out.append(category)
    return out


def taught_values(units: Iterable[BundleUnit]) -> set[str]:
    """Each feature value a node of the course introduces, as Name=Value."""
    out: set[str] = set()
    for unit in units:
        for node in unit.nodes:
            for part in node.introduces:
                ident = str(part)
                if ident.startswith("feature:"):
                    out.add(ident.removeprefix("feature:"))
    return out


def _base(written: Sequence[Mapping[str, Any]]) -> Mapping[str, Any] | None:
    return written[0] if len(written) == 1 else next((w for w in written if w.get("base")), None)


def cells_of(
    lang: Language, sites: Iterable[Site], taught: set[str], pos_of: Mapping[str, str]
) -> dict[str, list[Feats]]:
    """The cells worth listing, by category, in the language's order (its dimensions, then each
    feature's values as declared): see the module's docstring."""
    declared = _dumped(lang.declared)
    dims = _names(declared.get("dimensions"))
    values = _names(declared.get("features"))
    citation = {k: _feats(v) for k, v in _table(declared.get("citation")).items()}
    bare = {k: _feats(v) for k, v in _table(declared.get("bare")).items()}
    unmarked = _names(declared.get("unmarked"))
    introduced = {v.split("=", 1)[0] for v in taught}

    def is_taught(category: str, name: str, value: str) -> bool:
        return all(
            f"{name}={v}" in taught
            or name not in introduced
            or citation.get(category, {}).get(name) == v
            or bare.get(category, {}).get(name) == v
            or v in unmarked.get(name, [])
            for v in value.split(",")
        )

    found: dict[str, dict[str, Feats]] = {}
    categories = _categories(declared)

    def add(category: str, feats: Feats) -> None:
        named = dims.get(category, [])
        cell = {k: v for k, v in feats.items() if k in named}
        if not cell or not all(is_taught(category, k, v) for k, v in cell.items()):
            return
        found.setdefault(category, {}).setdefault(cell_key(cell), cell)

    for site in sites:
        base = _base(site.written)
        if base is None:
            continue
        category = pos_of.get(str(base["lexeme"]))
        if category is None or category not in categories:
            continue
        add(category, _feats(base.get("feats")))
    for category, parts in _table(declared.get("principalParts")).items():
        if category in categories:
            for feats in _items(parts):
                add(category, _feats(feats))

    def order(category: str, cell: Feats) -> list[int]:
        return [
            values.get(d, []).index(cell[d])
            if cell.get(d) in values.get(d, [])
            else (99 if d in cell else -1)
            for d in dims.get(category, [])
        ]

    return {
        category: [
            cell
            for _, cell in sorted(
                found[category].items(), key=lambda kv: (order(category, kv[1]), kv[0])
            )
        ]
        for category in categories
        if category in found
    }


@dataclass(frozen=True)
class Refused:
    """A form not shipped: its spelling has characters outside its orthography's script, or begins
    with a joining carrier (`form.spelling-script`)."""

    lexeme: str
    cell: str
    orth: str
    #: `paradigm` or `regularised`.
    where: str
    spelling: str
    outside: list[str]


@dataclass(frozen=True)
class _Where:
    orth: str
    layer: str | None


def _wheres(orth: str, profile: OrthographyProfile | None) -> list[_Where]:
    """Where an orthography spells a realisation: its `spell`, then its layer's (marked text)."""
    if profile is None or profile.spell is None:
        return []
    out = [_Where(orth, None)]
    for layer in profile.annotations or []:
        if layer.spell is not None:
            out.append(_Where(orth, layer.id))
            break
    return out


def _spell_request(where: _Where, notation: Any, form: str) -> dict[str, Any]:
    ask: dict[str, Any] = {"op": "spell", "profile": where.orth, "notation": notation, "form": form}
    if where.layer is not None:
        ask["layer"] = where.layer
    return ask


def _key(request: Mapping[str, Any]) -> str:
    return json.dumps(request, sort_keys=True, ensure_ascii=False)


def _realised(result: Any) -> tuple[str | None, bool]:
    """A paradigm cell's answer: its lexical form (None where the rules give none) and whether any
    rule was taken (a citation form takes none)."""
    r = _table(_table(result).get("result"))
    if not r.get("ok"):
        return None, False
    value = _table(r.get("value"))
    return str(value.get("form")), bool(_items(value.get("steps")))


def in_script(
    entry: str | list[str] | None,
    orth: str,
    lexeme: str,
    cell: str,
    where: str,
    outside: Callable[[str, str, bool], list[str]] | None,
    refused: list[Refused] | None,
) -> bool:
    """Whether a form's spelling and marked text are in its orthography's script; one that is
    not is added to `refused`."""
    if entry is None or outside is None:
        return True
    texts = [entry] if isinstance(entry, str) else entry
    # A modifier letter that joins (the tatweel) is a carrier of the lexical notation, never a
    # word's first character: a spelling that begins with one is a realisation that went wrong,
    # though it is in the script.
    leading = {t[0] for t in texts if t and unicodedata.category(t[0]) == "Lm"}
    bad = sorted({c for i, t in enumerate(texts) for c in outside(orth, t, i > 0)} | leading)
    if bad and refused is not None:
        refused.append(Refused(lexeme, cell, orth, where, texts[0], bad))
    return not bad


def paradigms(
    lexicon: BundleLexicon,
    lang: Language,
    sites: Iterable[Site],
    units: Iterable[BundleUnit],
    orthographies: Iterable[str],
    profiles: Mapping[str, OrthographyProfile],
    cli: CoreCli,
    outside: Callable[[str, str, bool], list[str]] | None = None,
    refused: list[Refused] | None = None,
) -> BundleLexicon:
    """The lexicon with its `cells` and `principalParts`, and each lexeme's `paradigm` and
    `regularised`. Unchanged for a language with no realisation rules, or a course whose tokens
    choose no cell worth listing. A form whose spelling (or marked text) has characters outside
    its orthography's script (`outside(orthography, text, marked)`: the script audit's test) is
    not shipped: null in the paradigm, left out of `regularised`, and added to `refused`."""
    declared = _dumped(lang.declared)
    notation = declared.get("notation")
    if not _items(declared.get("realisation")) or notation is None:
        return lexicon
    pos_of = {str(lx.id): str(lx.pos) for lx in lexicon.lexemes if lx.pos is not None}
    sites = list(sites)
    cells = cells_of(lang, sites, taught_values(units), pos_of)
    # A lexeme the course writes, and never with a value chosen, is a word of its category that
    # does not inflect (apc's lezem, fi, badd: the rules would conjugate them): no paradigm.
    chosen: dict[str, bool] = {}
    for site in sites:
        base = _base(site.written)
        if base is not None:
            ident = str(base["lexeme"])
            chosen[ident] = chosen.get(ident, False) or bool(base.get("feats"))
    wheres = [w for o in orthographies for w in _wheres(o, profiles.get(o))]
    if not cells or not wheres:
        return lexicon
    source = language_args(lang)
    lexical = _names(declared.get("lexical"))

    # One question per lexeme and blocking: its category's cells, realised.
    asked = [
        lx
        for lx in lexicon.lexemes
        if lx.pos is not None and str(lx.pos) in cells and chosen.get(str(lx.id), True)
    ]
    requests: list[dict[str, Any]] = []
    for lx in asked:
        for blocking in (True, False):
            request: dict[str, Any] = {
                "op": "paradigm",
                **source,
                "lexeme": str(lx.id),
                "cells": cells[str(lx.pos)],
                "spellings": False,
                "strict": True,
            }
            if not blocking:
                request["blocking"] = False
            requests.append(request)
    answers = iter(cli.batch(requests))
    realised: dict[str, tuple[list[tuple[str | None, bool]], list[tuple[str | None, bool]]]] = {}
    for lx in asked:
        on, off = _items(next(answers)), _items(next(answers))
        realised[str(lx.id)] = ([_realised(r) for r in on], [_realised(r) for r in off])

    # A cell no rule gives any lexeme (only citation forms stand in it: a noun's singular, a
    # plural-only noun's plural) says nothing the lexicon does not: kept only as the category's
    # citation cell beside cells the rules do give.
    kept: dict[str, list[int]] = {}
    for category, listed in cells.items():
        ruled = [
            any(realised[str(lx.id)][0][k][1] for lx in asked if str(lx.pos) == category)
            for k in range(len(listed))
        ]
        if any(ruled):
            cited = _feats(_table(declared.get("citation")).get(category))
            kept[category] = [
                k
                for k, cell in enumerate(listed)
                if ruled[k] or (cited and all(cited.get(n) == v for n, v in cell.items()))
            ]
    cells = {category: [cells[category][k] for k in ks] for category, ks in kept.items()}
    if not cells:
        return lexicon

    # Each lexeme's forms, cell by cell, with and without blocking; each spelled once.
    forms: dict[str, tuple[list[str | None], list[str | None]]] = {}
    asks: dict[str, dict[str, Any]] = {}
    for lx in asked:
        ident = str(lx.id)
        category = str(lx.pos)
        if category not in kept:
            continue
        own = _feats(lx.feats)
        chooses = {str(c) for c in (lx.chooses or [])}
        # A cell that sets a lexical feature the lexeme has otherwise, and does not choose.
        conflicts = [
            any(
                name in lexical.get(category, [])
                and name not in chooses
                and own.get(name, value) != value
                for name, value in cell.items()
            )
            for cell in cells[category]
        ]
        on, off = realised[ident]
        given = [None if conflicts[i] else on[k][0] for i, k in enumerate(kept[category])]
        regular = [None if conflicts[i] else off[k][0] for i, k in enumerate(kept[category])]
        forms[ident] = (given, regular)
        for form in [*given, *regular]:
            if form is not None:
                for w in wheres:
                    ask = _spell_request(w, notation, form)
                    asks.setdefault(_key(ask), ask)
    keys = list(asks)
    spelled = dict(zip(keys, cli.batch([asks[k] for k in keys]), strict=True))

    def entry(form: str | None, orth: str) -> str | list[str] | None:
        """A cell's form in an orthography: its spelling, or its spelling and its marked text."""
        if form is None:
            return None
        texts = [
            str(_table(spelled[_key(_spell_request(w, notation, form))]).get("spelling"))
            for w in wheres
            if w.orth == orth
        ]
        return texts[0] if len(texts) == 1 else texts

    orths = list(dict.fromkeys(w.orth for w in wheres))
    lexemes: list[dict[str, Any]] = []
    for lx in lexicon.lexemes:
        ident = str(lx.id)
        data = _dumped(lx)
        if ident in forms:
            given, regular = forms[ident]
            listed = cells[str(lx.pos)]
            paradigm: dict[str, list[str | list[str] | None]] = {}
            regularised: dict[str, dict[str, str | list[str] | None]] = {}
            for orth in orths:
                raw = [entry(f, orth) for f in given]
                row = [
                    e
                    if in_script(e, orth, ident, cell_key(listed[k]), "paradigm", outside, refused)
                    else None
                    for k, e in enumerate(raw)
                ]
                if any(e is not None for e in row):
                    paradigm[orth] = row
                other: dict[str, str | list[str] | None] = {}
                for k, (g, r) in enumerate(zip(given, regular, strict=True)):
                    e = entry(r, orth)
                    cell = cell_key(listed[k])
                    if (
                        r is not None
                        and r != g
                        and e != raw[k]
                        and in_script(e, orth, ident, cell, "regularised", outside, refused)
                    ):
                        other[cell] = e
                if other:
                    regularised[orth] = other
            if paradigm:
                data["paradigm"] = paradigm
            if regularised:
                data["regularised"] = regularised
        lexemes.append(data)
    principal: dict[str, list[str]] = {}
    dims = _names(declared.get("dimensions"))
    for category, parts in _table(declared.get("principalParts")).items():
        listed_keys = {cell_key(c) for c in cells.get(category, [])}
        named = [
            cell_key({k: v for k, v in _feats(p).items() if k in dims.get(category, [])})
            for p in _items(parts)
        ]
        if any(k in listed_keys for k in named):
            principal[category] = [k for k in named if k in listed_keys]
    out = _dumped(lexicon) | {"lexemes": lexemes}
    out["cells"] = {category: [cell_key(c) for c in cs] for category, cs in cells.items()}
    if principal:
        out["principalParts"] = principal
    return BundleLexicon.model_validate(out)
