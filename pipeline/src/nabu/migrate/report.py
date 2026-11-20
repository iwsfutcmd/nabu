"""What the converter found in a course (docs/migration/<id>.md; docs/migration-design.md,
"What the converter reports"). Each finding is a question for a reviewer: the converter decided
nothing, and says where the course or its plan leaves something open."""

from __future__ import annotations

import collections
from typing import TYPE_CHECKING, Any

from nabu.migrate.source import obj, seq, show

if TYPE_CHECKING:
    from nabu.migrate import Migration

Json = dict[str, Any]

# Finding kinds, in the order the report gives them: a heading, and what a reviewer should know.
SECTIONS: list[tuple[str, str, str]] = [
    (
        "lexical-exception",
        "Lexemes that break a default",
        "The entry stores the feature, and it is a part to learn (ADR 0146). Check each: a wrong "
        "default makes parts of regular words, a missing one hides an exception.",
    ),
    (
        "lexical-stored",
        "Lexemes no default speaks of",
        "No stated default gives the feature for a lexeme so written, so the entry stores it and "
        "it is a part to learn. A reliable ending among these is a default to add.",
    ),
    (
        "lexical-varies",
        "Lexical features the tokens choose",
        "The feature is declared lexical for the category, and this lexeme's tokens have more "
        "than one value of it, or the entry itself is written in another (tía under tío). By "
        "ADR 0145 a noun's feminine is a derivative, a lexeme of its own where it is listed. "
        "The values stay on the tokens until that is decided.",
    ),
    (
        "lexical-unknown",
        "Lexemes whose lexical feature no token says",
        "Mostly entries written as several tokens, on which the course pins no form.",
    ),
    (
        "spelling",
        "Other spellings of an entry",
        "A token names the lexeme, is spelled otherwise than its entry and pins the entry's own "
        "reading: the same word as its source spells it (ADR 0145: a source's spelling is the "
        "utterance's). Kept among the entry's spellings; when the orthography's free "
        "correspondences are stated (ADR 0148), they should give each of these.",
    ),
    (
        "written-otherwise",
        "Written otherwise than the entry",
        "A token names the lexeme, no feature value tells it from the entry's own form, and it is "
        "spelled differently: an allomorph by context (gran before a noun), or a form the "
        "course's annotation has no name for. Kept as an allomorph of the entry.",
    ),
    (
        "entry-built",
        "Entries shown as a built word",
        "A word card shows the entry's first spelling, and here that is the lexeme with an ending "
        "on it. The spelling is kept, since it is what a learner sees today; the lexeme's own form "
        "is then missing from its entry.",
    ),
    (
        "cell-tie",
        "Feature values that do not tell forms apart",
        "Several spellings share one set of values: the course's form KC names less than the "
        "forms differ by. Each is pinned; a tie is an authoring error once a rule reads it "
        "(ADR 0145).",
    ),
    (
        "second-form",
        "Entry forms no token writes",
        "A KC listed the form after its first; no sentence or story line writes it. Kept as a "
        "spelling.",
    ),
    (
        "orthographies-differ",
        "Items whose orthographies name different lexemes",
        "A sentence names the same lexemes in the same order in each orthography, which is what "
        "pairs a form's spellings. These do not, so their spellings are recorded apart.",
    ),
    (
        "unused",
        "Lexemes no sentence writes",
        "An entry of the lexicon with no token: a word taught only by its card, or left over.",
    ),
    (
        "node-empty",
        "Nodes that introduce less",
        "What the node introduced is introduced earlier in the new shape (a sense that was built "
        "of lexemes an earlier node now names), or was a form KC whose values name nothing new.",
    ),
    (
        "distractor-built",
        "Story options that were a form",
        "A wrong option named a sense that is a form of another lexeme now.",
    ),
    (
        "no-kind",
        "Lexemes of no kind",
        "The plan gives neither a part of speech, a value nor a head.",
    ),
]


def _table(rows: list[tuple[str, ...]], head: tuple[str, ...]) -> list[str]:
    out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    out += ["| " + " | ".join(cell.replace("|", "\\|") for cell in row) + " |" for row in rows]
    return out


def _feats(feats: Json) -> str:
    return ", ".join(f"{k}={v}" for k, v in sorted(feats.items())) or "(none)"


