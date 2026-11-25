"""A category whose lexical forms are stems (language.yaml `stemmed`; docs/rules/bar.md): the lemma
check (`form.projection`, nabu.forms.check) realises a stem's citation cell through @nabu/core, as
it does a radical form's, where a string form is otherwise spelled as it is. On bar's own lexicon:
its verbs are stems."""

from __future__ import annotations

from nabu.compiler import load_profiles
from nabu.forms import check
from nabu.lexicon import load_language

from .conftest import ROOT, CoreCli

ORTH = "bar-Latn/moser"


def test_a_stem_is_checked_through_its_citation_cell(core_cli: CoreCli) -> None:
    lang, errors = load_language(ROOT / "lexicons", "bar")
    assert lang is not None, errors
    report = check(lang, [ORTH], load_profiles(), {}, core_cli)
    entries = {e.lexeme: e for e in report.entries}
    assert report.problems == []
    # The stem red; its lemma redn as the rules give it (rule:bar-infinitive).
    redn = entries["lexeme:redn"]
    assert (redn.kind, redn.form) == ("stem", "red")
    checks = [(c.spelling, c.expected, c.found) for c in redn.checks]
    assert checks == [("redn", "redn", "spelling")]
    # A rewrite on the way (-en after a nasal), and a listed infinitive (gian).
    assert [c.spelling for c in entries["lexeme:kemmen"].checks] == ["kemmen"]
    assert [c.spelling for c in entries["lexeme:gian"].checks] == ["gian"]
    # A category not declared stemmed: its form is its lemma, spelled as it is.
    kind = entries["lexeme:kind"]
    assert (kind.kind, [c.spelling for c in kind.checks]) == ("string", ["Kind"])
    # An allomorph is still checked against its own spellings (none pinned: nothing to compare).
    der = [(c.allomorph, c.spelling) for c in entries["lexeme:der"].checks]
    assert der == [(None, "der"), (0, "n")]
    assert report.counts()["mismatched"] == 0
