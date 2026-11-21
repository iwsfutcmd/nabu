"""What each KC id of a course became (courses/<id>/aliases.yaml; docs/migration-design.md,
"Old events"): the table `upgrade` will read to turn a logged event into the new shape."""

from __future__ import annotations

import collections
from typing import Any

from nabu import yamlio
from nabu.migrate.convert import Converter
from nabu.migrate.source import seq

Json = dict[str, Any]


def _taught(units: list[Json]) -> tuple[dict[str, int], dict[str, int]]:
    """Where on the path each feature value is introduced, and where each sentence and story line
    stands (its node's place): what the compiler lists as a form's parts is every lexeme it
    writes and the values chosen there that a node at or before it introduces."""
    node_pos: dict[str, int] = {}
    introduced: dict[str, int] = {}
    for unit in units:
        for node in seq(unit.get("nodes")):
            node_pos[str(node["id"])] = len(node_pos)
            for teachable in seq(node.get("introduces")):
                introduced.setdefault(str(teachable), node_pos[str(node["id"])])
    item_pos: dict[str, int] = {}
    for unit in units:
        for sentence in seq(unit.get("sentences")):
            if str(sentence.get("node")) in node_pos:
                item_pos[str(sentence["id"])] = node_pos[str(sentence["node"])]
        for story in seq(unit.get("stories")):
            if str(story.get("node")) in node_pos:
                for i, _ in enumerate(seq(story.get("steps"))):
                    item_pos[f"{story['id']}#{i}"] = node_pos[str(story["node"])]
    return introduced, item_pos


def build(conv: Converter, units: list[Json]) -> tuple[Json, Json]:
    """The table, and counts of what kind of thing each id became. `units`: the converted
    units, whose nodes say where the course teaches each feature value."""
    plan = conv.plan
    stats: collections.Counter[str] = collections.Counter()
    introduced, item_pos = _taught(units)
    # Where a form was pinned on a token, the feature values it chose there that the course has
    # taught by then: the parts the form stood for in that item.
    by_form: dict[str, dict[str, list[str]]] = collections.defaultdict(dict)
    for item_id, forms in conv.items.items():
        at = item_pos.get(item_id)
        if at is None:
            continue
        for toks in forms.values():
            for tok in toks:
                for part in tok.parts:
                    if part.form is None:
                        continue
                    values = [
                        f"feature:{name}={value}"
                        for name in sorted(part.feats)
                        for value in str(part.feats[name]).split(",")
                    ]
                    taught = [v for v in values if introduced.get(v, at + 1) <= at]
                    if taught:
                        known = by_form[part.form].setdefault(item_id, [])
                        known += [v for v in taught if v not in known]
    # Where a sense was built of several lexemes, the parts it stood for in each item.
    by_item: dict[str, dict[str, list[str]]] = collections.defaultdict(dict)
    for item_id, forms in conv.items.items():
        for toks in forms.values():
            for tok in toks:
                built: dict[str, list[str]] = collections.defaultdict(list)
                for part in tok.parts:
                    if part.kc is not None and part.kc.startswith("sense:"):
                        built[part.kc].append(f"lexeme:{part.lexeme}")
                for kc, parts in built.items():
                    if plan.sense(kc[6:]).parts:
                        known = by_item[kc].setdefault(item_id, [])
                        known += [p for p in parts if p not in known]

    aliases: Json = {}
    for kc in conv.kcs:
        kind, _, name = kc.partition(":")
        alias: Json = {}
        if kind == "grapheme":
            alias["part"] = kc
            stats["a letter of a script track: unchanged"] += 1
        elif kind == "sense":
            sp = plan.sense(name)
            if sp.parts:
                alias["part"] = f"lexeme:{sp.parts[0]}"
                if by_item.get(kc):
                    alias["byItem"] = {
                        item: yamlio.FlowList(parts) for item, parts in sorted(by_item[kc].items())
                    }
                stats["a sense built of several lexemes: its first, and each by sentence"] += 1
            elif sp.form_of:
                alias["part"] = f"lexeme:{sp.form_of}"
                stats["a sense that is a form of another lexeme"] += 1
            else:
                alias["part"] = f"lexeme:{conv.lexeme_of[kc]}"
                stats[
                    "a sense: the lexeme of its name"
                    if conv.lexeme_of[kc] == name
                    else "a sense: a lexeme renamed"
                ] += 1
        else:
            fp = plan.forms.get(kc)
            if fp is not None and fp.lexeme is not None:
                alias["part"] = f"lexeme:{fp.lexeme}"
                stats[f"a {kind} written as a morph: a lexeme"] += 1
            elif fp is not None and fp.rule is not None:
                alias["part"] = f"rule:{fp.rule}"
                stats[f"a {kind}: a rule, not written yet"] += 1
            else:
                # Feature values on its tokens. What was learned under it goes, sentence by
                # sentence, to the values it chose there that the course teaches (a sentence's
                # parts); where the sentence is not known, to nothing: the id alone says no more
                # than its values, and nothing old counts towards a rule (ADR 0146).
                if fp is not None and fp.introduces:
                    alias["seeds"] = yamlio.FlowList([f"feature:{v}" for v in fp.introduces])
                if by_form.get(kc):
                    alias["byItem"] = {
                        item: yamlio.FlowList(parts) for item, parts in sorted(by_form[kc].items())
                    }
                    stats[f"a {kind} pinned on tokens: by sentence, the feature values taught"] += 1
                else:
                    stats[f"a {kind} pinned on tokens: feature values none of which is taught"] += 1
        aliases[kc] = yamlio.Flow(alias) if "byItem" not in alias else alias
    return {"course": conv.course.id, "aliases": aliases}, dict(stats)
