"""A form's key (schemas/common.schema.json `FormKey`): one form of a lexeme as a string.

    lexeme:ra7|form:Aspect=Part;Gender=Masc;Number=Sing
    lexeme:badd+lexeme:poss-1sg

The lexeme's id, then `|form:` and the feature values chosen there as Name=Value, sorted by name
and joined by `;`; a lexeme with no values chosen is its id alone. A token built of several
lexemes is their keys joined by `+`, in the order it writes them. It names the clip that says a
form, and the pairs a learner has seen (ADR 0146). @nabu/core has its twin (`formKey`); the
conformance vectors of kind `form-key` hold the two together.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence


def lexeme_form_key(lexeme: str, feats: Mapping[str, str] | None = None) -> str:
    """One lexeme in one form."""
    if not feats:
        return lexeme
    return f"{lexeme}|form:" + ";".join(f"{name}={feats[name]}" for name in sorted(feats))


def form_key(lexemes: Sequence[tuple[str, Mapping[str, str] | None]]) -> str:
    """A token's key: each lexeme it writes, in order, in the form it has there."""
    return "+".join(lexeme_form_key(lexeme, feats) for lexeme, feats in lexemes)


def parse_form_key(key: str) -> list[tuple[str, dict[str, str]]]:
    """A key's lexemes and their feature values: the inverse of `form_key`."""
    out: list[tuple[str, dict[str, str]]] = []
    for part in key.split("+"):
        lexeme, _, said = part.partition("|form:")
        feats = dict(pair.split("=", 1) for pair in said.split(";")) if said else {}
        out.append((lexeme, feats))
    return out
