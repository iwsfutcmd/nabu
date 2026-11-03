"""Writes lints/<lint-id>.yaml: one course per lint that makes exactly that lint fire (and maybe
others), each a small mutation of clean.yaml.

Run: uv run python tests/fixtures/make_lint_fixtures.py"""

from __future__ import annotations

import copy
import hashlib
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import yaml

from nabu import yamlio

HERE = Path(__file__).parent
CLEAN: dict[str, Any] = yaml.safe_load((HERE / "clean.yaml").read_text(encoding="utf-8"))

YUE: dict[str, Any] = {
    "id": "clean-yue",
    "target": "yue-Hant-HK",
    "orthographies": ["yue-Hant-HK/standard"],
    "support": ["en-Latn/standard"],
    "license": "CC0-1.0",
    "provenance": {"author": "human:fixture", "status": "draft"},
    "units": [
        {
            "id": "basics",
            "kcs": [{"id": "sense:我哋", "gloss": {"en": "we"}}],
            "nodes": [{"id": "basics.1", "kind": "lesson", "introduces": ["sense:我哋"]}],
            "sentences": [
                {
                    "id": "s.1",
                    "node": "basics.1",
                    "forms": {
                        "yue-Hant-HK/standard": {
                            "text": "我哋",
                            "tokens": [
                                {
                                    "surface": "我哋",
                                    "sense": "我哋",
                                    "readings": {"jyutping": "ngo5 dei6"},
                                }
                            ],
                            "reverse": "我哋",
                        }
                    },
                    "translations": {"en": "we"},
                }
            ],
        }
    ],
}

Course = dict[str, Any]


def unit(c: Course) -> dict[str, Any]:
    return c["units"][0]


def sentence(c: Course, i: int = 0) -> dict[str, Any]:
    return unit(c)["sentences"][i]


def uz_form(c: Course, i: int = 0) -> dict[str, Any]:
    return sentence(c, i)["forms"]["uz-Latn/standard"]


def with_cyrl(c: Course) -> None:
    c["orthographies"] = ["uz-Latn/standard", "uz-Cyrl/standard"]
    for s in unit(c)["sentences"]:
        s["forms"]["uz-Cyrl/standard"] = (
            {"text": "Салом!", "reverse": "Салом"}
            if s["id"] == "s.1"
            else {"text": "—", "reverse": "—"}
        )
    unit(c)["sentences"] = unit(c)["sentences"][:1]
    unit(c)["kcs"] = unit(c)["kcs"][:1]
    unit(c)["nodes"][0]["introduces"] = ["sense:salom"]


def m(fn: Callable[[Course], None], base: Course = CLEAN) -> Callable[[], Course]:
    def make() -> Course:
        c = copy.deepcopy(base)
        fn(c)
        return c

    return make


def set_(path: list[Any], value: Any) -> Callable[[Course], None]:
    def go(c: Course) -> None:
        node: Any = c
        for p in path[:-1]:
            node = node[p]
        node[path[-1]] = value

    return go


def _cycle(c: Course) -> None:
    kcs = unit(c)["kcs"]
    kcs[0]["prerequisites"] = ["sense:men"]
    kcs[1]["prerequisites"] = ["sense:salom"]


def _order(c: Course) -> None:
    u = unit(c)
    u["kcs"][2]["prerequisites"] = ["construction:copula-man"]
    u["nodes"] = [
        {
            "id": "basics.1",
            "kind": "lesson",
            "introduces": ["sense:salom", "sense:men", "sense:talaba"],
        },
        {"id": "basics.2", "kind": "lesson", "introduces": ["construction:copula-man"]},
    ]
    u["sentences"][3]["node"] = "basics.2"


def _late(c: Course) -> None:
    u = unit(c)
    u["nodes"] = [
        {
            "id": "basics.1",
            "kind": "lesson",
            "introduces": ["sense:salom", "sense:men", "construction:copula-man"],
        },
        {"id": "basics.2", "kind": "lesson", "introduces": ["sense:talaba"]},
    ]


def _shadowed(c: Course) -> None:
    unit(c)["kcs"].append(
        {"id": "construction:salom-men", "forms": {"uz-Latn/standard": ["salom men"]}}
    )
    unit(c)["nodes"][0]["introduces"].append("construction:salom-men")
    sentence(c, 1)["constructions"] = ["construction:salom-men"]


def _never(c: Course) -> None:
    unit(c)["nodes"][0]["introduces"].remove("sense:talaba")


