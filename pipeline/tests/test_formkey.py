"""A form's key (ADR 0146) is built here (nabu.formkey) and in core (`formKey`): the two are
pinned to the same conformance vectors (conformance/form-key.json), which the core-cli harnesses
run against core."""

from __future__ import annotations

import json
from typing import Any

import pytest

from nabu.formkey import form_key, is_form, lexeme_form_key, parse_form_key, token_key

from .conftest import ROOT

VECTORS = json.loads((ROOT / "conformance/form-key.json").read_text(encoding="utf-8"))["vectors"]


@pytest.mark.parametrize("vector", VECTORS, ids=[v["id"] for v in VECTORS])
def test_python_keys_a_form_as_core_does(vector: dict[str, Any]) -> None:
    args = vector["args"]
    if vector["op"] == "form-key":
        written = [(str(w["lexeme"]), w.get("feats")) for w in args["token"].get("lexemes", [])]
        assert {"key": token_key(written)} == vector["expected"]
    else:
        parsed = [
            {"lexeme": lexeme, "feats": feats} for lexeme, feats in parse_form_key(args["key"])
        ]
        assert parsed == vector["expected"]


def test_a_key_parses_back_to_what_made_it() -> None:
    written = [("lexeme:kitob", {"Number": "Plur"}), ("lexeme:poss-1sg", None)]
    assert parse_form_key(form_key(written)) == [
        ("lexeme:kitob", {"Number": "Plur"}),
        ("lexeme:poss-1sg", {}),
    ]


def test_a_form_is_told_from_a_lexemes_own_entry() -> None:
    assert not is_form("lexeme:casa")
    assert is_form(lexeme_form_key("lexeme:casa", {"Number": "Plur"}))
    assert is_form("lexeme:badd+lexeme:poss-1sg")
    assert not is_form("s.12")
