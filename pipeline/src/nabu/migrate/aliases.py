"""What each KC id of a course became (courses/<id>/aliases.yaml; docs/migration-design.md,
"Old events"): the table `upgrade` will read to turn a logged event into the new shape."""

from __future__ import annotations

import collections
from typing import Any

from nabu import yamlio
from nabu.migrate.convert import Converter

Json = dict[str, Any]


def build(conv: Converter) -> tuple[Json, Json]:
    """The table, and counts of what kind of thing each id became."""
    plan = conv.plan
    stats: collections.Counter[str] = collections.Counter()
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
                # Feature values on its tokens: nothing a learner has (ADR 0146: what was learned
                # under it is a feature's uses and a rule's branches, and nothing old counts
                # towards those).
                stats[f"a {kind} pinned on tokens: feature values, no part"] += 1
        aliases[kc] = yamlio.Flow(alias) if "byItem" not in alias else alias
    return {"course": conv.course.id, "aliases": aliases}, dict(stats)
