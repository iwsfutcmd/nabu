"""Number drills spelled out by CLDR RBNF through PyICU (§7.6). ICU has no RBNF for some
languages (Uzbek, Tajik in ICU 74) and silently falls back to English or to digits; that is
detected, never trusted. PyICU is optional (the `icu` dependency group) and untyped."""

from __future__ import annotations

import importlib
from functools import cache
from typing import Any


@cache
def _icu() -> Any | None:
    try:
        return importlib.import_module("icu")
    except ImportError:
        return None


def icu_version() -> str | None:
    icu = _icu()
    return None if icu is None else str(icu.ICU_VERSION)


def spellout(tag: str, value: int) -> str | None:
    """`value` spelled out in `tag`'s language, or None when ICU has no rules for it."""
    icu = _icu()
    if icu is None:
        return None

    def fmt(locale: Any) -> str:
        return str(icu.RuleBasedNumberFormat(icu.URBNFRuleSetTag.SPELLOUT, locale).format(value))

    out = fmt(icu.Locale.forLanguageTag(tag))
    english = fmt(icu.Locale("en"))
    language = tag.split("-")[0]
    digits_only = out.replace("\u00a0", "").replace(" ", "").replace(",", "").isdigit()
    if digits_only or (language != "en" and out == english):
        return None
    return out


def transform(transform_id: str, text: str) -> str | None:
    """A CLDR transform such as uz_Latn-uz_Cyrl, or None if unavailable."""
    icu = _icu()
    if icu is None or transform_id not in set(icu.Transliterator.getAvailableIDs()):
        return None
    return str(icu.Transliterator.createInstance(transform_id).transliterate(text))
