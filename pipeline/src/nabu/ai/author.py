"""`nabu author draft` (gameplan §13.5): an LLM drafts practice sentences for a lesson node.

The prompt lists the knowledge components taught up to the node (forms in every orthography,
glosses) and asks for sentences in every orthography of the course under the i+1 rule. The answer
must fit AuthorOutput (schemas/ai.schema.json). Each draft becomes a sentence source tagged
`llm:<model>@<prompt-hash>` with status draft, is compiled together with the course to collect
every lint it trips, and is written to courses/<id>/drafts/<node>.yaml for a human to review and
move into a unit. Nothing is drafted without a model.
"""

from __future__ import annotations

import copy
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import yaml

from nabu import yamlio
from nabu.ai.llm import Model, load_prompt, render
from nabu.notation import literal
from nabu.paths import SCHEMAS
from nabu.schema.models import AuthorOutput


def author_schema() -> dict[str, Any]:
    """AuthorOutput as one self-contained JSON Schema (what providers take)."""
    import json

    defs = cast(
        dict[str, Any],
        json.loads((SCHEMAS / "ai.schema.json").read_text(encoding="utf-8"))["$defs"],
    )

    def strip(node: Any) -> Any:
        if isinstance(node, dict):
            return {
                k: strip(v)
                for k, v in cast(dict[str, Any], node).items()
                if k not in ("description", "title")
            }
        if isinstance(node, list):
            return [strip(v) for v in cast(list[Any], node)]
        return node

    return cast(dict[str, Any], strip(defs["AuthorOutput"]))


@dataclass
class Course:
    dir: Path
    source: dict[str, Any]
    units: list[tuple[Path, dict[str, Any]]]

    @property
    def orthographies(self) -> list[str]:
        return list(self.source["orthographies"])


def load_course(course_dir: Path) -> Course:
    source = cast(
        dict[str, Any], yaml.safe_load((course_dir / "course.yaml").read_text(encoding="utf-8"))
    )
    units = [
        (
            course_dir / u,
            cast(dict[str, Any], yaml.safe_load((course_dir / u).read_text(encoding="utf-8"))),
        )
        for u in source.get("units", [])
        if isinstance(u, str)
    ]
    return Course(course_dir, source, units)


def prompt_values(course: Course, node: str, count: int) -> dict[str, str]:
    """What the author prompt is filled with: the components taught up to and including `node`."""
    kcs: dict[str, dict[str, Any]] = {
        kc["id"]: kc for _, u in course.units for kc in u.get("kcs", [])
    }
    taught: list[str] = []
    introduces: list[str] = []
    found = False
    for _, u in course.units:
        for n in u.get("nodes", []):
            taught += list(n.get("introduces") or [])
            if n["id"] == node:
                introduces = list(n.get("introduces") or [])
                found = True
                break
        if found:
            break
    if not found:
        raise KeyError(f"no node {node!r} in {course.dir}")
    lines: list[str] = []
    for kc_id in dict.fromkeys(taught):
        kc = kcs.get(kc_id, {})
        forms = " / ".join(
            ", ".join(kc.get("forms", {}).get(o, []))
            for o in course.orthographies
            if kc.get("forms", {}).get(o)
        )
        gloss = kc.get("gloss", {}).get("en", "")
        lines.append(f"{kc_id}: {forms or '(a form or construction)'} ({gloss})")
    language = language_name(str(course.source["target"]))
    return {
        "language": language,
        "count": str(count),
        "node": node,
        "orthographies": ", ".join(course.orthographies),
        "kcs": "\n".join(lines),
        "introduces": ", ".join(introduces),
    }


def language_name(tag: str) -> str:
    """ "Uzbek (Latin, Uzbekistan)" from ICU when installed (the icu group), else the tag itself."""
    from nabu.drills.rbnf import _icu  # pyright: ignore[reportPrivateUsage]

    icu = _icu()
    if icu is None:
        return tag
    return str(icu.Locale(tag.replace("-", "_")).getDisplayName(icu.Locale("en")))


SAFE = re.compile(r"[\s@]+")


