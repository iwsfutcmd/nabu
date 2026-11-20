"""A course's conversion plan: what the converter cannot read off the course
(docs/migration-design.md).

Today's course says `form:pret-3s` and `sense:raye7`; the lexical model wants feature values, and
lexemes whose forms those are. Which values, and which lexeme, is a linguist's statement about the
language. A plan holds those statements for one course (plans/<course>.yaml), drafted and awaiting
review like every profile policy, so the converter itself decides nothing.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import yaml

from nabu.migrate.source import obj

Feats = dict[str, str]
Json = dict[str, Any]

PLANS = Path(__file__).resolve().parent / "plans"


class PlanError(ValueError):
    """The plan does not say what the converter needs, or says two things."""


@dataclass(frozen=True)
class FormPlan:
    """What a `form:` or `construction:` KC becomes.

    One pinned on a token is feature values (`feats`, by part of speech where they differ). One
    written as a morph is a lexeme (`lexeme`): a value head (`realises`), a function head (`head`)
    or a clitic with a part of speech of its own (`pos`, `has`).
    """

    kc: str
    feats: Feats | None = None
    by_pos: dict[str, Feats] = field(default_factory=lambda: {})
    introduces: tuple[str, ...] = ()
    lexeme: str | None = None
    pos: str | None = None
    has: Feats | None = None
    realises: Feats | None = None
    head: Json | None = None
    rule: str | None = None
    listed: Json | None = None
    note: str | None = None
    refine: tuple[tuple[str, Feats], ...] = ()
    """Values an ending shows and the KC does not name (es -mos on an imperfect): the first
    ending that fits adds its values."""

    def pinned(self, pos: str | None, surface: str = "") -> Feats:
        found = self.by_pos.get(pos or "", self.feats)
        if found is None:
            raise PlanError(
                f"{self.kc} is pinned on a token ({pos}) and the plan gives it no feats"
            )
        out = dict(found)
        written = surface.casefold()
        for ending, more in self.refine:
            if written.endswith(ending):
                out.update(more)
                break
        return out


@dataclass(frozen=True)
class SensePlan:
    """What the plan says of one sense KC: nothing, for most."""

    name: str
    rename: str | None = None
    form_of: str | None = None
    parts: tuple[str, ...] = ()
    feats: Feats = field(default_factory=lambda: {})
    bare: Feats | None = None
    pos: str | None = None
    note: str | None = None
    drop: tuple[str, ...] = ()
    """Features its tokens never have, whatever the form KC says for its category (grc ἐγώ pins
    its case with a KC that also means masculine)."""


@dataclass(frozen=True)
class Plan:
    course: str
    language: str
    author: str
    data: Json
    forms: dict[str, FormPlan]
    senses: dict[str, SensePlan]

    @property
    def bare(self) -> dict[str, Feats]:
        return {str(p): _feats(f, "bare") for p, f in obj(self.data.get("bare")).items()}

    @property
    def lexical(self) -> dict[str, list[str]]:
        return cast(dict[str, list[str]], obj(self.data.get("lexical")))

    @property
    def citation(self) -> dict[str, Feats]:
        return {str(p): _feats(f, "citation") for p, f in obj(self.data.get("citation")).items()}

    @property
    def tokens(self) -> dict[str, dict[str, Json]]:
        return cast(dict[str, dict[str, Json]], obj(self.data.get("tokens")))

    def sense(self, name: str) -> SensePlan:
        return self.senses.get(name) or SensePlan(name)

    def form(self, kc: str) -> FormPlan:
        if kc not in self.forms:
            raise PlanError(f"the plan has no entry for {kc}")
        return self.forms[kc]


def _feats(value: Any, where: str) -> Feats:
    if not isinstance(value, dict):
        raise PlanError(f"{where}: feature values are a mapping")
    out: Feats = {}
    for k, v in cast(dict[Any, Any], value).items():
        if isinstance(v, bool):
            # YAML 1.1 reads a bare Yes as true: Poss: 'Yes' needs its quotes.
            raise PlanError(f"{where}: {k} is a boolean; quote the value")
        out[str(k)] = str(v)
    return out


def _form(kc: str, raw: Json) -> FormPlan:
    known = {
        "feats",
        "byPos",
        "introduces",
        "lexeme",
        "pos",
        "has",
        "realises",
        "head",
        "rule",
        "listed",
        "note",
        "refine",
    }
    extra = set(raw) - known
    if extra:
        raise PlanError(f"{kc}: unknown keys {sorted(extra)}")
    return FormPlan(
        kc=kc,
        feats=_feats(raw["feats"], kc) if "feats" in raw else None,
        by_pos={str(p): _feats(f, kc) for p, f in obj(raw.get("byPos")).items()},
        introduces=tuple(str(x) for x in raw.get("introduces") or ()),
        lexeme=None if raw.get("lexeme") is None else str(raw["lexeme"]),
        pos=raw.get("pos"),
        has=_feats(raw["has"], kc) if "has" in raw else None,
        realises=_feats(raw["realises"], kc) if "realises" in raw else None,
        head=raw.get("head"),
        rule=None if raw.get("rule") is None else str(raw["rule"]),
        listed=raw.get("listed"),
        note=raw.get("note"),
        refine=tuple(
            (str(r["ends"]).casefold(), _feats(r["feats"], kc)) for r in raw.get("refine") or ()
        ),
    )


def _sense(name: str, raw: Json) -> SensePlan:
    known = {"rename", "formOf", "parts", "feats", "bare", "pos", "note", "drop"}
    extra = set(raw) - known
    if extra:
        raise PlanError(f"sense {name}: unknown keys {sorted(extra)}")
    return SensePlan(
        name=name,
        rename=None if raw.get("rename") is None else str(raw["rename"]),
        form_of=None if raw.get("formOf") is None else str(raw["formOf"]),
        parts=tuple(str(p) for p in raw.get("parts") or ()),
        feats=_feats(obj(raw.get("feats")), name),
        bare=_feats(raw["bare"], name) if "bare" in raw else None,
        pos=raw.get("pos"),
        note=raw.get("note"),
        drop=tuple(str(x) for x in raw.get("drop") or ()),
    )


def load(course: str, path: Path | None = None) -> Plan:
    file = path or PLANS / f"{course}.yaml"
    if not file.exists():
        raise PlanError(f"no conversion plan for {course}: {file}")
    text = file.read_text(encoding="utf-8")
    data = cast(Json, yaml.safe_load(text))
    digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]
    forms = {str(k): _form(str(k), v or {}) for k, v in obj(data.get("forms")).items()}
    forms.update(
        {str(k): _form(str(k), v or {}) for k, v in obj(data.get("constructions")).items()}
    )
    senses = {str(k): _sense(str(k), v or {}) for k, v in obj(data.get("senses")).items()}
    return Plan(
        course=course,
        language=str(data["language"]),
        # A plan is a prompt's worth of statements about the language: its hash stands where a
        # drafted item has its prompt's.
        author=f"llm:claude@{digest}",
        data=data,
        forms=forms,
        senses=senses,
    )