def render(m: Migration) -> str:
    cid, lang = m.course.id, m.plan.language
    kcs = m.conv.kcs
    kinds = collections.Counter(k.partition(":")[0] for k in kcs)
    by_kind: dict[str, list[tuple[str, str]]] = collections.defaultdict(list)
    for f in m.findings:
        by_kind[f.kind].append((f.where, f.what))
    lines: list[str] = [
        f"# Converting `courses/{cid}` to the lexical model",
        "",
        f"Written by `nabu migrate ../courses/{cid}`; do not edit by hand. It belongs to",
        "[the migration's design note](../migration-design.md), deliverable 2. Nothing here is",
        "decided:",
        "the converter applies the course's conversion plan",
        f"(`pipeline/src/nabu/migrate/plans/{cid}.yaml`, drafted, REVIEW) and lists what it found.",
        "",
        "## What was converted",
        "",
    ]
    items = sum(1 for _ in m.course.items())
    tokens = sum(len(t) for forms in m.conv.items.values() for t in forms.values())
    lexemes = m.built.lexicon["lexemes"]
    rows = [
        ("Sense KCs", str(kinds["sense"])),
        ("`form:` KCs", str(kinds["form"])),
        ("`construction:` KCs", str(kinds["construction"])),
        ("`grapheme:` KCs", str(kinds["grapheme"])),
        ("Sentences and story lines", str(items)),
        ("Tokens", str(tokens)),
        (f"Lexemes in `lexicons/{lang}/lexemes.yaml`", str(len(lexemes))),
        (
            "Pinned forms (rule debt, ADR 0145)",
            str(sum(len(seq(e.get("forms"))) for e in lexemes)),
        ),
        ("Listed forms", "0: no statement that a form has no rule is drafted yet"),
    ]
    lines += _table(rows, ("", "Count"))
    lines += ["", '**Checks** (docs/migration-design.md, "What must not change"):', ""]
    if m.errors:
        lines += [f"- FAILED: {show(e)}" for e in m.errors[:200]]
    else:
        lines += [
            "- every sentence and story line as displayed: text, tokens, readings, accept sets and "
            "translations are unchanged, item by item;",
            "- no two annotations of the course became one;",
            "- every lexeme a token writes is written as its entry, or as a form or allomorph the "
            "lexicon has;",
            "- every name points at something, and every file fits its schema.",
        ]

    lines += ["", "## What each KC id became", ""]
    lines += _table([(k, str(v)) for k, v in sorted(m.stats["aliases"].items())], ("Kind", "KCs"))
    folded = [
        (n, sp) for n, sp in sorted(m.plan.senses.items()) if sp.parts or sp.form_of or sp.rename
    ]
    if folded:
        lines += ["", "**Senses that are no lexeme of their own now** (the plan's statements):", ""]
        folds: list[tuple[str, ...]] = []
        for name, sp in folded:
            if sp.parts:
                became = "built of " + " + ".join(f"`lexeme:{p}`" for p in sp.parts)
            elif sp.form_of:
                became = f"a form of `lexeme:{sp.form_of}`" + (
                    f" ({_feats(sp.feats)})" if sp.feats else ""
                )
            else:
                became = f"renamed `lexeme:{sp.rename}`"
            gloss = str(obj(kcs[f"sense:{name}"].get("gloss")).get("en", ""))
            folds.append((f"`sense:{name}`", gloss, became, sp.note or ""))
        lines += _table(folds, ("KC", "Gloss", "Became", "Why"))

    forms = [(k, fp) for k, fp in m.plan.forms.items()]
    if forms:
        lines += ["", "**`form:` and `construction:` KCs** (the plan's statements, REVIEW):", ""]
        kinds_: list[tuple[str, ...]] = []
        for kc, fp in forms:
            gloss = str(obj(kcs[kc].get("gloss")).get("en", ""))[:70]
            said: list[str] = []
            if fp.feats is not None:
                said.append("values " + _feats(fp.feats))
            for pos, feats in fp.by_pos.items():
                said.append(f"on {pos}: {_feats(feats)}")
            if fp.refine:
                said.append(
                    "by ending: "
                    + ", ".join(f"-{e or '(any other)'}: {_feats(f)}" for e, f in fp.refine)
                )
            if fp.lexeme is not None:
                kind = (
                    "realises " + _feats(fp.realises)
                    if fp.realises is not None
                    else "a function head"
                    if fp.head is not None
                    else f"{fp.pos}"
                    if fp.pos is not None
                    else "a listed item"
                    if fp.listed is not None
                    else "no kind"
                )
                said.append(f"`lexeme:{fp.lexeme}` ({kind})")
            if fp.rule is not None:
                said.append(f"`rule:{fp.rule}`, not written")
            kinds_.append((f"`{kc}`", gloss, "; ".join(said), fp.note or ""))
        lines += _table(kinds_, ("KC", "Gloss", "Becomes", "Note"))

    stats = m.stats["lexicon"]
    defaults = [(k, v) for k, v in sorted(stats.items()) if k.startswith("default ")]
    if defaults or m.plan.lexical:
        lines += ["", "## Defaults", ""]
        lines += [
            "A default is a rule, and what it gives is no part of a lexeme (ADR 0146). These are",
            "the plan's, drafted (REVIEW); the counts are this course's lexemes.",
            "",
        ]
        rows = [(k, str(v)) for k, v in defaults]
        rows += [(k, str(v)) for k, v in sorted(stats.items()) if k.startswith("lexical feature")]
        lines += _table(rows, ("", "Lexemes"))

    for kind, title, why in SECTIONS:
        found = by_kind.get(kind)
        if not found:
            continue
        lines += ["", f"## {title} ({len(found)})", "", why, ""]
        lines += _table([(f"`{where}`", show(what)) for where, what in found], ("Where", "What"))

    other = sorted(set(by_kind) - {k for k, _, _ in SECTIONS})
    for kind in other:
        lines += ["", f"## {kind} ({len(by_kind[kind])})", ""]
        lines += _table([(f"`{w}`", show(x)) for w, x in by_kind[kind]], ("Where", "What"))

    lines += [
        "",
        "## What no finding above covers",
        "",
        "- **Projections:** no orthography of this course has a stated projection yet, so every",
        "  spelling and reading stays pinned as it is; there is nothing to compare them with",
        "  (ADR 0148).",
        "- **Credits by sentence:** an old credit for a `form:` KC that is feature values now has",
        "  no",
        "  part to go to: a feature's uses are not authored, and nothing old counts towards a rule",
        "  (ADR 0146).",
    ]
    return "\n".join(lines) + "\n"
