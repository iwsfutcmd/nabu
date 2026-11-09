"""Alphabet nodes (ADR 0088): a script track's letters and words, with their Latin spellings.

A grapheme KC is a letter, a diphthong or a mark, by its forms:
- a letter or a diphthong (α, Α; αι) is its letters without marks, and a word has it where those
  letters stand together (lowercased, final ς as σ);
- a vowel or ρ with a mark (ἁ, ὁ, ῥ: the rough breathing; ᾳ, ῃ, ῳ: the iota subscript) is that mark,
  and a word has it where any of its letters carries it.

A word of an alphabet node must be spelled with the letters taught by then
(`script.untaught-letter`); marks are not checked: the words are shown as the course writes them.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from nabu import greek_translit
from nabu.compiler.diagnostics import Diagnostics, Loc
from nabu.schema.models import CourseSource, OrthographyProfile

if TYPE_CHECKING:
    from nabu.compiler.build import Unit

#: Romanization schemes a profile can name (`romanize`), each a word → Latin function.
ROMANIZERS: dict[str, Callable[[str], str]] = {"greek": greek_translit.word}
#: Vowels and ρ: a mark on one of these is the mark's grapheme (ἁ, ῥ, ᾳ), not the letter's.
_CARRIERS = set("αεηιουωρ")


def romanized(profile: OrthographyProfile) -> str:
    """The orthography of the Latin spellings: grc-Grek/polytonic → grc-Latn/romanized."""
    return f"{profile.lang.split('-')[0]}-Latn/romanized"


def letters_of(text: str) -> str:
    """A word's letters, without marks, lowercased, final sigma as sigma: Σωκράτης → σωκρατησ."""
    out = "".join(
        c
        for c in unicodedata.normalize("NFD", text)
        if not unicodedata.combining(c) and unicodedata.category(c)[0] == "L"
    )
    return out.lower().replace("ς", "σ")


def marks_of(text: str) -> set[str]:
    return {c for c in unicodedata.normalize("NFD", text) if unicodedata.combining(c)}


@dataclass(frozen=True)
class Grapheme:
    kc: str
    form: str
    #: A letter or diphthong: its letters. A mark: empty.
    letters: str
    #: A mark: the combining marks it is.
    marks: frozenset[str]

    def occurs(self, word: str) -> bool:
        if self.marks:
            return bool(self.marks & marks_of(word))
        return self.letters in letters_of(word)


def grapheme(kc: str, forms: list[str]) -> Grapheme:
    first = forms[0]
    base = letters_of(first)
    marks = marks_of(first)
    if marks and len(base) == 1 and base in _CARRIERS:
        return Grapheme(kc, first, "", frozenset(marks))
    return Grapheme(kc, first, base, frozenset())


def _item(
    tagged: Callable[[str, str], dict[str, Any]],
    orth: str,
    latin_orth: str,
    romanize: Callable[[str], str],
    kc: str,
    text: str,
    letters: list[str],
) -> dict[str, Any]:
    """A bundled ScriptItem: the KC, its written form and its Latin spelling."""
    return {
        "kc": kc,
        "letters": letters,
        "text": tagged(orth, text),
        "latin": tagged(latin_orth, romanize(text)),
    }


def compile_alphabets(
    diags: Diagnostics,
    course: CourseSource,
    units: list[Unit],
    profiles: dict[str, OrthographyProfile],
    tagged: Callable[[str, str], dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Each alphabet node's bundled `alphabet` (node id → {orthography, letters, words}), in course
    order, with the lints. `tagged(orthography, text)` makes a TaggedText."""
    kcs = {kc.id: kc for unit in units for kc in unit.source.kcs}
    out: dict[str, dict[str, Any]] = {}
    taught: dict[str, list[Grapheme]] = {}  # orthography → graphemes taught so far
    for unit in units:
        for ni, node in enumerate(unit.source.nodes):
            alphabet = getattr(node, "alphabet", None)
            if alphabet is None:
                continue
            loc: Loc = unit.doc.loc("nodes", ni, "alphabet")
            orth = str(alphabet.orthography)
            profile = profiles.get(orth)
            if orth not in course.orthographies or profile is None:
                diags.report(
                    "parse.unknown-orthography", f"{node.id} teaches {orth}, not the course's", loc
                )
                continue
            scheme = getattr(profile, "romanize", None)
            romanize = ROMANIZERS.get(str(scheme)) if scheme is not None else None
            if romanize is None:
                diags.report(
                    "script.untaught-letter",
                    f"{node.id}: {orth} has no romanization (its profile's `romanize`)",
                    loc,
                )
                continue
            latin_orth = romanized(profile)
            if latin_orth not in profiles:
                diags.report(
                    "script.untaught-letter",
                    f"{node.id}: no profile {latin_orth} for the Latin spellings",
                    loc,
                )
                continue
            new: list[Grapheme] = []
            for kc_id in node.introduces or []:
                kc = kcs.get(kc_id)
                forms = (kc.forms or {}).get(orth, []) if kc is not None else []
                if kc_id.startswith("grapheme:") and forms:
                    new.append(grapheme(kc_id, list(forms)))
            so_far = [*taught.get(orth, []), *new]
            taught[orth] = so_far
            known = {c for g in so_far if not g.marks for c in g.letters}

            words: list[dict[str, Any]] = []
            for wi, kc_id in enumerate(alphabet.words):
                kc = kcs.get(kc_id)
                forms = (kc.forms or {}).get(orth, []) if kc is not None else []
                wloc = unit.doc.loc("nodes", ni, "alphabet", "words", wi)
                if not forms:
                    diags.report(
                        "script.untaught-letter", f"{node.id}: {kc_id} has no {orth} form", wloc
                    )
                    continue
                word = forms[0]
                missing = sorted(set(letters_of(word)) - known)
                if missing:
                    diags.report(
                        "script.untaught-letter",
                        f"{node.id}: {word!r} ({kc_id}) needs {' '.join(missing)}, not taught yet",
                        wloc,
                    )
                    continue
                words.append(
                    _item(
                        tagged,
                        orth,
                        latin_orth,
                        romanize,
                        kc_id,
                        word,
                        [g.kc for g in so_far if g.occurs(word)],
                    )
                )
            out[node.id] = {
                "orthography": orth,
                "letters": [
                    _item(tagged, orth, latin_orth, romanize, g.kc, g.form, [g.kc]) for g in new
                ],
                "words": words,
            }
    return out


def romanized_orthographies(
    course: CourseSource, profiles: dict[str, OrthographyProfile]
) -> list[str]:
    """The Latin orthographies a course's alphabet nodes tag their spellings with: their profiles
    ship in the bundle beside the course's own."""
    out: list[str] = []
    for orth in course.orthographies:
        profile = profiles.get(orth)
        if profile is not None and getattr(profile, "romanize", None) is not None:
            latin = romanized(profile)
            if latin in profiles and latin not in out:
                out.append(latin)
    return out
