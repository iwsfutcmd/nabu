"""A language's lexicon as the pipeline reads it (ADR 0145; docs/migration-design.md):
lexicons/<lang>/lexemes.yaml, every lexeme in one flat list, and language.yaml, what the language
declares beside it (dimensions, lexical features, defaults, labels, named rules).

A course points at its language's lexicon and its nodes at the entries; no entry names a unit.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import ValidationError

from nabu.compiler.diagnostics import Loc
from nabu.compiler.source import Doc, load_doc
from nabu.schema.models import Default, LanguageDeclaration, Lexeme, Lexicon

LEXEME = "lexeme:"
RULE = "rule:"
FEATURE = "feature:"
GRAPHEME = "grapheme:"


def kind_of(teachable: str) -> str:
    """What a teachable or a part is: lexeme, feature, rule or grapheme."""
    return teachable.split(":", 1)[0]


def feature_id(name: str, value: str) -> str:
    """One value of one feature, as a node introduces it: feature:Tense=Past."""
    return f"{FEATURE}{name}={value}"


def _clusters(text: str) -> tuple[set[str], list[tuple[str, set[str]]]]:
    """A text as its letters, each with the marks on it; and the marks it begins with, which sit
    on the letter before it."""
    leading: set[str] = set()
    out: list[tuple[str, set[str]]] = []
    for ch in unicodedata.normalize("NFD", text).casefold():
        if unicodedata.combining(ch):
            (out[-1][1] if out else leading).add(ch)
        else:
            out.append((ch, set()))
    return leading, out


def letters(text: str) -> str:
    """Letters with no accent, for a beginning or an ending: Greek -ός is -ος."""
    bare = "".join(ch for ch in unicodedata.normalize("NFD", text) if not unicodedata.combining(ch))
    return unicodedata.normalize("NFC", bare).casefold()


def ends(spelling: str, ending: str) -> bool:
    """Whether a spelling ends so. An ending written with marks needs them where it has them
    (Hebrew qamats and he, not any he), whatever other marks the letters carry; one written
    without is compared on the letters alone (Greek -ος is -ός)."""
    leading, tail = _clusters(ending)
    _, word = _clusters(spelling)
    if len(tail) > len(word) or (leading and len(tail) >= len(word)):
        return False
    start = len(word) - len(tail)
    for (letter, marks), (want, needed) in zip(word[start:], tail, strict=True):
        if letter != want or not needed <= marks:
            return False
    return not leading or leading <= word[start - 1][1]


def default_for(
    defaults: Iterable[Default], pos: str | None, spelling: str, feature: str
) -> Default | None:
    """The most specific default that speaks of this feature for a lexeme so written (ADR 0148:
    a default is a rule): the one whose ending is longest."""
    best: Default | None = None
    for d in defaults:
        when = d.when
        if feature not in d.gives:
            continue
        if when.pos is not None and when.pos != pos:
            continue
        if when.ends is not None and not ends(spelling, when.ends):
            continue
        if when.starts is not None and not letters(spelling).startswith(letters(when.starts)):
            continue
        if best is None or len(when.ends or "") > len(best.when.ends or ""):
            best = d
    return best


@dataclass
class Language:
    """A language's lexicon and declaration, with where each entry stands in its file."""

    code: str
    folder: Path
    """Where its files are kept (lexicons/<lang>/, or a one-file course's own folder): what an
    entry's picture is relative to."""
    lexicon: Lexicon
    declared: LanguageDeclaration
    doc: Doc
    declared_doc: Doc
    index: dict[str, int] = field(default_factory=lambda: {})

    def __post_init__(self) -> None:
        self.index = {str(entry.id): i for i, entry in enumerate(self.lexicon.lexemes)}

    def get(self, lexeme: str) -> Lexeme | None:
        i = self.index.get(lexeme)
        return None if i is None else self.lexicon.lexemes[i]

    def loc(self, lexeme: str, *path: str | int) -> Loc:
        i = self.index.get(lexeme)
        return self.doc.loc() if i is None else self.doc.loc("lexemes", i, *path)

    def rules(self) -> dict[str, int]:
        """The rules the language names, each with its place in language.yaml."""
        return {str(r.id): i for i, r in enumerate(self.declared.rules or [])}

    def feature_values(self) -> set[str]:
        """Every feature value the language declares, as an id (feature:Tense=Past)."""
        return {
            feature_id(name, value)
            for name, values in (self.declared.features or {}).items()
            for value in values
        }

    def spelled(self, entry: Lexeme, orthography: str) -> list[str]:
        """How an entry is written in an orthography: its own spellings, the first the one a card
        shows. Not its allomorphs: those are how it is written inside a token (a stem before a
        suffix), which nothing shows or looks up alone."""
        return [str(s) for s in (entry.spelled or {}).get(orthography, [])]

    def effective(self, entry: Lexeme, chosen: Mapping[str, str] | None = None) -> dict[str, str]:
        """The feature values a token of the entry has in all: those chosen on the token, and
        those the entry has of itself for its category (a noun's gender), stored or by a
        default. What two tokens must share to stand in one form (ADR 0132): la mano and la casa
        are both feminine singular, though only hermana chooses it."""
        own = set(self.own_features(entry))
        out = {k: v for k, v in self.lexical(entry).items() if k in own}
        out.update({str(k): str(v) for k, v in (chosen or {}).items()})
        return dict(sorted(out.items()))

    def shown(self, entry: Lexeme) -> str:
        """The spelling a default looks at: the entry's first, in the first orthography it is
        spelled in (its lexical form, once the language has a notation for one)."""
        for spellings in (entry.spelled or {}).values():
            if spellings:
                return str(spellings[0])
        return ""

    def own_features(self, entry: Lexeme) -> list[str]:
        """The features an entry's category has of itself in this language (a noun's gender)."""
        if entry.pos is None:
            return []
        for pos, features in (self.declared.lexical or {}).items():
            if str(pos) == str(entry.pos):
                return [str(f) for f in features]
        return []

    def lexical(self, entry: Lexeme) -> dict[str, str]:
        """An entry's lexical features, every one: what it stores, and what a default of the
        language gives for a feature its category has of itself and it does not store."""
        out: dict[str, str] = {str(k): str(v) for k, v in (entry.feats or {}).items()}
        pos = None if entry.pos is None else str(entry.pos)
        for feature in self.own_features(entry):
            if feature in out or feature in (entry.chooses or []):
                continue
            d = default_for(self.declared.defaults or [], pos, self.shown(entry), feature)
            if d is not None:
                out[feature] = str(d.gives[feature])
        return dict(sorted(out.items()))

    def parts(self, entry: Lexeme) -> list[str]:
        """An entry's parts beyond itself (ADR 0146: every part no rule gives): a lexical feature
        of its category that it stores, since no default gives it."""
        stored = entry.feats or {}
        return [
            f"{entry.id}|{feature}" for feature in self.own_features(entry) if feature in stored
        ]


