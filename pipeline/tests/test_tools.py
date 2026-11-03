"""Analyzer adapters and RBNF (skipped locally when not installed; CI requires them)."""

import pytest

from nabu.analyzers import analyzers_by_tool
from nabu.drills.rbnf import icu_version, spellout, transform

from .conftest import REQUIRE_TOOLS

ANALYZERS = analyzers_by_tool()


def need(tool: str, available: bool) -> None:
    if not available:
        if REQUIRE_TOOLS:
            pytest.fail(f"{tool} is required")
        pytest.skip(f"{tool} not installed")


def test_pycantonese_reading_and_segmentation() -> None:
    need("pycantonese", "pycantonese" in ANALYZERS)
    yue = ANALYZERS["pycantonese"]
    assert yue.reading("jyutping", "我哋去飲茶") == "ngo5 dei6 heoi3 jam2 caa4"
    assert yue.reading("pinyin", "我") is None
    assert yue.segment("我哋去飲茶") == ["我哋", "去", "飲茶"]


def test_hazm_segmentation() -> None:
    need("hazm", "hazm" in ANALYZERS)
    assert ANALYZERS["hazm"].segment("کتاب\u200cها روی میز هستند.") == [
        "کتاب\u200cها",
        "روی",
        "میز",
        "هستند",
        ".",
    ]


def test_rbnf_spellout_and_fallback_detection() -> None:
    need("icu", icu_version() is not None)
    assert spellout("fa-Arab-IR", 47) == "چهل و هفت"
    assert spellout("tr-Latn", 47) == "kırk yedi"
    assert spellout("uz-Latn", 47) is None, (
        "ICU falls back to English for uz; that must be detected"
    )
    assert spellout("uz-Cyrl", 47) is None, "and to digits for uz-Cyrl"


def test_cldr_transform() -> None:
    need("icu", icu_version() is not None)
    assert transform("uz_Latn-uz_Cyrl", "salom") == "салом"
    assert transform("xx-yy", "a") is None
