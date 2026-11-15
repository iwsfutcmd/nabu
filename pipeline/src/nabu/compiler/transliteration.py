"""Reading layers that are another orthography of the course (ADR 0129).

A profile's reading layer may name an orthography (`orthography`): chg-Arab's Schluessel layer is
chg-Latn/schluessel, which the course pins word for word (ADR 0128). Each word of a sentence, story
line or KC form then reads as the word in the same place in that orthography's form, and its ruby
is that reading over the whole word: an alphabet's word is not split over its letters, as a Han
word's reading is over its characters. Nothing is pinned by hand, so the layer cannot drift from
the orthography it shows.

Only ruby is set, never `readings`: the reading is the other orthography's own text, which
corrections, the word list and voices already have as that orthography's.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from nabu.schema.models import BundleUnit, OrthographyProfile, TaggedText, TokenModel


def word_layers(profile: OrthographyProfile) -> list[tuple[str, str]]:
    """(scheme, orthography) of each of the profile's ruby layers that is another orthography's
    words, in profile order."""
    return [
        (layer.scheme, layer.orthography)
        for layer in profile.annotations or []
        if layer.kind == "reading"
        and layer.render == "ruby"
        and layer.scheme is not None
        and layer.orthography is not None
    ]


def _words(tokens: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return [t for t in tokens if t["kind"] == "word"]


def _unaligned(
    ours: Sequence[Mapping[str, Any]], theirs: Sequence[Mapping[str, Any]]
) -> str | None:
    """Why the words do not line up: their counts, or two senses in one place."""
    if len(ours) != len(theirs):
        return f"{len(ours)} words against {len(theirs)}"
    for a, b in zip(ours, theirs, strict=True):
        sa, sb = a.get("sense"), b.get("sense")
        if sa is not None and sb is not None and sa != sb:
            return f"{a['surface']!r} ({sa}) against {b['surface']!r} ({sb})"
    return None


def word_ruby(
    tokens: list[dict[str, Any]], words_of: Sequence[Mapping[str, Any]], scheme: str
) -> str | None:
    """Puts the word in the same place in `words_of` over each word of `tokens` (in place), as ruby
    in `scheme`. Returns why it cannot, and changes nothing then."""
    ours, theirs = _words(tokens), _words(words_of)
    why = _unaligned(ours, theirs)
    if why is not None:
        return why
    for a, b in zip(ours, theirs, strict=True):
        a.setdefault("ruby", {})[scheme] = [{"base": a["surface"], "text": b["surface"]}]  # type: ignore[index]
    return None


def transliterate_forms(
    forms: Mapping[str, dict[str, Any]], profiles: Mapping[str, OrthographyProfile]
) -> list[tuple[str, str]]:
    """Each compiled form of one sentence or story line (TaggedText dicts, by orthography) takes
    its layers' ruby from the other forms (in place). Returns (orthography, why) for each form
    whose words do not line up with its layer's orthography."""
    problems: list[tuple[str, str]] = []
    for orth, tagged in forms.items():
        profile = profiles.get(orth)
        for scheme, other in word_layers(profile) if profile is not None else []:
            if other not in forms:
                continue
            why = word_ruby(tagged["tokens"], forms[other]["tokens"], scheme)
            if why is not None:
                problems.append((orth, f"{other}: {why}"))
    return problems


def _with_ruby(form: TaggedText, other: TaggedText, scheme: str) -> TaggedText | str:
    """The form with its words' ruby from `other`, or why the words do not line up. A form of one
    word reads as `other` from its first word to its last (bē-ḥadd over بیحد); what stands outside
    them, as a stem's hyphen (bar-), the form shows itself."""
    tokens = [t.model_dump(exclude_none=True) for t in form.tokens]
    theirs = [t.model_dump(exclude_none=True) for t in other.tokens]
    ours = _words(tokens)
    at = [i for i, t in enumerate(theirs) if t["kind"] == "word"]
    if len(ours) == 1 and at:
        whole = "".join(str(t["surface"]) for t in theirs[at[0] : at[-1] + 1])
        ours[0].setdefault("ruby", {})[scheme] = [{"base": ours[0]["surface"], "text": whole}]  # type: ignore[index]
    else:
        why = word_ruby(tokens, theirs, scheme)
        if why is not None:
            return why
    return form.model_copy(update={"tokens": [TokenModel.model_validate(t) for t in tokens]})


def _letter(kc_id: str) -> bool:
    """A script track's letter (ADR 0088): its Latin spelling is what its cards ask for."""
    return kc_id.startswith("grapheme:")


def pin_kc_ruby(
    units: Sequence[BundleUnit], profiles: Mapping[str, OrthographyProfile]
) -> tuple[list[BundleUnit], list[tuple[str, str, str]]]:
    """Every KC form's layers' ruby, from the KC's forms in the layer's orthography: form by form
    where the KC has as many in both, else its first form only (the others are spellings the
    orthography has no counterpart for). A letter of a script track gets none: its Latin spelling
    is what its cards ask. Returns the units, and (KC id, orthography, why) for each form whose
    words do not line up."""
    problems: list[tuple[str, str, str]] = []
    out: list[BundleUnit] = []
    for unit in units:
        kcs = list(unit.kcs)
        for ki, kc in enumerate(kcs):
            if _letter(kc.id):
                continue
            forms = dict(kc.forms or {})
            changed = False
            for orth, texts in (kc.forms or {}).items():
                profile = profiles.get(orth)
                for scheme, other in word_layers(profile) if profile is not None else []:
                    theirs = forms.get(other) or []
                    if not theirs or not texts:
                        continue
                    count = len(texts) if len(texts) == len(theirs) else 1
                    new = list(forms[orth])
                    for fi in range(count):
                        pinned = _with_ruby(new[fi], theirs[fi], scheme)
                        if isinstance(pinned, str):
                            problems.append((kc.id, orth, f"{other}: {pinned}"))
                            continue
                        new[fi] = pinned
                        changed = True
                    forms[orth] = new
            if changed:
                kcs[ki] = kc.model_copy(update={"forms": forms})
        out.append(unit.model_copy(update={"kcs": kcs}) if kcs != list(unit.kcs) else unit)
    return out, problems
