"""What the migration to the lexical model (ADRs 0145–0151) has to convert, counted from the ten
courses: every KC by kind, how each form: and construction: KC is used (pinned on a token as its
form, written as a morph with letters of its own, or only listed by sentences), and the ids other
things are keyed by (clips).

Run from pipeline/: uv run --frozen python ../docs/prototypes/migration-inventory/inventory.py [--table]
"""

from __future__ import annotations

import collections
import glob
import re
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[3]
COURSES = sorted(p.name for p in (ROOT / "courses").iterdir() if (p / "course.yaml").exists())


def tokens_of(unit: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    items = list(unit.get("sentences", []))
    for story in unit.get("stories", []) or []:
        for step in story.get("steps", []) or []:
            line = step.get("line", step)
            if isinstance(line, dict) and "forms" in line:
                items.append(line)
    for item in items:
        for form in item["forms"].values():
            out.extend(t for t in form.get("tokens", []) if t.get("kind", "word") == "word")
    return out


def survey(course: str) -> dict[str, Any]:
    kcs: dict[str, dict[str, Any]] = {}
    pinned: collections.Counter[str] = collections.Counter()
    morph: collections.Counter[str] = collections.Counter()
    silent: collections.Counter[str] = collections.Counter()
    shapes: dict[str, set[str]] = collections.defaultdict(set)
    listed: collections.Counter[str] = collections.Counter()
    sentences = 0
    for path in sorted(glob.glob(str(ROOT / "courses" / course / "units" / "*.yaml"))):
        unit = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
        for kc in unit.get("kcs", []) or []:
            kcs.setdefault(kc["id"], kc)
        for s in unit.get("sentences", []) or []:
            sentences += 1
            for kc in (s.get("kcs", []) or []) + (s.get("constructions", []) or []):
                listed[kc] += 1
        for t in tokens_of(unit):
            if t.get("form"):
                pinned[t["form"]] += 1
            for m in t.get("morphs", []) or []:
                kc = m.get("kc", "")
                if not kc:
                    continue
                if m.get("surface"):
                    morph[kc] += 1
                    if len(shapes[kc]) < 6:
                        shapes[kc].add(str(m["surface"]))
                else:
                    silent[kc] += 1
    clips = 0
    by_kc = 0
    index = ROOT / "courses" / course / "audio" / "index.yaml"
    if index.exists():
        for clip in yaml.safe_load(index.read_text(encoding="utf-8")).get("clips", []) or []:
            clips += 1
            if ":" in str(clip.get("item", "")) and str(clip["item"]).split(":")[0] in ("sense", "form", "construction", "grapheme"):
                by_kc += 1
    return {"kcs": kcs, "pinned": pinned, "morph": morph, "silent": silent, "shapes": shapes, "listed": listed, "sentences": sentences, "clips": clips, "clips_by_kc": by_kc}


INVISIBLE = re.compile("[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]")


def show(text: str) -> str:
    """Invisible characters as their escapes (a ZWNJ before chg's copula), never literally."""
    return INVISIBLE.sub(lambda m: f"\\u{ord(m.group()):04x}", text)


def use_of(kc: str, s: dict[str, Any]) -> str:
    bits = []
    if s["pinned"][kc]:
        bits.append(f"a token's form {s['pinned'][kc]}×")
    if s["morph"][kc]:
        bits.append(f"a morph with letters {s['morph'][kc]}× ({', '.join(show(x) for x in sorted(s['shapes'][kc])[:4])})")
    if s["silent"][kc]:
        bits.append(f"a morph with no letters {s['silent'][kc]}×")
    if not bits:
        bits.append(f"named by {s['listed'][kc]} sentences" if s["listed"][kc] else "named by no token or sentence")
    return "; ".join(bits)


def becomes(kc: str, s: dict[str, Any]) -> str:
    """What the design note's rules make of a KC, from how the course uses it."""
    if kc.startswith("construction:"):
        return "a rule, or a listed item with slots: decided when its course is converted (ADR 0145)"
    pin, morph, silent = s["pinned"][kc], s["morph"][kc], s["silent"][kc]
    if pin and morph:
        return "feature values on the words that carry it; the morph is their exponent, a morpheme"
    if pin:
        return "feature values on the token (no letters of its own are marked)"
    if morph:
        return "a morpheme: the exponent of a feature value, with these shapes as its allomorphs"
    if silent:
        return "a feature value with no exponent the script writes"
    return "not used by any token: a feature value or a rule, decided with its course"


def main() -> None:
    table = "--table" in sys.argv
    totals: collections.Counter[str] = collections.Counter()
    for course in COURSES:
        s = survey(course)
        kinds = collections.Counter(k.split(":")[0] for k in s["kcs"])
        totals.update(kinds)
        totals["sentences"] += s["sentences"]
        totals["clips"] += s["clips"]
        totals["clips keyed by a KC"] += s["clips_by_kc"]
        other = [k for k in s["kcs"] if k.split(":")[0] in ("form", "construction")]
        if table:
            print(f"\n## {course} ({len(other)})\n")
            print("| KC | Gloss | Used as | Becomes |")
            print("|---|---|---|---|")
            for k in other:
                gloss = str((s["kcs"][k].get("gloss") or {}).get("en", "")).replace("|", "/")[:90]
                print(f"| `{k}` | {gloss} | {use_of(k, s)} | {becomes(k, s)} |")
        else:
            uses = collections.Counter("pin" if s["pinned"][k] and not s["morph"][k] else "morph" if s["morph"][k] and not s["pinned"][k] else "both" if s["pinned"][k] else "silent morph" if s["silent"][k] else "listed only" for k in other)
            print(course, dict(kinds), "form/construction used as:", dict(uses), "| sentences", s["sentences"], "clips", s["clips"], "by KC", s["clips_by_kc"])
    if not table:
        print("TOTAL", dict(totals))


if __name__ == "__main__":
    main()
