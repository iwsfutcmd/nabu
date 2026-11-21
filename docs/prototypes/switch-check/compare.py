"""The switch's check of stage 2 (docs/migration-design.md, "Deliverable 3"): a course's bundle in
the new shape against the one the main branch's compiler writes, item by item.

    python3 docs/prototypes/switch-check/compare.py <old bundles dir> <new bundles dir> [course…]

What must be equal: every sentence's and story line's text as displayed (surfaces, kinds, tiles,
readings, ruby, variants), its accept sets and translations; every story question; every word's
spellings, gloss and picture, under its new name; every node's sentences; every letter and word of
a script track; every clip. What may differ is listed by kind, each with why. It reads the two
bundles and the new one's alias table, and nothing else.
"""

from __future__ import annotations

import collections
import json
import sys
from pathlib import Path
from typing import Any

Json = dict[str, Any]
SHOWN = ("surface", "kind", "readings", "ruby", "ipa", "tileGroup", "variants")


def load(bundle: Path) -> tuple[Json, list[Json], Json, Json | None, Json | None]:
    manifest = json.loads((bundle / "manifest.json").read_text(encoding="utf-8"))
    units = [json.loads((bundle / u["file"]).read_text(encoding="utf-8")) for u in manifest["units"]]

    def one(role: str) -> Json | None:
        found = [f for f in manifest["files"] if f["role"] == role]
        return json.loads((bundle / found[0]["path"]).read_text(encoding="utf-8")) if found else None

    return manifest, units, one("audio-index") or {"items": {}}, one("lexicon"), one("aliases")


def shown(text: Json | None) -> Any:
    """A text as a learner sees it: what every token shows, without what it is analysed as."""
    if text is None:
        return None
    return {
        "lang": text["lang"],
        "orthography": text["orthography"],
        "tokens": [{k: t[k] for k in SHOWN if k in t} for t in text["tokens"]],
    }


def old_analysis(token: Json) -> tuple[Any, ...]:
    return (
        token.get("sense"),
        token.get("form"),
        tuple((m["kc"], m["surface"]) for m in token.get("morphs", [])),
    )


class Report:
    def __init__(self, course: str) -> None:
        self.course = course
        self.same: collections.Counter[str] = collections.Counter()
        self.differs: dict[str, list[str]] = collections.defaultdict(list)

    def check(self, kind: str, where: str, old: Any, new: Any) -> bool:
        if old == new:
            self.same[kind] += 1
            return True
        self.differs[kind].append(where)
        return False

    def note(self, kind: str, where: str) -> None:
        self.differs[kind].append(where)


