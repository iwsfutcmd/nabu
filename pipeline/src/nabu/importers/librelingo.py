"""Best-effort importer for LibreLingo YAML courses (gameplan §7.7).

Our own parser of LibreLingo's documented layout: course.yaml (Course, Modules) →
<module>/module.yaml (Module, Skills) → <module>/skills/<skill>.yaml (Skill, New words, Phrases).
librelingo-yaml-loader is AGPL and cannot be a dependency of MIT/Apache code, so nothing of it is
used.

Output is Nabu course source in draft status. Each phrase becomes a sentence with whitespace
tokens; new words become sense KCs, introduced by one lesson node per skill. Readings cannot be
recovered and are left for the compiler's enrich.missing-reading lint to flag. Check each course's
own content license before importing; it is carried over from course.yaml.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

import yaml

from nabu import yamlio

SLUG = re.compile(r"[^a-z0-9]+")
WORD = re.compile(r"[\w\u200cʻʼ'’-]+")


def slug(text: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return SLUG.sub("-", ascii_.lower()).strip("-") or "x"


@dataclass
class Imported:
    course: dict[str, Any]
    units: dict[str, dict[str, Any]] = field(default_factory=lambda: {})
    warnings: list[str] = field(default_factory=lambda: [])


def _load(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _alternatives(item: dict[str, Any], main: str, alt: str) -> list[str]:
    first = str(item[main]).strip()
    rest = [str(x).strip() for x in cast(list[Any], item.get(alt) or [])]
    return [first, *[r for r in rest if r and r != first]]


def _escape(text: str) -> str:
    """Accept-set notation treats ( ) [ ] | \\ as syntax."""
    return re.sub(r"([()\[\]|\\])", r"\\\1", text)


def import_course(
    root: Path, course_id: str, orthography: str, support: str = "en-Latn/standard"
) -> Imported:
    course_yaml = _load(root / "course.yaml")
    meta = course_yaml["Course"]
    target = str(meta["Language"]["IETF BCP 47"])
    license_ = str(meta.get("License", {}).get("Short name", "NOASSERTION")).replace(" ", "-")
    support_key = support.split("-")[0]
    out = Imported(
        course={
            "id": course_id,
            "target": target
            if "-" in target
            else f"{target}-{orthography.split('/')[0].split('-')[1]}",
            "orthographies": [orthography],
            "support": [support],
            "license": license_,
            "provenance": {
                "author": f"human:librelingo-{slug(str(meta['Language']['Name']))}",
                "status": "draft",
            },
            "units": [],
        }
    )
    seen_kcs: set[str] = set()
    for module_dir in cast(list[str], course_yaml.get("Modules", [])):
        module_path = root / module_dir
        module = _load(module_path / "module.yaml")
        unit_id = slug(str(module["Module"]["Name"]))
        unit: dict[str, Any] = {
            "id": unit_id,
            "title": {support_key: str(module["Module"]["Name"])},
            "kcs": [],
            "nodes": [],
            "sentences": [],
        }
        for skill_file in cast(list[str], module.get("Skills", [])):
            skill = _load(module_path / "skills" / skill_file)
            node_id = f"{unit_id}.{slug(str(skill['Skill']['Name']))}"
            introduces: list[str] = []
            for word in cast(list[dict[str, Any]], skill.get("New words") or []):
                surface = str(word["Word"]).strip()
                kc = f"sense:{surface.replace(' ', '_')}"
                if kc not in seen_kcs:
                    seen_kcs.add(kc)
                    unit["kcs"].append(
                        {
                            "id": kc,
                            "gloss": {support_key: str(word["Translation"])},
                            "forms": {orthography: [surface]},
                        }
                    )
                    introduces.append(kc)
            unit["nodes"].append({"id": node_id, "kind": "lesson", "introduces": introduces})
            senses = {kc.removeprefix("sense:").replace("_", " ") for kc in seen_kcs}
            for i, phrase in enumerate(cast(list[dict[str, Any]], skill.get("Phrases") or [])):
                text = str(phrase["Phrase"]).strip()
                tokens: list[dict[str, Any]] = []
                for m in WORD.finditer(text):
                    token: dict[str, Any] = {"surface": m.group(0)}
                    if m.group(0).lower() in senses or m.group(0) in senses:
                        token["sense"] = (
                            m.group(0) if m.group(0) in senses else m.group(0).lower()
                        ).replace(" ", "_")
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
                                    _escape(a)
                                    for a in _alternatives(phrase, "Phrase", "Alternative versions")
                                ),
                            }
                        },
                        "translations": {
                            support_key: "\n".join(
                                _escape(a)
                                for a in _alternatives(
                                    phrase, "Translation", "Alternative translations"
                                )
                            )
                        },
                    }
                )
        out.units[unit_id] = unit
        out.course["units"].append(f"units/{unit_id}.yaml")
    return out


def write(imported: Imported, out_dir: Path) -> None:
    (out_dir / "units").mkdir(parents=True, exist_ok=True)
    header = "# Imported from LibreLingo by `nabu import-librelingo`. Draft: review every item.\n"
    (out_dir / "course.yaml").write_text(header + yamlio.dump(imported.course), encoding="utf-8")
    for unit_id, unit in imported.units.items():
        (out_dir / "units" / f"{unit_id}.yaml").write_text(
            header + yamlio.dump(unit), encoding="utf-8"
        )
