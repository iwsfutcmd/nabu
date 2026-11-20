"""Relations between the lexemes a form writes, where agreement matters (ADR 0145, round 6:
a token names its Universal Dependencies head and relation where it agrees or is governed).

Today's courses hold no trees. What they do hold is enough to draft the edges agreement needs:
which lexemes stand next to which, their parts of speech, and the gender, number and case the
form KCs pinned on them. Each language's plan states its rules (`relations`), and this module
applies them: a determiner to the noun it stands before, an adjective to the noun beside it, an
article or a preposition to the word it is written on. A rule links only where the values agree
and nothing stands between, so what it writes is a draft a reviewer can trust more than not;
what it cannot link stays bare and is counted (ADR 0145: trees are drafted, then corrected).
"""

from __future__ import annotations

import collections
from dataclasses import dataclass
from typing import Any

from nabu.migrate.convert import Converter, Finding, Part
from nabu.migrate.lexicon import offsets
from nabu.migrate.plan import PlanError
from nabu.migrate.source import obj, seq

Json = dict[str, Any]


@dataclass(frozen=True)
class Rule:
    rel: str
    source: tuple[str, ...]
    """Parts of speech of what depends."""
    target: tuple[str, ...]
    """Parts of speech of what it depends on."""
    side: str
    """Where the head stands: right, left, either (left first), or inside the same token."""
    agree: tuple[str, ...] = ()
    skip: tuple[str, ...] = ()
    """Parts of speech that may stand between the two."""
    reach: int = 0
    """How many such may."""


def rules_of(data: Json) -> list[Rule]:
    out: list[Rule] = []
    for raw in seq(data.get("relations")):
        r = obj(raw)
        extra = set(r) - {"rel", "from", "to", "side", "agree", "skip", "reach"}
        if extra or r.get("side") not in ("right", "left", "either", "inside"):
            raise PlanError(f"relations: {r} is no rule the converter knows")
        out.append(
            Rule(
                rel=str(r["rel"]),
                source=tuple(str(x) for x in seq(r.get("from"))),
                target=tuple(str(x) for x in seq(r.get("to"))),
                side=str(r["side"]),
                agree=tuple(str(x) for x in seq(r.get("agree"))),
                skip=tuple(str(x) for x in seq(r.get("skip"))),
                reach=int(r.get("reach") or 0),
            )
        )
    return out


@dataclass
class _Slot:
    part: Part
    token: int
    start: int
    end: int


def _agrees(a: Part, b: Part, features: tuple[str, ...]) -> bool | None:
    """Whether two parts have the same values of the features: None where neither side says.
    One form in several values (a Greek neuter, nominative and accusative) agrees with any."""
    said = False
    for f in features:
        x, y = a.said.get(f), b.said.get(f)
        if x is None or y is None:
            continue
        said = True
        if not set(x.split(",")) & set(y.split(",")):
            return False
    return True if said else None


def relate(conv: Converter) -> tuple[Json, list[Finding]]:
    """Number the lexemes of every form and write the edges the plan's rules find."""
    rules = rules_of(conv.plan.data)
    stats: collections.Counter[str] = collections.Counter()
    findings: list[Finding] = []
    if not rules:
        return {}, findings
    agreeing = {pos for r in rules if r.agree for pos in r.source}
    for item in conv.course.items():
        for orth, toks in conv.items[item.id].items():
            text = str(item.data["forms"][orth]["text"])
            spans = offsets(text, [t.surface for t in toks])
            slots: list[_Slot] = []
            for ti, (tok, (start, end)) in enumerate(zip(toks, spans, strict=True)):
                at = start
                spelled = "".join(p.surface for p in tok.parts) == tok.surface
                for part in tok.parts:
                    here = (at, at + len(part.surface)) if spelled else (start, end)
                    slots.append(_Slot(part, ti, *here))
                    at += len(part.surface)
            for n, slot in enumerate(slots, 1):
                slot.part.n = n
                slot.part.head = None
                slot.part.rel = None
            for i, slot in enumerate(slots):
                dep = slot.part
                for rule in rules:
                    if dep.head is not None or dep.pos not in rule.source:
                        continue
                    for head, adjacent in _heads(rule, i, slots, text):
                        other = slots[head].part
                        if rule.agree and _agrees(dep, other, rule.agree) is False:
                            if adjacent and rule.rel == "det":
                                findings.append(
                                    Finding(
                                        "agreement",
                                        f"{item.id} ({orth})",
                                        f"{dep.surface} ({_values(dep, rule.agree)}) stands "
                                        f"before {other.surface} ({_values(other, rule.agree)}) "
                                        "and does not agree with it",
                                    )
                                )
                            continue
                        dep.head = other.n
                        dep.rel = rule.rel
                        stats[f"{rule.rel}: written"] += 1
                        break
                if dep.head is None and dep.pos in agreeing and dep.said:
                    stats[f"{dep.pos} with values and no relation"] += 1
            linked = {s.part.head for s in slots if s.part.head is not None}
            for slot in slots:
                if slot.part.head is None and slot.part.n not in linked:
                    slot.part.n = None
    return dict(stats), findings


def _values(part: Part, features: tuple[str, ...]) -> str:
    return ", ".join(f"{f}={part.said[f]}" for f in features if f in part.said) or "no values"


def _clear(text: str, a: _Slot, b: _Slot) -> bool:
    """Nothing but space between two lexemes: no comma, no stop, no bracket."""
    lo, hi = (a.end, b.start) if a.end <= b.start else (b.end, a.start)
    return not text[lo:hi].strip()


def _heads(rule: Rule, i: int, slots: list[_Slot], text: str) -> list[tuple[int, bool]]:
    """The slots a rule could make this one depend on, the likeliest first, and whether each is
    its neighbour."""
    me = slots[i]
    if rule.side == "inside":
        return [
            (j, True)
            for j, other in enumerate(slots)
            if j != i
            and other.token == me.token
            and other.part.base
            and other.part.pos in rule.target
        ]
    out: list[tuple[int, bool]] = []
    for step in (-1, 1) if rule.side == "either" else (1,) if rule.side == "right" else (-1,):
        skipped = 0
        j = i + step
        while 0 <= j < len(slots):
            other = slots[j]
            between = slots[j - step]
            if other.token != between.token and not _clear(text, between, other):
                break
            if other.part.pos in rule.target:
                out.append((j, skipped == 0))
                break
            if other.part.pos in rule.skip and skipped < rule.reach:
                skipped += 1
                j += step
                continue
            break
    return out
