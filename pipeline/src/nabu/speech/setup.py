"""How speech in an orthography is heard (ADR 0116): the recognizer that hears it and the phones
expected of it, from its profile's `speech`, and the defaults where the profile says nothing.

The recognizer and eSpeak NG each hear a language they have no model for as the macrolanguage
that encompasses it, as CLDR records it (packages/i18n/src/generated/macrolanguages.json, written
by `pnpm cldr`): neither has Lebanese Arabic (apc), so both hear it as Arabic (ar). Each tool says
what it has (`heard_as` asks it), so nothing here names a course or a language.

The same setup serves learners' speech (the speech service, which the API asks with the profile's
setup from the course's bundle) and the course's clips (the round trip, forced alignment).
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import cache
from typing import Any

import yaml

from nabu.paths import I18N_GENERATED, PROFILES
from nabu.schema.models import OrthographyProfile
from nabu.schema.models import Recognizer as RecognizerSetup


@dataclass(frozen=True)
class Recognizer:
    """Who hears speech: Whisper, in `language` (which Whisper hears as its macrolanguage when it
    has none for it), or a fine-tune of it (`model`, "repo@revision", and the Whisper language
    `token` it was trained with) for a language Whisper's own does not write."""

    language: str
    model: str | None = None
    token: str | None = None


def language_of(tag: str) -> str:
    """A language tag's language: apc-Arab-LB → apc."""
    return tag.split("-")[0].lower()


@cache
def macrolanguages() -> dict[str, str]:
    """Each language a macrolanguage encompasses, and that macrolanguage (CLDR's data)."""
    path = I18N_GENERATED / "macrolanguages.json"
    data: dict[str, str] = json.loads(path.read_text(encoding="utf-8"))
    return data


def heard_as(language: str, has: Callable[[str], bool]) -> str:
    """The language a tool takes for `language`: the language itself where the tool has it, else
    the macrolanguage that encompasses it where the tool has that (apc → ar), else the language,
    which the tool then refuses as it would."""
    if has(language):
        return language
    macro = macrolanguages().get(language)
    return macro if macro is not None and has(macro) else language


def recognizer_from(language: str, setup: RecognizerSetup | Mapping[str, Any] | None) -> Recognizer:
    """The recognizer a profile's `speech.recognizer` gives speech in `language` (the profile's
    language): Whisper in the language it pins, else in `language`; or its fine-tune. `setup` as
    the profile has it, or as the API sends it (JSON); ValueError for one that is neither."""
    if setup is not None and not isinstance(setup, RecognizerSetup):
        setup = RecognizerSetup.model_validate(setup)
    tuned = None if setup is None else setup.fineTuned
    pinned = None if setup is None else setup.language
    return Recognizer(
        pinned or language,
        None if tuned is None else tuned.model,
        None if tuned is None else tuned.token,
    )


def recognizer_of(profile: OrthographyProfile) -> Recognizer:
    """Who hears the orthography: its profile's recognizer, or Whisper in its language."""
    setup = None if profile.speech is None else profile.speech.recognizer
    return recognizer_from(language_of(profile.lang), setup)


def espeak_voice_of(profile: OrthographyProfile, has_voice: Callable[[str], bool]) -> str:
    """The eSpeak NG voice whose phonemes stand for the orthography's spelling: the one its
    profile names, else its language's (or its macrolanguage's), as eSpeak NG has them."""
    phones = None if profile.speech is None else profile.speech.phones
    if phones is not None and phones.voice is not None:
        return phones.voice
    return heard_as(language_of(profile.lang), has_voice)


@cache
def profiles() -> dict[str, OrthographyProfile]:
    """Every orthography profile, by id."""
    out: dict[str, OrthographyProfile] = {}
    for path in sorted(PROFILES.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        profile = OrthographyProfile.model_validate(data)
        out[profile.id] = profile
    return out


@cache
def fine_tunes() -> frozenset[str]:
    """Every fine-tuned recognizer a profile names: the only models the speech service loads
    (a model named in a request would run code from wherever it came from)."""
    return frozenset(
        r.model
        for p in profiles().values()
        if p.speech is not None and p.speech.recognizer is not None
        for r in [p.speech.recognizer.fineTuned]
        if r is not None
    )
