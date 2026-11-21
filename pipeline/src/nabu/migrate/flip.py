"""The flip of the sources (docs/migration-design.md, deliverable 3): the courses of a git ref in
today's shape, converted and put where the new shape lives.

Until the switch lands, the courses on the main branch are the ones people edit, in the old shape.
The branch that builds the switch holds them flipped: `nabu flip` reads the old sources from a ref
(the main branch), converts them with this package and writes

- lexicons/<lang>/language.yaml and lexemes.yaml;
- courses/<id>/course.yaml and units/ in the new shape, with the comments the old files had;
- courses/<id>/aliases.yaml and audio/assignment.yaml;
- courses/<id>/audio/index.yaml with each word clip's item under its new name, and nothing else
  in an entry changed.

So a change to a course on the main branch reaches the branch by merging and running the flip
again, never by hand. It goes with the converter once the switch has landed.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from nabu import migrate, yamlio
from nabu.formkey import form_key
from nabu.migrate import report
from nabu.migrate.audio import KC_KINDS, renamed
from nabu.migrate.source import fold, obj, seq

OLD = re.compile(r"courses/[^/]+/(course\.yaml|units/[^/]+\.yaml|audio/index\.yaml)")
_HEADER_END = "# switch.\n"
_ANCHOR = re.compile(
    r"^\s*(?:- )?\{?\s*(?:id: *['\"]?(?P<id>[^,'\"}\s]+)|(?P<key>[^\s:#'\"{\[-][^:#]*):)"
)


@dataclass
class Flipped:
    """What a flip writes, and what it could not place."""

    files: dict[str, str] = field(default_factory=lambda: {})
    """Every file it writes: its path from the repo's root, and its text."""
    stale: list[str] = field(default_factory=lambda: [])
    """Files of the work tree that have no place after it: a unit the course no longer names,
    the converted copy beside a course."""
    written: list[str] = field(default_factory=lambda: [])
    removed: list[str] = field(default_factory=lambda: [])
    clips: dict[str, int] = field(default_factory=lambda: {})
    lost_comments: list[str] = field(default_factory=lambda: [])
    errors: list[str] = field(default_factory=lambda: [])


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, capture_output=True, text=True
    ).stdout


def old_tree(repo: Path, ref: str, into: Path) -> list[str]:
    """The old-shape sources of `ref`, written under `into` as the repo lays them out: each
    course's course.yaml, unit files and audio index, which is all the converter reads."""
    paths = [p for p in _git(repo, "ls-tree", "-r", "--name-only", ref, "courses").splitlines()]
    wanted = [p for p in paths if OLD.fullmatch(p)]
    for rel in wanted:
        target = into / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(_git(repo, "show", f"{ref}:{rel}"), encoding="utf-8")
    return wanted


def _body(text: str) -> str:
    """A converted file without the converter's header, which says nothing reads it."""
    at = text.find(_HEADER_END)
    return text if at < 0 else text[at + len(_HEADER_END) :]


def _anchor(line: str) -> str | None:
    m = _ANCHOR.match(line)
    if m is None:
        return None
    return m.group("id") or (m.group("key") or "").strip()


def comment_blocks(text: str) -> tuple[list[str], list[tuple[str, str, list[str]]]]:
    """A file's comments: the block at its head, and every later block with what it stands
    before (the top-level key it is under, and the key or id of the line after it)."""
    lines = text.splitlines()
    head: list[str] = []
    i = 0
    while i < len(lines) and lines[i].lstrip().startswith("#"):
        head.append(lines[i])
        i += 1
    blocks: list[tuple[str, str, list[str]]] = []
    section = ""
    pending: list[str] = []
    for line in lines[i:]:
        stripped = line.strip()
        if stripped.startswith("#"):
            pending.append(stripped)
            continue
        if not stripped:
            continue
        if not line.startswith((" ", "-")):
            section = _anchor(line) or section
        if pending:
            blocks.append((section, _anchor(line) or "", pending))
            pending = []
    if pending:
        blocks.append((section, "", pending))
    return head, blocks


