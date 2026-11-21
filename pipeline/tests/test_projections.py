"""`nabu projections` (ADR 0148): what the statements leave to learn, asked of @nabu/core.

es and chg need no analyzer, so these never skip; NABU_REQUIRE_TOOLS changes nothing here.
"""

from __future__ import annotations

from nabu.compiler import compile_course, load_profiles
from nabu.projections import (
    ReadingReport,
    Report,
    SpellingReport,
    Unaccounted,
    format_report,
    report,
)

from .conftest import ROOT, CoreCli

PROFILES = load_profiles()


def _report(core_cli: CoreCli, course: str) -> Report:
    diags, compiled = compile_course(ROOT / "courses" / course, core_cli, PROFILES, audio=False)
    assert compiled is not None, [d.format() for d in diags.items]
    return report(compiled.content, compiled.orthographies, PROFILES, core_cli)


def test_es_words_with_other_spellings(core_cli: CoreCli) -> None:
    r = _report(core_cli, "es")
    assert [s.orthography for s in r.spelling] == ["es-Latn/standard"]
    assert r.reading == []
    es = r.spelling[0]
    assert 0 < es.with_others < es.words
    for word, others in es.examples:
        assert others
        for other in others:
            assert core_cli.result(
                "sound-compare", profile="es-Latn/standard", expected=word, typed=other
            )["same"]


def test_chg_review_list(core_cli: CoreCli) -> None:
    r = _report(core_cli, "chg")
    # chg-Arab reads no sound off its spelling: only the scheme's relation is reported.
    assert r.spelling == []
    [g] = r.reading
    assert (g.scheme, g.orthography) == ("schluessel", "chg-Arab/standard")
    assert g.tokens > 3000
    assert len(g.unaccounted) / g.tokens < 0.01
    # A scribal pe for b is not stated: it is on the list.
    assert any(u.surface == "پز" and u.reading == "biz" for u in g.unaccounted)


def test_format_escapes_invisibles() -> None:
    zwnj = chr(0x200C)
    r = Report(
        [SpellingReport("fa-Arab/standard", 2, 1, [("صد", ["سد", "ثد"])])],
        [
            ReadingReport(
                "schluessel", "chg-Arab/standard", 5, [Unaccounted("s.1", f"ا{zwnj}ب", "ab")]
            )
        ],
    )
    lines = format_report(r)
    assert lines[0] == "fa-Arab/standard: 1 of 2 words have another spelling of their sound"
    assert lines[1] == "  صد: سد, ثد"
    assert lines[2] == "schluessel of chg-Arab/standard: 4 of 5 readings related to their spellings"
    assert lines[3] == "  s.1: ا\\u200cب ab (projection.unaccounted)"
    assert all(zwnj not in line for line in lines)


def _compiled(core_cli: CoreCli, course: str):
    diags, compiled = compile_course(ROOT / "courses" / course, core_cli, PROFILES, audio=False)
    assert compiled is not None, [d.format() for d in diags.items]
    return diags, compiled


def test_es_lexemes_carry_their_spelling_leftovers(core_cli: CoreCli) -> None:
    _, compiled = _compiled(core_cli, "es")
    by_id = {str(lx.id): lx for lx in compiled.lexicon.lexemes}
    casa = by_id["lexeme:casa"]
    assert casa.leftovers is not None and casa.leftovers.spelling is not None
    assert [str(o) for o in casa.leftovers.spelling] == ["es-Latn/standard"]
    assert casa.leftovers.reading is None
    # A word every letter of which says itself has none (mi: m and i).
    assert by_id["lexeme:mi"].leftovers is None
    with_spelling = [lx for lx in compiled.lexicon.lexemes if lx.leftovers is not None]
    assert 0 < len(with_spelling) < len(compiled.lexicon.lexemes)


def test_chg_lexemes_carry_their_reading_leftovers_and_the_review_list(core_cli: CoreCli) -> None:
    diags, compiled = _compiled(core_cli, "chg")
    opened = [
        lx
        for lx in compiled.lexicon.lexemes
        if lx.leftovers is not None
        and lx.leftovers.reading is not None
        and any(str(r.scheme) == "schluessel" for r in lx.leftovers.reading)
    ]
    assert len(opened) > 100
    assert all(
        lx.leftovers is None or lx.leftovers.spelling is None for lx in compiled.lexicon.lexemes
    )
    # The review list is a warning: the course still builds.
    listed = [d for d in diags.items if d.lint == "projection.unaccounted"]
    assert listed and all(d.severity == "warning" for d in listed)
    assert any("'پز'" in d.message for d in listed)