def _unused(c: Course) -> None:
    unit(c)["kcs"].append({"id": "sense:kitob", "gloss": {"en": "book"}})
    unit(c)["nodes"][0]["introduces"].append("sense:kitob")


def _iplus(c: Course) -> None:
    del unit(c)["sentences"][2]


def _script_missing(c: Course) -> None:
    with_cyrl(c)
    unit(c)["sentences"].append(
        {
            "id": "s.9",
            "node": "basics.1",
            "forms": {
                "uz-Latn/standard": {
                    "text": "Salom!",
                    "tokens": [{"surface": "Salom", "sense": "salom"}],
                    "reverse": "Salom",
                }
            },
            "translations": {"en": "Hello!"},
            "production": False,
        }
    )
    unit(c)["nodes"].append(
        {
            "id": "basics.script",
            "kind": "script",
            "convert": {
                "from": "uz-Latn/standard",
                "to": "uz-Cyrl/standard",
                "sentences": ["s.1", "s.9"],
            },
        }
    )


def _translit(c: Course) -> None:
    with_cyrl(c)
    s = sentence(c)
    s["forms"]["uz-Latn/standard"] = {
        "text": "Oʻzbek!",
        "tokens": [{"surface": "Oʻzbek", "sense": "salom"}],
        "reverse": "Oʻzbek",
    }
    s["forms"]["uz-Cyrl/standard"] = {"text": "Ўзбек!", "reverse": "Ўзбек"}
    unit(c)["kcs"][0]["forms"] = {"uz-Latn/standard": ["oʻzbek"]}


def _no_license(c: Course) -> None:
    del c["license"]


def _no_provenance(c: Course) -> None:
    del c["provenance"]


