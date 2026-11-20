"""Tokens of today's course into tokens of the lexical model (docs/migration-design.md, "A token").

A token today names a sense, a form and morphs. A converted one names the lexemes it writes and
the feature values chosen there. What the names become is the plan's (plan.py); this module only
applies it, and keeps for every lexeme what today's annotation said, so that the conversion can be
read back and compared (checks.py).
"""

from __future__ import annotations

import collections
import unicodedata
from dataclasses import dataclass, field
from typing import Any

from nabu.migrate.plan import Feats, Plan, PlanError
from nabu.migrate.source import Course, Item, fold, obj, seq

Json = dict[str, Any]

# What a token carries beside its lexemes; copied as it is.
KEPT = ("readings", "variants", "tile", "vocalized", "context", "readingVariant")


@dataclass
class Part:
    """One lexeme a token writes."""

    lexeme: str
    surface: str
    feats: Feats = field(default_factory=lambda: {})
    base: bool = False
    said: Feats = field(default_factory=lambda: {})
    """Every value today's annotation states, before a lexical feature moves to its lexeme."""
    kc: str | None = None
    """The sense, form or construction KC it was."""
    form: str | None = None
    """The form KC pinned on it."""
    pos: str | None = None
    alone: bool = True
    """Written as a token of its own, not joined to another lexeme."""
    n: int | None = None
    """Its number among the lexemes its form writes, where a relation names it."""
    head: int | None = None
    rel: str | None = None


@dataclass
class Tok:
    surface: str
    parts: list[Part]
    rest: Json
    old: Json


@dataclass
class Finding:
    kind: str
    where: str
    what: str


