"""Alphabet nodes (ADR 0088): a script track's letters and the lexemes it practises them on,
with their readings in Latin.

What a letter and a mark are is the orthography's profile's to say (ADR 0124), so a track in any
script needs code only where its reading scheme's text is not Latin:
- **letters** are the units the profile cuts text into (its `letters`, longest first, else
  grapheme clusters) after its normalization and case folding, without the marks of its mark set
  (`match.marks.set`): Σωκράτης is σ ω κ ρ α τ η σ, the fold making Σ and the final ς one σ;
- a grapheme whose first form is one letter carrying marks of the profile's mark set is **that
  mark** (the rough breathing: ἁ, ὁ, ῥ; the iota subscript: ᾳ, ῃ, ῳ), and a word has it where any
  of its letters carries it;
- any other grapheme is **its letters** (a letter, a diphthong: α; αι), as any of its forms
  spells them (σ, ς, Σ; a final form no fold makes one, Hebrew ך beside כ, is listed among its
  letter's forms), and a word has it where those letters stand together.

A lexeme of an alphabet node must be spelled with the letters taught by then
(`script.untaught-letter`); marks are not checked: the words are shown as the course writes them.
A grapheme whose first form has no letter would be in every word (`script.no-letter`).

What the track asks its letters and words as is their reading (ADR 0133), in Latin letters for a
learner who cannot read the script yet: the orthography's profile names the scheme
(`scriptTrack.reading`), and the scheme the orthography of its Latin (`latin`, which needs a
profile): `script.no-reading-scheme`. A lexeme's Latin is its pinned reading (ADR 0117), the one
its word card shows and its clip says, written in Latin by the scheme's `latin` plug-in where the
scheme's text is not Latin (Attic: χώρᾱ is chōrā), as it stands otherwise (Schluessel); a lexeme
with none is `script.missing-reading` (give its entry `readings`). A letter has no reading: it is
the plug-in's rendering of the letter (α is a), or, where the scheme has no plug-in (an abjad's
letter stands for several sounds), its grapheme's own first form in the Latin orthography (chg's
ب is b). Each lexeme needs a spelling in the orthography, and such a letter a form in the Latin
(`script.missing-form`). The track is compiled once the lexemes' readings are pinned.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import partial
from typing import TYPE_CHECKING, Any

from nabu.compiler.diagnostics import Diagnostics, Loc
from nabu.items import WORD_KINDS
from nabu.lexicon import GRAPHEME, Language
from nabu.schema.models import (
    BundleAlphabet,
    BundleLexicon,
    BundleUnit,
    CourseSource,
    GraphemeSource,
    OrthographyProfile,
)
from nabu.schemes import plugins, schemes

if TYPE_CHECKING:
    from nabu.compiler.build import Unit
    from nabu.corecli import CoreCli


@dataclass(frozen=True)
class Track:
    """What an orthography's alphabet track asks its letters and words as: their reading in
    `scheme`, written in `latin`, by `write` where the scheme's text is not Latin."""

    scheme: str
    latin: str
    write: Callable[[str], str] | None


def track(profile: OrthographyProfile) -> Track | None:
    """The orthography's track (its profile's `scriptTrack`), if it names a scheme with a Latin
    orthography."""
    if profile.scriptTrack is None:
        return None
    scheme = str(profile.scriptTrack.reading)
    found = schemes().get(scheme)
    if found is None or found.latin is None:
        return None
    return Track(scheme, str(found.latin), plugins(scheme).latin)


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
    id: str
    form: str
    #: A letter or a diphthong: its letters, as each of its forms spells them. A mark: none.
    spellings: frozenset[tuple[str, ...]]
    #: A mark: the marks it is.
    marks: frozenset[str]

    def occurs(self, word: Spelled) -> bool:
        if self.marks:
            return bool(self.marks & word.marks)
        return any(_within(word.letters, s) for s in self.spellings)


