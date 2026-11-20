"""The one-time converter to the lexical model (docs/migration-design.md, deliverable 2).

`nabu migrate <course>` reads a course as it is today and writes, beside it: its language's
lexicon and declaration (lexicons/<lang>/), the course in the new shape (courses/<id>/next/),
the table of what each KC id became (courses/<id>/aliases.yaml) and a report of everything it
found (docs/migration/<id>.md). Nothing in the app reads what it writes until the switch.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from nabu import yamlio
from nabu.migrate import aliases as aliases_mod
from nabu.migrate import checks, report
from nabu.migrate import plan as plan_mod
from nabu.migrate import source as source_mod
from nabu.migrate.convert import Converter, Finding
from nabu.migrate.course import CourseWriter
from nabu.migrate.lexicon import Built, build
from nabu.migrate.plan import Plan, PlanError
from nabu.migrate.source import Course, obj
from nabu.paths import REPO, SCHEMAS

Json = dict[str, Any]

__all__ = ["Migration", "PlanError", "migrate", "stale", "write"]

WIDTH = 100_000
"""No folding: a token list, an entry's form and a node stay on one line, so a diff shows a line."""


@dataclass
class Migration:
    course: Course
    plan: Plan
    conv: Converter
    built: Built
    next_course: Json
    next_units: list[tuple[str | None, Json]]
    aliases: Json
    findings: list[Finding]
    errors: list[str]
    stats: Json
    files: dict[str, str] = field(default_factory=lambda: {})
    """What it writes: path from the repo's root, and the text."""


def migrate(course_dir: Path, plan_path: Path | None = None) -> Migration:
    course = source_mod.load(course_dir)
    plan = plan_mod.load(course.id, plan_path)
    if plan.language != course.language:
        raise PlanError(f"the plan is for {plan.language}, the course teaches {course.language}")
    conv = Converter(course, plan)
    built = build(conv)
    writer = CourseWriter(conv)
    next_units = [(path, writer.unit(unit)) for path, unit in course.units]
    next_course = writer.course()
    if any(path is None for path, _ in next_units):
        next_course["units"] = [path or unit for path, unit in next_units]
    table, alias_stats = aliases_mod.build(conv)
    findings = [*conv.findings, *built.findings, *writer.findings]

    units = [unit for _, unit in next_units]
    # The entries written as several tokens, by orthography: the lexicon says so itself (its
    # first spelling has a space).
    multiword = {
        (str(entry["id"])[7:], orth)
        for entry in built.lexicon["lexemes"]
        for orth, spellings in obj(entry.get("spelled")).items()
        if any(ch.isspace() for ch in str(spellings[0]))
    }
    errors = [
        *checks.text_unchanged(conv, units),
        *checks.nothing_merged(conv),
        *checks.references(built.lexicon, built.language, next_course, units, table),
        *checks.accounted(built.lexicon, built.language, units, multiword),
        *_validate(built, next_course, units, table),
    ]
    stats: Json = {"lexicon": built.stats, "aliases": alias_stats}
    out = Migration(
        course, plan, conv, built, next_course, next_units, table, findings, errors, stats
    )
    out.files = _files(out)
    return out


def _validate(built: Built, next_course: Json, units: list[Json], table: Json) -> list[str]:
    """Each file against its schema's generated model."""
    from pydantic import ValidationError

    from nabu.schema import models

    errors: list[str] = []
    docs: list[tuple[str, Any, Any]] = [
        ("language.yaml", models.LanguageDeclaration, built.language),
        ("lexemes.yaml", models.Lexicon, built.lexicon),
        ("next/course.yaml", models.NextCourseSource, next_course),
        ("aliases.yaml", models.AliasTable, table),
        *[(f"next unit {u['id']}", models.NextUnitSource, u) for u in units],
    ]
    for name, model, data in docs:
        try:
            model.model_validate(_plain(data))
        except ValidationError as e:
            shown = "; ".join(
                f"{'.'.join(str(x) for x in err['loc'])}: {err['msg']}" for err in e.errors()[:6]
            )
            errors.append(f"{name} does not fit its schema ({e.error_count()} errors): {shown}")
    errors += _validate_json(
        [
            ("language.yaml", "language.schema.json", None, built.language),
            ("lexemes.yaml", "lexicon.schema.json", None, built.lexicon),
            ("next/course.yaml", "course-source.next.schema.json", None, next_course),
            ("aliases.yaml", "aliases.schema.json", None, table),
            *[
                (f"next unit {u['id']}", "course-source.next.schema.json", "NextUnitSource", u)
                for u in units
            ],
        ]
    )
    return errors


