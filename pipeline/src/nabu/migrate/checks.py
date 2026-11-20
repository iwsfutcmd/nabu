"""What must be true of a converted course (docs/migration-design.md, "What must not change").

Each check reads what the converter wrote, not what it meant to write: the new course, the
lexicon, the alias table. A failure is an error, never a finding: it means the converter or its
plan is wrong.
"""

from __future__ import annotations

import collections
from typing import Any

from nabu.migrate.convert import KEPT, Converter
from nabu.migrate.lexicon import Written, key_of, offsets, runs
from nabu.migrate.source import fold, items_of, obj, seq

Json = dict[str, Any]


def text_unchanged(conv: Converter, units: list[Json]) -> list[str]:
    """Every sentence and story line as displayed: text, tokens in order, readings, accept
    sets and translations, byte for byte."""
    errors: list[str] = []
    new_items = {item.id: item.data for unit in units for item in items_of(unit)}
    seen = 0
    for item in conv.course.items():
        new = new_items.get(item.id)
        if new is None:
            errors.append(f"{item.id}: not in the converted course")
            continue
        seen += 1
        if new["translations"] != item.data["translations"]:
            errors.append(f"{item.id}: translations differ")
        if list(new["forms"]) != list(item.data["forms"]):
            errors.append(f"{item.id}: orthographies differ")
            continue
        for orth, old in item.data["forms"].items():
            form = new["forms"][orth]
            if form["text"] != old["text"] or form.get("reverse") != old.get("reverse"):
                errors.append(f"{item.id} ({orth}): text or accept set differs")
            old_tokens = seq(old.get("tokens"))
            new_tokens = seq(form.get("tokens"))
            if len(old_tokens) != len(new_tokens):
                errors.append(
                    f"{item.id} ({orth}): {len(old_tokens)} tokens became {len(new_tokens)}"
                )
                continue
            for a, b in zip(old_tokens, new_tokens, strict=True):
                if a["surface"] != b["surface"]:
                    errors.append(f"{item.id} ({orth}): {a['surface']} became {b['surface']}")
                for key in KEPT:
                    if a.get(key) != b.get(key):
                        errors.append(f"{item.id} ({orth}): {a['surface']}: {key} differs")
                if "lexemes" in b and "".join(p["surface"] for p in b["lexemes"]) != b["surface"]:
                    # Today's morphs do not always spell their token either; say only what changed.
                    was = "".join(str(m["surface"]) for m in seq(a.get("morphs")))
                    if was == a["surface"]:
                        errors.append(
                            f"{item.id} ({orth}): the lexemes of {b['surface']} no longer spell it"
                        )
            try:
                offsets(str(form["text"]), [str(t["surface"]) for t in new_tokens])
            except ValueError as e:
                errors.append(f"{item.id} ({orth}): {e}")
    if seen != len(new_items):
        errors.append(f"the converted course has {len(new_items)} items, the course {seen}")
    return errors


def nothing_merged(conv: Converter) -> list[str]:
    """No two annotations of today's course became one: whatever the course told apart, the
    converted course still does."""
    became: dict[tuple[Any, ...], set[tuple[Any, ...]]] = collections.defaultdict(set)
    for forms in conv.items.values():
        for toks in forms.values():
            for tok in toks:
                old = tok.old
                morphs = tuple(str(m["kc"]) for m in seq(old.get("morphs")))
                was = (old.get("sense"), old.get("form"), morphs)
                now = tuple((p.lexeme, key_of(p.said), p.base) for p in tok.parts)
                became[now].add(was)

    def folded(was: tuple[Any, ...]) -> bool:
        """Whether an annotation names a sense the plan makes of other lexemes: that one is
        meant to become what the course already writes elsewhere (baddik pinned on baddak, and
        badd with its ending)."""
        names = [was[0], *[str(m).partition(":")[2] for m in was[2] if str(m).startswith("sense:")]]
        return any(n is not None and conv.plan.sense(str(n)).parts for n in names)

    errors: list[str] = []
    for now, olds in became.items():
        if sum(1 for was in olds if not folded(was)) > 1:
            errors.append(f"{sorted(map(str, olds))} all became {now}")
    return errors


