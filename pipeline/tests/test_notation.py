"""The accept notation Python writes (nabu.notation) against the parser that reads it, core's
(packages/core/src/accept/notation.ts, through core-cli): escaped text is one literal alternative,
and the canonical answer Python maps back onto a line is the one core takes from it."""

from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from nabu.notation import canonical_map, escape, literal

from .conftest import CoreCli

PROFILE = "en-Latn/standard"

#: Letters, the specials, a comment sign, a weight's pieces and white space.
TEXT = st.text(alphabet="abc XY()[]|\\@#.1\t", min_size=1, max_size=24).filter(
    lambda t: any(c.isalpha() for c in t)
)


def canonical_source(core_cli: CoreCli, line: str) -> str:
    return str(core_cli.result("accept", profile=PROFILE, accept=line)["canonicalSource"])


def test_an_answer_becomes_one_literal_alternative() -> None:
    assert literal("I (really) am | not @home") == "I \\(really\\) am \\| not \\@home"
    assert literal("# not a comment") == "\\# not a comment"
    assert literal("  two   spaces ") == "two spaces"
    assert escape("a # b", at_start=False) == "a # b"


@settings(max_examples=150, deadline=None)
@given(TEXT)
def test_escaped_text_is_what_core_reads(core_cli: CoreCli, text: str) -> None:
    result = core_cli.result("accept", profile=PROFILE, accept=literal(text))
    assert result["paths"] == 1
    assert result["canonicalSource"] == " ".join(text.split())


WORD = st.sampled_from(["a", "bc", "X", "I'm", "\\(", "\\|", "\\@", "\\#", "\\\\"])


def _sequence(parts: st.SearchStrategy[str]) -> st.SearchStrategy[str]:
    return st.lists(parts, min_size=1, max_size=3).map(" ".join)


GROUP = st.recursive(
    WORD,
    lambda inner: st.one_of(
        st.lists(_sequence(inner), min_size=2, max_size=3).map(lambda o: "(" + "|".join(o) + ")"),
        _sequence(inner).map(lambda s: f"[{s}]"),
    ),
    max_leaves=6,
)
#: A line: a word (no path may be empty), then words and groups, a weight perhaps, spaces around.
LINE = st.tuples(
    st.sampled_from(["", " ", "  "]),
    WORD,
    st.lists(st.one_of(WORD, GROUP), max_size=3),
    st.sampled_from(["", " @2", "  @0.5", " @1 "]),
).map(lambda p: p[0] + " ".join([p[1], *p[2]]) + p[3])


def test_the_canonical_answer_maps_back_to_the_notation(core_cli: CoreCli) -> None:
    for line in [
        "(Thanks|Thank you), I('m| am) (well|fine).",
        "It('s| is) Maryam.",
        "a [b (c|d)] e @2",
    ]:
        text, spans = canonical_map(line)
        assert text == canonical_source(core_cli, line)
        plain = "".join(line[s[0] : s[1]] for s in spans if s is not None)
        assert all(c not in "()[]|" for c in plain)


@settings(max_examples=200, deadline=None)
@given(LINE)
def test_the_canonical_answer_is_the_one_core_takes(core_cli: CoreCli, line: str) -> None:
    text, spans = canonical_map(line)
    assert text == canonical_source(core_cli, line)
    # Each grapheme's span, where it has one, is that grapheme as the line writes it.
    for g, span in zip(text, spans, strict=True):
        if span is not None:
            assert line[span[0] : span[1]] == g