def drafts_of(output: AuthorOutput, course: Course, node: str, author: str) -> list[dict[str, Any]]:
    """Sentence sources from the model's answer. Only sense components become token senses."""
    drafts: list[dict[str, Any]] = []
    for i, s in enumerate(output.sentences, 1):
        forms: dict[str, Any] = {}
        for orth, form in s.forms.items():
            tokens = [
                yamlio.Flow(
                    {
                        "surface": t.surface,
                        **(
                            {"sense": t.kc.removeprefix("sense:")}
                            if t.kc.startswith("sense:")
                            else {}
                        ),
                    }
                )
                for t in form.tokens
            ]
            forms[orth] = {
                "text": form.text,
                "tokens": tokens,
                "reverse": literal(form.text),
            }
        drafts.append(
            {
                "id": f"draft.{node}.{i}",
                "node": node,
                "forms": forms,
                "translations": {"en": "\n".join(literal(t) for t in s.translations)},
                "provenance": yamlio.Flow({"author": author, "status": "draft"}),
            }
        )
    return drafts


def lint(course: Course, node: str, drafts: list[dict[str, Any]]) -> list[str]:
    """Every diagnostic the drafts add to the course's own (compiled together in a scratch copy)."""
    from nabu.compiler import compile_course
    from nabu.corecli import CoreCli

    def diagnostics(directory: Path, cli: CoreCli) -> set[tuple[str, str]]:
        diags, _ = compile_course(directory, cli)
        return {(d.lint, d.message) for d in diags.items}

    with tempfile.TemporaryDirectory() as tmp, CoreCli() as cli:
        before = diagnostics(course.dir, cli)
        scratch = Path(tmp) / course.dir.name
        shutil.copytree(course.dir, scratch, ignore=shutil.ignore_patterns("audio", "drafts"))
        # Courses share pictures from a sibling directory (../images).
        if (course.dir.parent / "images").is_dir():
            (Path(tmp) / "images").symlink_to(
                course.dir.parent / "images", target_is_directory=True
            )
        for path, unit in course.units:
            if any(n["id"] == node for n in unit.get("nodes", [])):
                merged = copy.deepcopy(unit)
                merged["sentences"] = [*merged.get("sentences", []), *drafts]
                (scratch / path.relative_to(course.dir)).write_text(
                    yamlio.dump(merged), encoding="utf-8"
                )
        audio = course.source.get("audio")
        if audio is not None:
            source = dict(course.source)
            source.pop("audio")
            (scratch / "course.yaml").write_text(yamlio.dump(source), encoding="utf-8")
        after = diagnostics(scratch, cli)
    return [
        f"{severity_of(lint_id)} {lint_id}: {message}"
        for lint_id, message in sorted(after - before)
    ]


def severity_of(lint_id: str) -> str:
    from nabu.compiler.diagnostics import LINTS

    return LINTS[lint_id].severity


def draft(course_dir: Path, node: str, count: int, model: Model) -> tuple[Path, list[str]]:
    """Asks the model; writes courses/<id>/drafts/<node>.yaml; returns it and the lints found."""
    course = load_course(course_dir)
    prompt = load_prompt("author")
    answer = model.complete(
        render(prompt.source, prompt_values(course, node, count)), author_schema(), "AuthorOutput"
    )
    output = AuthorOutput.model_validate(answer)
    author = f"llm:{SAFE.sub('-', model.model)}@{prompt.hash}"
    drafts = drafts_of(output, course, node, author)
    # The compiler lets a sentence skip an orthography; a draft may not (the prompt asks for all).
    findings = [
        f"error {d['id']}: no {o} form"
        for d in drafts
        for o in course.orthographies
        if o not in d["forms"]
    ] + lint(course, node, drafts)
    out = course_dir / "drafts" / f"{node}.yaml"
    out.parent.mkdir(exist_ok=True)
    header = [
        f"# Drafts for {node}, by {author} (prompts/author.md). Status draft: a speaker of the",
        "# language reviews each one, fixes it, adds readings where the course pins them, and",
        "# moves it into a unit.",
        *(
            ["# Lints the drafts trip (compiled with the course):"] + [f"#   {f}" for f in findings]
            if findings
            else ["# The drafts compile with the course without new lints."]
        ),
    ]
    out.write_text(
        "\n".join(header) + "\n" + yamlio.dump({"node": node, "sentences": drafts}),
        encoding="utf-8",
    )
    return out, findings
