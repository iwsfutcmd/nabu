"""Alphabet nodes (ADR 0088): a script track's letters and words, with their Latin spellings.

What a letter and a mark are is the orthography's profile's to say (ADR 0124), so a track in any
script needs code only for its romanization:
- **letters** are the units the profile cuts text into (its `letters`, longest first, else
  grapheme clusters) after its normalization and case folding, without the marks of its mark set
  (`match.marks.set`): Σωκράτης is σ ω κ ρ α τ η σ, the fold making Σ and the final ς one σ;
- a grapheme KC whose first form is one letter carrying marks of the profile's mark set is **that
  mark** (the rough breathing: ἁ, ὁ, ῥ; the iota subscript: ᾳ, ῃ, ῳ), and a word has it where any
  of its letters carries it;
- any other grapheme KC is **its letters** (a letter, a diphthong: α; αι), as any of its forms
  spells them (σ, ς, Σ; a final form no fold makes one, Hebrew ך beside כ, is listed among its
  letter's forms), and a word has it where those letters stand together.

A word of an alphabet node must be spelled with the letters taught by then
(`script.untaught-letter`); marks are not checked: the words are shown as the course writes them.
A grapheme KC whose first form has no letter would be in every word (`script.no-letter`). The
orthography's profile names its romanization (`romanize`: a scheme, and the orthography of the
Latin spellings, which needs a profile: `script.no-romanization`), and each word needs a form in
the orthography (`script.missing-form`).
"""

from __future__ import annotations

import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from nabu import greek_translit
from nabu.compiler.diagnostics import Diagnostics, Loc
from nabu.schema.models import CourseSource, OrthographyProfile

if TYPE_CHECKING:
    from nabu.compiler.build import Unit
    from nabu.corecli import CoreCli

#: Romanization schemes a profile can name (`romanize.scheme`), each a word → Latin function.
ROMANIZERS: dict[str, Callable[[str], str]] = {"greek": greek_translit.word}


def romanized(profile: OrthographyProfile) -> str | None:
    """The orthography the profile's Latin spellings are in (grc-Latn/romanized), if it names
    a romanization."""
    return None if profile.romanize is None else str(profile.romanize.orthography)


@dataclass(frozen=True)
class Spelled:
    """Text as its orthography's profile reads it: its letters in order, and its marks."""

    letters: tuple[str, ...]
    marks: frozenset[str]


@dataclass
class Reader:
    """Reads text in one orthography as its profile does (the module's docstring): its letters as
    core cuts them (core-cli `letters`: the profile's normalization, case folding and letters),
    without the marks of its mark set."""

    cli: CoreCli
    orthography: str
    #: The profile's marks, one code point each, as core reads its mark set.
    marks: frozenset[str]
    _read: dict[str, Spelled] = field(default_factory=lambda: {})

    @classmethod
    def of(cls, cli: CoreCli, orthography: str, profile: OrthographyProfile) -> Reader:
        found = profile.match.marks if profile.match is not None else None
        marks: list[str] = [] if found is None else cli.result("unicode-set", set=found.set)
        return cls(cli, orthography, frozenset(m for m in marks if len(m) == 1))

    def __call__(self, text: str) -> Spelled:
        known = self._read.get(text)
        if known is not None:
            return known
        units: list[str] = self.cli.result("letters", profile=self.orthography, text=text)
        letters: list[str] = []
        marks: set[str] = set()
        for unit in units:
            decomposed = unicodedata.normalize("NFD", unit)
            marks |= {c for c in decomposed if c in self.marks}
            base = "".join(c for c in decomposed if c not in self.marks)
            base = unicodedata.normalize("NFC", base)
            if base and unicodedata.category(base[0])[0] == "L":
                letters.append(base)
        spelled = self._read[text] = Spelled(tuple(letters), frozenset(marks))
        return spelled


def _within(word: tuple[str, ...], letters: tuple[str, ...]) -> bool:
    """Whether the letters stand together in the word."""
    n = len(letters)
    return any(word[i : i + n] == letters for i in range(len(word) - n + 1))


