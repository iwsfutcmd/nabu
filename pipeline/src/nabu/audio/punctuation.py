"""A full stop for text a voice reads without one (ADR 0063).

Neural voices say a lone word or a fragment more naturally, and pronounce it more reliably, when
it reads as a sentence. A voice with `finalStop` gets text that has no final punctuation (word
cards, mostly) ended with its script's full stop. The stop is part of the clip's synthesis
input: the audio check shows it as what the voice was given.

The stop is chosen by the orthography's script subtag (ISO 15924), and by the language where one
script has several (Urdu ends sentences with U+06D4). Scripts that end sentences with no mark
(Thai, Lao) get none, and neither does text ending in a digit: "12." is an ordinal in Uzbek,
Turkish and German.
"""

from __future__ import annotations

import regex

#: The full stop of each script (ISO 15924 subtag).
FULL_STOP: dict[str, str] = {
    **dict.fromkeys(["Latn", "Cyrl", "Grek", "Arab", "Hebr", "Geor", "Hang", "Kore"], "."),
    # The ideographic full stop.
    **dict.fromkeys(["Hani", "Hans", "Hant", "Jpan", "Hira", "Kana", "Bopo"], "。"),
    # The danda.
    **dict.fromkeys(["Deva", "Beng", "Guru", "Orya"], "।"),
    "Armn": "։",  # Armenian full stop
    "Ethi": "።",  # Ethiopic full stop
    "Mymr": "။",  # Myanmar section
    "Khmr": "។",  # Khmer khan
    "Tibt": "།",  # Tibetan shad
}

#: Languages whose full stop is not their script's (language subtag → stop).
BY_LANGUAGE: dict[str, str] = {
    "ur": "۔",  # Arabic full stop, as Urdu writes it
}

#: Scripts whose sentences end with no mark.
NO_STOP = frozenset(["Thai", "Laoo"])

#: Text already ended: punctuation, then only spaces or format characters (bidi marks, ZWNJ).
_ENDED = regex.compile(r"\p{P}[\s\p{Cf}]*$")
_TAIL = regex.compile(r"[\s\p{Cf}]*$")
_DIGIT_END = regex.compile(r"\p{Nd}[\s\p{Cf}]*$")


def full_stop(tag: str) -> str | None:
    """The full stop for a BCP 47 tag with a script subtag ("yue-Hant-HK" → "。"); None if the
    script has no mark or is not known (the text is then left as it is)."""
    subtags = tag.split("-")
    language = subtags[0].lower()
    script = next((s.title() for s in subtags[1:] if len(s) == 4 and s.isalpha()), None)
    if language in BY_LANGUAGE:
        return BY_LANGUAGE[language]
    if script is None or script in NO_STOP:
        return None
    return FULL_STOP.get(script)


def with_final_stop(text: str, tag: str) -> str:
    """`text` ended with its script's full stop, unless it already ends with punctuation, ends in
    a digit, or its script takes none. Trailing spaces and format characters stay after it."""
    stop = full_stop(tag)
    if stop is None or _ENDED.search(text) or _DIGIT_END.search(text):
        return text
    tail = _TAIL.search(text)
    at = tail.start() if tail is not None else len(text)
    if at == 0:  # nothing but spaces and format characters: nothing to end
        return text
    return text[:at] + stop + text[at:]