class Converter:
    """One course's tokens, converted in two passes: what each says, then what is its lexeme's."""

    def __init__(self, course: Course, plan: Plan) -> None:
        self.course = course
        self.plan = plan
        self.kcs = course.kcs()
        self.findings: list[Finding] = []
        self.pos: dict[str, str | None] = {
            k[6:]: kc.get("pos") for k, kc in self.kcs.items() if k.startswith("sense:")
        }
        # How each KC is written where it is one of several in a token, by orthography.
        self.seen: dict[str, dict[str, collections.Counter[str]]] = collections.defaultdict(
            lambda: collections.defaultdict(collections.Counter)
        )
        for item in course.items():
            for orth, form in item.data["forms"].items():
                for t in seq(form.get("tokens")):
                    for m in seq(t.get("morphs")):
                        self.seen[str(m["kc"])][orth][str(m["surface"])] += 1
        self._names()
        self.items: dict[str, dict[str, list[Tok]]] = {}
        for item in course.items():
            self.items[item.id] = {
                orth: [self._token(t, orth, item, form) for t in seq(form.get("tokens"))]
                for orth, form in item.data["forms"].items()
            }
        self.lexical: dict[str, Feats] = {}
        self.varying: dict[str, dict[str, list[str]]] = {}
        self._hoist()

    # Names

    def _names(self) -> None:
        """Every lexeme's name, and that no two KCs take the same one."""
        self.lexeme_of: dict[str, str] = {}
        taken: dict[str, str] = {}
        for kc in self.kcs:
            kind, _, name = kc.partition(":")
            if kind == "sense":
                sp = self.plan.sense(name)
                if sp.form_of or sp.parts:
                    continue
                new = sp.rename or name
            elif kind in ("form", "construction"):
                fp = self.plan.forms.get(kc)
                if fp is None or fp.lexeme is None:
                    continue
                new = fp.lexeme
            else:
                continue
            if new in taken:
                raise PlanError(f"{kc} and {taken[new]} would both be lexeme:{new}: rename one")
            taken[new] = kc
            self.lexeme_of[kc] = new
        for name, sp in self.plan.senses.items():
            if f"sense:{name}" not in self.kcs:
                raise PlanError(f"the plan names sense:{name}, which the course does not have")
            for target in (*((sp.form_of,) if sp.form_of else ()), *sp.parts):
                if target not in taken:
                    raise PlanError(f"sense {name}: lexeme:{target} is not a lexeme of the course")
        for kc in self.plan.forms:
            if kc not in self.kcs:
                raise PlanError(f"the plan names {kc}, which the course does not have")
        self.taken = taken

    def lexeme_pos(self, lexeme: str) -> str | None:
        kc = self.taken[lexeme]
        if kc.startswith("sense:"):
            return self.plan.sense(kc[6:]).pos or self.pos.get(kc[6:])
        return self.plan.forms[kc].pos

    # Pass 1: what each token says

    def forms_of(self, kc: str, orth: str) -> list[str]:
        """How a KC's entry is written in an orthography: its lemma first (ADR 0061)."""
        return [str(f) for f in seq(obj(self.kcs.get(kc, {}).get("forms")).get(orth))]

    def _spellings(self, lexeme: str, orth: str) -> set[str]:
        kc = self.taken[lexeme]
        seen: collections.Counter[str] = self.seen.get(kc, {}).get(orth, collections.Counter())
        return {fold(s) for s in seen} | {fold(s) for s in self.forms_of(kc, orth)}

    def _override(self, sense: str, surface: str) -> Json:
        """What the plan says of one way a sense is written (its letters, whatever the case)."""
        for written, said in self.plan.tokens.get(sense, {}).items():
            if fold(str(written)) == fold(surface):
                return said
        return {}

    def _segment(self, surface: str, lexemes: list[str], orth: str, where: str) -> list[str]:
        """A surface cut into its lexemes' letters, by how each is written elsewhere."""
        known = [self._spellings(lex, orth) for lex in lexemes]

        def cuts(start: int, i: int) -> list[list[str]]:
            if i == len(lexemes) - 1:
                piece = surface[start:]
                return [[piece]] if piece and fold(piece) in known[i] else []
            found: list[list[str]] = []
            for end in range(len(surface) - 1, start, -1):
                piece = surface[start:end]
                if fold(piece) in known[i]:
                    found += [[piece, *rest] for rest in cuts(end, i + 1)]
            return found

        ways = cuts(0, 0)
        if not ways and len(lexemes) == 2:
            # The stem is written as nowhere else: the ending still says where it stops.
            for end in range(1, len(surface)):
                if fold(surface[end:]) in known[1]:
                    ways.append([surface[:end], surface[end:]])
            ways.sort(key=lambda w: len(w[1]), reverse=True)
        if not ways:
            raise PlanError(
                f"{where}: cannot cut {surface!r} into {' + '.join(lexemes)} ({orth}); "
                "give the plan a split under tokens"
            )
        return ways[0]

    def _recut(self, surface: str, split: list[str], where: str) -> list[str]:
        """The plan's cut of a surface, on the letters as this token writes them (its capital)."""
        out: list[str] = []
        at = 0
        for piece in split:
            out.append(surface[at : at + len(piece)])
            at += len(piece)
        if at != len(surface) or [fold(x) for x in out] != [fold(x) for x in split]:
            raise PlanError(f"{where}: the plan's split {split} does not spell {surface!r}")
        return out

    def _feats(self, sense: str, form: str | None, multiword: bool, surface: str) -> Feats:
        sp = self.plan.sense(sense)
        pos = sp.pos or self.pos.get(sense)
        if form is not None:
            feats = self.plan.form(form).pinned(pos, surface)
        elif sp.bare is not None:
            feats = dict(sp.bare)
        elif multiword:
            feats = {}
        else:
            feats = dict(self.plan.bare.get(pos or "", {}))
        return {k: v for k, v in {**feats, **sp.feats}.items() if k not in sp.drop}

    def _entry(self, sense: str, orth: str) -> set[str]:
        return {fold(f) for f in self.forms_of(f"sense:{sense}", orth)}

    def _multiword(self, sense: str, orth: str) -> bool:
        forms = self.forms_of(f"sense:{sense}", orth)
        return bool(forms) and any(ch.isspace() for ch in forms[0])

    def _sense_parts(
        self, sense: str, surface: str, form: str | None, orth: str, where: str, alone: bool
    ) -> list[Part]:
        """The lexemes one sense KC stood for in a token: one, unless the plan says it was built
        of several (apc baddi: badd and its ending; es llamarnos: llamar and nos)."""
        kc = f"sense:{sense}"
        if kc not in self.kcs:
            raise PlanError(f"{where}: no KC sense:{sense}")
        sp = self.plan.sense(sense)
        override = self._override(sense, surface)
        names = [str(x) for x in (override.get("parts") or sp.parts)]
        if names:
            kept_form = form
            if form is not None and self.plan.form(form).lexeme is not None and not override:
                # baddak pinned as -ik: the ending named takes the place of the one built in.
                names = [*names[:-1], str(self.plan.form(form).lexeme)]
                kept_form = None
            for n in names:
                if n not in self.taken:
                    raise PlanError(
                        f"{where}: {sense} is built of lexeme:{n}, which the course has not"
                    )
            if override.get("split"):
                pieces = self._recut(surface, [str(x) for x in override["split"]], where)
            else:
                pieces = self._segment(surface, names, orth, f"{where}: {sense}")
            given: list[Json] = [obj(g) for g in seq(override.get("feats"))]
            parts: list[Part] = []
            for i, (n, piece) in enumerate(zip(names, pieces, strict=True)):
                part = Part(n, piece, kc=kc, pos=self.lexeme_pos(n), alone=False)
                own = self.taken[n]
                if i < len(given) and given[i]:
                    part.said = {str(k): str(v) for k, v in given[i].items()}
                elif i == 0 and own.startswith("sense:"):
                    part.said = self._feats(own[6:], kept_form, False, piece)
                    part.form = kept_form
                parts.append(part)
            parts[0].base = True
            return parts
        lexeme = sp.form_of or sp.rename or sense
        if "feats" in override:
            said = {str(k): str(v) for k, v in override["feats"].items()}
        else:
            said = self._feats(sense, form, self._multiword(sense, orth), surface)
        return [
            Part(
                lexeme,
                surface,
                said=said,
                kc=kc,
                form=form,
                pos=self.lexeme_pos(lexeme),
                alone=alone,
            )
        ]

    def _token(self, t: Json, orth: str, item: Item, form: Json) -> Tok:
        where = f"{item.id} ({orth})"
        surface = str(t["surface"])
        sense = None if t.get("sense") is None else str(t["sense"])
        pinned = None if t.get("form") is None else str(t["form"])
        morphs = seq(t.get("morphs"))
        parts: list[Part] = []
        if morphs:
            # The base is the morph that is the token's own sense; where it is written twice
            # (yue 得唔得閒, a word, 唔 and the word again), the copy written in full, or the last.
            own = [
                i for i, m in enumerate(morphs) if sense is not None and m["kc"] == f"sense:{sense}"
            ]
            full = [
                i for i in own if fold(str(morphs[i]["surface"])) in self._entry(sense or "", orth)
            ]
            base_at = (full or own or [None])[-1]
            for i, m in enumerate(morphs):
                kc = str(m["kc"])
                kind, _, name = kc.partition(":")
                if kind == "sense":
                    is_base = i == base_at
                    got = self._sense_parts(
                        name, str(m["surface"]), pinned if is_base else None, orth, where, False
                    )
                    if not is_base:
                        for p in got:
                            p.base = False
                    else:
                        got[0].base = True
                    parts += got
                else:
                    fp = self.plan.form(kc)
                    if fp.lexeme is None:
                        raise PlanError(
                            f"{where}: {kc} is written as a morph; the plan gives it no lexeme"
                        )
                    parts.append(Part(fp.lexeme, str(m["surface"]), kc=kc, pos=fp.pos, alone=False))
            if sense is not None and not any(p.base for p in parts):
                raise PlanError(f"{where}: {surface}: none of its morphs is its sense {sense}")
        elif sense is not None:
            parts = self._sense_parts(sense, surface, pinned, orth, where, True)
            if len(parts) == 1:
                parts[0].base = False
        elif pinned is not None:
            raise PlanError(f"{where}: {surface} pins {pinned} and names no sense")
        rest = {k: t[k] for k in KEPT if k in t}
        if t.get("kind") not in (None, "word"):
            rest["kind"] = t["kind"]
        return Tok(surface, parts, rest, t)

    # Pass 2: what is the lexeme's, not the token's

    def _hoist(self) -> None:
        """A feature its language keeps on the lexeme (a noun's gender) leaves the tokens where
        every token of the lexeme says the same. Where they differ it stays on them, and where the
        entry itself is written in another value (tía under tío) too: both are reported."""
        values: dict[str, dict[str, set[str]]] = collections.defaultdict(
            lambda: collections.defaultdict(set)
        )
        for _, part in self.parts():
            for feature in self.plan.lexical.get(part.pos or "", []):
                if feature in part.said:
                    values[part.lexeme][feature].add(part.said[feature])
        for lexeme, by_feature in values.items():
            for feature, found in by_feature.items():
                only = next(iter(found))
                if len(found) == 1 and not self._entry_differs(lexeme, feature, only):
                    self.lexical.setdefault(lexeme, {})[feature] = only
                else:
                    self.varying.setdefault(lexeme, {})[feature] = sorted(found)
        for _, part in self.parts():
            mine = self.lexical.get(part.lexeme, {})
            part.feats = {k: v for k, v in part.said.items() if k not in mine}

    def _entry_differs(self, lexeme: str, feature: str, value: str) -> bool:
        """Whether the entry is a form with another value of the feature than its tokens have:
        the value is not the one a bare token has, tokens stand in the entry's own cell but for
        it, and none of them is written as the entry is (the course writes tía under tío and
        never tío). Accents aside: an enclitic's accent does not make another word."""
        pos = self.lexeme_pos(lexeme)
        if self.plan.bare.get(pos or "", {}).get(feature) in (None, value):
            return False
        cited = self.plan.citation.get(pos or "", {})
        cell = {k: v for k, v in cited.items() if k != feature}
        seen = False
        for orth, part in self.parts():
            if part.lexeme != lexeme or not part.alone:
                continue
            forms = self.forms_of(self.taken[lexeme], orth)
            if not forms or any(ch.isspace() for f in forms for ch in f):
                continue
            if {k: v for k, v in part.said.items() if k != feature} != cell:
                continue
            if _bare(part.surface) in {_bare(f) for f in forms}:
                return False
            seen = True
        return seen

    def parts(self) -> list[tuple[str, Part]]:
        return [
            (orth, p)
            for forms in self.items.values()
            for orth, toks in forms.items()
            for t in toks
            for p in t.parts
        ]


def _bare(text: str) -> str:
    """Letters with no mark at all on them."""
    decomposed = unicodedata.normalize("NFD", fold(text))
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def emit(tok: Tok) -> Json:
    """A converted token as the course source writes it (schemas/course-source.next)."""
    out: Json = {"surface": tok.surface}
    if "kind" in tok.rest:
        out["kind"] = tok.rest["kind"]
    if len(tok.parts) == 1:
        part = tok.parts[0]
        out["lexeme"] = part.lexeme
        if part.feats:
            out["feats"] = dict(sorted(part.feats.items()))
        _relation(part, out)
    elif tok.parts:
        out["lexemes"] = [_emit_part(p) for p in tok.parts]
    for key in KEPT:
        if key in tok.rest:
            out[key] = tok.rest[key]
    return out


def _emit_part(part: Part) -> Json:
    out: Json = {"lexeme": part.lexeme, "surface": part.surface}
    if part.base:
        out["base"] = True
    if part.feats:
        out["feats"] = dict(sorted(part.feats.items()))
    _relation(part, out)
    return out


def _relation(part: Part, out: Json) -> None:
    if part.n is not None:
        out["n"] = part.n
    if part.head is not None and part.rel is not None:
        out["head"] = part.head
        out["rel"] = part.rel