@dataclass(frozen=True)
class Grapheme:
    kc: str
    form: str
    #: A letter or a diphthong: its letters, as each of its forms spells them. A mark: none.
    spellings: frozenset[tuple[str, ...]]
    #: A mark: the marks it is.
    marks: frozenset[str]

    def occurs(self, word: Spelled) -> bool:
        if self.marks:
            return bool(self.marks & word.marks)
        return any(_within(word.letters, s) for s in self.spellings)


def grapheme(kc: str, forms: list[str], read: Reader) -> Grapheme | None:
    """A grapheme KC by its forms (the module's docstring); None if its first form has no
    letter."""
    first = read(forms[0])
    if first.marks and len(first.letters) == 1:
        return Grapheme(kc, forms[0], frozenset(), first.marks)
    if not first.letters:
        return None
    spellings = frozenset(s for s in (read(f).letters for f in forms) if s)
    return Grapheme(kc, forms[0], spellings, frozenset())


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
    cli: CoreCli,
) -> dict[str, dict[str, Any]]:
    """Each alphabet node's bundled `alphabet` (node id → {orthography, letters, words}), in course
    order, with the lints. `tagged(orthography, text)` makes a TaggedText; `cli` reads text as
    its profile does."""
    kcs = {kc.id: (unit, ki, kc) for unit in units for ki, kc in enumerate(unit.source.kcs)}
    out: dict[str, dict[str, Any]] = {}
    taught: dict[str, list[Grapheme]] = {}  # orthography → graphemes taught so far
    readers: dict[str, Reader] = {}
    for unit in units:
        for ni, node in enumerate(unit.source.nodes):
            alphabet = node.alphabet
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
            scheme = profile.romanize.scheme if profile.romanize is not None else None
            romanize = ROMANIZERS.get(scheme) if scheme is not None else None
            latin_orth = romanized(profile)
            if romanize is None or latin_orth is None:
                diags.report(
                    "script.no-romanization",
                    f"{node.id}: {orth} has no romanization (its profile's `romanize`)",
                    loc,
                )
                continue
            if latin_orth not in profiles:
                diags.report(
                    "script.no-romanization",
                    f"{node.id}: no profile {latin_orth} for the Latin spellings",
                    loc,
                )
                continue
            read = readers.get(orth)
            if read is None:
                read = readers[orth] = Reader.of(cli, orth, profile)
            new: list[Grapheme] = []
            for kc_id in node.introduces or []:
                found = kcs.get(kc_id)
                if found is None or not kc_id.startswith("grapheme:"):
                    continue
                kc_unit, ki, kc = found
                forms = (kc.forms or {}).get(orth, [])
                if not forms:
                    continue
                g = grapheme(kc_id, list(forms), read)
                if g is None:
                    diags.report(
                        "script.no-letter",
                        f"{kc_id}: {forms[0]!r} has no letter of {orth}, nor one carrying a mark "
                        "of its profile: it would be in every word",
                        kc_unit.doc.loc("kcs", ki, "forms", orth, 0),
                    )
                    continue
                new.append(g)
            so_far = [*taught.get(orth, []), *new]
            taught[orth] = so_far
            known = {letter for g in so_far for s in g.spellings for letter in s}

            words: list[dict[str, Any]] = []
            for wi, kc_id in enumerate(alphabet.words):
                found = kcs.get(kc_id)
                forms = (found[2].forms or {}).get(orth, []) if found is not None else []
                wloc = unit.doc.loc("nodes", ni, "alphabet", "words", wi)
                if not forms:
                    diags.report(
                        "script.missing-form", f"{node.id}: {kc_id} has no {orth} form", wloc
                    )
                    continue
                word = forms[0]
                spelled = read(word)
                missing = sorted(set(spelled.letters) - known)
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
                        [g.kc for g in so_far if g.occurs(spelled)],
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
        latin = romanized(profile) if profile is not None else None
        if latin is not None and latin in profiles and latin not in out:
            out.append(latin)
    return out