FIXTURES: dict[str, tuple[str, Callable[[], Course]]] = {
    "parse.schema": (
        "A sentence has a field the schema does not know.",
        m(set_(["units", 0, "sentences", 0, "colour"], "red")),
    ),
    "parse.duplicate-id": (
        "Two sentences are both s.1.",
        m(set_(["units", 0, "sentences", 1, "id"], "s.1")),
    ),
    "parse.unknown-orthography": (
        "A Cyrillic form in a Latin-only course.",
        m(
            set_(
                ["units", 0, "sentences", 0, "forms", "uz-Cyrl/standard"],
                {"text": "Салом!", "reverse": "Салом"},
            )
        ),
    ),
    "parse.missing-asset": (
        "A KC image whose file does not exist.",
        m(
            set_(
                ["units", 0, "kcs", 0, "image"],
                {
                    "file": "images/no-such-picture.svg",
                    "license": "CC0-1.0",
                    "provenance": {"author": "human:fixture", "status": "draft"},
                },
            )
        ),
    ),
    "parse.token-mismatch": (
        "A token that is not in the text.",
        m(
            set_(
                ["units", 0, "sentences", 0, "forms", "uz-Latn/standard", "tokens"],
                [{"surface": "Xayr", "sense": "salom"}],
            )
        ),
    ),
    "text.not-nfc": (
        "A decomposed é in a translation.",
        m(set_(["units", 0, "sentences", 0, "translations", "en"], "Café!")),
    ),
    "text.invisible": (
        "A right-to-left mark in Latin text.",
        m(lambda c: uz_form(c).update(text="Salom!\u200f")),
    ),
    "text.splits-grapheme": (
        "A token boundary between a letter and its combining mark.",
        m(
            lambda c: uz_form(c).update(
                text="Salom z̃",
                tokens=[{"surface": "Salom", "sense": "salom"}, {"surface": "z"}, {"surface": "̃"}],
            )
        ),
    ),
    "text.script-audit": (
        "Ş is not in the Uzbek exemplars.",
        m(
            lambda c: uz_form(c).update(
                text="Şalom!", tokens=[{"surface": "Şalom", "sense": "salom"}], reverse="Şalom"
            )
        ),
    ),
    "text.punctuation-audit": (
        "An Arabic question mark in Uzbek.",
        m(lambda c: uz_form(c).update(text="Salom؟")),
    ),
    "text.mixed-script": (
        "A Cyrillic а inside a Latin word.",
        m(
            lambda c: uz_form(c).update(
                text="Sаlom!", tokens=[{"surface": "Sаlom", "sense": "salom"}], reverse="Sаlom"
            )
        ),
    ),
    "text.non-canonical": (
        "ASCII apostrophe where Uzbek content needs U+02BB.",
        m(
            lambda c: uz_form(c).update(
                text="O'zbek!", tokens=[{"surface": "O'zbek", "sense": "salom"}], reverse="O'zbek"
            )
        ),
    ),
    "enrich.missing-reading": (
        "A character no analyzer can read and no pinned Jyutping.",
        m(
            lambda c: sentence(c)["forms"]["yue-Hant-HK/standard"].update(
                text="\U0002a6a5",
                tokens=[{"surface": "\U0002a6a5", "sense": "我哋"}],
                reverse="\U0002a6a5",
            ),
            YUE,
        ),
    ),
    "enrich.reading-mismatch": (
        "Pinned ngo4 where PyCantonese says ngo5 (pinned wins).",
        m(
            set_(
                [
                    "units",
                    0,
                    "sentences",
                    0,
                    "forms",
                    "yue-Hant-HK/standard",
                    "tokens",
                    0,
                    "readings",
                    "jyutping",
                ],
                "ngo4 dei6",
            ),
            YUE,
        ),
    ),
    "enrich.ruby-unaligned": (
        "One syllable for two characters.",
        m(
            set_(
                [
                    "units",
                    0,
                    "sentences",
                    0,
                    "forms",
                    "yue-Hant-HK/standard",
                    "tokens",
                    0,
                    "readings",
                    "jyutping",
                ],
                "ngo5",
            ),
            YUE,
        ),
    ),
    "enrich.transliteration-mismatch": (
        "ICU's uz_Latn-uz_Cyrl gives Ўзбэк; the pinned form is Ўзбек.",
        m(_translit),
    ),
    "drills.rbnf-unavailable": (
        "ICU has no Uzbek spellout.",
        m(
            set_(
                ["drills"],
                [{"kind": "numbers", "orthography": "uz-Latn/standard", "values": [1, 2]}],
            )
        ),
    ),
    "curriculum.unknown-kc": (
        "A token's sense is not defined.",
        m(lambda c: uz_form(c)["tokens"][0].update(sense="xayr")),
    ),
    "curriculum.unknown-node": (
        "A sentence in a node that does not exist.",
        m(set_(["units", 0, "sentences", 0, "node"], "basics.9")),
    ),
    "curriculum.never-introduced": ("sense:talaba is used but no node introduces it.", m(_never)),
    "curriculum.introduced-late": ("A node-1 sentence uses a KC node 2 introduces.", m(_late)),
    "curriculum.i-plus-one": (
        "Men talabaman brings in sense:talaba and the copula at once.",
        m(_iplus),
    ),
    "curriculum.cycle": ("salom requires men requires salom.", m(_cycle)),
    "curriculum.order": ("A KC is introduced before its prerequisite.", m(_order)),
    "curriculum.unused-kc": ("sense:kitob is introduced but never used.", m(_unused)),
    "grading.accept-syntax": (
        "An unclosed parenthesis.",
        m(lambda c: uz_form(c).update(reverse="Salom (dunyo")),
    ),
    "grading.blowup": (
        "Eleven optionals: 2048 answers.",
        m(
            lambda c: uz_form(c).update(
                reverse="Salom " + " ".join(f"[{x}]" for x in "abcdefghijk")
            )
        ),
    ),
    "grading.duplicate": (
        "Salom and Salom! normalize alike.",
        m(lambda c: uz_form(c).update(reverse="Salom\nSalom!")),
    ),
    "grading.canonical-missing": (
        "The reverse set does not accept the sentence.",
        m(lambda c: uz_form(c).update(reverse="Xayr")),
    ),
    "grading.missing-reverse": (
        "A production sentence with no reverse set.",
        m(lambda c: uz_form(c).pop("reverse")),
    ),
    "glossary.dead-entry": (
        "A glossary form that no sentence contains.",
        m(lambda c: unit(c)["kcs"][0]["forms"]["uz-Latn/standard"].append("assalomu alaykum")),
    ),
    "glossary.shadowed": ("salom loses to the longer entry salom men.", m(_shadowed)),
    "glossary.tile-split": (
        "Tiles split salom inside one runtime unit.",
        m(
            lambda c: uz_form(c).update(
                tokens=[
                    {"surface": "Sa", "sense": "salom", "tile": 0},
                    {"surface": "lom", "sense": "salom", "tile": 1},
                ]
            )
        ),
    ),
    "script.missing-form": (
        "A script-convert track uses a sentence with no Cyrillic form.",
        m(_script_missing),
    ),
    "package.license": ("No license on the course or the sentence.", m(_no_license)),
    "package.provenance": ("No provenance on the course or the sentence.", m(_no_provenance)),
    "package.unreviewed-published": (
        "Published without a reviewer.",
        m(
            set_(
                ["units", 0, "sentences", 0, "provenance"],
                {"author": "human:fixture", "status": "published"},
            )
        ),
    ),
}


