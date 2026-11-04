"""Phase 2 fixture courses: each builds with no errors, and shows what it is there to show."""

from __future__ import annotations

from collections import Counter
from typing import Any, cast

import pytest

from nabu.analyzers import analyzers_by_tool
from nabu.compiler import Diagnostics, compile_course, load_profiles
from nabu.compiler.build import Compiled
from nabu.drills.rbnf import icu_version

from .conftest import REQUIRE_TOOLS, ROOT, CoreCli

COURSES = ROOT / "courses"
PROFILES = load_profiles()
ANALYZERS = analyzers_by_tool()
ZWNJ = "\u200c"

# Warnings a course is known to raise, by (lint, surface). Anything else is a regression.
# PyCantonese reads the sentence-final particles 呀 and 嗎 as aa4 and maa5;
# the pinned aa3 and maa3 win.
# Pinned readings PyCantonese disagrees with, where the pinned one is the colloquial reading taught:
# the particles 呀/嗎, 名 meng2 (你叫咩名呀), 弟弟 dai4 dai2, 平 peng4 ("cheap").
EXPECTED_WARNINGS = {
    "yue": {
        ("enrich.reading-mismatch", "呀"),
        ("enrich.reading-mismatch", "嗎"),
        ("enrich.reading-mismatch", "名"),
        ("enrich.reading-mismatch", "弟弟"),
        ("enrich.reading-mismatch", "平"),
        # The native-speaker pass (2026-11): demonstrative 呢 is ni1 (PyCantonese: ne1), and the
        # colloquial changed tones of 女兒 ji2, 英文 / 中文 man2.
        ("enrich.reading-mismatch", "中文"),
        ("enrich.reading-mismatch", "女兒"),
        ("enrich.reading-mismatch", "英文"),
        ("enrich.reading-mismatch", "呢件"),
        ("enrich.reading-mismatch", "呢個"),
        ("enrich.reading-mismatch", "呢對"),
        ("enrich.reading-mismatch", "呢度"),
        ("enrich.reading-mismatch", "呢張"),
        ("enrich.reading-mismatch", "呢本"),
        ("enrich.reading-mismatch", "呢杯"),
        ("enrich.reading-mismatch", "呢條"),
        ("enrich.reading-mismatch", "呢碗"),
        ("enrich.reading-mismatch", "呢隻"),
    }
}
TOOLS = {"fa": ["hazm", "icu"], "yue": ["pycantonese", "icu"], "uz": ["icu"], "apc": []}

_cache: dict[str, tuple[Diagnostics, Compiled | None]] = {}


def _missing(course: str) -> list[str]:
    return [
        t for t in TOOLS[course] if (icu_version() is None if t == "icu" else t not in ANALYZERS)
    ]


def build(cli: CoreCli, course: str) -> tuple[Diagnostics, Compiled]:
    missing = _missing(course)
    if missing:
        if REQUIRE_TOOLS:
            pytest.fail(f"{', '.join(missing)} required (NABU_REQUIRE_TOOLS=1)")
        pytest.skip(f"needs {', '.join(missing)}")
    if course not in _cache:
        _cache[course] = compile_course(COURSES / course, cli, PROFILES, ANALYZERS)
    diags, compiled = _cache[course]
    assert compiled is not None, [d.format() for d in diags.items]
    return diags, compiled


def sentences(compiled: Compiled) -> list[dict[str, Any]]:
    return [s for u in compiled.units for s in u["sentences"]]


def surface(diag_message: str) -> str:
    return diag_message.split("'")[1]


@pytest.mark.parametrize("course", sorted(TOOLS))
def test_course_builds_clean(core_cli: CoreCli, course: str) -> None:
    diags, compiled = build(core_cli, course)
    assert diags.errors == []
    warnings = {(d.lint, surface(d.message)) for d in diags.items if d.severity == "warning"}
    assert warnings <= EXPECTED_WARNINGS.get(course, set()), [
        d.format() for d in diags.items if d.severity == "warning"
    ]
    taught = [s for s in sentences(compiled) if not s["id"].startswith("drill.")]
    kcs = {k["id"] for u in compiled.units for k in u["kcs"]}
    assert len(taught) >= 20 and len(kcs) >= 20, (len(taught), len(kcs))


@pytest.mark.parametrize("course", sorted(TOOLS))
def test_sentence_kcs_are_listed_once(core_cli: CoreCli, course: str) -> None:
    """A token whose sense is also its stem morph (talaba-man) brings in one KC, not two."""
    _, compiled = build(core_cli, course)
    for s in sentences(compiled):
        assert not [kc for kc, n in Counter(cast(list[str], s["kcs"])).items() if n > 1], s["id"]


