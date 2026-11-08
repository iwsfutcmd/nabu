"""Phase 2 fixture courses: each builds with no errors, and shows what it is there to show."""

from __future__ import annotations

import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, cast

import pytest
import regex
import yaml

from nabu.analyzers import analyzers_by_tool
from nabu.compiler import Diagnostics, compile_course, load_profiles, write_bundle
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
TOOLS = {
    "fa": ["hazm", "icu"],
    "yue": ["pycantonese", "icu"],
    "uz": ["icu"],
    "apc": [],
    "lzh": [],
    "hbo": [],
    "es": [],
}

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
    # Lemmas (ADR 0061): 呢, no longer 呢個; its reading comes from the morph in 呢個 and the rest.
    assert forms[("sense:我", "我")]["readings"] == {"jyutping": "ngo5"}
    assert forms[("sense:呢", "呢")]["readings"] == {"jyutping": "ni1"}
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


VOCALIZED = {"fa": "fa-Arab/standard", "apc": "apc-Arab/standard"}


def _texts(node: Any, orth: str) -> list[list[dict[str, Any]]]:
    """Every TaggedText in `orth` under a compiled unit: sentences, story lines, word forms."""
    if isinstance(node, dict):
        node = cast(dict[str, Any], node)
        if node.get("orthography") == orth and isinstance(node.get("tokens"), list):
            return [cast(list[dict[str, Any]], node["tokens"])]
        return [t for v in node.values() for t in _texts(v, orth)]
    if isinstance(node, list):
        return [t for v in cast(list[Any], node) for t in _texts(v, orth)]
    return []


@pytest.mark.parametrize("course", sorted(VOCALIZED))
def test_every_word_the_vocalization_knows_is_marked(core_cli: CoreCli, course: str) -> None:
    """With "Show vowel marks" on, every letter the course's vocalization marks carries a mark,
    wherever the word is: written with a shadda, cut into morphs, a word form, a character's name.
    Marks the source writes itself win (بدِّك, to a woman), and so does a token's own `vocalized`."""
    orth = VOCALIZED[course]
    _, compiled = build(core_cli, course)
    profile = PROFILES[orth]
    assert profile.match and profile.match.marks
    marks = regex.compile(profile.match.marks.set)
    root = COURSES / course
    source = yaml.safe_load((root / "vocalization.yaml").read_text(encoding="utf-8"))
    words = {
        marks.sub("", unicodedata.normalize("NFC", k)): unicodedata.normalize("NFC", v)
        for k, v in source["words"].items()
    }
    units = "".join(p.read_text(encoding="utf-8") for p in sorted((root / "units").glob("*.yaml")))
    pinned = {
        unicodedata.normalize("NFC", v)
        for v in regex.findall(r"vocalized: ['\"]?([^,}'\"]+)", units)
    }
    unmarked: list[str] = []
    seen = 0
    for unit in compiled.units:
        for tokens in _texts(unit, orth):
            for t in tokens:
                if t["kind"] != "word" or t["surface"] in pinned:
                    continue
                want = words.get(marks.sub("", t["surface"]))
                if want is None:
                    continue
                seen += 1
                have = regex.findall(r"\X", t["surface"])
                need = regex.findall(r"\X", want)
                if len(have) != len(need) or any(
                    marks.search(b) and not marks.search(a) for a, b in zip(have, need, strict=True)
                ):
                    unmarked.append(f"{unit['id']}: {t['surface']} (wants {want})")
    assert seen > 100
    assert unmarked == [], "\n".join(unmarked)


LZH = "lzh-Hant/standard"
LZH_SCHEMES = ["baxter", "jyutping", "pinyin"]


def test_classical_chinese_is_read_and_written_never_spoken(core_cli: CoreCli) -> None:
    """lzh (ADR 0071): no audio, and it practises recognize and produce only."""
    _, compiled = build(core_cli, "lzh")
    assert compiled.course.audio is None and compiled.audio_items == {}
    assert compiled.course.facets == ["recognize", "produce"]
    assert compiled.orthographies == [LZH]


def test_classical_chinese_pins_three_reading_layers(core_cli: CoreCli) -> None:
    """Every Han word carries Pinyin, Jyutping and Baxter's Middle Chinese, as readings and as
    ruby, one segment per character; the word cards (KC forms) carry them too."""
    _, compiled = build(core_cli, "lzh")
    han = regex.compile(r"\p{Han}")

    def check(tokens: list[dict[str, Any]], where: str) -> int:
        n = 0
        for t in tokens:
            if t["kind"] != "word" or not han.search(t["surface"]):
                continue
            n += 1
            assert sorted(t["readings"]) == LZH_SCHEMES, (where, t["surface"])
            for scheme in LZH_SCHEMES:
                segments = t["ruby"][scheme]
                assert "".join(seg["base"] for seg in segments) == t["surface"], (where, scheme)
                assert [seg["text"] for seg in segments] == t["readings"][scheme].split(), where
        return n

    words = sum(check(s["forms"][LZH]["text"]["tokens"], s["id"]) for s in sentences(compiled))
    assert words > 1000
    for u in compiled.units:
        for kc in u["kcs"]:
            for form in kc.get("forms", {}).get(LZH, []):
                assert check(form["tokens"], kc["id"]) == 1, kc["id"]