def compare(course: str, old_dir: Path, new_dir: Path) -> Report:
    r = Report(course)
    om, ou, oa, _, _ = load(old_dir / course)
    nm, nu, na, lexicon, aliases = load(new_dir / course)
    assert lexicon is not None, "the new bundle has no lexicon"
    table: Json = (aliases or {}).get("aliases", {})
    lexemes = {e["id"]: e for e in lexicon["lexemes"]}
    labels = lexicon.get("labels", [])
    rules = {x["id"]: x for x in lexicon.get("rules", [])}

    for key in ("course", "target", "orthographies", "support", "names", "facets", "audioQuality",
                "placement", "wordParts", "licenses", "provenance"):
        r.check("manifest field", key, om.get(key), nm.get(key))
    r.check("unit ids", "units", [u["id"] for u in ou], [u["id"] for u in nu])

    old_kcs = {k["id"]: k for u in ou for k in u["kcs"]}

    def aliased(kc: str) -> str | None:
        part = table.get(kc, {}).get("part")
        return part if isinstance(part, str) else None

    def first_forms(forms: Json | None) -> dict[str, str]:
        return {
            o: "".join(t["surface"] for t in fs[0]["tokens"]) for o, fs in (forms or {}).items() if fs
        }

    # A word that is a form of another lexeme now, or built of several, has that lexeme as its
    # alias (old credits go to it) and is no lexeme of its own: where two KCs have one lexeme,
    # the one spelled as the entry is the lexeme, and the other the form.
    by_lexeme: dict[str, list[str]] = collections.defaultdict(list)
    for kc_id in old_kcs:
        part = aliased(kc_id)
        if part is not None:
            by_lexeme[part].append(kc_id)
    forms_of_another: set[str] = set()
    for part, kc_ids in by_lexeme.items():
        if len(kc_ids) < 2:
            continue
        entry_first = first_forms(lexemes.get(part, {}).get("forms"))
        own = [k for k in kc_ids if first_forms(old_kcs[k].get("forms")) == entry_first]
        keep = own[0] if own else kc_ids[0]
        forms_of_another.update(k for k in kc_ids if k != keep)

    def renamed(kc: str) -> str | None:
        return None if kc in forms_of_another else aliased(kc)

    # ---- sentences
    old_s = {s["id"]: s for u in ou for s in u["sentences"]}
    new_s = {s["id"]: s for u in nu for s in u["sentences"]}
    r.check("sentence ids", "all", list(old_s), list(new_s))
    for sid, o in old_s.items():
        n = new_s.get(sid)
        if n is None:
            continue
        r.check("sentence node", sid, o["node"], n["node"])
        r.check("sentence production", sid, o["production"], n["production"])
        r.check("sentence provenance and license", sid, (o.get("provenance"), o["license"]),
                (n.get("provenance"), n["license"]))
        r.check("sentence translations", sid, o["translations"], n["translations"])
        r.check("sentence orthographies", sid, list(o["forms"]), list(n["forms"]))
        for orth, form in o["forms"].items():
            nf = n["forms"].get(orth, {})
            r.check("sentence text", f"{sid} {orth}", shown(form["text"]), shown(nf.get("text")))
            r.check("sentence accept set", f"{sid} {orth}", form.get("reverse"), nf.get("reverse"))
        tags = n.get("tags", [])
        persons = next((t["persons"] for t in tags if "persons" in t), None)
        register = next((t["register"] for t in tags if "register" in t), None)
        r.check("persons", sid, o.get("persons"), persons)
        if o.get("register") != register:
            # A register every sentence of the course has is the course's range, not a tag.
            ranged = nm.get("registers") == [o.get("register")] and register is None
            r.note("register: now the course's" if ranged else "register", sid)
        else:
            r.same["register"] += 1

    # ---- nodes
    old_n = {n["id"]: n for u in ou for n in u["nodes"]}
    new_n = {n["id"]: n for u in nu for n in u["nodes"]}
    r.check("node ids", "all", list(old_n), list(new_n))
    for nid, o in old_n.items():
        n = new_n.get(nid)
        if n is None:
            continue
        r.check("node kind and sentences", nid, (o["kind"], o["sentences"], o.get("convert")),
                (n["kind"], n["sentences"], n.get("convert")))
        if "alphabet" in o or "alphabet" in n:
            oa_, na_ = o.get("alphabet", {}), n.get("alphabet", {})
            r.check("alphabet letters", nid,
                    [(i["kc"], i["letters"], shown(i["text"]), shown(i["latin"])) for i in oa_.get("letters", [])],
                    [(i["id"], i["letters"], shown(i["text"]), shown(i["latin"])) for i in na_.get("letters", [])])
            r.check("alphabet words", nid,
                    [(renamed(i["kc"]), i["letters"], shown(i["text"]), shown(i["latin"])) for i in oa_.get("words", [])],
                    [(i["id"], i["letters"], shown(i["text"]), shown(i["latin"])) for i in na_.get("lexemes", [])])

    # ---- stories
    old_st = {s["id"]: s for u in ou for s in u.get("stories", [])}
    new_st = {s["id"]: s for u in nu for s in u.get("stories", [])}
    r.check("story ids", "all", list(old_st), list(new_st))
    for stid, o in old_st.items():
        n = new_st.get(stid)
        if n is None:
            continue
        r.check("story head", stid,
                (o["node"], o["title"], o["characters"], o.get("provenance"), o["license"], len(o["steps"])),
                (n["node"], n["title"], n["characters"], n.get("provenance"), n["license"], len(n["steps"])))
        for i, (os_, ns_) in enumerate(zip(o["steps"], n["steps"], strict=False)):
            where = f"{stid}#{i}"
            if "choose" in os_ or "choose" in ns_:
                r.check("story question (choose)", where, os_.get("choose"), ns_.get("choose"))
                continue
            ol, nl = os_["line"], ns_["line"]
            r.check("story line text", where, {k: shown(v) for k, v in ol["forms"].items()},
                    {k: shown(v) for k, v in nl["forms"].items()})
            r.check("story line translations and speaker", where, (ol["translations"], ol.get("speaker"), ol.get("ask")),
                    (nl["translations"], nl.get("speaker"), nl.get("ask")))
            if "gap" in ol or "gap" in nl:
                asks = {"word": "lexeme", "form": "form"}.get(ol.get("asks", ""), ol.get("asks"))
                r.check("story gap", where, (renamed(ol.get("gap", "")), asks), (nl.get("gap"), nl.get("asks")))
                old_options = [{k: shown(v) for k, v in opt.items()} for opt in ol.get("options", [])]
                new_options = [{k: shown(v) for k, v in opt.items()} for opt in nl.get("options", [])]
                if not r.check("story options", where, old_options, new_options):
                    first = lambda options: [  # noqa: E731
                        next(iter(opt.values()))["tokens"][0]["surface"] for opt in options
                    ]
                    r.differs["story options"][-1] += f": {first(old_options)} → {first(new_options)}"

    # ---- words: each KC with its lexeme, label or rule
    graphemes = {g["id"]: g for u in nu for g in u.get("graphemes", [])}
    for kc_id, kc in old_kcs.items():
        kind = kc["kind"]
        forms = {o: [shown(t) for t in fs] for o, fs in (kc.get("forms") or {}).items()}
        gloss = kc.get("gloss")
        if kind == "grapheme":
            g = graphemes.get(kc_id)
            new_g = None if g is None else (
                {o: [shown(t) for t in fs] for o, fs in (g.get("forms") or {}).items()}, g.get("gloss"))
            if (forms, gloss) == new_g:
                r.same["letter"] += 1
            elif g is not None and first_forms(kc.get("forms")) == first_forms(g.get("forms")) and gloss == g.get("gloss"):
                # The old compiler pinned a word's reading on a letter spelled like it (و "and").
                r.note("letter: written the same, without the reading of a word spelled like it", kc_id)
            else:
                r.note("letter", kc_id)
            continue
        new_id = renamed(kc_id)
        entry = lexemes.get(new_id or "")
        if entry is not None:
            new_forms = {o: [shown(t) for t in fs] for o, fs in (entry.get("forms") or {}).items()}
            r.check("word gloss", kc_id, gloss, entry.get("gloss"))
            r.check("word picture", kc_id, kc.get("image"), entry.get("image"))
            r.check("word part of speech", kc_id, kc.get("pos"), entry.get("pos"))
            if forms == new_forms:
                r.same["word spellings"] += 1
            elif {o: fs[:1] for o, fs in forms.items()} == {o: fs[:1] for o, fs in new_forms.items()}:
                r.note("word spellings: the first is the same, another is not listed", kc_id)
            elif not forms and new_forms:
                r.note("word spellings: an ending the old bundle did not spell", kc_id)
            else:
                r.note("word spellings", f"{kc_id} → {new_id}")
            continue
        if new_id is not None and new_id.startswith("rule:"):
            r.check("pattern gloss (now a rule's)", kc_id, gloss, rules.get(new_id, {}).get("gloss"))
            if forms:
                r.note("pattern with a spelling: a rule has none", kc_id)
            continue
        if new_id is None and kind == "construction":
            rule = f"rule:{kc_id.partition(':')[2]}"
            if rule in rules:
                r.check("pattern gloss (now a rule's)", kc_id, gloss, rules[rule].get("gloss"))
                continue
        if new_id is None and kind == "form":
            # A form KC that is feature values now: its gloss is a label's.
            if gloss is None or any(label["gloss"] == gloss for label in labels):
                r.same["form gloss (now a label's)"] += 1
            else:
                r.note("form gloss (now a label's)", kc_id)
            if forms:
                r.note("form KC with a spelling: feature values have none", kc_id)
            continue
        if new_id is None and kind == "sense":
            r.note("word that is a form of another lexeme, or built of several, now", f"{kc_id} (of {aliased(kc_id)})")
            continue
        r.note("KC with no counterpart", kc_id)

    # ---- token analysis: every old annotation has a new one, and the letters line up
    def tokens_of(units: list[Json]) -> dict[tuple[str, str], list[Json]]:
        out: dict[tuple[str, str], list[Json]] = {}
        for u in units:
            for s in u["sentences"]:
                for orth, form in s["forms"].items():
                    out[(s["id"], orth)] = form["text"]["tokens"]
            for st in u.get("stories", []):
                for i, step in enumerate(st["steps"]):
                    if "line" in step:
                        for orth, text in step["line"]["forms"].items():
                            out[(f"{st['id']}#{i}", orth)] = text["tokens"]
        return out

    ot, nt = tokens_of(ou), tokens_of(nu)
    for key, old_tokens in ot.items():
        new_tokens = nt.get(key, [])
        for o, n in zip(old_tokens, new_tokens, strict=False):
            was = "sense" in o or "morphs" in o or "form" in o
            now = bool(n.get("lexemes"))
            if was != now:
                r.note("token analysed in one and not the other", f"{key[0]} {key[1]} {o['surface']}")
            elif was:
                r.same["token analysed in both"] += 1
                parts = n["lexemes"]
                if len(parts) > 1 and "".join(p.get("surface", "") for p in parts) != n["surface"]:
                    r.note("token lexemes do not spell the token", f"{key[0]} {key[1]} {n['surface']}")

    # ---- clips
    new_items = na["items"]
    matched: set[str] = set()
    for item, clips in oa["items"].items():
        if item in forms_of_another:
            # The clip of a form: kept in the course under its form's key, and in no bundle.
            r.note("clip of a word that is a form now: kept in the course, not shipped", item)
            continue
        key = renamed(item) or item
        if key not in new_items:
            r.note("clip not shipped", item)
            continue
        matched.add(key)
        r.check("clip", key, clips, new_items[key])
    for item in new_items:
        if item not in matched:
            r.note("clip only in the new bundle", item)
    return r


def main() -> None:
    old_dir, new_dir = Path(sys.argv[1]), Path(sys.argv[2])
    courses = sys.argv[3:] or sorted(p.name for p in new_dir.iterdir() if (p / "manifest.json").exists())
    total_same: collections.Counter[str] = collections.Counter()
    all_differs: dict[str, dict[str, list[str]]] = collections.defaultdict(dict)
    for course in courses:
        r = compare(course, old_dir, new_dir)
        total_same.update(r.same)
        for kind, where in r.differs.items():
            all_differs[kind][course] = where
    print("## The same in both\n")
    for kind, n in sorted(total_same.items()):
        print(f"- {kind}: {n}")
    print("\n## Different\n")
    if not all_differs:
        print("Nothing.")
    for kind, by_course in sorted(all_differs.items()):
        n = sum(len(v) for v in by_course.values())
        print(f"### {kind}: {n}\n")
        for course, where in sorted(by_course.items()):
            shown_ = "; ".join(where[:6]) + (f"; … ({len(where)} in all)" if len(where) > 6 else "")
            print(f"- {course}: {shown_}")
        print()


if __name__ == "__main__":
    main()
