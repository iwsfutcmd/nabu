"""A compiled token's lexemes (ADR 0145; schemas/tagged-text.schema.json `WrittenLexeme`).

A source token names its one lexeme itself (`lexeme`, `feats`) or lists several (`lexemes`); a
compiled token has one shape: `lexemes`, a list of one or more, each with its full id. There is
no unit between a token and a lexeme: a stem, a clitic and an affix are all in the list.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, cast

from nabu.formkey import form_key
from nabu.lexicon import LEXEME
from nabu.schema.models import SourceToken, TokenLexeme

Json = dict[str, Any]


def _relation(source: SourceToken | TokenLexeme, out: Json) -> None:
    if source.n is not None:
        out["n"] = source.n
    if source.head is not None:
        out["head"] = source.head
    if source.rel is not None:
        out["rel"] = source.rel


def written(token: SourceToken) -> list[Json]:
    """The lexemes a source token writes, as a compiled token lists them."""
    if token.lexemes:
        out: list[Json] = []
        for part in token.lexemes:
            entry: Json = {"lexeme": f"{LEXEME}{part.lexeme}", "surface": part.surface}
            if part.base:
                entry["base"] = True
            if part.feats:
                entry["feats"] = {k: str(part.feats[k]) for k in sorted(part.feats)}
            _relation(part, entry)
            out.append(entry)
        return out
    if token.lexeme is not None:
        entry = {"lexeme": f"{LEXEME}{token.lexeme}"}
        if token.feats:
            entry["feats"] = {k: str(token.feats[k]) for k in sorted(token.feats)}
        _relation(token, entry)
        return [entry]
    return []


def lexemes_of(token: Mapping[str, Any]) -> list[Json]:
    """A compiled token's lexemes; none for a space, punctuation or a word left bare."""
    return cast(list[Json], token.get("lexemes") or [])


def ids_of(token: Mapping[str, Any]) -> list[str]:
    """The ids of the lexemes a compiled token writes, in order."""
    return [str(part["lexeme"]) for part in lexemes_of(token)]


def base_of(token: Mapping[str, Any]) -> Json | None:
    """The lexeme a token's others are merged onto: the one marked, or its only one. A token of
    two equals has none."""
    parts = lexemes_of(token)
    if len(parts) == 1:
        return parts[0]
    return next((p for p in parts if p.get("base")), None)


def base_id(token: Mapping[str, Any]) -> str | None:
    base = base_of(token)
    return None if base is None else str(base["lexeme"])


def feats_of(part: Mapping[str, Any]) -> dict[str, str]:
    return cast(dict[str, str], part.get("feats") or {})


def analysis(token: Mapping[str, Any]) -> str | None:
    """How a token is annotated, as one string: the key of the form it writes (its lexemes, each
    with the feature values chosen there). None for a token that names no lexeme."""
    parts = lexemes_of(token)
    if not parts:
        return None
    return form_key([(str(p["lexeme"]), feats_of(p)) for p in parts])


def source_analysis(token: SourceToken) -> str | None:
    """`analysis` of a source token, before it is compiled."""
    return analysis({"lexemes": written(token)})


def split_surfaces(parts: Sequence[Mapping[str, Any]]) -> list[str] | None:
    """The letters of each lexeme of a token that writes several, or None where the token writes
    one (its letters are the token's)."""
    if len(parts) < 2 and not (parts and "surface" in parts[0]):
        return None
    return [str(p.get("surface", "")) for p in parts]