def with_comments(old: str, new: str, where: str, lost: list[str]) -> str:
    """The new file with the old one's comments: its head block first, then each block before the
    line that begins what it stood before. A block whose line is gone (a unit's `kcs:`) is
    reported, never dropped in silence."""
    head, blocks = comment_blocks(old)
    lines = new.splitlines()
    sections: list[str] = []
    section = ""
    for line in lines:
        if line.strip() and not line.startswith((" ", "-", "#")):
            section = _anchor(line) or section
        sections.append(section)
    inserts: dict[int, list[str]] = {}
    for under, anchor, block in blocks:
        found = None
        for n, line in enumerate(lines):
            if _anchor(line) == anchor and (sections[n] == under or under == anchor):
                found = n
                break
        if found is None:
            for n, line in enumerate(lines):
                if _anchor(line) == under and not line.startswith(" "):
                    found = n
                    break
        if found is None:
            lost.append(f"{where}: before {anchor or 'the end'}: {' '.join(block)[:160]}")
            continue
        indent = lines[found][: len(lines[found]) - len(lines[found].lstrip())]
        inserts.setdefault(found, []).extend(indent + c for c in block)
    out = list(head)
    for n, line in enumerate(lines):
        out.extend(inserts.get(n, []))
        out.append(line)
    return "\n".join(out) + "\n"


def clip_names(m: migrate.Migration) -> dict[str, str]:
    """Each word clip's item under its new name: its lexeme where the KC is one, else the key of
    the form the clip says (a form of another lexeme, or a token built of several)."""
    names = dict(renamed(m.conv, m.aliases))
    first = m.course.orthographies[0]
    for kc_id, kc in m.conv.kcs.items():
        if kc_id in names or not kc_id.startswith("sense:"):
            continue
        name = kc_id.partition(":")[2]
        spelled = [str(f) for f in seq(obj(kc.get("forms")).get(first))]
        if not spelled:
            continue
        for forms in m.conv.items.values():
            hit = next(
                (
                    t
                    for t in forms.get(first, [])
                    if t.old.get("sense") == name and fold(t.surface) == fold(spelled[0])
                ),
                None,
            )
            if hit is not None:
                names[kc_id] = form_key([(f"lexeme:{p.lexeme}", p.feats) for p in hit.parts])
                break
    return names


_ITEM = re.compile(r"^(- item: )(\S+)$", re.MULTILINE)


def renamed_index(text: str, names: dict[str, str], where: str, out: Flipped) -> str:
    """The audio index with each word clip's item renamed, line by line: nothing else changes."""

    def rename(match: re.Match[str]) -> str:
        item = match.group(2).strip("'\"")
        if item.partition(":")[0] not in KC_KINDS or ":" not in item:
            return match.group(0)
        if item not in names:
            out.errors.append(f"{where}: the clip of {item} has no name in the new shape")
            return match.group(0)
        out.clips["renamed"] = out.clips.get("renamed", 0) + 1
        new = names[item]
        if "|form:" in new or "+" in new:
            out.clips["of a form"] = out.clips.get("of a form", 0) + 1
        return f"{match.group(1)}{_quoted(new)}"

    return _in_order(_ITEM.sub(rename, text))


def _in_order(text: str) -> str:
    """The index's clips in the order its own writer keeps them (by item, then speed), each
    entry's text as it was: a renamed item has another place, and the next `nabu audio` write
    would otherwise move every such entry."""
    head, found, body = text.partition("\nclips:\n")
    if not found:
        return text
    entries = re.split(r"(?m)^(?=- item: )", body)
    lead, clips = entries[0], entries[1:]

    def key(entry: str) -> tuple[str, str]:
        # An entry begins with its item and its speed, as the writer lists a clip's fields.
        clip = obj(seq(yaml.safe_load("\n".join(entry.split("\n", 2)[:2])))[0])
        return str(clip["item"]), str(clip["speed"])

    if clips and not clips[-1].endswith("\n"):
        clips[-1] += "\n"
    return head + found + lead + "".join(sorted(clips, key=key))


def _quoted(item: str) -> str:
    """An item id as the audio index's own writer spells it (plain where YAML reads it so)."""
    return yamlio.dump({"item": item}).strip().removeprefix("item: ")


def _header(*lines: str) -> str:
    return "".join(f"# {line}\n" for line in lines)


