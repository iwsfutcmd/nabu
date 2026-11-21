"""`nabu author draft` (gameplan §13.5): an LLM drafts practice sentences for a lesson node.

The prompt lists what is taught up to the node (each lexeme with its spellings in every
orthography and its gloss, each rule and feature value the nodes introduce) and asks for
sentences in every orthography of the course under the i+1 rule. The answer must fit
AuthorOutput (schemas/ai.schema.json), each token naming the id of what it writes. Each draft
becomes a sentence source whose tokens name lexemes, tagged `llm:<model>@<prompt-hash>` with
status draft; a lexeme the language's lexicon lacks is drafted as a lexicon entry, with the same
provenance. They are compiled together with the course to collect every lint they trip, and
written to courses/<id>/drafts/<node>.yaml for a human to review: the sentences to move into a
unit, the entries into the lexicon. Nothing is drafted without a model.
"""

from __future__ import annotations

import copy
import re
import shutil
import tempfile
from dataclasses import dataclass, field
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


LEXEME = "lexeme:"
RULE = "rule:"
FEATURE = "feature:"


@dataclass
class Course:
    dir: Path
    source: dict[str, Any]
    units: list[tuple[Path, dict[str, Any]]]
    #: Its language's lexicon (lexemes.yaml) and declaration (language.yaml), as written.
    lexicon: dict[str, Any] = field(default_factory=lambda: {})
    language: dict[str, Any] = field(default_factory=lambda: {})
    #: Where the lexicon is kept (lexicons/<lang>/), or None for a course that keeps its own.
    lexicon_dir: Path | None = None
    #: What each id the course had before the lexical model became (aliases.yaml).
    aliases: dict[str, Any] = field(default_factory=lambda: {})

    @property
    def orthographies(self) -> list[str]:
        return list(self.source["orthographies"])

    def entries(self) -> dict[str, dict[str, Any]]:
        """The lexicon's entries, by id."""
        return {
            str(e["id"]): e for e in cast(list[dict[str, Any]], self.lexicon.get("lexemes") or [])
        }

    def rules(self) -> dict[str, dict[str, Any]]:
        return {
            str(r["id"]): r for r in cast(list[dict[str, Any]], self.language.get("rules") or [])
        }