# ---- audio: a voice for the clean course, and clips in <fixture>.audio/ (index.yaml, clips/)

VOICE = {
    "id": "narrator",
    "provider": "espeak-ng",
    "voice": "uz",
    "orthography": "uz-Latn/standard",
    "reading": "text",
    "license": "CC0-1.0",
}


def _with_voice(c: Course) -> None:
    c["audio"] = {"voices": [VOICE]}


def _human_required(c: Course) -> None:
    c["audio"] = {"humanRequired": True}


def clip(item: str, data: bytes, **extra: Any) -> tuple[bytes, dict[str, Any]]:
    """A fixture clip: arbitrary bytes (the compiler only hashes them) and its index entry."""
    digest = hashlib.sha256(data).hexdigest()
    entry: dict[str, Any] = {
        "item": item,
        "speed": "normal",
        "file": f"clips/{digest[:16]}.mp3",
        "sha256": digest,
        "durationMs": 900,
        "license": "CC0-1.0",
        "provenance": {"author": "generated:espeak-ng@1.51", "status": "draft"},
        "synthetic": True,
        "synthesis": {
            "provider": "espeak-ng",
            "version": "1.51",
            "voice": "uz",
            "input": "Salom!",
            "rate": 1.0,
            "inputHash": "0" * 64,
        },
    }
    return data, entry | extra


def _unlicensed() -> tuple[bytes, dict[str, Any]]:
    data, entry = clip("s.1", b"schema")
    del entry["license"]
    return data, entry


def _read(text: str) -> dict[str, Any]:
    return {**clip("s.1", b"")[1]["synthesis"], "input": text}


AUDIO: dict[str, tuple[str, Callable[[Course], None], list[tuple[bytes, dict[str, Any]]]]] = {
    "audio.schema": (
        "A clip without its license.",
        _with_voice,
        [_unlicensed()],
    ),
    "audio.missing-file": (
        "A clip whose file is not there.",
        _with_voice,
        [clip("s.1", b"never written", file="clips/0000000000000000.mp3")],
    ),
    "audio.human-required": (
        "A synthesized clip in a course whose audio must be recorded.",
        _human_required,
        [clip("s.1", b"human-required")],
    ),
    "audio.unknown-item": (
        "A clip for a sentence the course does not have.",
        _with_voice,
        [clip("s.99", b"unknown item")],
    ),
    "audio.stale": (
        "The voice now reads 'Salom!', the clip read 'Salam!'.",
        _with_voice,
        [clip("s.1", b"stale", synthesis=_read("Salam!"))],
    ),
    "audio.timings": (
        "Timings that point past the sentence's tokens.",
        _with_voice,
        [clip("s.1", b"timings", timings=[{"token": 9, "startMs": 0, "endMs": 400}])],
    ),
    "audio.held-back": (
        "A clip the round-trip check failed, not yet reviewed.",
        _with_voice,
        [clip("s.1", b"held back", qa={"asrText": "Salam", "cer": 0.8, "status": "fail"})],
    ),
}
for _lint, (_why, _mutate, _clips) in AUDIO.items():
    FIXTURES[_lint] = (_why, m(_mutate))


def main() -> None:
    out = HERE / "lints"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.yaml"):
        old.unlink()
    for old_dir in out.glob("*.audio"):
        shutil.rmtree(old_dir)
    for lint, (why, make) in FIXTURES.items():
        body = yamlio.dump(make())
        (out / f"{lint}.yaml").write_text(
            f"# Fixture for {lint}: {why}\n"
            f"# Generated by make_lint_fixtures.py from clean.yaml.\n{body}",
            encoding="utf-8",
        )
    for lint, (why, _mutate, clips) in AUDIO.items():
        adir = out / f"{lint}.audio"
        (adir / "clips").mkdir(parents=True)
        for data, entry in clips:
            if lint != "audio.missing-file":
                (adir / entry["file"]).write_bytes(data)
        body = yamlio.dump({"version": 1, "clips": [entry for _, entry in clips]})
        (adir / "index.yaml").write_text(
            f"# Audio for the {lint} fixture: {why}\n{body}", encoding="utf-8"
        )


if __name__ == "__main__":
    main()