def test_classical_chinese_reads_a_character_by_its_sense(core_cli: CoreCli) -> None:
    """Senses written alike keep their own readings: 說 "pleased" is read as 悅, 女 "you" as 汝."""
    _, compiled = build(core_cli, "lzh")
    by_sense: dict[str, set[tuple[str, ...]]] = {}
    for s in sentences(compiled):
        for t in s["forms"][LZH]["text"]["tokens"]:
            if "sense" in t:
                reading = tuple(t["readings"][k] for k in LZH_SCHEMES)
                by_sense.setdefault(t["sense"], set()).add(reading)
    assert by_sense["說.yue"] == {("ywet", "jyut6", "yuè")}
    assert by_sense["女.ru"] == {("nyoX", "jyu5", "rǔ")}
    assert by_sense["知"] == {("trje", "zi1", "zhī")}
    assert by_sense["知.zhi"] == {("trjeH", "zi3", "zhì")}
    several = {k: v for k, v in by_sense.items() if len(v) > 1}
    assert several == {}


ES_FORMS = ["pres-1s", "pret-3s", "impf", "imp-tu", "part", "cond", "fut", "subj", "subj-past"]


def test_cuban_spanish_runs_thirty_units_each_ending_in_a_story(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """es (ADR 0075): thirty units, A1 to B2, each ending in a story; the tenses and moods the
    syllabus promises are all taught; the placement test types its answers (ADR 0076)."""
    _, compiled = build(core_cli, "es")
    assert compiled.course.target == "es-Latn-CU"
    assert [u["id"] for u in compiled.units] == [f"u{n:02d}" for n in range(1, 31)]
    assert (compiled.units[0]["cefr"], compiled.units[-1]["cefr"]) == ("A1", "B2")
    for u in compiled.units:
        assert len(u["stories"]) == 1, u["id"]
        assert u["nodes"][-1]["kind"] == "story", u["id"]
    used = {kc for s in sentences(compiled) for kc in s["kcs"]}
    assert [f for f in ES_FORMS if f"form:{f}" not in used] == []
    manifest = write_bundle(compiled, PROFILES, ANALYZERS, tmp_path)
    assert manifest["placement"] == {"production": "typed"}
    assert manifest["target"] == "es-Latn-CU"


HBO = "hbo-Hebr/tiberian"
HEBREW_LETTER = regex.compile(r"\p{Script=Hebrew}")


def test_biblical_hebrew_is_never_read_as_modern_hebrew(core_cli: CoreCli) -> None:
    """hbo (ADR 0082): every voice says the pinned Tiberian reading as eSpeak NG phonemes, never
    Hebrew text, and no voice is a Hebrew (Modern Hebrew) one; every clip's input is phonemes."""
    from nabu.audio import tiberian
    from nabu.audio.course import PHONEME_SCHEMES, read_index

    _, compiled = build(core_cli, "hbo")
    audio = compiled.course.audio
    assert audio is not None and audio.voices
    for voice in audio.voices:
        assert voice.reading == "tiberian" and voice.reading in PHONEME_SCHEMES
        assert voice.provider == "espeak-ng" and not voice.voice.startswith("he")
    index = read_index(COURSES / "hbo" / "audio")
    assert len(index.clips) > 300
    for clip in index.clips:
        assert clip.synthesis is not None
        assert not HEBREW_LETTER.search(clip.synthesis.input), clip.item
        words = regex.findall(r"\[\[[^\]]*\]\]", clip.synthesis.input)
        assert words and "".join(words) == clip.synthesis.input.replace(" ", "").rstrip(".?"), (
            clip.item
        )
    assert tiberian.espeak("wayyṓʾmer") in {
        c.synthesis.input.split(" ")[0] for c in index.clips if c.synthesis
    }


def test_biblical_hebrew_pins_a_tiberian_reading_on_every_word(core_cli: CoreCli) -> None:
    """Every word of every sentence and story line carries its Tiberian reading, which the audio
    module can say (ADR 0082); the divine name is read with its qere, ʾăḏōnāy."""
    from nabu.audio import tiberian

    _, compiled = build(core_cli, "hbo")
    words = 0
    for unit in compiled.units:
        lines = [s["forms"][HBO] for s in unit["sentences"]] + [
            step["line"]["forms"][HBO]
            for story in unit.get("stories", [])
            for step in story["steps"]
            if "line" in step
        ]
        for form in lines:
            tokens = form["text"]["tokens"] if "text" in form else form["tokens"]
            for t in tokens:
                if t["kind"] != "word":
                    continue
                words += 1
                reading = t["readings"]["tiberian"]
                assert tiberian.ipa(reading), (unit["id"], t["surface"])
                if regex.sub(r"\p{M}", "", t["surface"]) == "יהוה":
                    assert reading == "ʾăḏōnāy"
    assert words > 1000


def test_biblical_hebrew_is_pointed_and_shows_its_points_by_default(core_cli: CoreCli) -> None:
    """The text is written with the Tiberian pointing, which the player shows by default and
    hides on request; answers are typed and graded without points."""
    _, compiled = build(core_cli, "hbo")
    profile = PROFILES[HBO]
    layers = [a for a in profile.annotations or [] if a.kind == "vocalization"]
    assert [(a.toggle, a.default) for a in layers] == [(True, "on")]
    assert profile.match and profile.match.marks and profile.match.marks.policy == "ignore"
    marks = regex.compile(profile.match.marks.set)
    for s in sentences(compiled):
        form = s["forms"][HBO]
        text = "".join(t["surface"] for t in form["text"]["tokens"])
        assert marks.search(text), s["id"]
        accept = form.get("reverse") or ""
        assert not marks.search(str(accept)), s["id"]