def plan(repo: Path, ref: str) -> Flipped:
    """What flipping the courses of `ref` writes into the work tree of `repo`, and what it
    removes: nothing is written."""
    out = Flipped()
    with tempfile.TemporaryDirectory() as tmp:
        old = Path(tmp)
        old_tree(repo, ref, old)
        courses = sorted(p.parent for p in (old / "courses").glob("*/course.yaml"))
        migrations = [migrate.migrate(c) for c in courses]
        languages = [m.plan.language for m in migrations]
        if len(set(languages)) != len(languages):
            out.errors.append("two courses of one language: their lexicon would be written twice")
            return out
        files = out.files
        for m in migrations:
            cid, lang = m.course.id, m.plan.language
            out.errors += [f"{cid}: {e}" for e in m.errors]
            written = m.files
            files[f"lexicons/{lang}/language.yaml"] = _header(
                f"What {lang} declares beside its lexicon (schemas/language.schema.json): its "
                "dimensions, features,",
                "defaults, labels and named rules.",
            ) + _body(written[f"lexicons/{lang}/language.yaml"])
            files[f"lexicons/{lang}/lexemes.yaml"] = _header(
                f"The lexicon of {lang} (schemas/lexicon.schema.json): every lexeme, sorted by id."
            ) + _body(written[f"lexicons/{lang}/lexemes.yaml"])
            files[f"courses/{cid}/aliases.yaml"] = _header(
                f"What each KC id of courses/{cid} became (schemas/aliases.schema.json): what "
                "upgrading a log",
                "written before the lexical model reads.",
            ) + _body(written[f"courses/{cid}/aliases.yaml"])
            assignment = written.get(f"courses/{cid}/next/audio/assignment.yaml")
            if assignment is not None:
                files[f"courses/{cid}/audio/assignment.yaml"] = _header(
                    "The voice an item keeps whatever its id draws (ADR 0078): read before a "
                    "voice is drawn."
                ) + _body(assignment)
            # What the conversion found: the report a reviewer reads.
            files[f"docs/migration/{cid}.md"] = written[f"docs/migration/{cid}.md"]
            lost: list[str] = []
            course_old = (old / "courses" / cid / "course.yaml").read_text(encoding="utf-8")
            files[f"courses/{cid}/course.yaml"] = with_comments(
                course_old,
                _body(written[f"courses/{cid}/next/course.yaml"]),
                f"courses/{cid}/course.yaml",
                lost,
            )
            for path, _ in m.next_units:
                if path is None:
                    continue
                unit_old = (old / "courses" / cid / path).read_text(encoding="utf-8")
                files[f"courses/{cid}/{path}"] = with_comments(
                    unit_old,
                    _body(written[f"courses/{cid}/next/{path}"]),
                    f"courses/{cid}/{path}",
                    lost,
                )
            out.lost_comments += lost
            index = old / "courses" / cid / "audio" / "index.yaml"
            if index.exists():
                files[f"courses/{cid}/audio/index.yaml"] = renamed_index(
                    index.read_text(encoding="utf-8"), clip_names(m), cid, out
                )
            # Unit files the course no longer names, and the converted copy beside the course.
            for unit_file in sorted((repo / "courses" / cid / "units").glob("*.yaml")):
                rel = unit_file.relative_to(repo).as_posix()
                if rel not in files:
                    out.stale.append(rel)
            beside = repo / "courses" / cid / "next"
            if beside.exists():
                out.stale += sorted(
                    p.relative_to(repo).as_posix() for p in beside.rglob("*") if p.is_file()
                )
        files[migrate.SUMMARY] = report.summary(migrations)
    return out


def out_of_date(repo: Path, flipped: Flipped) -> list[str]:
    """The files of the work tree that are not what the flip writes, and those it would remove."""
    return [
        rel
        for rel, text in flipped.files.items()
        if not (repo / rel).exists() or (repo / rel).read_text(encoding="utf-8") != text
    ] + flipped.stale


def flip(repo: Path, ref: str) -> Flipped:
    """Converts the courses of `ref` and writes them, flipped, into the work tree of `repo`."""
    out = plan(repo, ref)
    if out.errors:
        return out
    for rel, text in out.files.items():
        path = repo / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8")
            out.written.append(rel)
    for rel in out.stale:
        (repo / rel).unlink()
        out.removed.append(rel)
    for cid in {rel.split("/")[1] for rel in out.stale if rel.startswith("courses/")}:
        beside = repo / "courses" / cid / "next"
        if beside.exists():
            for folder in sorted((p for p in beside.rglob("*") if p.is_dir()), reverse=True):
                folder.rmdir()
            beside.rmdir()
    return out