def grapheme(ident: str, forms: list[str], read: Reader) -> Grapheme | None:
    """A grapheme by its forms (the module's docstring); None if its first form has no letter."""
    first = read(forms[0])
    if first.marks and len(first.letters) == 1:
        return Grapheme(ident, forms[0], frozenset(), first.marks)
    if not first.letters:
        return None
    spellings = frozenset(s for s in (read(f).letters for f in forms) if s)
    return Grapheme(ident, forms[0], spellings, frozenset())


def _item(
    tagged: Callable[[str, str], dict[str, Any]],
    orth: str,
    latin_orth: str,
    latin: str,
    ident: str,
    text: str,
    letters: list[str],
) -> dict[str, Any]:
    """A bundled script item: what it is, its written form and its Latin."""
    return {
        "id": ident,
        "letters": letters,
        "text": tagged(orth, text),
        "latin": tagged(latin_orth, latin),
    }


def _readings(lexicon: BundleLexicon) -> Callable[[str, str, str], str | None]:
    """(lexeme, orthography, scheme) → the reading pinned on the words of the lexeme's first
    spelling in the orthography (ADR 0117), its words' readings joined by spaces; None where a
    word has none."""
    firsts = {
        str(lexeme.id): {orth: texts[0] for orth, texts in (lexeme.forms or {}).items() if texts}
        for lexeme in lexicon.lexemes
    }

    def reading(lexeme: str, orth: str, scheme: str) -> str | None:
        text = firsts.get(lexeme, {}).get(orth)
        if text is None:
            return None
        words = [(t.readings or {}).get(scheme) for t in text.tokens if t.kind in WORD_KINDS]
        if not words or any(r is None for r in words):
            return None
        return " ".join(r for r in words if r is not None)

    return reading


def _letter_latin(
    diags: Diagnostics,
    graphemes: dict[str, tuple[Unit, int, GraphemeSource]],
    t: Track,
    node_id: str,
    g: Grapheme,
    where: Loc,
) -> str | None:
    """A letter's Latin: the scheme's plug-in's rendering of it, or its own first form in the
    Latin orthography (the module's docstring)."""
    if t.write is not None:
        return t.write(g.form)
    found = graphemes.get(g.id)
    own = (found[2].forms or {}).get(t.latin, []) if found is not None else []
    if not own:
        diags.report("script.missing-form", f"{node_id}: {g.id} has no {t.latin} form", where)
        return None
    return own[0]


