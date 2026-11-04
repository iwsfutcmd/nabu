"""Vowel marks an orthography can leave out (ADR 0053).

The compiler adds them to a course's words from its vocalization; the course source, the voices
and the corrections tool work with the letters alone, so they compare text without them.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import cache

import regex
import yaml

from nabu.paths import PROFILES
from nabu.schema.models import OrthographyProfile


@cache
def _marks(orthography: str) -> regex.Pattern[str] | None:
    for path in sorted(PROFILES.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if data.get("id") != orthography:
            continue
        profile = OrthographyProfile.model_validate(data)
        if profile.match and profile.match.marks:
            return regex.compile(profile.match.marks.set)
    return None


def unmarker(orthography: str) -> Callable[[str], str]:
    """Takes out the vowel marks the orthography's profile lets a text go without
    (`match.marks`); the identity for an orthography without them."""
    marks = _marks(orthography)
    if marks is None:
        return lambda s: s
    return lambda s: marks.sub("", s)