def references(
    lexicon: Json, language: Json, course: Json, units: list[Json], aliases: Json
) -> list[str]:
    """Every name points at something: the schema cannot say so (docs/migration-design.md,
    "Left to lints")."""
    errors: list[str] = []
    ids = [str(e["id"]) for e in lexicon["lexemes"]]
    if len(ids) != len(set(ids)):
        errors.append("two lexemes share an id")
    if ids != sorted(ids):
        errors.append("the lexicon is not sorted by id")
    known = set(ids)
    features: dict[str, list[str]] = obj(language.get("features"))

    def feats_ok(feats: Json, where: str) -> None:
        for k, v in feats.items():
            for value in str(v).split(","):
                if value not in features.get(str(k), []):
                    errors.append(f"{where}: {k}={value} is no value the language declares")

    for entry in lexicon["lexemes"]:
        kinds = [k for k in ("pos", "realises", "head") if k in entry]
        if not kinds and "form" not in entry:
            errors.append(f"{entry['id']}: neither a part of speech, a value nor a head")
        feats_ok(obj(entry.get("feats")), str(entry["id"]))
        feats_ok(obj(entry.get("realises")), str(entry["id"]))
        for form in seq(entry.get("forms")):
            feats_ok(form["feats"], str(entry["id"]))
            if "form" not in form and "stem" not in form and "spelled" not in form:
                errors.append(f"{entry['id']}: a form with no spelling")
    for label in seq(language.get("labels")):
        feats_ok(label["feats"], f"label {label.get('was')}")
    for d in seq(language.get("defaults")):
        feats_ok(d["gives"], f"default {d['id']}")

    def teachable(t: str, where: str) -> None:
        if t.startswith("lexeme:") and t not in known:
            errors.append(f"{where}: {t} is not in the lexicon")
        if t.startswith("feature:"):
            name, _, value = t[8:].partition("=")
            if value not in features.get(name, []):
                errors.append(f"{where}: {t} is no value the language declares")

    for unit in units:
        graphemes = {str(g["id"]) for g in seq(unit.get("graphemes"))}
        for node in seq(unit.get("nodes")):
            for t in [*seq(node.get("introduces")), *seq(node.get("reinforces"))]:
                teachable(str(t), str(node["id"]))
                if str(t).startswith("grapheme:") and str(t) not in graphemes:
                    errors.append(f"{node['id']}: {t} is no letter its unit lists")
            for lex in seq(obj(node.get("alphabet")).get("lexemes")):
                teachable(str(lex), str(node["id"]))
        for item in items_of(unit):
            for use in seq(item.data.get("uses")):
                teachable(str(use), item.id)
            if "gap" in item.data:
                teachable(str(item.data["gap"]), item.id)
            for d in seq(item.data.get("distractors")):
                if isinstance(d, str):
                    teachable(d, item.id)
                elif isinstance(d, list):
                    for lex in d:  # pyright: ignore[reportUnknownVariableType]
                        teachable(str(lex), item.id)  # pyright: ignore[reportUnknownArgumentType]
                else:
                    feats_ok(d, item.id)
            for form in item.data["forms"].values():
                written: list[Json] = [
                    p
                    for tok in seq(form.get("tokens"))
                    for p in (seq(tok.get("lexemes")) or ([tok] if "lexeme" in tok else []))
                ]
                numbers = [int(p["n"]) for p in written if "n" in p]
                for i, p in enumerate(written, 1):
                    if "n" in p and p["n"] != i:
                        errors.append(f"{item.id}: {p['lexeme']} is lexeme {i} and says {p['n']}")
                    if ("head" in p) != ("rel" in p):
                        errors.append(
                            f"{item.id}: {p['lexeme']} has a head or a relation, not both"
                        )
                    if "head" in p and (p["head"] not in numbers or "n" not in p):
                        errors.append(f"{item.id}: {p['lexeme']} points at no numbered lexeme")
                for tok in seq(form.get("tokens")):
                    parts: list[Json] = seq(tok.get("lexemes")) or (
                        [tok] if "lexeme" in tok else []
                    )
                    if "lexemes" in tok and "lexeme" in tok:
                        errors.append(
                            f"{item.id}: {tok['surface']} names one lexeme and lists several"
                        )
                    if sum(1 for p in parts if p.get("base")) > 1:
                        errors.append(f"{item.id}: {tok['surface']} has two bases")
                    for part in parts:
                        if f"lexeme:{part['lexeme']}" not in known:
                            errors.append(
                                f"{item.id}: lexeme:{part['lexeme']} is not in the lexicon"
                            )
                        feats_ok(obj(part.get("feats")), f"{item.id}: {tok['surface']}")
    for kc, alias in aliases["aliases"].items():
        for part in [
            alias.get("part"),
            *[p for ps in obj(alias.get("byItem")).values() for p in ps],
        ]:
            if (
                part is not None
                and str(part).startswith("lexeme:")
                and str(part).split("|")[0] not in known
            ):
                errors.append(f"alias {kc}: {part} is not in the lexicon")
    return errors