@pytest.mark.parametrize(
    ("course", "orthographies", "convert"),
    [
        ("uz", ["uz-Latn/standard", "uz-Cyrl/standard"], ("uz-Latn/standard", "uz-Cyrl/standard")),
        (
            "apc",
            ["apc-Arab/standard", "apc-Latn/arabizi"],
            ("apc-Arab/standard", "apc-Latn/arabizi"),
        ),
    ],
)
def test_every_sentence_in_both_orthographies_with_a_script_track(
    core_cli: CoreCli, course: str, orthographies: list[str], convert: tuple[str, str]
) -> None:
    _, compiled = build(core_cli, course)
    assert compiled.orthographies == orthographies
    for s in sentences(compiled):
        assert sorted(s["forms"]) == sorted(orthographies), s["id"]
        assert all("reverse" in f for f in s["forms"].values()), s["id"]
    tracks = [n for u in compiled.units for n in u["nodes"] if n["kind"] == "script"]
    assert [(n["convert"]["from"], n["convert"]["to"]) for n in tracks] == [convert]
    assert tracks[0]["sentences"] and all(
        kc.startswith("grapheme:") for kc in tracks[0]["introduces"]
    )


def test_persian_plural_keeps_its_zwnj(core_cli: CoreCli) -> None:
    _, compiled = build(core_cli, "fa")
    plural = [
        t
        for s in sentences(compiled)
        for t in s["forms"]["fa-Arab/standard"]["text"]["tokens"]
        if any(m["kc"] == "form:plural-ha" for m in t.get("morphs", []))
    ]
    assert plural and all(ZWNJ in t["surface"] for t in plural)
    assert all(t["morphs"][0]["surface"].endswith(ZWNJ) for t in plural), (
        "the ZWNJ stays with the stem's last grapheme"
    )


def test_cantonese_readings_line_up_as_ruby(core_cli: CoreCli) -> None:
    _, compiled = build(core_cli, "yue")
    for s in sentences(compiled):
        for t in s["forms"]["yue-Hant-HK/standard"]["text"]["tokens"]:
            if t["kind"] == "word":
                assert "jyutping" in t.get("readings", {}), (s["id"], t["surface"])
                assert "".join(seg["base"] for seg in t["ruby"]["jyutping"]) == t["surface"]


def test_cantonese_words_carry_the_readings_their_sentences_pin(core_cli: CoreCli) -> None:
    """Word exercises (pairs, pictures, listening options) show Jyutping as sentences do: each
    KC form takes its sense's pinned reading, and a word met only inside longer words its
    characters' share (禮拜 in 禮拜一)."""
    _, compiled = build(core_cli, "yue")
    forms = {
        (k["id"], t["surface"]): t
        for u in compiled.units
        for k in u["kcs"]
        for f in k.get("forms", {}).get("yue-Hant-HK/standard", [])
        for t in f["tokens"]
        if t["kind"] == "word"
    }
    assert forms, "yue has word forms"
    missing = [key for key, t in forms.items() if "jyutping" not in t.get("readings", {})]
    assert missing == []
    assert forms[("sense:唔該", "唔該")]["readings"] == {"jyutping": "m4 goi1"}
    assert forms[("sense:我", "我哋")]["readings"] == {"jyutping": "ngo5 dei6"}
    assert forms[("sense:禮拜", "禮拜")]["ruby"] == {
        "jyutping": [{"base": "禮", "text": "lai5"}, {"base": "拜", "text": "baai3"}]
    }


def test_courses_are_drafts_until_reviewed(core_cli: CoreCli) -> None:
    for course in sorted(TOOLS):
        _, compiled = build(core_cli, course)
        assert compiled.provenance.get("status.published", 0) == 0
        taught = [s for s in sentences(compiled) if not s["id"].startswith("drill.")]
        assert all(
            s["provenance"]["author"].startswith("llm:") and s["provenance"]["status"] == "draft"
            for s in taught
        )


def test_course_dirs_are_all_tested() -> None:
    assert sorted(p.name for p in COURSES.iterdir() if (p / "course.yaml").is_file()) == sorted(
        TOOLS
    )


@pytest.mark.parametrize("course", sorted(TOOLS))
def test_select_image_has_licensed_pictures(core_cli: CoreCli, course: str) -> None:
    """At least three pictured senses per course, so select-image has distractors."""
    _, compiled = build(core_cli, course)
    pictured = [k for u in compiled.units for k in u["kcs"] if "image" in k]
    assert len(pictured) >= 3, [k["id"] for k in pictured]
    assert all(k["image"] in compiled.images for k in pictured)
    assert all(license_ == "CC0-1.0" for _, license_, _ in compiled.images.values())