@dataclass
class LexiconError:
    """A file that is missing or does not fit its schema."""

    loc: Loc
    message: str


def _errors(doc: Doc, error: ValidationError) -> list[LexiconError]:
    out: list[LexiconError] = []
    for e in error.errors():
        path = list(e["loc"])
        where = ".".join(str(p) for p in path) or "(root)"
        out.append(LexiconError(doc.loc(*path), f"{where}: {e['msg']}"))
    return out


def load_language(
    root: Path, code: str, display: Mapping[Path, str] | None = None
) -> tuple[Language | None, list[LexiconError]]:
    """A language's lexicon from `root` (the repo's lexicons/), or what is wrong with it."""
    folder = root / code
    shown = display or {}
    docs: list[Doc] = []
    errors: list[LexiconError] = []
    for name in ("lexemes.yaml", "language.yaml"):
        path = folder / name
        label = shown.get(path, f"lexicons/{code}/{name}")
        if not path.is_file():
            errors.append(LexiconError(Loc(label, 1), f"no {name} for {code}"))
            continue
        docs.append(load_doc(path, label))
    if errors:
        return None, errors
    lexemes_doc, language_doc = docs
    try:
        lexicon = Lexicon.model_validate(lexemes_doc.data)
    except ValidationError as error:
        return None, _errors(lexemes_doc, error)
    try:
        declared = LanguageDeclaration.model_validate(language_doc.data)
    except ValidationError as error:
        return None, _errors(language_doc, error)
    return Language(code, folder, lexicon, declared, lexemes_doc, language_doc), []


def sorted_feats(feats: Mapping[str, str] | None) -> dict[str, str]:
    return {k: str(feats[k]) for k in sorted(feats)} if feats else {}


def taught_values(feats: Mapping[str, str] | None, taught: Sequence[str] | set[str]) -> list[str]:
    """The feature values of a token's lexeme that a node of the course introduces, in the order
    of their names."""
    out: list[str] = []
    for name in sorted(feats or {}):
        for value in str((feats or {})[name]).split(","):
            ident = feature_id(name, value)
            if ident in taught and ident not in out:
                out.append(ident)
    return out