def accounted(
    lexicon: Json, language: Json, units: list[Json], multiword: set[tuple[str, str]]
) -> list[str]:
    """Every lexeme a token writes is written as its entry is, or as one of the entry's forms
    or allomorphs (ADR 0145: every form the rules do not reach is pinned or listed). Read from
    the files alone, as the compiler will read them."""
    entries = {str(e["id"])[7:]: e for e in lexicon["lexemes"]}
    citation: dict[str, Json] = obj(language.get("citation"))
    lexical: dict[str, list[str]] = obj(language.get("lexical"))

    def own_cell(entry: Json) -> Any:
        """The cell an entry is spelled in: its category's, less what the lexeme has of itself.
        A lexical feature the entry says its tokens choose stays in it (hermano, hermana)."""
        pos = str(entry.get("pos"))
        chosen = seq(entry.get("chooses"))
        kept = {
            str(k): str(v)
            for k, v in citation.get(pos, {}).items()
            if k not in lexical.get(pos, []) or k in chosen
        }
        return key_of(kept)

    def folded(spelled: Json | None, orth: str) -> set[str]:
        return {fold(str(s)) for s in (spelled or {}).get(orth, [])}

    errors: list[str] = []
    for unit in units:
        for item in items_of(unit):
            for orth, form in item.data["forms"].items():
                tokens: list[Written] = []
                for tok in seq(form.get("tokens")):
                    if "lexeme" in tok:
                        said = {str(k): str(v) for k, v in obj(tok.get("feats")).items()}
                        tokens.append(
                            (
                                str(tok["surface"]),
                                [(str(tok["lexeme"]), said, str(tok["surface"]))],
                                True,
                                (),
                            )
                        )
                    else:
                        parts = [
                            (
                                str(p["lexeme"]),
                                {str(k): str(v) for k, v in obj(p.get("feats")).items()},
                                str(p["surface"]),
                            )
                            for p in seq(tok.get("lexemes"))
                        ]
                        tokens.append((str(tok["surface"]), parts, False, ()))
                found = runs(
                    str(form["text"]), tokens, lambda lexeme, o=orth: (lexeme, o) in multiword
                )
                for run in found:
                    name, feats, surface = run.lexeme, run.feats, run.surface
                    entry = entries[name]
                    letters = fold(surface)
                    cell = key_of({str(k): str(v) for k, v in feats.items()})
                    ways: set[str] = set()
                    for f in seq(entry.get("forms")):
                        if key_of({str(k): str(v) for k, v in f["feats"].items()}) == cell:
                            ways |= folded(f.get("spelled"), orth)
                    if cell in ((), own_cell(entry)):
                        ways |= folded(entry.get("spelled"), orth)
                        for a in seq(entry.get("allomorphs")):
                            ways |= folded(a.get("spelled"), orth)
                            if a.get("form") == "":
                                ways.add("")
                    if letters not in ways:
                        errors.append(
                            f"{item.id} ({orth}): {surface} is no form of lexeme:{name} "
                            "the lexicon has"
                        )
    return errors
