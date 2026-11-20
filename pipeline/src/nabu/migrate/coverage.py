"""What a converted course says against what its language declares (docs/migration-design.md,
"What the converter reports"): the dimensions its tokens leave unsaid, the values they carry
that no dimension declares, and the endings a default could still cover. Tables for a reviewer;
nothing here changes what is written."""

from __future__ import annotations

import collections
import unicodedata
from typing import Any

from nabu.migrate.convert import Converter
from nabu.migrate.source import obj, seq

Json = dict[str, Any]


def _realised(conv: Converter) -> dict[str, set[str]]:
    """The features each lexeme that is a value head realises (uz -lar: Number)."""
    out: dict[str, set[str]] = {}
    for lexeme, kc in conv.taken.items():
        fp = conv.plan.forms.get(kc)
        if fp is not None and fp.realises is not None:
            out[lexeme] = set(fp.realises)
    return out


def dimensions(conv: Converter) -> list[tuple[str, ...]]:
    """For each category and each of its dimensions: the tokens that say a value of it, on
    themselves or by an ending written on them, and those that leave it unsaid."""
    declared: dict[str, list[str]] = {
        str(p): [str(d) for d in seq(ds)] for p, ds in obj(conv.plan.data.get("dimensions")).items()
    }
    realised = _realised(conv)
    said: collections.Counter[tuple[str, str]] = collections.Counter()
    unsaid: collections.Counter[tuple[str, str]] = collections.Counter()
    for forms in conv.items.values():
        for toks in forms.values():
            for tok in toks:
                here = {f for p in tok.parts for f in realised.get(p.lexeme, set())}
                for part in tok.parts:
                    if part.pos not in declared or (len(tok.parts) > 1 and not part.base):
                        continue
                    for dim in declared[part.pos]:
                        if dim in part.said or dim in here:
                            said[(part.pos, dim)] += 1
                        else:
                            unsaid[(part.pos, dim)] += 1
    return [
        (pos, dim, str(said[(pos, dim)]), str(unsaid[(pos, dim)]))
        for pos, dims in declared.items()
        for dim in dims
    ]


def undeclared(conv: Converter) -> list[tuple[str, ...]]:
    """Values tokens carry that their category declares no dimension for, with the lexemes
    that carry them: a category whose members do not all inflect (a pronoun), or a lexeme
    tagged as another category than it behaves as (es mucho, an adverb that agrees)."""
    declared: dict[str, set[str]] = {
        str(p): {str(d) for d in seq(ds)} for p, ds in obj(conv.plan.data.get("dimensions")).items()
    }
    tokens: collections.Counter[tuple[str, str]] = collections.Counter()
    lexemes: dict[tuple[str, str], collections.Counter[str]] = collections.defaultdict(
        collections.Counter
    )
    for _, part in conv.parts():
        pos = part.pos or "(none)"
        for feature in part.feats:
            if feature not in declared.get(pos, set()):
                tokens[(pos, feature)] += 1
                lexemes[(pos, feature)][part.lexeme] += 1
    return [
        (pos, feature, str(n), ", ".join(lex for lex, _ in lexemes[(pos, feature)].most_common(6)))
        for (pos, feature), n in sorted(tokens.items())
    ]


def _letters(text: str) -> str:
    bare = "".join(ch for ch in unicodedata.normalize("NFD", text) if not unicodedata.combining(ch))
    return unicodedata.normalize("NFC", bare).casefold()


def endings(stored: list[tuple[str, str, str]]) -> list[tuple[str, ...]]:
    """Endings among the lexemes that store a lexical feature (no default gives it, or one is
    broken) which every such lexeme shares the value of: candidates for a default. `stored` is
    (feature, value, spelling)."""
    by_ending: dict[tuple[str, str], collections.Counter[str]] = collections.defaultdict(
        collections.Counter
    )
    examples: dict[tuple[str, str, str], list[str]] = collections.defaultdict(list)
    for feature, value, spelling in stored:
        letters = _letters(spelling)
        for size in (1, 2, 3):
            if len(letters) > size:
                ending = letters[-size:]
                by_ending[(feature, ending)][value] += 1
                examples[(feature, ending, value)].append(spelling)
    rows: list[tuple[str, ...]] = []
    seen: set[frozenset[str]] = set()
    for (feature, ending), values in sorted(by_ending.items(), key=lambda kv: -sum(kv[1].values())):
        value, n = values.most_common(1)[0]
        words = examples[(feature, ending, value)]
        if n < 3 or n != sum(values.values()) or frozenset(words) in seen:
            continue
        seen.add(frozenset(words))
        rows.append((f"-{ending}", f"{feature}={value}", str(n), ", ".join(words[:6])))
    return rows