def _validate_json(docs: list[tuple[str, str, str | None, Any]]) -> list[str]:
    """Each file against the JSON Schema itself: the generated models do not hold every
    constraint (a pattern on a key, a least number of properties)."""
    try:
        from jsonschema import Draft202012Validator
        from referencing import Registry, Resource
    except ImportError:  # The dev group has them; a bare install converts without this check.
        return []
    base = "https://nabu.invalid/schemas/v0/"
    registry: Any = Registry().with_resources(  # pyright: ignore[reportUnknownVariableType, reportUnknownMemberType, reportUnknownArgumentType]
        [
            (base + p.name, Resource.from_contents(json.loads(p.read_text(encoding="utf-8"))))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType]
            for p in sorted(SCHEMAS.glob("*.schema.json"))
        ]
    )
    errors: list[str] = []
    for name, file, definition, data in docs:
        schema: Json = {"$ref": base + file + (f"#/$defs/{definition}" if definition else "")}
        validator = Draft202012Validator(schema, registry=registry)
        found = sorted(validator.iter_errors(_plain(data)), key=lambda e: list(e.absolute_path))  # pyright: ignore[reportUnknownMemberType, reportUnknownArgumentType, reportUnknownLambdaType]
        if found:
            shown = "; ".join(
                f"{'/'.join(str(x) for x in e.absolute_path)}: {e.message[:120]}" for e in found[:6]
            )
            errors.append(f"{name} does not fit {file} ({len(found)} errors): {shown}")
    return errors


def _plain(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items()}  # pyright: ignore[reportUnknownVariableType, reportUnknownArgumentType]
    if isinstance(value, list):
        return [_plain(v) for v in value]  # pyright: ignore[reportUnknownVariableType]
    return value


def _header(what: str, course: str) -> str:
    return (
        f"# {what}\n"
        f"# Written by `nabu migrate` from courses/{course} and its conversion plan\n"
        "# (docs/migration-design.md, deliverable 2); never by hand. Nothing reads it until the\n"
        "# switch.\n"
    )


def _lexemes(lexicon: Json) -> Json:
    """Entries laid out to be read and diffed: one line a form, a spelling, a gloss."""
    out = dict(lexicon)
    out["provenance"] = yamlio.Flow(lexicon["provenance"])
    entries: list[Json] = []
    for entry in lexicon["lexemes"]:
        e: Json = {}
        for key, value in entry.items():
            if key in ("forms", "allomorphs"):
                e[key] = [_flow(v) for v in value]
            elif isinstance(value, (dict, list)):
                e[key] = _flow(value)
            else:
                e[key] = value
        entries.append(e)
    out["lexemes"] = entries
    return out


def _flow(value: Any) -> Any:
    if isinstance(value, dict):
        return yamlio.Flow({k: _flow(v) for k, v in value.items()})  # pyright: ignore[reportUnknownVariableType]
    if isinstance(value, list):
        return yamlio.FlowList([_flow(v) for v in value])  # pyright: ignore[reportUnknownVariableType]
    return value


def _language(language: Json) -> Json:
    out: Json = {}
    for key, value in language.items():
        if key in ("defaults", "classes", "labels"):
            out[key] = [_flow(v) for v in value]
        elif key in ("dimensions", "lexical", "citation", "features"):
            out[key] = {k: _flow(v) for k, v in value.items()}
        elif isinstance(value, (dict, list)):
            out[key] = _flow(value)
        else:
            out[key] = value
    return out


def _files(m: Migration) -> dict[str, str]:
    cid, lang = m.course.id, m.plan.language
    files: dict[str, str] = {}
    files[f"lexicons/{lang}/language.yaml"] = _header(
        f"What {lang} declares beside its lexicon (schemas/language.schema.json).", cid
    ) + yamlio.dump(_language(m.built.language), WIDTH)
    files[f"lexicons/{lang}/lexemes.yaml"] = _header(
        f"The lexicon of {lang} (schemas/lexicon.schema.json): every lexeme, sorted by id.", cid
    ) + yamlio.dump(_lexemes(m.built.lexicon), WIDTH)
    files[f"courses/{cid}/next/course.yaml"] = _header(
        f"courses/{cid} in the new shape (schemas/course-source.next.schema.json).", cid
    ) + yamlio.dump(m.next_course, WIDTH)
    for path, unit in m.next_units:
        if path is not None:
            files[f"courses/{cid}/next/{path}"] = _header(
                f"Unit {unit['id']} of courses/{cid} in the new shape.", cid
            ) + yamlio.dump(unit, WIDTH)
    files[f"courses/{cid}/aliases.yaml"] = _header(
        f"What each KC id of courses/{cid} became (schemas/aliases.schema.json).", cid
    ) + yamlio.dump(m.aliases, WIDTH)
    files[f"docs/migration/{cid}.md"] = report.render(m)
    return files


def write(m: Migration, repo: Path = REPO) -> list[Path]:
    written: list[Path] = []
    for rel, text in m.files.items():
        path = repo / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8")
            written.append(path)
    return written


def stale(m: Migration, repo: Path = REPO) -> list[str]:
    """The files that are not what the converter writes now."""
    return [
        rel
        for rel, text in m.files.items()
        if not (repo / rel).exists() or (repo / rel).read_text(encoding="utf-8") != text
    ]
