"""Best-effort importer for LibreLingo YAML courses (gameplan §7.7).

Our own parser of LibreLingo's documented layout: course.yaml (Course, Modules) →
<module>/module.yaml (Module, Skills) → <module>/skills/<skill>.yaml (Skill, New words, Phrases).
librelingo-yaml-loader is AGPL and cannot be a dependency of MIT/Apache code, so nothing of it is
used.

Output is Nabu course source in draft status, kept in one file: course.yaml with its units and
its own lexicon and language declaration (`own`), since an imported course's words are not yet
any language's lexicon (lexicons/<lang>/). Each phrase becomes a sentence with whitespace tokens;
new words become lexemes, introduced by one lesson node per skill. LibreLingo gives no part of
speech, so each lexeme is drafted as X for a person to settle (REVIEW), and the language declares
nothing but itself. Readings cannot be recovered and are left for the compiler's
enrich.missing-reading lint to flag. Check each course's own content license before importing;
it is carried over from course.yaml.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import yaml

from nabu import yamlio
from nabu.notation import escape

SLUG = re.compile(r"[^a-z0-9]+")
WORD = re.compile(r"[\w\u200cʻʼ'’-]+")


def slug(text: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return SLUG.sub("-", ascii_.lower()).strip("-") or "x"


LEXEME = "lexeme:"


@dataclass
class Imported:
    course: dict[str, Any]
    units: dict[str, dict[str, Any]] = field(default_factory=lambda: {})
    #: The course's own lexicon: a lexeme for each new word, sorted by id.
    lexemes: list[dict[str, Any]] = field(default_factory=lambda: [])
    warnings: list[str] = field(default_factory=lambda: [])


def lexeme_name(surface: str) -> str:
    """A new word's lexeme name: the word, spaces as underscores (a lexeme id has none)."""
    return surface.replace(" ", "_")


def _load(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _alternatives(item: dict[str, Any], main: str, alt: str) -> list[str]:
    first = str(item[main]).strip()
    rest = [str(x).strip() for x in cast(list[Any], item.get(alt) or [])]
    return [first, *[r for r in rest if r and r != first]]


def import_course(
    root: Path, course_id: str, orthography: str, support: str = "en-Latn/standard"
) -> Imported:
    course_yaml = _load(root / "course.yaml")
    meta = course_yaml["Course"]
    target = str(meta["Language"]["IETF BCP 47"])
    license_ = str(meta.get("License", {}).get("Short name", "NOASSERTION")).replace(" ", "-")
    support_key = support.split("-")[0]
    language = target.split("-")[0].lower()
    provenance = {
        "author": f"human:librelingo-{slug(str(meta['Language']['Name']))}",
        "status": "draft",
    }
    out = Imported(
        course={
            "id": course_id,
            "target": target
            if "-" in target
            else f"{target}-{orthography.split('/')[0].split('-')[1]}",
            "orthographies": [orthography],
            "support": [support],
            # What the app calls it (ADR 0109): LibreLingo names the language, in the support one.
            "names": {support_key: {"course": str(meta["Language"]["Name"])}},
            "license": license_,
            "provenance": provenance,
            "lexicon": language,
            "units": [],
        }
    )
    seen: set[str] = set()
    for module_dir in cast(list[str], course_yaml.get("Modules", [])):
        module_path = root / module_dir
        module = _load(module_path / "module.yaml")
        unit_id = slug(str(module["Module"]["Name"]))
        unit: dict[str, Any] = {
            "id": unit_id,
            "title": {support_key: str(module["Module"]["Name"])},
            "nodes": [],
            "sentences": [],
        }
        for skill_file in cast(list[str], module.get("Skills", [])):
            skill = _load(module_path / "skills" / skill_file)
            node_id = f"{unit_id}.{slug(str(skill['Skill']['Name']))}"
            introduces: list[str] = []
            for word in cast(list[dict[str, Any]], skill.get("New words") or []):
                surface = str(word["Word"]).strip()
                name = lexeme_name(surface)
                if name not in seen:
                    seen.add(name)
                    out.lexemes.append(
                        {
                            "id": f"{LEXEME}{name}",
                            # No part of speech in LibreLingo: other, until a person says. REVIEW
                            "pos": "X",
                            "gloss": {support_key: str(word["Translation"])},
                            "spelled": {orthography: [surface]},
                        }
                    )
                    introduces.append(f"{LEXEME}{name}")
            unit["nodes"].append({"id": node_id, "kind": "lesson", "introduces": introduces})
            words = {name.replace("_", " ") for name in seen}
            for i, phrase in enumerate(cast(list[dict[str, Any]], skill.get("Phrases") or [])):
                text = str(phrase["Phrase"]).strip()
                tokens: list[dict[str, Any]] = []
                for m in WORD.finditer(text):
                    token: dict[str, Any] = {"surface": m.group(0)}
                    if m.group(0).lower() in words or m.group(0) in words:
                        token["lexeme"] = lexeme_name(
                            m.group(0) if m.group(0) in words else m.group(0).lower()
                        )
                    tokens.append(token)
                unit["sentences"].append(
                    {
                        "id": f"{node_id}.{i + 1}",
                        "node": node_id,
                        "forms": {
                            orthography: {
                                "text": text,
                                "tokens": tokens,
                                "reverse": "\n".join(
                                    escape(a)
                                    for a in _alternatives(phrase, "Phrase", "Alternative versions")
                                ),
                            }
                        },
                        "translations": {
                            support_key: "\n".join(
                                escape(a)
                                for a in _alternatives(
                                    phrase, "Translation", "Alternative translations"
                                )
                            )
                        },
                    }
                )
        out.units[unit_id] = unit
        out.course["units"].append(unit)
    out.lexemes.sort(key=lambda e: str(e["id"]))
    out.course["own"] = {
        "lexicon": {
            "language": language,
            "license": license_,
            "provenance": provenance,
            "lexemes": out.lexemes,
        },
        "language": {
            "id": language,
            "license": license_,
            "provenance": provenance,
            "dimensions": {},
        },
    }
    return out


def write(imported: Imported, out_dir: Path) -> None:
    """The course as one file, out_dir/course.yaml: its units and its own lexicon inside it."""
    out_dir.mkdir(parents=True, exist_ok=True)
    header = (
        "# Imported from LibreLingo by `nabu import-librelingo`. Draft: review every item,\n"
        "# and give each lexeme its part of speech (X until then).\n"
    )
    (out_dir / "course.yaml").write_text(header + yamlio.dump(imported.course), encoding="utf-8")