def compile_alphabets(
    diags: Diagnostics,
    course: CourseSource,
    units: list[Unit],
    lexicon: BundleLexicon,
    lang: Language,
    profiles: dict[str, OrthographyProfile],
    tagged: Callable[[str, str], dict[str, Any]],
    cli: CoreCli,
) -> dict[str, dict[str, Any]]:
    """Each alphabet node's bundled `alphabet` (node id → {orthography, letters, lexemes}), in
    course order, with the lints. `lexicon`: the bundle's, with its readings pinned (ADR 0117),
    which a lexeme's Latin is written from; `lang`: the language's lexicon, for an entry's
    spelling and its place in its file; `tagged(orthography, text)` makes a TaggedText; `cli`
    reads text as its profile does."""
    graphemes = {
        str(g.id): (unit, gi, g)
        for unit in units
        for gi, g in enumerate(unit.source.graphemes or [])
    }
    reading_of = _readings(lexicon)
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
            t = track(profile)
            if t is None:
                diags.report(
                    "script.no-reading-scheme",
                    f"{node.id}: {orth} names no reading scheme with a Latin orthography for its "
                    "track (its profile's `scriptTrack`, the scheme's `latin`)",
                    loc,
                )
                continue
            if t.latin not in profiles:
                diags.report(
                    "script.no-reading-scheme",
                    f"{node.id}: no profile {t.latin} for the {t.scheme} scheme's Latin",
                    loc,
                )
                continue
            read = readers.get(orth)
            if read is None:
                read = readers[orth] = Reader.of(cli, orth, profile)

            letter_latin = partial(_letter_latin, diags, graphemes, t, node.id)
            new: list[tuple[Grapheme, str]] = []
            for teachable in node.introduces or []:
                ident = str(teachable)
                found = graphemes.get(ident)
                if found is None or not ident.startswith(GRAPHEME):
                    continue
                g_unit, gi, source = found
                forms = (source.forms or {}).get(orth, [])
                if not forms:
                    continue
                g = grapheme(ident, list(forms), read)
                if g is None:
                    diags.report(
                        "script.no-letter",
                        f"{ident}: {forms[0]!r} has no letter of {orth}, nor one carrying a mark "
                        "of its profile: it would be in every word",
                        g_unit.doc.loc("graphemes", gi, "forms", orth, 0),
                    )
                    continue
                latin = letter_latin(g, g_unit.doc.loc("graphemes", gi, "forms"))
                if latin is None:
                    continue
                new.append((g, latin))
            so_far = [*taught.get(orth, []), *(g for g, _ in new)]
            taught[orth] = so_far
            known = {letter for g in so_far for s in g.spellings for letter in s}

            lexemes: list[dict[str, Any]] = []
            for wi, named in enumerate(alphabet.lexemes):
                ident = str(named)
                entry = lang.get(ident)
                forms = [] if entry is None else lang.spelled(entry, orth)
                wloc = unit.doc.loc("nodes", ni, "alphabet", "lexemes", wi)
                if not forms:
                    diags.report(
                        "script.missing-form", f"{node.id}: {ident} has no {orth} spelling", wloc
                    )
                    continue
                word = forms[0]
                spelled = read(word)
                missing = sorted(set(spelled.letters) - known)
                if missing:
                    diags.report(
                        "script.untaught-letter",
                        f"{node.id}: {word!r} ({ident}) needs {' '.join(missing)}, not taught yet",
                        wloc,
                    )
                    continue
                reading = reading_of(ident, orth, t.scheme)
                if reading is None:
                    diags.report(
                        "script.missing-reading",
                        f"{node.id}: {word!r} ({ident}) has no {t.scheme} reading: no sentence "
                        "spells it, so give its entry `readings`",
                        wloc,
                    )
                    continue
                latin = t.write(reading) if t.write is not None else reading
                lexemes.append(
                    _item(
                        tagged,
                        orth,
                        t.latin,
                        latin,
                        ident,
                        word,
                        [g.id for g in so_far if g.occurs(spelled)],
                    )
                )
            out[node.id] = {
                "orthography": orth,
                "letters": [
                    _item(tagged, orth, t.latin, latin, g.id, g.form, [g.id]) for g, latin in new
                ],
                "lexemes": lexemes,
            }
    return out


def with_alphabets(
    units: list[BundleUnit], alphabets: dict[str, dict[str, Any]]
) -> list[BundleUnit]:
    """The units with each alphabet node's compiled `alphabet`."""
    out: list[BundleUnit] = []
    for unit in units:
        if not any(n.id in alphabets for n in unit.nodes):
            out.append(unit)
            continue
        nodes = [
            n.model_copy(update={"alphabet": BundleAlphabet.model_validate(alphabets[n.id])})
            if n.id in alphabets
            else n
            for n in unit.nodes
        ]
        out.append(unit.model_copy(update={"nodes": nodes}))
    return out


def latin_orthographies(course: CourseSource, profiles: dict[str, OrthographyProfile]) -> list[str]:
    """The orthographies a course's cards write in beside its own, whose profiles ship in the bundle
    with the course's (a course orthography ships anyway): the Latin one its alphabet tracks tag
    their letters and words with (their schemes' `latin`, ADR 0133), and the one each reading layer
    typed as text is graded by (a scheme's `answer` with `typedByProfile`: Schluessel, Pinyin,
    Baxter; ADR 0131, 0138)."""
    out: list[str] = []

    def add(orth: str | None) -> None:
        if orth is None or orth in out or orth in course.orthographies:
            return
        if orth in profiles:
            out.append(orth)

    for orth in course.orthographies:
        profile = profiles.get(orth)
        if profile is None:
            continue
        t = track(profile)
        add(t.latin if t is not None else None)
        for layer in profile.annotations or []:
            if layer.kind != "reading" or layer.scheme is None:
                continue
            data = schemes().get(str(layer.scheme))
            if data is not None and data.typedByProfile:
                add(data.answer)
    return out