def _read(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    return cast(dict[str, Any], data) if isinstance(data, dict) else {}


def load_course(course_dir: Path) -> Course:
    from nabu.compiler.build import lexicons_dir

    source = _read(course_dir / "course.yaml")
    units = [
        (course_dir / u, _read(course_dir / u))
        for u in source.get("units", [])
        if isinstance(u, str)
    ]
    aliases = cast(dict[str, Any], _read(course_dir / "aliases.yaml").get("aliases") or {})
    own = source.get("own")
    if isinstance(own, dict):
        own = cast(dict[str, Any], own)
        return Course(
            course_dir,
            source,
            units,
            cast(dict[str, Any], own.get("lexicon") or {}),
            cast(dict[str, Any], own.get("language") or {}),
            None,
            aliases,
        )
    folder = lexicons_dir(course_dir / "course.yaml") / str(source.get("lexicon"))
    return Course(
        course_dir,
        source,
        units,
        _read(folder / "lexemes.yaml"),
        _read(folder / "language.yaml"),
        folder,
        aliases,
    )


def _spellings(entry: dict[str, Any], orth: str) -> list[str]:
    """An entry's spellings in an orthography: its own, else its allomorphs' (an ending's)."""
    own = cast(dict[str, list[str]], entry.get("spelled") or {}).get(orth)
    if own:
        return list(own)
    out: list[str] = []
    for a in cast(list[dict[str, Any]], entry.get("allomorphs") or []):
        out += cast(dict[str, list[str]], a.get("spelled") or {}).get(orth, [])
    return out


def _gloss(value: Any) -> str:
    if isinstance(value, dict):
        return str(cast(dict[str, Any], value).get("en", ""))
    return ""


def prompt_values(course: Course, node: str, count: int) -> dict[str, str]:
    """What the author prompt is filled with: what is taught up to and including `node`, one id
    a line (`parts`, the prompt's name for the list)."""
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
    entries, rules = course.entries(), course.rules()
    lines: list[str] = []
    for ident in dict.fromkeys(taught):
        if ident.startswith(LEXEME):
            entry = entries.get(ident, {})
            forms = " / ".join(
                ", ".join(spelled)
                for o in course.orthographies
                if (spelled := _spellings(entry, o))
            )
            gloss = _gloss(entry.get("gloss"))
            lines.append(f"{ident}: {forms or '(not written alone)'} ({gloss})")
        elif ident.startswith(RULE):
            gloss = _gloss(rules.get(ident, {}).get("gloss"))
            lines.append(f"{ident}: (a rule) ({gloss})")
        elif ident.startswith(FEATURE):
            lines.append(f"{ident}: (a form) ()")
    language = language_name(str(course.source["target"]))
    return {
        "language": language,
        "count": str(count),
        "node": node,
        "orthographies": ", ".join(course.orthographies),
        "parts": "\n".join(lines),
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


def resolve(course: Course, ident: str) -> str:
    """What a token's id names, as a full id: a lexeme, a rule or a feature value. An id of the
    course before the lexical model (sense:kitob) is what its aliases.yaml says it became, else
    the lexeme of its name; a bare name is a lexeme's."""
    if ident.startswith((LEXEME, RULE, FEATURE)):
        return ident
    alias = course.aliases.get(ident)
    part = cast(dict[str, Any], alias).get("part") if isinstance(alias, dict) else None
    if isinstance(part, str) and "|" not in part:
        return part
    name = ident.split(":", 1)[1] if ":" in ident else ident
    return f"{LEXEME}{name}"


@dataclass
class Drafted:
    """The model's answer as sources: sentences, and lexicon entries for the lexemes they write
    that the lexicon lacks."""

    sentences: list[dict[str, Any]]
    lexemes: list[dict[str, Any]]


def drafts_of(output: AuthorOutput, course: Course, node: str, author: str) -> Drafted:
    """Sentence sources from the model's answer. A token names the lexeme its id resolves to; a
    feature value becomes the token's `feats`, a rule the sentence's `uses`."""
    known = course.entries()
    new: dict[str, dict[str, Any]] = {}
    drafts: list[dict[str, Any]] = []
    for i, s in enumerate(output.sentences, 1):
        forms: dict[str, Any] = {}
        uses: list[str] = []
        for orth, form in s.forms.items():
            tokens: list[yamlio.Flow] = []
            for t in form.tokens:
                ident = resolve(course, t.part)
                token: dict[str, Any] = {"surface": t.surface}
                if ident.startswith(LEXEME):
                    token["lexeme"] = ident.removeprefix(LEXEME)
                    if ident not in known:
                        entry = new.setdefault(ident, {"id": ident, "pos": "X", "spelled": {}})
                        spelled = cast(dict[str, list[str]], entry["spelled"])
                        if t.surface not in spelled.setdefault(str(orth), []):
                            spelled[str(orth)].append(t.surface)
                elif ident.startswith(FEATURE):
                    name, _, value = ident.removeprefix(FEATURE).partition("=")
                    token["feats"] = yamlio.Flow({name: value})
                elif ident.startswith(RULE) and ident not in uses:
                    uses.append(ident)
                tokens.append(yamlio.Flow(token))
            forms[orth] = {
                "text": form.text,
                "tokens": tokens,
                "reverse": literal(form.text),
            }
        drafts.append(
            {
                "id": f"draft.{node}.{i}",
                "node": node,
                **({"uses": uses} if uses else {}),
                "forms": forms,
                "translations": {"en": "\n".join(literal(t) for t in s.translations)},
                "provenance": yamlio.Flow({"author": author, "status": "draft"}),
            }
        )
    lexemes = [
        {
            "id": e["id"],
            "pos": e["pos"],
            "spelled": yamlio.Flow(
                {o: yamlio.FlowList(v) for o, v in cast(dict[str, list[str]], e["spelled"]).items()}
            ),
            "provenance": yamlio.Flow({"author": author, "status": "draft"}),
        }
        for _, e in sorted(new.items())
    ]
    return Drafted(drafts, lexemes)


def lint(course: Course, node: str, drafted: Drafted) -> list[str]:
    """Every diagnostic the drafts add to the course's own (compiled together in a scratch copy,
    the drafted entries in a copy of the lexicon)."""
    from nabu.compiler import compile_course
    from nabu.corecli import CoreCli

    def diagnostics(directory: Path, cli: CoreCli) -> set[tuple[str, str]]:
        diags, _ = compile_course(directory, cli)
        return {(d.lint, d.message) for d in diags.items}

    with tempfile.TemporaryDirectory() as tmp, CoreCli() as cli:
        before = diagnostics(course.dir, cli)
        # The repo's layout: courses/<id> beside courses/images (pictures courses share), and
        # lexicons/<lang> (whose pictures are named from there).
        scratch = Path(tmp) / "courses" / course.dir.name
        shutil.copytree(course.dir, scratch, ignore=shutil.ignore_patterns("audio", "drafts"))
        if (course.dir.parent / "images").is_dir():
            (scratch.parent / "images").symlink_to(
                course.dir.parent / "images", target_is_directory=True
            )
        lexemes = sorted(
            [*cast(list[dict[str, Any]], course.lexicon.get("lexemes") or []), *drafted.lexemes],
            key=lambda e: str(e["id"]),
        )
        lexicon = {**course.lexicon, "lexemes": lexemes}
        source = dict(course.source)
        if course.lexicon_dir is not None:
            folder = Path(tmp) / "lexicons" / course.lexicon_dir.name
            shutil.copytree(course.lexicon_dir, folder)
            (folder / "lexemes.yaml").write_text(yamlio.dump(lexicon), encoding="utf-8")
        else:
            source["own"] = {**cast(dict[str, Any], source["own"]), "lexicon": lexicon}
        for path, unit in course.units:
            if any(n["id"] == node for n in unit.get("nodes", [])):
                merged = copy.deepcopy(unit)
                merged["sentences"] = [*merged.get("sentences", []), *drafted.sentences]
                (scratch / path.relative_to(course.dir)).write_text(
                    yamlio.dump(merged), encoding="utf-8"
                )
        # Without the audio directory the audio settings would point nowhere.
        source.pop("audio", None)
        if source != course.source:
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
    drafted = drafts_of(output, course, node, author)
    # The compiler lets a sentence skip an orthography; a draft may not (the prompt asks for all).
    findings = (
        [
            f"error {d['id']}: no {o} form"
            for d in drafted.sentences
            for o in course.orthographies
            if o not in d["forms"]
        ]
        + [
            f"warning {e['id']}: not in the lexicon: drafted as an entry (part of speech X, no "
            "gloss): give it its part of speech and gloss"
            for e in drafted.lexemes
        ]
        + lint(course, node, drafted)
    )
    out = course_dir / "drafts" / f"{node}.yaml"
    out.parent.mkdir(exist_ok=True)
    where = (
        f"lexicons/{course.lexicon_dir.name}/lexemes.yaml"
        if course.lexicon_dir is not None
        else "the course's own lexicon"
    )
    header = [
        f"# Drafts for {node}, by {author} (prompts/author.md). Status draft: a speaker of the",
        "# language reviews each one, fixes it, adds readings where the course pins them, and",
        "# moves it into a unit.",
        *(
            [
                "# `lexemes` are entries drafted for words the lexicon lacks: give each its",
                f"# part of speech and gloss, and move it into {where}, sorted by id.",
            ]
            if drafted.lexemes
            else []
        ),
        *(
            ["# Lints the drafts trip (compiled with the course):"] + [f"#   {f}" for f in findings]
            if findings
            else ["# The drafts compile with the course without new lints."]
        ),
    ]
    body: dict[str, Any] = {"node": node, "sentences": drafted.sentences}
    if drafted.lexemes:
        body["lexemes"] = drafted.lexemes
    out.write_text("\n".join(header) + "\n" + yamlio.dump(body), encoding="utf-8")
    return out, findings
